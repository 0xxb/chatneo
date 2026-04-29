mod deep_link;
mod error_code;
mod export_pdf;
mod fonts;
mod knowledge;
mod logging;
mod model_common;
mod settings;
mod stt;
mod text_extract;
mod tools;
mod tts;
mod tray;
#[cfg(target_os = "macos")]
mod progress_dialog;
mod updater;
mod webdav;

pub use error_code::coded;

use tauri::menu::{MenuBuilder, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::{Listener, Manager};
use tauri_plugin_autostart::ManagerExt;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(serde::Deserialize)]
struct SettingsPayload {
    key: String,
    value: String,
}

pub fn build_http_client(app: &tauri::AppHandle) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(proxy_url) = settings::get_setting(app, "proxy") {
        if !proxy_url.is_empty() {
            let proxy = reqwest::Proxy::all(&proxy_url).map_err(|e| format!("代理配置失败: {e}"))?;
            builder = builder.proxy(proxy);
        }
    }
    builder.build().map_err(|e| format!("HTTP 客户端创建失败: {e}"))
}

#[tauri::command]
async fn download_file(app: tauri::AppHandle, url: String, ext: String) -> Result<String, String> {
    // Validate ext: only allow alphanumeric characters to prevent path traversal
    if !ext.chars().all(|c| c.is_alphanumeric()) {
        return Err(format!("非法的文件扩展名: {ext}"));
    }
    let client = build_http_client(&app)?;

    const MAX_DOWNLOAD_SIZE: u64 = 100 * 1024 * 1024; // 100MB
    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("服务器返回错误: {e}"))?;
    if let Some(len) = resp.content_length() {
        if len > MAX_DOWNLOAD_SIZE {
            return Err(format!("文件过大: {} 字节，最大允许 {} 字节", len, MAX_DOWNLOAD_SIZE));
        }
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    if bytes.len() as u64 > MAX_DOWNLOAD_SIZE {
        return Err(format!("文件过大: {} 字节", bytes.len()));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let path = dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| format!("写入文件失败: {e}"))?;

    path.to_str()
        .map(String::from)
        .ok_or_else(|| "路径转换失败".into())
}

#[tauri::command]
async fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    show_settings_window(&app)
}

fn show_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    show_settings_window_at(app, "/general")
}

fn show_settings_window_at(app: &tauri::AppHandle, hash_path: &str) -> Result<(), String> {
    // Sanitize: only allow alphanumeric, hyphens, slashes, and underscores
    if !hash_path
        .chars()
        .all(|c| c.is_alphanumeric() || c == '/' || c == '-' || c == '_')
    {
        return Err(format!("非法的设置路径: {hash_path}"));
    }
    if let Some(window) = app.get_webview_window("settings") {
        // Navigate to the target path via eval, then focus
        let js = format!("window.location.hash = '#{}';", hash_path);
        window.eval(&js).map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        let url = format!("settings.html#{}", hash_path);
        #[allow(unused_mut)]
        let mut builder =
            tauri::WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::App(url.into()))
                .title("设置")
                .inner_size(820.0, 500.0)
                .min_inner_size(820.0, 500.0)
                .resizable(true);

        #[cfg(target_os = "macos")]
        {
            builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .transparent(true)
                .effects(
                    EffectsBuilder::new()
                        .effect(Effect::Sidebar)
                        .state(EffectState::FollowsWindowActiveState)
                        .build(),
                )
                .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                    16.0, 26.0,
                )));
        }

        builder.build().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn db_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_tables",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }]
}

fn setup_menu(app: &tauri::App) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "ChatNeo")
        .about_with_text("关于 ChatNeo", None)
        .separator()
        .text("settings", "设置...")
        .separator()
        .services_with_text("服务")
        .separator()
        .hide_with_text("隐藏 ChatNeo")
        .hide_others_with_text("隐藏其他")
        .show_all_with_text("显示全部")
        .separator()
        .quit_with_text("退出 ChatNeo")
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "文件")
        .close_window_with_text("关闭窗口")
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .undo_with_text("撤销")
        .redo_with_text("重做")
        .separator()
        .cut_with_text("剪切")
        .copy_with_text("拷贝")
        .paste_with_text("粘贴")
        .select_all_with_text("全选")
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "显示")
        .fullscreen_with_text("进入全屏幕")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "窗口")
        .minimize_with_text("最小化")
        .maximize_with_text("缩放")
        .separator()
        .close_window_with_text("关闭窗口")
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

