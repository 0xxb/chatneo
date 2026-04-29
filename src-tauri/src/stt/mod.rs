pub mod model_download;
pub mod openai;
pub mod whisper;

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptResult {
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TranscribeConfig {
    pub language: Option<String>,
    pub prompt: Option<String>,
}

#[async_trait::async_trait]
pub trait SttProvider: Send + Sync {
    async fn transcribe(
        &self,
        audio: Vec<u8>,
        config: &TranscribeConfig,
    ) -> Result<TranscriptResult, String>;

    #[allow(dead_code)]
    fn supports_streaming(&self) -> bool;

    fn name(&self) -> &str;
}

pub struct SttManager {
    provider: RwLock<Option<Arc<dyn SttProvider>>>,
    /// 当前 provider 对应的配置指纹。用于避免配置未变更时重复重建（Whisper 模型加载代价高）。
    current_key: RwLock<Option<String>>,
}

impl SttManager {
    pub fn new() -> Self {
        Self {
            provider: RwLock::new(None),
            current_key: RwLock::new(None),
        }
    }

    pub async fn set_provider(&self, provider: Arc<dyn SttProvider>, key: String) {
        *self.provider.write().await = Some(provider);
        *self.current_key.write().await = Some(key);
    }

    pub async fn current_key(&self) -> Option<String> {
        self.current_key.read().await.clone()
    }

    pub async fn get_provider(&self) -> Result<Arc<dyn SttProvider>, String> {
        let guard = self.provider.read().await;
        guard.clone().ok_or_else(|| "未配置语音识别服务".into())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SttStatus {
    pub provider: Option<String>,
    pub model_id: Option<String>,
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
    pub language: Option<String>,
}

#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
    state: State<'_, SttManager>,
) -> Result<TranscriptResult, String> {
    let audio = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("需要二进制音频数据".into()),
    };
    if audio.len() < 1000 {
        return Err("录音时间过短".into());
    }
    let provider = state.get_provider().await?;
    let language = crate::settings::get_setting(&app, "stt_language")
        .unwrap_or_else(|| "zh".into());
    let prompt = match language.as_str() {
        "zh" => "以下是普通话的转录。".to_string(),
        "en" => "The following is a transcription in English.".to_string(),
        "ja" => "以下は日本語の文字起こしです。".to_string(),
        "ko" => "다음은 한국어 전사입니다.".to_string(),
        _ => String::new(),
    };
    let config = TranscribeConfig {
        language: Some(language),
        prompt: if prompt.is_empty() { None } else { Some(prompt) },
    };
    provider.transcribe(audio, &config).await
}

#[tauri::command]
pub async fn switch_stt_provider(
    app: AppHandle,
    state: State<'_, SttManager>,
    config: ProviderConfig,
) -> Result<String, String> {
    // 先解析出配置指纹与目标 provider 的基础参数；若指纹与已有一致则直接复用
    let (key, provider): (String, Arc<dyn SttProvider>) = match config.provider_type.as_str() {
        "whisper" => {
            let model_path = if let Some(path) = &config.model_path {
                path.clone()
            } else if let Some(model_id) = &config.model_id {
                model_download::get_model_path_if_exists(&app, model_id)
                    .ok_or_else(|| format!("模型 {} 尚未下载", model_id))?
                    .to_string_lossy()
                    .to_string()
            } else {
                return Err("需要指定模型路径或模型 ID".into());
            };
            let key = format!("whisper:{model_path}");
            if state.current_key().await.as_deref() == Some(key.as_str()) {
                let existing = state.get_provider().await?;
                return Ok(existing.name().to_string());
            }
            (key, Arc::new(whisper::WhisperProvider::new(&model_path)?))
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
                .unwrap_or_else(|| "whisper-1".into());
            let key = format!("openai:{api_key}:{base_url}:{model_name}");
            if state.current_key().await.as_deref() == Some(key.as_str()) {
                let existing = state.get_provider().await?;
                return Ok(existing.name().to_string());
            }
            let client = crate::build_http_client(&app)?;
            (
                key,
                Arc::new(openai::OpenAiCompatibleProvider::new(
                    client, api_key, base_url, model_name,
                )),
            )
        }
        _ => return Err(format!("不支持的 Provider 类型: {}", config.provider_type)),
    };

    let name = provider.name().to_string();
    state.set_provider(provider, key).await;
    Ok(name)
}

#[tauri::command]
pub async fn get_stt_status(state: State<'_, SttManager>) -> Result<SttStatus, String> {
    let guard = state.provider.read().await;
    Ok(SttStatus {
        provider: guard.as_ref().map(|p| p.name().to_string()),
        model_id: None,
    })
}

#[tauri::command]
pub async fn stt_get_available_models(
    app: AppHandle,
) -> Result<Vec<model_download::ModelInfo>, String> {
    Ok(model_download::get_available_models(&app))
}

#[tauri::command]
pub async fn stt_download_model(
    app: AppHandle,
    model_id: String,
) -> Result<String, String> {
    model_download::download_model(app, model_id).await
}
