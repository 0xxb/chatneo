use std::collections::HashMap;
use std::io::Write;

use serde::Serialize;
use tauri::AppHandle;

// ─── Return types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ToolHttpResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct UrlContent {
    pub title: String,
    pub content: String,
    pub url: String,
}

#[derive(Serialize)]
pub struct CodeRunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Serialize)]
pub struct FileContent {
    pub filename: String,
    pub file_type: String,
    pub content: String,
    pub size: u64,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// 判断 IP 是否属于本地/内网/保留范围 —— 禁止作为网络工具的目标，避免把桌面端当 SSRF 代理。
fn is_forbidden_ip(ip: &std::net::IpAddr) -> bool {
    use std::net::IpAddr;
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()        // 127.0.0.0/8
                || v4.is_private()  // 10/8, 172.16/12, 192.168/16
                || v4.is_link_local() // 169.254.0.0/16 —— 覆盖 169.254.169.254 等云元数据端点
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_documentation()
                || matches!(v4.octets(), [100, b, _, _] if (64..=127).contains(&b)) // CG-NAT 100.64/10
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // ULA fc00::/7
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
                || v6.to_ipv4_mapped()
                    .map(|v4| is_forbidden_ip(&IpAddr::V4(v4)))
                    .unwrap_or(false)
        }
    }
}

/// 协议 + 主机边界检查：
/// - 只允许 http/https
/// - 拒绝 localhost / *.local / *.internal 等常见本地名
/// - DNS 解析每个地址，命中内网/环回/链路本地/云元数据即拒绝
///
/// 限制：reqwest 自带解析器会二次查询 DNS，理论上存在 DNS rebinding 风险。
/// 这里的预检是纵深防御，真正的生产级 SSRF 隔离需要网络命名空间/代理。
pub(crate) async fn validate_public_url(url_str: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(url_str).map_err(|e| format!("非法的 URL: {e}"))?;
    match url.scheme() {
        "http" | "https" => {}
        other => return Err(format!("不允许的协议: {other}（仅允许 http/https）")),
    }
    let host = url.host_str().ok_or_else(|| "URL 缺少主机名".to_string())?;
    let host_lower = host.to_lowercase();

    const FORBIDDEN_HOSTS: &[&str] = &["localhost", "metadata", "metadata.google.internal"];
    if FORBIDDEN_HOSTS.iter().any(|h| *h == host_lower.as_str()) {
        return Err(format!("不允许访问本地或元数据主机: {host}"));
    }
    const FORBIDDEN_SUFFIXES: &[&str] = &[".localhost", ".local", ".internal"];
    if FORBIDDEN_SUFFIXES.iter().any(|s| host_lower.ends_with(s)) {
        return Err(format!("不允许访问本地或元数据主机: {host}"));
    }

    // host 也可能直接是 IP 字面量 —— lookup_host 会原样返回。
    let port = url.port_or_known_default().unwrap_or(80);
    let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("DNS 解析失败: {e}"))?
        .collect();
    if addrs.is_empty() {
        return Err("DNS 未返回任何地址".to_string());
    }
    for addr in &addrs {
        let ip = addr.ip();
        if is_forbidden_ip(&ip) {
            return Err(format!("不允许访问内网或保留地址: {ip}"));
        }
    }
    Ok(())
}

