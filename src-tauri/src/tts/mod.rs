pub mod model_download;
pub mod openai;
pub mod sherpa;

use serde::Deserialize;
use std::sync::Arc;
use tauri::{ipc::Response, AppHandle, State};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct SynthesisResult {
    pub audio: Vec<u8>,
    pub sample_rate: u32,
}

#[async_trait::async_trait]
pub trait TtsProvider: Send + Sync {
    async fn synthesize(
        &self,
        text: &str,
        voice: &str,
        speed: f32,
    ) -> Result<SynthesisResult, String>;

    fn list_voices(&self) -> Vec<String>;

    fn name(&self) -> &str;

    fn is_local(&self) -> bool;
}

pub struct TtsManager {
    provider: RwLock<Option<Arc<dyn TtsProvider>>>,
    /// 当前 provider 对应的配置指纹，避免相同配置重复重建 Sherpa 模型。
    current_key: RwLock<Option<String>>,
}

impl TtsManager {
    pub fn new() -> Self {
        Self {
            provider: RwLock::new(None),
            current_key: RwLock::new(None),
        }
    }

    pub async fn set_provider(&self, provider: Arc<dyn TtsProvider>, key: String) {
        *self.provider.write().await = Some(provider);
        *self.current_key.write().await = Some(key);
    }

    pub async fn current_key(&self) -> Option<String> {
        self.current_key.read().await.clone()
    }

    pub async fn get_provider(&self) -> Result<Arc<dyn TtsProvider>, String> {
        let guard = self.provider.read().await;
        guard.clone().ok_or_else(|| "未配置语音合成服务".into())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ProviderConfig {
    pub provider_type: String,
    pub model_path: Option<String>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model_name: Option<String>,
}

/// Encode raw PCM 16-bit mono samples as a WAV byte buffer.
fn encode_wav(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
    let data_len = pcm.len() as u32;
    let file_len = 36 + data_len;
    let channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * u32::from(channels) * u32::from(bits_per_sample) / 8;
    let block_align = channels * bits_per_sample / 8;

    let mut buf = Vec::with_capacity(44 + pcm.len());
    // RIFF header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&file_len.to_le_bytes());
    buf.extend_from_slice(b"WAVE");
    // fmt subchunk
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes()); // subchunk1 size
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM format
    buf.extend_from_slice(&channels.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&bits_per_sample.to_le_bytes());
    // data subchunk
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_len.to_le_bytes());
    buf.extend_from_slice(pcm);
    buf
}

#[tauri::command]
pub async fn tts_synthesize(
    state: State<'_, TtsManager>,
    text: String,
    voice: Option<String>,
    speed: Option<f32>,
) -> Result<Response, String> {
    let provider = state.get_provider().await?;
    let voice = voice.unwrap_or_else(|| "default".into());
    let speed = speed.unwrap_or(1.0);

    let result = provider.synthesize(&text, &voice, speed).await?;

    let wav = if provider.is_local() {
        // Local providers return raw PCM — wrap in WAV
        encode_wav(&result.audio, result.sample_rate)
    } else {
        // Cloud providers (OpenAI) return complete WAV/MP3 already
        result.audio
    };

    Ok(Response::new(wav))
}

#[tauri::command]
pub async fn tts_list_voices(
    state: State<'_, TtsManager>,
) -> Result<Vec<String>, String> {
    let provider = state.get_provider().await?;
    Ok(provider.list_voices())
}

#[tauri::command]
pub async fn switch_tts_provider(
    app: AppHandle,
    state: State<'_, TtsManager>,
    config: ProviderConfig,
) -> Result<String, String> {
    let (key, provider): (String, Arc<dyn TtsProvider>) = match config.provider_type.as_str() {
        "sherpa" => {
            let model_path = if let Some(path) = &config.model_path {
                path.clone()
            } else if let Some(model_id) = &config.model_id {
                model_download::get_model_dir_if_exists(&app, model_id)
                    .ok_or_else(|| format!("模型 {} 尚未下载", model_id))?
                    .to_string_lossy()
                    .to_string()
            } else {
                return Err("需要指定模型路径或模型 ID".into());
            };
            let key = format!("sherpa:{model_path}");
            if state.current_key().await.as_deref() == Some(key.as_str()) {
                let existing = state.get_provider().await?;
                return Ok(existing.name().to_string());
            }
            (key, Arc::new(sherpa::SherpaTtsProvider::new(&model_path)?))
        }
        "openai" => {
            let api_key = config.api_key.ok_or("需要 API Key")?;
            let base_url = config
                .base_url
                .clone()
                .unwrap_or_else(|| "https://api.openai.com".into());
            let model_name = config
                .model_name
                .clone()
                .unwrap_or_else(|| "tts-1".into());
            let key = format!("openai:{api_key}:{base_url}:{model_name}");
            if state.current_key().await.as_deref() == Some(key.as_str()) {
                let existing = state.get_provider().await?;
                return Ok(existing.name().to_string());
            }
            let client = crate::build_http_client(&app)?;
            (
                key,
                Arc::new(openai::OpenAiTtsProvider::new(
                    client, api_key, base_url, model_name,
                )),
            )
        }
        _ => return Err(format!("不支持的 TTS Provider 类型: {}", config.provider_type)),
    };

    let name = provider.name().to_string();
    state.set_provider(provider, key).await;
    Ok(name)
}

#[tauri::command]
pub async fn tts_get_available_models(
    app: AppHandle,
) -> Result<Vec<model_download::TtsModelInfo>, String> {
    Ok(model_download::get_available_models(&app))
}

#[tauri::command]
pub async fn tts_download_model(
    app: AppHandle,
    model_id: String,
) -> Result<String, String> {
    model_download::download_model(app, model_id).await
}
