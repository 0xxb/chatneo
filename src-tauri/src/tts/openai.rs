use super::{SynthesisResult, TtsProvider};

pub struct OpenAiTtsProvider {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
    model: String,
}

impl OpenAiTtsProvider {
    pub fn new(
        client: reqwest::Client,
        api_key: String,
        base_url: String,
        model: String,
    ) -> Self {
        Self {
            client,
            api_key,
            base_url: base_url.trim_end_matches('/').to_string(),
            model,
        }
    }
}

#[async_trait::async_trait]
impl TtsProvider for OpenAiTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice: &str,
        speed: f32,
    ) -> Result<SynthesisResult, String> {
        let body = serde_json::json!({
            "model": self.model,
            "input": text,
            "voice": voice,
            "speed": speed,
            "response_format": "wav",
        });

        let resp = self
            .client
            .post(format!("{}/v1/audio/speech", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API 错误 {status}: {body}"));
        }

        let audio = resp
            .bytes()
            .await
            .map_err(|e| format!("读取响应失败: {e}"))?
            .to_vec();

        // Parse sample_rate from WAV header bytes 24..28 (little-endian u32)
        let sample_rate = if audio.len() >= 28 {
            u32::from_le_bytes([audio[24], audio[25], audio[26], audio[27]])
        } else {
            24000
        };

        Ok(SynthesisResult { audio, sample_rate })
    }

    fn list_voices(&self) -> Vec<String> {
        vec![
            "alloy".into(),
            "echo".into(),
            "fable".into(),
            "onyx".into(),
            "nova".into(),
            "shimmer".into(),
        ]
    }

    fn name(&self) -> &str {
        "OpenAI Compatible"
    }

    fn is_local(&self) -> bool {
        false
    }
}