/// Generic HTTP request proxy.
#[tauri::command]
pub async fn tool_http_request(
    app: AppHandle,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<ToolHttpResponse, String> {
    validate_public_url(&url).await?;
    let client = crate::build_http_client(&app)?;

    let method_parsed = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| format!("非法的 HTTP 方法: {method}"))?;

    let mut req = client
        .request(method_parsed, &url)
        .timeout(std::time::Duration::from_secs(120));
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;

    // 检查 Content-Length，拒绝超过 10MB 的响应
    const MAX_RESPONSE_SIZE: u64 = 10 * 1024 * 1024;
    if let Some(len) = resp.content_length() {
        if len > MAX_RESPONSE_SIZE {
            return Err(format!("响应体过大: {} 字节，最大允许 {} 字节", len, MAX_RESPONSE_SIZE));
        }
    }

    let status = resp.status().as_u16();
    let mut resp_headers: HashMap<String, String> = HashMap::new();
    for (k, v) in resp.headers() {
        if let Ok(val) = v.to_str() {
            resp_headers.insert(k.to_string(), val.to_string());
        }
    }
    let body_text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    if body_text.len() as u64 > MAX_RESPONSE_SIZE {
        return Err(format!("响应体过大: {} 字节", body_text.len()));
    }

    Ok(ToolHttpResponse {
        status,
        body: body_text,
        headers: resp_headers,
    })
}

/// Fetch a URL, parse HTML, and return the main text content.
#[tauri::command]
pub async fn tool_read_url(
    app: AppHandle,
    url: String,
    max_length: usize,
    timeout_secs: u64,
) -> Result<UrlContent, String> {
    use scraper::{Html, Selector};

    validate_public_url(&url).await?;

    const MAX_HTML_SIZE: u64 = 10 * 1024 * 1024;
    let client = crate::build_http_client(&app)?;
    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(timeout_secs))
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

    let html_text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    if html_text.len() as u64 > MAX_HTML_SIZE {
        return Err(format!("网页过大: {} 字节", html_text.len()));
    }
    let document = Html::parse_document(&html_text);

    // Extract title
    let title = Selector::parse("title").ok().and_then(|sel| {
        document
            .select(&sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
    }).unwrap_or_default();

    let body_sel = Selector::parse("body").map_err(|_| "选择器解析失败".to_string())?;

    let mut content = String::new();
    if let Some(body) = document.select(&body_sel).next() {
        crate::text_extract::extract_text_from_html(&body, &crate::text_extract::SKIP_TAGS, &mut content);
    } else {
        crate::text_extract::extract_text_from_html(&document.root_element(), &crate::text_extract::SKIP_TAGS, &mut content);
    }

    let content = crate::text_extract::collapse_whitespace(&content);

    // Truncate (char-boundary safe to avoid panic on multi-byte UTF-8)
    let content = if content.len() > max_length {
        let mut end = max_length;
        while end > 0 && !content.is_char_boundary(end) {
            end -= 1;
        }
        content[..end].to_string()
    } else {
        content
    };

    Ok(UrlContent { title, content, url })
}

/// Execute code in a temp file and return stdout/stderr.
#[tauri::command]
pub async fn tool_run_code(
    language: String,
    code: String,
    timeout_secs: u64,
) -> Result<CodeRunResult, String> {
    let timeout_secs = timeout_secs.min(300);
    let (interpreter, ext) = match language.to_lowercase().as_str() {
        "python" | "python3" => ("python3", "py"),
        "javascript" | "js" | "node" => ("node", "js"),
        "shell" | "sh" | "bash" => ("sh", "sh"),
        other => return Err(format!("不支持的语言: {other}")),
    };

    // Write code to a temp file
    let mut tmp = tempfile_with_ext(ext)?;
    tmp.write_all(code.as_bytes())
        .map_err(|e| format!("写入临时文件失败: {e}"))?;
    tmp.flush().map_err(|e| format!("刷新临时文件失败: {e}"))?;
    let tmp_path = tmp.path().to_path_buf();

    let timeout = std::time::Duration::from_secs(timeout_secs);

    // 用 tokio::process::Command 以便超时时真正终止子进程；
    // kill_on_drop(true) 保证即使 Future 被 drop（超时），子进程也会被 SIGKILL。
    let child = tokio::process::Command::new(interpreter)
        .arg(&tmp_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("启动子进程失败: {e}"))?;

    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let exit_code = output.status.code().unwrap_or(-1);
            Ok(CodeRunResult {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code,
            })
        }
        Ok(Err(e)) => Err(format!("执行失败: {e}")),
        // 超时：wait_with_output Future 被 drop，child 随之 drop，kill_on_drop 触发 SIGKILL
        Err(_) => Err("执行超时".into()),
    }
}

