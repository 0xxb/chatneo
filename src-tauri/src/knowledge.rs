use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::Manager;
use zerocopy::IntoBytes;

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ChunkInput {
    pub document_id: String,
    pub content: String,
    pub position: i64,
    pub token_count: Option<i64>,
    pub embedding: Vec<f32>,
}

#[derive(Serialize)]
pub struct ChunkSearchResult {
    pub chunk_id: i64,
    pub document_id: String,
    pub document_name: String,
    pub document_type: String,
    pub knowledge_base_id: String,
    pub content: String,
    pub position: i64,
    pub distance: f64,
}


// ─── Extension init ─────────────────────────────────────────────────────────

fn db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {e}"))?
        .join("chatneo.db"))
}

fn open_vec_db(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| unsafe {
        // SAFETY: sqlite3_vec_init has the signature expected by sqlite3_auto_extension
        // (i.e. fn(*mut sqlite3, *mut *const c_char, *const sqlite3_api_routines) -> c_int).
        // The transmute is required because rusqlite::ffi types differ from sqlite_vec's.
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
    let path = db_path(app)?;
    let conn =
        rusqlite::Connection::open(&path).map_err(|e| format!("数据库打开失败: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("PRAGMA 设置失败: {e}"))?;
    Ok(conn)
}

fn vec_table_name(dimensions: i64) -> Result<String, String> {
    if dimensions <= 0 || dimensions > 10000 {
        return Err(format!("无效的向量维度: {dimensions}"));
    }
    Ok(format!("knowledge_chunks_vec_{dimensions}"))
}

fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        params![name],
        |row| row.get::<_, i64>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

/// One-time migration from old shared `knowledge_chunks_vec` table to per-dimension tables.
fn migrate_old_vec_table(conn: &rusqlite::Connection) -> Result<(), String> {
    static MIGRATED: OnceLock<Result<(), String>> = OnceLock::new();
    let result = MIGRATED.get_or_init(|| {
        if !table_exists(conn, "knowledge_chunks_vec") {
            return Ok(());
        }
        let old_dims: Option<i64> = conn
            .query_row(
                "SELECT vec_length(embedding) FROM knowledge_chunks_vec LIMIT 1",
                [],
                |row| row.get(0),
            )
            .ok();
        if let Some(dims) = old_dims {
            let target = vec_table_name(dims).map_err(|e| format!("迁移失败: {e}"))?;
            conn.execute_batch(&format!(
                "CREATE VIRTUAL TABLE IF NOT EXISTS \"{target}\" USING vec0(
                    chunk_id INTEGER PRIMARY KEY,
                    embedding float[{dims}]
                );
                INSERT OR IGNORE INTO \"{target}\" (chunk_id, embedding)
                    SELECT chunk_id, embedding FROM knowledge_chunks_vec;"
            ))
            .map_err(|e| format!("迁移向量数据失败: {e}"))?;
            tracing::info!("已迁移旧向量表数据到 {target}");
        }
        conn.execute_batch("DROP TABLE knowledge_chunks_vec;")
            .map_err(|e| format!("删除旧向量表失败: {e}"))?;
        tracing::info!("已删除旧向量表 knowledge_chunks_vec");
        Ok(())
    });
    result.clone()
}

/// Ensure the vector table for a specific dimension exists.
fn ensure_vec_table(conn: &rusqlite::Connection, dimensions: i64) -> Result<(), String> {
    migrate_old_vec_table(conn)?;

    let table = vec_table_name(dimensions)?;
    if !table_exists(conn, &table) {
        conn.execute_batch(&format!(
            "CREATE VIRTUAL TABLE \"{table}\" USING vec0(
                chunk_id INTEGER PRIMARY KEY,
                embedding float[{dimensions}]
            );"
        ))
        .map_err(|e| format!("创建向量表失败: {e}"))?;
        tracing::info!("向量表已创建: {table}");
    }

    Ok(())
}

// ─── Commands ───────────────────────────────────────────────────────────────

/// Store chunks with their embeddings.
#[tauri::command]
pub async fn kb_store_chunks(
    app: tauri::AppHandle,
    chunks: Vec<ChunkInput>,
    dimensions: i64,
) -> Result<Vec<i64>, String> {
    if dimensions <= 0 || dimensions > 10000 {
        return Err(format!("无效的向量维度: {dimensions}，允许范围 1-10000"));
    }
    tokio::task::spawn_blocking(move || {
        let mut conn = open_vec_db(&app)?;
        ensure_vec_table(&conn, dimensions)?;

        let tx = conn.transaction().map_err(|e| format!("开启事务失败: {e}"))?;

        let mut chunk_ids = Vec::with_capacity(chunks.len());
        let table = vec_table_name(dimensions)?;
        let vec_sql = format!("INSERT INTO \"{table}\" (chunk_id, embedding) VALUES (?1, ?2)");

        for chunk in &chunks {
            tx.execute(
                "INSERT INTO knowledge_chunks (document_id, content, position, token_count) VALUES (?1, ?2, ?3, ?4)",
                params![chunk.document_id, chunk.content, chunk.position, chunk.token_count],
            )
            .map_err(|e| format!("插入分段失败: {e}"))?;

            let chunk_id = tx.last_insert_rowid();
            chunk_ids.push(chunk_id);

            let embedding_bytes = chunk.embedding.as_bytes();
            tx.execute(&vec_sql, params![chunk_id, embedding_bytes])
                .map_err(|e| format!("插入向量失败: {e}"))?;
        }

        // Update document chunk_count
        if let Some(first) = chunks.first() {
            tx.execute(
                "UPDATE knowledge_documents SET chunk_count = (
                    SELECT COUNT(*) FROM knowledge_chunks WHERE document_id = ?1
                ) WHERE id = ?1",
                params![first.document_id],
            )
            .map_err(|e| format!("更新分段计数失败: {e}"))?;
        }

        tx.commit().map_err(|e| format!("提交事务失败: {e}"))?;

        Ok(chunk_ids)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// KNN search across knowledge bases.
#[tauri::command]
pub async fn kb_search_chunks(
    app: tauri::AppHandle,
    query_embedding: Vec<f32>,
    knowledge_base_ids: Vec<String>,
    dimensions: i64,
    top_k: i64,
) -> Result<Vec<ChunkSearchResult>, String> {
    if dimensions <= 0 || dimensions > 10000 {
        return Err(format!("无效的向量维度: {dimensions}，允许范围 1-10000"));
    }
    let top_k = top_k.max(1).min(200);
    tokio::task::spawn_blocking(move || {
        let conn = open_vec_db(&app)?;
        let table = vec_table_name(dimensions)?;

        // 空知识库(从未处理过文档)没有对应维度的向量表，直接返回空结果。
        if !table_exists(&conn, &table) {
            return Ok(Vec::new());
        }

        let query_bytes = query_embedding.as_bytes();

        // Build placeholders for KB IDs
        let placeholders: Vec<String> = knowledge_base_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 3))
            .collect();
        let placeholders_str = placeholders.join(", ");

        let sql = format!(
            "WITH knn AS (
                SELECT chunk_id, distance
                FROM \"{table}\"
                WHERE embedding MATCH ?1 AND k = ?2
            )
            SELECT knn.chunk_id, knn.distance,
                   c.document_id, c.content, c.position,
                   d.name, d.type, d.knowledge_base_id
            FROM knn
            JOIN knowledge_chunks c ON c.id = knn.chunk_id
            JOIN knowledge_documents d ON d.id = c.document_id
            WHERE d.knowledge_base_id IN ({placeholders_str})
            ORDER BY knn.distance ASC
            LIMIT {top_k}"
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| format!("查询准备失败: {e}"))?;

        // Build params: query_bytes, over_fetch_k, then each kb_id
        let over_fetch_k = top_k.saturating_mul(5);
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        param_values.push(Box::new(query_bytes.to_vec()));
        param_values.push(Box::new(over_fetch_k));
        for kb_id in &knowledge_base_ids {
            param_values.push(Box::new(kb_id.clone()));
        }
        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let results = stmt
            .query_map(params_ref.as_slice(), |row| {
                Ok(ChunkSearchResult {
                    chunk_id: row.get(0)?,
                    distance: row.get(1)?,
                    document_id: row.get(2)?,
                    content: row.get(3)?,
                    position: row.get(4)?,
                    document_name: row.get(5)?,
                    document_type: row.get(6)?,
                    knowledge_base_id: row.get(7)?,
                })
            })
            .map_err(|e| format!("查询执行失败: {e}"))?;

        let mut out = Vec::new();
        for r in results {
            out.push(r.map_err(|e| format!("读取结果失败: {e}"))?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// Delete all chunks and vectors for given documents.
#[tauri::command]
pub async fn kb_delete_chunks(
    app: tauri::AppHandle,
    document_ids: Vec<String>,
    dimensions: i64,
) -> Result<(), String> {
    if dimensions <= 0 || dimensions > 10000 {
        return Err(format!("无效的向量维度: {dimensions}，允许范围 1-10000"));
    }
    tokio::task::spawn_blocking(move || {
        let mut conn = open_vec_db(&app)?;
        let table = vec_table_name(dimensions)?;

        // 新建知识库默认带 dimensions 但未必有实际向量表（所有文档都还 pending 时）。
        // 此时删 pending/failed 文档或删整库不应因 "no such table" 而失败。
        let vec_table_present = table_exists(&conn, &table);
        let vec_del_sql = format!(
            "DELETE FROM \"{table}\" WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE document_id = ?1)"
        );

        let tx = conn.transaction().map_err(|e| format!("开启事务失败: {e}"))?;

        for document_id in &document_ids {
            if vec_table_present {
                tx.execute(&vec_del_sql, params![document_id])
                    .map_err(|e| format!("删除向量失败: {e}"))?;
            }

            tx.execute(
                "DELETE FROM knowledge_chunks WHERE document_id = ?1",
                params![document_id],
            )
            .map_err(|e| format!("删除分段失败: {e}"))?;

            tx.execute(
                "UPDATE knowledge_documents SET chunk_count = 0 WHERE id = ?1",
                params![document_id],
            )
            .map_err(|e| format!("更新分段计数失败: {e}"))?;
        }

        tx.commit().map_err(|e| format!("提交事务失败: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// Parse a document and extract text content.
#[tauri::command]
pub async fn kb_parse_document(path: String, doc_type: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let file_path = std::path::Path::new(&path);
        crate::tools::validate_file_path(file_path)?;

        match doc_type.as_str() {
            "pdf" => {
                let bytes =
                    std::fs::read(file_path).map_err(|e| format!("读取文件失败: {e}"))?;
                crate::text_extract::extract_pdf_text(&bytes)
            }
            "txt" | "md" => {
                std::fs::read_to_string(file_path).map_err(|e| format!("读取文件失败: {e}"))
            }
            _ => Err(format!("不支持的文件类型: {doc_type}")),
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// Fetch a webpage and extract text content.
#[tauri::command]
pub async fn kb_fetch_webpage(app: tauri::AppHandle, url: String) -> Result<String, String> {
    use scraper::{Html, Selector};

    // 知识库导入 URL 不能绕过外部工具的 SSRF 边界，否则就是一条通过 RAG 入口的内网探测链路。
    crate::tools::validate_public_url(&url).await?;

    let client = crate::build_http_client(&app)?;
    const MAX_HTML_SIZE: u64 = 10 * 1024 * 1024;
    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .header("User-Agent", "Mozilla/5.0 (compatible; ChatNeo/1.0)")
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("服务器返回错误: {e}"))?;

    if let Some(len) = resp.content_length() {
        if len > MAX_HTML_SIZE {
            return Err(format!("网页过大: {} 字节，最大允许 {} 字节", len, MAX_HTML_SIZE));
        }
    }

    let html_text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    if html_text.len() as u64 > MAX_HTML_SIZE {
        return Err(format!("网页过大: {} 字节", html_text.len()));
    }

    let document = Html::parse_document(&html_text);
    let body_sel = Selector::parse("body").map_err(|_| "选择器解析失败".to_string())?;

    let mut content = String::new();
    if let Some(body) = document.select(&body_sel).next() {
        crate::text_extract::extract_text_from_html(&body, &crate::text_extract::SKIP_TAGS, &mut content);
    } else {
        crate::text_extract::extract_text_from_html(&document.root_element(), &crate::text_extract::SKIP_TAGS, &mut content);
    }

    let text = crate::text_extract::collapse_whitespace(&content);

    Ok(text)
}
