use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

pub use crate::model_common::ModelInfo as TtsModelInfo;
use crate::model_common::DownloadProgress;

const MODELS: &[(&str, &str, &str, &str, &str)] = &[
    (
        "vits-zh-hf-theresa",
        "VITS 中文 (Theresa)",
        "约 115 MB",
        "推荐 — 中文女声，音质好",
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-hf-theresa.tar.bz2",
    ),
    (
        "vits-zh-hf-eula",
        "VITS 中文 (Eula)",
        "约 115 MB",
        "中文女声，另一种音色",
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-hf-eula.tar.bz2",
    ),
];

fn tts_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("tts-models"))
}

fn model_dir(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    Ok(tts_models_dir(app)?.join(model_id))
}

pub fn get_model_dir_if_exists(app: &AppHandle, model_id: &str) -> Option<PathBuf> {
    let path = model_dir(app, model_id).ok()?;
    path.exists().then_some(path)
}

pub fn get_available_models(app: &AppHandle) -> Vec<TtsModelInfo> {
    MODELS
        .iter()
        .map(|(id, name, size, desc, _url)| {
            let downloaded = model_dir(app, id).map(|p| p.exists()).unwrap_or(false);
            TtsModelInfo {
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
    let (_id, _name, _size, _desc, url) = MODELS
        .iter()
        .find(|(id, ..)| *id == model_id)
        .ok_or_else(|| format!("未知模型: {model_id}"))?;

    let dest = model_dir(&app, &model_id)?;

    // If already downloaded, return immediately
    if dest.exists() {
        return dest
            .to_str()
            .map(String::from)
            .ok_or_else(|| "路径转换失败".into());
    }

    let parent = tts_models_dir(&app)?;
    std::fs::create_dir_all(&parent).map_err(|e| format!("创建目录失败: {e}"))?;

    let client = crate::build_http_client(&app)?;

    let resp = client
        .get(*url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("下载失败: {e}"))?;

    let total = resp.content_length().unwrap_or(0);
    // TTS tar.bz2 模型目前最大约 150MB，这里放宽到 500MB 作为上限，防止异常响应导致磁盘填满
    const MAX_MODEL_SIZE: u64 = 500 * 1024 * 1024;
    if total > MAX_MODEL_SIZE {
        return Err(format!("文件过大: {} 字节，最大允许 {} 字节", total, MAX_MODEL_SIZE));
    }
    let mut downloaded: u64 = 0;

    let tmp_path = parent.join(format!("{model_id}.tar.bz2.tmp"));

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
                    "tts-download-progress",
                    DownloadProgress {
                        model_id: model_id.clone(),
                        progress,
                        status: "downloading".into(),
                        error: None,
                    },
                );
            }
        }

        // Drop file handle before extraction
        drop(file);

        // Emit extracting status
        let _ = app.emit(
            "tts-download-progress",
            DownloadProgress {
                model_id: model_id.clone(),
                progress: 1.0,
                status: "extracting".into(),
                error: None,
            },
        );

        // Extract tar.bz2 to a temp directory first
        let tmp_extract_dir = parent.join(format!("{model_id}.extracting"));
        if tmp_extract_dir.exists() {
            std::fs::remove_dir_all(&tmp_extract_dir)
                .map_err(|e| format!("清理临时解压目录失败: {e}"))?;
        }
        std::fs::create_dir_all(&tmp_extract_dir)
            .map_err(|e| format!("创建解压目录失败: {e}"))?;

        let archive_file =
            std::fs::File::open(&tmp_path).map_err(|e| format!("打开压缩文件失败: {e}"))?;
        let bz2_decoder = bzip2::read::BzDecoder::new(archive_file);
        let mut archive = tar::Archive::new(bz2_decoder);
        archive
            .unpack(&tmp_extract_dir)
            .map_err(|e| format!("解压失败: {e}"))?;

        // Handle the case where tar extracts into a subdirectory
        // Check if .onnx file exists directly or in a subdirectory
        let has_onnx_directly = std::fs::read_dir(&tmp_extract_dir)
            .map_err(|e| format!("读取解压目录失败: {e}"))?
            .filter_map(|e| e.ok())
            .any(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|ext| ext == "onnx")
            });

        if has_onnx_directly {
            // Files are directly in the extract dir, just rename it
            std::fs::rename(&tmp_extract_dir, &dest)
                .map_err(|e| format!("重命名目录失败: {e}"))?;
        } else {
            // Files are in a subdirectory — find it and move it up
            let subdirs: Vec<_> = std::fs::read_dir(&tmp_extract_dir)
                .map_err(|e| format!("读取解压目录失败: {e}"))?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .collect();

            if subdirs.len() == 1 {
                let subdir = subdirs[0].path();
                std::fs::rename(&subdir, &dest)
                    .map_err(|e| format!("移动子目录失败: {e}"))?;
                // Clean up the now-empty temp extract dir
                let _ = std::fs::remove_dir_all(&tmp_extract_dir);
            } else {
                // Multiple subdirs or no subdirs — just use the extract dir as-is
                std::fs::rename(&tmp_extract_dir, &dest)
                    .map_err(|e| format!("重命名目录失败: {e}"))?;
            }
        }

        // Clean up the downloaded archive
        let _ = std::fs::remove_file(&tmp_path);

        Ok::<(), String>(())
    }
    .await;

    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp_path);
        let _ = std::fs::remove_dir_all(&dest);
        return Err(e);
    }

    let _ = app.emit(
        "tts-download-progress",
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