/// A NamedTempFile-alike that supports custom extensions via a wrapper.
struct TempFileWithExt {
    path: std::path::PathBuf,
    file: std::fs::File,
}

impl TempFileWithExt {
    fn path(&self) -> &std::path::Path {
        &self.path
    }
}

impl Write for TempFileWithExt {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.file.write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.file.flush()
    }
}

impl Drop for TempFileWithExt {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn tempfile_with_ext(ext: &str) -> Result<TempFileWithExt, String> {
    let dir = std::env::temp_dir();
    let name = format!("chatneo_{}.{}", uuid::Uuid::new_v4(), ext);
    let path = dir.join(name);
    let file = std::fs::File::create(&path).map_err(|e| format!("创建临时文件失败: {e}"))?;
    Ok(TempFileWithExt { path, file })
}

/// Reject paths that attempt directory traversal or access sensitive locations.
///
/// 策略：
/// 1. 系统目录（`/etc`、`/var`、`C:\Windows` 等）整体禁读
/// 2. 所有路径组件以 `.` 开头的文件/目录禁读（覆盖 `~/.ssh`、`~/.env*`、`~/.gitconfig`、
///    `~/.npmrc`、`~/.zsh_history` 等，以及项目里的 `.env.local`、`.git/config`）
/// 3. 用户级应用数据目录禁读（macOS `~/Library`、Windows `AppData`）
/// 4. 特定凭据相关文件名禁读
pub fn validate_file_path(path: &std::path::Path) -> Result<(), String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("路径解析失败: {e}"))?;
    let path_str = canonical.to_string_lossy();

    // Block directory traversal
    for component in canonical.components() {
        if let std::path::Component::ParentDir = component {
            return Err("路径中不允许包含 '..'".into());
        }
    }

    // Block known sensitive system directories
    let blocked_prefixes: &[&str] = &[
        "/etc", "/var", "/private/etc", "/private/var",
        "/System", "/Library",
        "/usr/local/etc",
        "/root",
        "C:\\Windows", "C:\\Program Files", "C:\\ProgramData",
    ];
    for prefix in blocked_prefixes {
        if path_str.starts_with(prefix) {
            return Err(format!("不允许读取系统目录: {prefix}"));
        }
    }

    // 用户级应用数据目录 —— 这些不是点目录但包含大量凭据/会话数据
    let home_dir = std::env::var("HOME").ok().or_else(|| std::env::var("USERPROFILE").ok());
    if let Some(home) = home_dir {
        let user_blocked_suffixes: &[&str] = &[
            "/Library",           // macOS: Keychains, Cookies, Application Support, Preferences
            "\\AppData",          // Windows
            "/AppData",           // Windows via forward slashes
        ];
        for suffix in user_blocked_suffixes {
            let full = format!("{home}{suffix}");
            if path_str.starts_with(&full) {
                return Err(format!("不允许读取用户应用数据目录: {suffix}"));
            }
        }
    }

    // Block any dot-prefixed path component. 覆盖 ~/.ssh, ~/.aws, ~/.env*, .git/*, .npmrc 等
    for component in canonical.components() {
        if let std::path::Component::Normal(name) = component {
            let name = name.to_string_lossy();
            if name.starts_with('.') {
                return Err(format!("不允许读取隐藏文件或目录: {name}"));
            }
        }
    }

    // Block specific credential-related filenames (大小写不敏感)
    if let Some(filename) = canonical.file_name().and_then(|n| n.to_str()) {
        let lower = filename.to_lowercase();
        let blocked_names: &[&str] = &[
            "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
            "authorized_keys", "known_hosts",
            "credentials", "credentials.json", "credentials.toml",
            "secrets.json", "secrets.yaml", "secrets.yml",
        ];
        for name in blocked_names {
            if lower == *name {
                return Err(format!("不允许读取凭据文件: {filename}"));
            }
        }
        let blocked_suffixes: &[&str] = &[".pem", ".key", ".p12", ".pfx", ".keystore", ".jks"];
        for suffix in blocked_suffixes {
            if lower.ends_with(suffix) {
                return Err(format!("不允许读取密钥文件: {filename}"));
            }
        }
    }

    Ok(())
}

