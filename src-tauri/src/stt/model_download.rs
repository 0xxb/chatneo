use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

pub use crate::model_common::ModelInfo;
use crate::model_common::DownloadProgress;

const MODELS: &[(&str, &str, &str, &str)] = &[
    (
        "large-v3-turbo-q5_0",
        "Large V3 Turbo (Q5)",
        "547 MB",
        "推荐 — 中文效果好，体积适中",
    ),
    ("medium", "Medium", "1.5 GB", "中等精度，较快速度"),
    ("large-v3", "Large V3", "2.9 GB", "最高精度，速度较慢"),
];

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("models"))
}

fn model_path(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(format!("ggml-{model_id}.bin")))
}

pub fn get_model_path_if_exists(app: &AppHandle, model_id: &str) -> Option<PathBuf> {
    let path = model_path(app, model_id).ok()?;
    path.exists().then_some(path)
}

pub fn get_available_models(app: &AppHandle) -> Vec<ModelInfo> {
    MODELS
        .iter()
        .map(|(id, name, size, desc)| {
            let downloaded = model_path(app, id).map(|p| p.exists()).unwrap_or(false);
            ModelInfo {
                id: id.to_string(),
                name: name.to_string(),
                size: size.to_string(),
                description: desc.to_string(),
                downloaded,
            }
        })
        .collect()
}

pub async fn download_model(app: AppHandle, model_id: String) -> Result<String, String> {
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model_id}.bin"
    );
    let dest = model_path(&app, &model_id)?;

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let client = crate::build_http_client(&app)?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("下载失败: {e}"))?;

    let total = resp.content_length().unwrap_or(0);
    // 模型文件最大 5GB，防止异常响应导致磁盘填满
    const MAX_MODEL_SIZE: u64 = 5 * 1024 * 1024 * 1024;
    if total > MAX_MODEL_SIZE {
        return Err(format!("文件过大: {} 字节，最大允许 {} 字节", total, MAX_MODEL_SIZE));
    }
    let mut downloaded: u64 = 0;

    let tmp_path = dest.with_extension("bin.tmp");
    let mut file =
        std::fs::File::create(&tmp_path).map_err(|e| format!("创建临时文件失败: {e}"))?;

    let result = async {
        use futures_util::StreamExt;
        use std::io::Write;
        let mut stream = resp.bytes_stream();
        let mut last_emitted_progress = -1.0_f64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("下载中断: {e}"))?;
            file.write_all(&chunk)
                .map_err(|e| format!("写入失败: {e}"))?;
            downloaded += chunk.len() as u64;
            if downloaded > MAX_MODEL_SIZE {
                return Err(format!("下载超出大小限制: {} 字节", downloaded));
            }

            let progress = if total > 0 {
                downloaded as f64 / total as f64
            } else {
                0.0
            };
            if progress - last_emitted_progress >= 0.01 {
                last_emitted_progress = progress;
                let _ = app.emit(
                    "stt-download-progress",
                    DownloadProgress {
                        model_id: model_id.clone(),
                        progress,
                        status: "downloading".into(),
                        error: None,
                    },
                );
            }
        }

        std::fs::rename(&tmp_path, &dest).map_err(|e| format!("重命名失败: {e}"))
    }
    .await;

    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    let _ = app.emit(
        "stt-download-progress",
        DownloadProgress {
            model_id: model_id.clone(),
            progress: 1.0,
            status: "completed".into(),
            error: None,
        },
    );

    dest.to_str()
        .map(String::from)
        .ok_or_else(|| "路径转换失败".into())
}