fn handle_settings_changed(handle: &tauri::AppHandle, payload: SettingsPayload) {
    const SENSITIVE_KEYS: &[&str] = &["proxy", "api_key", "password", "secret"];
    if SENSITIVE_KEYS.iter().any(|k| payload.key.contains(k)) {
        tracing::info!("设置变更: {} = [已隐藏]", payload.key);
    } else {
        tracing::info!("设置变更: {} = {}", payload.key, payload.value);
    }
    match payload.key.as_str() {
        "launch_at_startup" => {
            let autostart = handle.autolaunch();
            let result = if payload.value == "1" {
                autostart.enable()
            } else {
                autostart.disable()
            };
            if let Err(e) = result {
                tracing::error!("自启动设置失败: {e}");
            }
        }
        "tray_visibility" => {
            let value = payload.value;
            let inner = handle.clone();
            if let Err(e) = handle
                .clone()
                .run_on_main_thread(move || match value.as_str() {
                    "never" => tray::destroy_tray(&inner),
                    _ => {
                        if let Err(e) = tray::create_tray(&inner) {
                            tracing::error!("托盘创建失败: {e}");
                        }
                    }
                })
            {
                tracing::error!("主线程调度失败: {e}");
            }
        }
        "log_enabled" => {
            logging::set_enabled(payload.value == "1");
        }
        "log_retention_days" => {
            if let Ok(days) = payload.value.parse::<i64>() {
                let dir = logging::log_dir(handle);
                logging::cleanup_old_logs(&dir, days);
            }
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 当第二个实例被启动时，argv 中可能包含 deep link URL
            for arg in argv {
                if arg.starts_with("chatneo://") {
                    deep_link::handle_deep_link(app, &arg);
                    return;
                }
            }
            deep_link::focus_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:chatneo.db", db_migrations())
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            logging::init(app.handle());
            tracing::info!("应用启动中...");

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            setup_menu(app)?;
            tracing::info!("菜单栏已初始化");

            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id().as_ref() == "settings" {
                    if let Err(e) = show_settings_window(&handle) {
                        tracing::error!("打开设置窗口失败: {e}");
                    }
                }
            });

            // Deep link: listen for URLs opened while app is running
            let handle_dl = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                    for url in urls {
                        deep_link::handle_deep_link(&handle_dl, &url);
                    }
                }
            });

            // Deep link: handle URLs that launched the app (Linux/Windows)
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in urls {
                        deep_link::handle_deep_link(app.handle(), url.as_str());
                    }
                }
            }

            // Initialize tray
            let tray_vis = settings::get_setting(app.handle(), "tray_visibility")
                .unwrap_or_else(|| "when_running".into());
            tracing::info!("托盘可见性: {tray_vis}");
            if tray_vis != "never" {
                if let Err(e) = tray::create_tray(app.handle()) {
                    tracing::error!("托盘初始化失败: {e}");
                }
            }

            // Sync autostart state
            let autostart = app.handle().autolaunch();
            let should_autostart = settings::get_setting(app.handle(), "launch_at_startup")
                .map(|v| v == "1")
                .unwrap_or(false);
            if let Err(e) = if should_autostart {
                autostart.enable()
            } else {
                autostart.disable()
            } {
                tracing::error!("自启动同步失败: {e}");
            }


            // Listen for settings changes from frontend
            let handle = app.handle().clone();
            app.listen(
                "settings-changed",
                move |event: tauri::Event| match serde_json::from_str::<SettingsPayload>(
                    event.payload(),
                ) {
                    Ok(payload) => handle_settings_changed(&handle, payload),
                    Err(e) => tracing::error!("设置变更解析失败: {e}"),
                },
            );

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let minimize = settings::get_setting(&window.app_handle(), "minimize_to_tray")
                        .map(|v| v == "1")
                        .unwrap_or(false);
                    // Only minimize to tray if tray actually exists
                    if minimize && window.app_handle().tray_by_id("main-tray").is_some() {
                        api.prevent_close();
                        if let Err(e) = window.hide() {
                            tracing::error!("窗口隐藏失败: {e}");
                        }
                    }
                }
            }
        })
        .manage(stt::SttManager::new())
        .manage(tts::TtsManager::new())
        .invoke_handler(tauri::generate_handler![
            open_settings,
            download_file,
            export_pdf::export_pdf,
            logging::get_log_dir,
            logging::open_log_dir,
            logging::log_message,
            logging::log_api_request,
            stt::transcribe_audio,
            stt::switch_stt_provider,
            stt::get_stt_status,
            stt::stt_get_available_models,
            stt::stt_download_model,
            tts::tts_synthesize,
            tts::tts_list_voices,
            tts::switch_tts_provider,
            tts::tts_get_available_models,
            tts::tts_download_model,
            tools::tool_http_request,
            tools::tool_read_url,
            tools::tool_run_code,
            tools::tool_read_file,
            webdav::webdav_test_connection,
            webdav::webdav_propfind,
            webdav::webdav_put,
            webdav::webdav_get,
            webdav::webdav_delete,
            knowledge::kb_store_chunks,
            knowledge::kb_search_chunks,
            knowledge::kb_delete_chunks,
            knowledge::kb_parse_document,
            knowledge::kb_fetch_webpage,
            fonts::get_system_fonts,
            updater::check_for_updates,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            if let Some(w) = _app_handle.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    });
}
