use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::Manager;
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};
use tracing_subscriber::fmt::time::ChronoLocal;
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::EnvFilter;

static LOG_ENABLED: AtomicBool = AtomicBool::new(true);

/// 包装 non-blocking 写入器：LOG_ENABLED 为 false 时吞掉所有写入，
/// 保证 `log_enabled=0` 后，Rust 侧所有 tracing 事件（不只是前端桥接）也不会落盘。
struct GatedWriter(NonBlocking);

impl<'a> MakeWriter<'a> for GatedWriter {
    type Writer = GatedHandle<'a>;
    fn make_writer(&'a self) -> Self::Writer {
        GatedHandle(self.0.make_writer())
    }
}

struct GatedHandle<'a>(<NonBlocking as MakeWriter<'a>>::Writer);

impl<'a> Write for GatedHandle<'a> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if is_enabled() {
            self.0.write(buf)
        } else {
            Ok(buf.len())
        }
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

/// Keep the guard alive for the lifetime of the application,
/// otherwise the non-blocking writer will drop and logs will be lost.
static GUARD: OnceLock<WorkerGuard> = OnceLock::new();

pub fn log_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("logs")
}

pub fn init(app: &tauri::AppHandle) {
    let dir = log_dir(app);
    fs::create_dir_all(&dir).ok();

    let enabled = crate::settings::get_setting(app, "log_enabled")
        .map(|v| v == "1")
        .unwrap_or(true);
    LOG_ENABLED.store(enabled, Ordering::Relaxed);

    let file_appender = tracing_appender::rolling::RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_suffix("log")
        .build(&dir)
        .expect("failed to create log appender");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let _ = GUARD.set(guard);

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new("info"))
        .with_writer(GatedWriter(non_blocking))
        .with_timer(ChronoLocal::new("%Y-%m-%d %H:%M:%S%.3f".to_string()))
        .with_ansi(false)
        .init();

    tracing::info!("日志系统已初始化");

    // Clean up old logs on startup
    let retention_days = crate::settings::get_setting(app, "log_retention_days")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(7);
    cleanup_old_logs(&dir, retention_days);
}

pub fn set_enabled(enabled: bool) {
    LOG_ENABLED.store(enabled, Ordering::Relaxed);
    if enabled {
        tracing::info!("日志已启用");
    }
}

pub fn is_enabled() -> bool {
    LOG_ENABLED.load(Ordering::Relaxed)
}

pub fn cleanup_old_logs(dir: &Path, retention_days: i64) {
    let cutoff = chrono::Local::now() - chrono::Duration::days(retention_days);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Log files are named like "2026-03-30.log"
        if let Some(date_part) = name.strip_suffix(".log") {
            if date_part < cutoff_str.as_str() {
                fs::remove_file(entry.path()).ok();
            }
        }
    }
}

#[tauri::command]
pub fn get_log_dir(app: tauri::AppHandle) -> String {
    log_dir(&app).to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_log_dir(app: tauri::AppHandle) {
    let dir = log_dir(&app);
    fs::create_dir_all(&dir).ok();
    if let Err(e) = tauri_plugin_opener::reveal_item_in_dir(&dir) {
        tracing::error!("打开日志目录失败: {e}");
    }
}

#[tauri::command]
pub fn log_message(level: String, target: String, message: String) {
    if !is_enabled() {
        return;
    }
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", category = %target, "{message}"),
        "warn" => tracing::warn!(target: "frontend", category = %target, "{message}"),
        "debug" => tracing::debug!(target: "frontend", category = %target, "{message}"),
        _ => tracing::info!(target: "frontend", category = %target, "{message}"),
    }
}

#[tauri::command]
pub fn log_api_request(
    provider: String,
    model: String,
    status: String,
    tokens: Option<u32>,
    duration_ms: u64,
) {
    if !is_enabled() {
        return;
    }
    let tokens_str = tokens
        .map(|t| t.to_string())
        .unwrap_or_else(|| "-".to_string());
    tracing::info!(
        target: "api",
        provider = %provider,
        model = %model,
        status = %status,
        tokens = %tokens_str,
        duration_ms = %duration_ms,
        "API 请求"
    );
}
