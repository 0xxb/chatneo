use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

const TRAY_ID: &str = "main-tray";
const ICON_BYTES: &[u8] = include_bytes!("../icons/tray-icon.png");

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let show = MenuItemBuilder::with_id("tray_show", "显示 ChatNeo").build(app)?;
    let check_update = MenuItemBuilder::with_id("tray_check_update", "检查更新").build(app)?;
    let settings = MenuItemBuilder::with_id("tray_settings", "设置...").build(app)?;
    let quit = MenuItemBuilder::with_id("tray_quit", "退出 ChatNeo").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&check_update)
        .separator()
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(ICON_BYTES)?.to_owned())
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_show" => {
                if let Some(w) = app.get_webview_window("main") {
                    if let Err(e) = w.show().and_then(|_| w.set_focus()) {
                        tracing::error!("显示主窗口失败: {e}");
                    }
                }
            }
            "tray_check_update" => {
                // 直接走原生 dialog 流程，避开跨窗口事件时序问题
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::updater::check_for_updates(handle).await {
                        tracing::error!("检查更新失败: {e}");
                    }
                });
            }
            "tray_settings" => {
                if let Err(e) = crate::show_settings_window(app) {
                    tracing::error!("打开设置窗口失败: {e}");
                }
            }
            "tray_quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|_tray, _event| {})
        .build(app)?;

    Ok(())
}

pub fn destroy_tray(app: &tauri::AppHandle) {
    app.remove_tray_by_id(TRAY_ID);
}
