use serde::Serialize;

/// Shared model info for both STT and TTS models.
#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub size: String,
    pub description: String,
    pub downloaded: bool,
}

/// Shared download progress event payload.
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub progress: f64,
    pub status: String,
    pub error: Option<String>,
}
