use tauri::{Emitter, Manager};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// 聚焦主窗口（如果被隐藏则先显示）
pub fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// 解析 chatneo:// URL 并执行对应操作
pub fn handle_deep_link(app: &tauri::AppHandle, url: &str) {
    tracing::info!("处理 deep link: {url}");

    // 解析 URL，chatneo://chat/xxx?input=hello 格式
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("无效的 deep link URL: {url}, 错误: {e}");
            return;
        }
    };

    let host = parsed.host_str().unwrap_or("");
    let path = parsed.path().trim_start_matches('/');

    match host {
        "chat" => {
            focus_main_window(app);
            let find_param = |key: &str| {
                parsed.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned())
            };

            let payload = ChatPayload {
                conversation_id: if path.is_empty() { None } else { Some(path.to_string()) },
                input: find_param("input"),
                model: find_param("model"),
            };

            if let Err(e) = app.emit("deep-link-chat", &payload) {
                tracing::error!("发送 deep-link-chat 事件失败: {e}");
            }
        }
        "settings" => {
            let hash_path = if path.is_empty() {
                "/general".to_string()
            } else {
                format!("/{path}")
            };
            if let Err(e) = crate::show_settings_window_at(app, &hash_path) {
                tracing::error!("打开设置窗口失败: {e}");
            }
        }
        _ => {
            tracing::info!("未识别的 deep link host: {host}，仅聚焦窗口");
            focus_main_window(app);
        }
    }
}
