use std::sync::{Arc, Mutex};

use sherpa_rs::tts::{VitsTts, VitsTtsConfig};

use super::{SynthesisResult, TtsProvider};

pub struct SherpaTtsProvider {
    tts: Arc<Mutex<VitsTts>>,
}

impl SherpaTtsProvider {
    pub fn new(model_dir: &str) -> Result<Self, String> {
        let dir = std::path::Path::new(model_dir);
        if !dir.is_dir() {
            return Err(format!("模型目录不存在: {}", model_dir));
        }

        // Find the .onnx model file
        let model_path = std::fs::read_dir(dir)
            .map_err(|e| format!("无法读取模型目录: {}", e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path()
                    .extension()
                    .map_or(false, |ext| ext == "onnx")
            })
            .map(|e| e.path())
            .ok_or_else(|| format!("模型目录中未找到 .onnx 文件: {}", model_dir))?;

        let tokens_path = dir.join("tokens.txt");
        if !tokens_path.exists() {
            return Err(format!("未找到 tokens.txt: {}", tokens_path.display()));
        }

        let lexicon_path = dir.join("lexicon.txt");
        let lexicon = if lexicon_path.exists() {
            lexicon_path.to_string_lossy().into_owned()
        } else {
            String::new()
        };

        let dict_path = dir.join("dict");
        let dict_dir = if dict_path.is_dir() {
            dict_path.to_string_lossy().into_owned()
        } else {
            String::new()
        };

        let config = VitsTtsConfig {
            model: model_path.to_string_lossy().into_owned(),
            tokens: tokens_path.to_string_lossy().into_owned(),
            lexicon,
            dict_dir,
            length_scale: 1.0,
            ..Default::default()
        };

        let tts = VitsTts::new(config);

        Ok(Self {
            tts: Arc::new(Mutex::new(tts)),
        })
    }
}

#[async_trait::async_trait]
impl TtsProvider for SherpaTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        _voice: &str,
        speed: f32,
    ) -> Result<SynthesisResult, String> {
        let text = text.to_string();
        let length_scale = 1.0 / speed.clamp(0.25, 4.0);
        let tts = self.tts.clone();

        tokio::task::spawn_blocking(move || {
            let mut tts = tts
                .lock()
                .map_err(|e| format!("TTS 引擎锁获取失败: {}", e))?;

            let audio = tts
                .create(&text, 0, length_scale)
                .map_err(|e| format!("语音合成失败: {}", e))?;

            // Convert f32 samples to i16 PCM bytes (little-endian)
            let mut pcm_bytes = Vec::with_capacity(audio.samples.len() * 2);
            for &sample in &audio.samples {
                let clamped = sample.clamp(-1.0, 1.0);
                let i16_val = (clamped * i16::MAX as f32) as i16;
                pcm_bytes.extend_from_slice(&i16_val.to_le_bytes());
            }

            Ok(SynthesisResult {
                audio: pcm_bytes,
                sample_rate: audio.sample_rate,
            })
        })
        .await
        .map_err(|e| format!("TTS 任务执行失败: {}", e))?
    }

    fn list_voices(&self) -> Vec<String> {
        vec!["default".into()]
    }

    fn name(&self) -> &str {
        "sherpa-onnx"
    }

    fn is_local(&self) -> bool {
        true
    }
}
