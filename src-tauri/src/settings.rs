use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static SETTINGS_CONN: OnceLock<Mutex<rusqlite::Connection>> = OnceLock::new();

fn get_conn(app: &tauri::AppHandle) -> Option<&'static Mutex<rusqlite::Connection>> {
    let db_path = app.path().app_data_dir().ok()?.join("chatneo.db");
    if !db_path.exists() {
        return None;
    }
    Some(SETTINGS_CONN.get_or_init(|| {
        let conn = rusqlite::Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .expect("Failed to open settings DB");
        Mutex::new(conn)
    }))
}

pub fn get_setting(app: &tauri::AppHandle, key: &str) -> Option<String> {
    let conn = get_conn(app)?.lock().ok()?;
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .ok()
}
