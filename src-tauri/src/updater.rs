//! 检查更新的原生流程：
//! 检查 → 原生 dialog 告知结果 → 有更新则让用户在原生 confirm 里决定是否下载安装。
//! 下载过程通过原生进度弹窗 + 事件 `update-progress` 双路推送，完成后自动重启。
//! 完全在 Rust 侧编排，避免前端跨窗口/跨页事件时序问题。

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::oneshot;

/// 进程级重入保护：托盘与设置页可能同时触发检查更新，避免重复对话框与并发下载。
static RUNNING: AtomicBool = AtomicBool::new(false);

/// RAII 守卫：离开作用域时自动释放 RUNNING 标志，保证 early return / panic 时也会恢复。
struct RunGuard;
impl Drop for RunGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::Release);
    }
}

#[derive(Serialize, Clone)]
struct UpdateProgress {
    chunk: usize,
    total: Option<u64>,
    downloaded: u64,
    phase: &'static str, // "downloading" | "finished" | "failed"
}

/// 异步弹原生 confirm dialog，返回用户是否确认。
async fn confirm(app: &AppHandle, title: &str, msg: &str, ok_label: &str, cancel_label: &str) -> bool {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .message(msg)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            ok_label.to_string(),
            cancel_label.to_string(),
        ))
        .show(move |confirmed| {
            let _ = tx.send(confirmed);
        });
    rx.await.unwrap_or(false)
}

/// 弹原生 info dialog（仅 OK 按钮）。非阻塞：调用后立即返回。
fn info(app: &AppHandle, title: &str, msg: &str, kind: MessageDialogKind) {
    app.dialog()
        .message(msg)
        .title(title)
        .kind(kind)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}

/// 在主线程显示原生进度弹窗（macOS only）。
#[cfg(target_os = "macos")]
fn show_native_progress(app: &AppHandle, title: &str, message: &str, indeterminate: bool) {
    let t = title.to_string();
    let m = message.to_string();
    let _ = app.run_on_main_thread(move || {
        crate::progress_dialog::show(&t, &m, indeterminate);
    });
}

/// 在主线程关闭原生进度弹窗（macOS only）。
#[cfg(target_os = "macos")]
fn close_native_progress(app: &AppHandle) {
    let _ = app.run_on_main_thread(|| {
        crate::progress_dialog::close();
    });
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<(), String> {
    // 抢占全局锁：若已有检查流程在跑，直接返回，避免并发 dialog / 下载。
    if RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(());
    }
    let _guard = RunGuard;

    let updater = app
        .updater()
        .map_err(|e| format!("更新器初始化失败: {e}"))?;

    // ── 阶段 1：检查更新（显示不定进度条） ──
    #[cfg(target_os = "macos")]
    show_native_progress(&app, "软件更新", "正在检查更新...", true);

    let check_result = updater.check().await;

    #[cfg(target_os = "macos")]
    close_native_progress(&app);

    let update_opt = check_result.map_err(|e| format!("检查更新失败: {e}"))?;

    let update = match update_opt {
        None => {
            info(&app, "检查更新", "当前已是最新版本", MessageDialogKind::Info);
            return Ok(());
        }
        Some(u) => u,
    };

    // ── 阶段 2：发现新版本，询问用户 ──
    let version = update.version.clone();
    let current = update.current_version.clone();
    let body = update.body.clone().unwrap_or_default();

    let msg = if body.is_empty() {
        format!("发现新版本 v{version}\n当前版本 v{current}\n\n是否立即下载并安装？")
    } else {
        // 限制 release notes 长度，原生 dialog 不适合展示长文
        let trimmed: String = body.chars().take(500).collect();
        let ellipsis = if body.chars().count() > 500 { "…" } else { "" };
        format!("发现新版本 v{version}\n当前版本 v{current}\n\n{trimmed}{ellipsis}\n\n是否立即下载并安装？")
    };

    let accepted = confirm(&app, "检查更新", &msg, "立即更新", "稍后").await;
    if !accepted {
        return Ok(());
    }

    // ── 阶段 3：下载并安装（显示确定进度条） ──
    #[cfg(target_os = "macos")]
    show_native_progress(&app, "软件更新", "正在下载更新...", false);

    let app_for_progress = app.clone();
    let mut downloaded_total: u64 = 0;

    #[cfg(target_os = "macos")]
    let app_native = app.clone();
    #[cfg(target_os = "macos")]
    let last_pct = std::sync::atomic::AtomicU32::new(0);

    let install_result = update
        .download_and_install(
            move |chunk_len, total| {
                downloaded_total = downloaded_total.saturating_add(chunk_len as u64);

                // macOS: 更新原生进度弹窗（节流：每 1% 更新一次）
                #[cfg(target_os = "macos")]
                if let Some(t) = total {
                    let pct = ((downloaded_total as f64 / t as f64) * 100.0) as u32;
                    if pct > last_pct.load(Ordering::Relaxed) {
                        last_pct.store(pct, Ordering::Relaxed);
                        let p = pct as f64;
                        let a = app_native.clone();
                        let _ = a.run_on_main_thread(move || {
                            crate::progress_dialog::update_progress(p);
                        });
                    }
                }

                let _ = app_for_progress.emit(
                    "update-progress",
                    UpdateProgress {
                        chunk: chunk_len,
                        total,
                        downloaded: downloaded_total,
                        phase: "downloading",
                    },
                );
            },
            || {},
        )
        .await;

    #[cfg(target_os = "macos")]
    close_native_progress(&app);

    match install_result {
        Ok(_) => {
            let _ = app.emit(
                "update-progress",
                UpdateProgress {
                    chunk: 0,
                    total: None,
                    downloaded: 0,
                    phase: "finished",
                },
            );
            // 重启以应用更新
            app.restart();
        }
        Err(e) => {
            let _ = app.emit(
                "update-progress",
                UpdateProgress {
                    chunk: 0,
                    total: None,
                    downloaded: 0,
                    phase: "failed",
                },
            );
            info(
                &app,
                "更新失败",
                &format!("下载或安装失败: {e}"),
                MessageDialogKind::Error,
            );
            Err(format!("下载/安装失败: {e}"))
        }
    }
}
