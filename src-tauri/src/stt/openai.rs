use super::{SttProvider, TranscribeConfig, TranscriptResult};

pub struct OpenAiCompatibleProvider {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
    model: String,
}

impl OpenAiCompatibleProvider {
    pub fn new(client: reqwest::Client, api_key: String, base_url: String, model: String) -> Self {
        Self {
            client,
            api_key,
            base_url: base_url.trim_end_matches('/').to_string(),
            model,
        }
    }
}

#[async_trait::async_trait]
impl SttProvider for OpenAiCompatibleProvider {
    async fn transcribe(
        &self,
        audio: Vec<u8>,
        config: &TranscribeConfig,
    ) -> Result<TranscriptResult, String> {
        let file_part = reqwest::multipart::Part::bytes(audio)
            .file_name("audio.webm")
            .mime_str("audio/webm")
            .map_err(|e| format!("MIME 设置失败: {e}"))?;

        let mut form = reqwest::multipart::Form::new()
            .text("model", self.model.clone())
            .part("file", file_part);

        if let Some(lang) = &config.language {
            form = form.text("language", lang.clone());
        }
        if let Some(prompt) = &config.prompt {
            form = form.text("prompt", prompt.clone());
        }

        let resp = self
            .client
            .post(format!("{}/v1/audio/transcriptions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API 错误 {status}: {body}"));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("响应解析失败: {e}"))?;
        let text = body["text"].as_str().unwrap_or("").to_string();

        Ok(TranscriptResult { text })
    }

    fn supports_streaming(&self) -> bool {
        false
    }

    fn name(&self) -> &str {
        "OpenAI Compatible"
    }
}