/// Read and parse a local file, dispatching by extension.
#[tauri::command]
pub async fn tool_read_file(
    path: String,
    max_size: u64,
) -> Result<FileContent, String> {
    let max_size = max_size.min(100_000_000); // 上限 100MB
    let file_path = std::path::Path::new(&path);

    validate_file_path(file_path)?;

    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let metadata = std::fs::metadata(file_path).map_err(|e| format!("读取文件元数据失败: {e}"))?;
    let size = metadata.len();

    if size > max_size {
        return Err(format!("文件过大: {} 字节，最大允许 {} 字节", size, max_size));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (file_type, content) = match ext.as_str() {
        "pdf" => ("pdf".to_string(), read_pdf(file_path)?),
        "xlsx" | "xls" | "xlsm" | "ods" => ("excel".to_string(), read_excel(file_path)?),
        "docx" => ("docx".to_string(), read_docx(file_path)?),
        _ => {
            // Plain text fallback
            let text = std::fs::read_to_string(file_path)
                .map_err(|e| format!("读取文件失败: {e}"))?;
            ("text".to_string(), text)
        }
    };

    Ok(FileContent { filename, file_type, content, size })
}

fn read_pdf(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("读取 PDF 失败: {e}"))?;
    crate::text_extract::extract_pdf_text(&bytes)
}

fn read_excel(path: &std::path::Path) -> Result<String, String> {
    use calamine::{open_workbook_auto, Reader};

    let mut workbook = open_workbook_auto(path).map_err(|e| format!("打开 Excel 失败: {e}"))?;
    let mut result = String::new();

    for sheet_name in workbook.sheet_names().to_vec() {
        result.push_str(&format!("=== {} ===\n", sheet_name));
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            for row in range.rows() {
                let cells: Vec<String> = row.iter().map(|c| c.to_string()).collect();
                result.push_str(&cells.join("\t"));
                result.push('\n');
            }
        }
        result.push('\n');
    }

    Ok(result)
}

fn read_docx(path: &std::path::Path) -> Result<String, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let file = std::fs::File::open(path).map_err(|e| format!("打开 DOCX 失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("解析 ZIP 失败: {e}"))?;

    let xml_content = {
        let mut doc = archive
            .by_name("word/document.xml")
            .map_err(|_| "找不到 word/document.xml".to_string())?;
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut doc, &mut buf)
            .map_err(|e| format!("读取 document.xml 失败: {e}"))?;
        buf
    };

    let mut reader = Reader::from_reader(xml_content.as_slice());
    reader.config_mut().trim_text(true);

    let mut result = String::new();
    let mut in_w_t = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                // w:t elements hold the actual text
                if e.local_name().as_ref() == b"t" {
                    in_w_t = true;
                } else if e.local_name().as_ref() == b"br" || e.local_name().as_ref() == b"p" {
                    // paragraph / line break
                    if !result.is_empty() && !result.ends_with('\n') {
                        result.push('\n');
                    }
                    in_w_t = false;
                } else {
                    in_w_t = false;
                }
            }
            Ok(Event::Text(e)) => {
                if in_w_t {
                    let text = e.unescape().map_err(|e| format!("XML 解码失败: {e}"))?;
                    result.push_str(&text);
                }
            }
            Ok(Event::End(ref e)) => {
                if e.local_name().as_ref() == b"t" {
                    in_w_t = false;
                } else if e.local_name().as_ref() == b"p" {
                    result.push('\n');
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML 解析失败: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(result)
}
