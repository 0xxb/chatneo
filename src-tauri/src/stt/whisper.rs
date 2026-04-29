use super::{SttProvider, TranscribeConfig, TranscriptResult};
use std::sync::Arc;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Detect whether the audio bytes look like WebM/Opus.
/// WebM starts with the EBML header magic bytes: 0x1A 0x45 0xDF 0xA3.
fn is_webm(data: &[u8]) -> bool {
    data.len() >= 4 && data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3
}

/// Decode a WebM/Opus file by using symphonia as a demuxer (container parser only)
/// and the `opus` crate for actual codec decoding.
///
/// Opus is always internally 48 kHz. We return (samples, 48000, channels).
fn decode_webm_opus(data: &[u8]) -> Result<(Vec<f32>, u32, usize), String> {
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let cursor = std::io::Cursor::new(data.to_vec());
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());

    let mut hint = Hint::new();
    hint.mime_type("audio/webm");

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("WebM 容器解析失败: {e}"))?;

    let mut format = probed.format;

    // Find the audio track (Opus codec_id in MKV is A_OPUS).
    let track = format
        .tracks()
        .first()
        .or_else(|| format.default_track())
        .ok_or("未找到音频轨道")?;

    let channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(1);
    let track_id = track.id;

    // Opus is always 48 kHz internally regardless of what the container reports.
    let opus_sample_rate: u32 = 48000;

    let opus_channels = match channels {
        1 => ::opus::Channels::Mono,
        _ => ::opus::Channels::Stereo,
    };
    let mut opus_decoder = ::opus::Decoder::new(opus_sample_rate, opus_channels)
        .map_err(|e| format!("Opus 解码器创建失败: {e}"))?;

    // Max Opus frame is 120 ms at 48 kHz × 2 channels = 11520 samples.
    let max_frame_size = 11520;
    let mut frame_buf = vec![0.0f32; max_frame_size];
    let mut samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(e) => return Err(format!("读取音频包失败: {e}")),
        };
        if packet.track_id() != track_id {
            continue;
        }

        let raw = packet.buf();
        // Skip very small packets (e.g. Opus header / tags packets from OGG-in-WebM).
        if raw.len() < 1 {
            continue;
        }

        match opus_decoder.decode_float(raw, &mut frame_buf, false) {
            Ok(n) => {
                // n is per-channel frame count; interleaved output has n * channels samples.
                samples.extend_from_slice(&frame_buf[..n * channels]);
            }
            Err(e) => {
                // Some header/info packets in WebM are not Opus audio frames; skip them.
                tracing::debug!("跳过非 Opus 包: {e}");
            }
        }
    }

    Ok((samples, opus_sample_rate, channels))
}

fn decode_audio(data: &[u8]) -> Result<(Vec<f32>, u32, usize), String> {
    // Route WebM/Opus through the dedicated decoder.
    if is_webm(data) {
        return decode_webm_opus(data);
    }

    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let cursor = std::io::Cursor::new(data.to_vec());
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());

    let probed = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("音频格式识别失败: {e}"))?;

    let mut format = probed.format;
    let track = format.default_track().ok_or("未找到音频轨道")?;
    let sample_rate = track.codec_params.sample_rate.ok_or("未知采样率")?;
    let channels = track.codec_params.channels.ok_or("未知声道数")?.count();
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("解码器创建失败: {e}"))?;

    let mut samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(e) => return Err(format!("读取音频包失败: {e}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|e| format!("解码失败: {e}"))?;
        let spec = *decoded.spec();
        let mut buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buf.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buf.samples());
    }

    Ok((samples, sample_rate, channels))
}

fn to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels == 1 {
        return samples.to_vec();
    }
    samples
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

fn resample_to_16k(samples: &[f32], from_rate: u32) -> Result<Vec<f32>, String> {
    if from_rate == 16000 {
        return Ok(samples.to_vec());
    }

    use rubato::{FftFixedInOut, Resampler};

    let chunk_size = 1024;
    let mut resampler = FftFixedInOut::<f32>::new(from_rate as usize, 16000, chunk_size, 1)
        .map_err(|e| format!("重采样器创建失败: {e}"))?;

    let mut output = Vec::new();
    let mut pos = 0;
    let input_frames_needed = resampler.input_frames_next();

    while pos + input_frames_needed <= samples.len() {
        let chunk = &samples[pos..pos + input_frames_needed];
        let result = resampler
            .process(&[chunk], None)
            .map_err(|e| format!("重采样失败: {e}"))?;
        output.extend_from_slice(&result[0]);
        pos += input_frames_needed;
    }

    if pos < samples.len() {
        let mut padded = samples[pos..].to_vec();
        padded.resize(input_frames_needed, 0.0);
        let result = resampler
            .process(&[&padded], None)
            .map_err(|e| format!("重采样失败: {e}"))?;
        let expected =
            ((samples.len() - pos) as f64 * 16000.0 / from_rate as f64).ceil() as usize;
        let take = expected.min(result[0].len());
        output.extend_from_slice(&result[0][..take]);
    }

    Ok(output)
}

fn prepare_audio(data: &[u8]) -> Result<Vec<f32>, String> {
    let (samples, sample_rate, channels) = decode_audio(data)?;
    let mono = to_mono(&samples, channels);
    resample_to_16k(&mono, sample_rate)
}

pub struct WhisperProvider {
    ctx: Arc<WhisperContext>,
}

impl WhisperProvider {
    pub fn new(model_path: &str) -> Result<Self, String> {
        let ctx =
            WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
                .map_err(|e| format!("Whisper 模型加载失败: {e}"))?;
        Ok(Self {
            ctx: Arc::new(ctx),
        })
    }
}

#[async_trait::async_trait]
impl SttProvider for WhisperProvider {
    async fn transcribe(
        &self,
        audio: Vec<u8>,
        config: &TranscribeConfig,
    ) -> Result<TranscriptResult, String> {
        let ctx = self.ctx.clone();
        let language = config
            .language
            .clone()
            .unwrap_or_else(|| "zh".into());
        let prompt = config
            .prompt
            .clone()
            .unwrap_or_else(|| "以下是普通话的转录。".into());

        tokio::task::spawn_blocking(move || {
            let samples = prepare_audio(&audio)?;
            let mut state = ctx
                .create_state()
                .map_err(|e| format!("创建状态失败: {e}"))?;

            let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
            params.set_language(Some(&language));
            params.set_translate(false);
            params.set_n_threads(4);
            params.set_print_progress(false);
            params.set_print_timestamps(false);
            params.set_initial_prompt(&prompt);

            state
                .full(params, &samples)
                .map_err(|e| format!("转录失败: {e}"))?;

            let mut text = String::new();
            let n = state
                .full_n_segments()
                .map_err(|e| format!("获取段数失败: {e}"))?;
            for i in 0..n {
                let seg = state
                    .full_get_segment_text(i)
                    .map_err(|e| format!("获取文本失败: {e}"))?;
                text.push_str(&seg);
            }

            Ok(TranscriptResult {
                text: text.trim().to_string(),
            })
        })
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
    }

    fn supports_streaming(&self) -> bool {
        false
    }

    fn name(&self) -> &str {
        "Whisper (本地)"
    }
}
