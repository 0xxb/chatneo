use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use percent_encoding::percent_decode_str;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone, Debug)]
pub struct WebDavEntry {
    pub name: String,
    pub size: u64,
    pub modified: String,
    pub is_collection: bool,
}

/// Strip namespace prefix from a tag name, e.g. "D:href" -> "href".
fn local_name(tag: &[u8]) -> String {
    let s = String::from_utf8_lossy(tag);
    match s.split_once(':') {
        Some((_, local)) => local.to_string(),
        None => s.to_string(),
    }
}

/// Build the full URL for a given path on the WebDAV server.
fn build_url(base_url: &str, path: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let path = path.trim_start_matches('/');
    if path.is_empty() {
        format!("{}/", base)
    } else {
        format!("{}/{}", base, path)
    }
}

/// Send a request with automatic Basic/Digest auth negotiation.
/// First tries with Basic auth; if the server responds with 401 and a Digest
/// challenge, re-sends the request using Digest authentication.
async fn send_authed(
    client: &reqwest::Client,
    method: reqwest::Method,
    url: &str,
    username: &str,
    password: &str,
    headers: Option<Vec<(&str, &str)>>,
    body: Option<Vec<u8>>,
) -> Result<reqwest::Response, String> {
    let apply_extras = |mut req: reqwest::RequestBuilder, with_body: bool| {
        if let Some(ref hdrs) = headers {
            for (k, v) in hdrs { req = req.header(*k, *v); }
        }
        if with_body {
            if let Some(ref b) = body { req = req.body(b.clone()); }
        }
        req
    };

    // First attempt with Basic auth (skip body to avoid wasting bandwidth on 401)
    let has_body = body.is_some();
    let req = apply_extras(
        client.request(method.clone(), url).basic_auth(username, Some(password)),
        !has_body, // send body only when there's none (no cost), skip large bodies
    );
    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;

    if resp.status().as_u16() != 401 {
        // Basic auth worked; if we skipped the body, retry with it only on success
        if has_body && (resp.status().is_success() || resp.status().as_u16() == 207) {
            let req = apply_extras(
                client.request(method, url).basic_auth(username, Some(password)),
                true,
            );
            return req.send().await.map_err(|e| format!("请求失败: {e}"));
        }
        return Ok(resp);
    }

    // Check for Digest challenge
    let www_auth = match resp.headers().get("www-authenticate") {
        Some(v) => v.to_str().unwrap_or("").to_string(),
        None => return Ok(resp),
    };
    if !www_auth.to_lowercase().starts_with("digest ") {
        return Ok(resp);
    }

    // Build Digest auth response
    let uri = url::Url::parse(url)
        .map(|u| u.path().to_string())
        .unwrap_or_else(|_| "/".to_string());
    let method_str = method.as_str();
    let context = digest_auth::AuthContext::new_with_method(
        username, password, &uri, Option::<&[u8]>::None,
        digest_auth::HttpMethod(std::borrow::Cow::Borrowed(method_str)),
    );
    let mut prompt = digest_auth::parse(&www_auth)
        .map_err(|e| format!("Digest 认证解析失败: {e}"))?;
    let auth_header = prompt
        .respond(&context)
        .map_err(|e| format!("Digest 认证响应生成失败: {e}"))?
        .to_header_string();

    let req = apply_extras(
        client.request(method, url).header("Authorization", auth_header),
        true,
    );
    req.send().await.map_err(|e| format!("请求失败: {e}"))
}

/// Validate that a WebDAV path does not contain path traversal sequences.
fn validate_webdav_path(path: &str) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    for segment in normalized.split('/') {
        if segment == ".." {
            return Err("路径中不允许包含 '..'".into());
        }
    }
    Ok(())
}

/// Recursively create parent directories via MKCOL, ignoring 405 (already exists).
async fn ensure_parent_dirs(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    password: &str,
    path: &str,
) -> Result<(), String> {
    let path = path.trim_start_matches('/');
    let parts: Vec<&str> = path.split('/').collect();
    // Skip the last part (the file itself)
    if parts.len() <= 1 {
        return Ok(());
    }
    let mkcol = reqwest::Method::from_bytes(b"MKCOL").map_err(|e| format!("HTTP 方法创建失败: {e}"))?;
    let mut current = String::new();
    for part in &parts[..parts.len() - 1] {
        current = if current.is_empty() {
            part.to_string()
        } else {
            format!("{}/{}", current, part)
        };
        let url = build_url(base_url, &format!("{}/", current));
        let resp = send_authed(client, mkcol.clone(), &url, username, password, None, None).await?;
        let status = resp.status().as_u16();
        // 201 = created, 405 = already exists — both are fine
        if status != 201 && status != 405 {
            return Err(format!("创建目录 {} 失败，状态码: {}", current, status));
        }
    }
    Ok(())
}

/// Parse PROPFIND XML response into entries.
fn parse_propfind_xml(xml: &str, request_path: &str) -> Result<Vec<WebDavEntry>, String> {
    let mut reader = Reader::from_str(xml);
    let mut entries = Vec::new();

    let mut in_response = false;
    let mut in_propstat = false;
    let mut in_prop = false;
    let mut current_href = String::new();
    let mut current_size: u64 = 0;
    let mut current_modified = String::new();
    let mut current_is_collection = false;
    let mut current_tag = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let tag = local_name(e.name().as_ref());
                match tag.as_str() {
                    "response" => {
                        in_response = true;
                        current_href.clear();
                        current_size = 0;
                        current_modified.clear();
                        current_is_collection = false;
                    }
                    "propstat" => in_propstat = true,
                    "prop" => in_prop = true,
                    "collection" => {
                        if in_prop {
                            current_is_collection = true;
                        }
                    }
                    _ => {}
                }
                if in_response {
                    current_tag = tag;
                }
            }
            Ok(Event::Empty(ref e)) => {
                let tag = local_name(e.name().as_ref());
                if tag == "collection" && in_prop {
                    current_is_collection = true;
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_response {
                    let text = e.unescape().unwrap_or_default().to_string();
                    match current_tag.as_str() {
                        "href" => {
                            if !in_propstat {
                                current_href = text;
                            }
                        }
                        "getcontentlength" => {
                            if in_prop {
                                current_size = text.parse().unwrap_or(0);
                            }
                        }
                        "getlastmodified" => {
                            if in_prop {
                                current_modified = text;
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = local_name(e.name().as_ref());
                match tag.as_str() {
                    "response" => {
                        in_response = false;
                        // Skip the parent directory entry
                        let href_decoded =
                            percent_decode_str(&current_href).decode_utf8_lossy().to_string();
                        let req_normalized = request_path.trim_end_matches('/');
                        let href_normalized = href_decoded.trim_end_matches('/');
                        if !href_normalized.ends_with(req_normalized) || req_normalized.is_empty() {
                            // Extract name from href
                            let name = current_href
                                .trim_end_matches('/')
                                .rsplit('/')
                                .next()
                                .unwrap_or("")
                                .to_string();
                            let name = percent_decode_str(&name).decode_utf8_lossy().to_string();
                            if !name.is_empty() {
                                entries.push(WebDavEntry {
                                    name,
                                    size: current_size,
                                    modified: current_modified.clone(),
                                    is_collection: current_is_collection,
                                });
                            }
                        }
                    }
                    "propstat" => in_propstat = false,
                    "prop" => in_prop = false,
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML 解析失败: {e}")),
            _ => {}
        }
    }

    Ok(entries)
}

#[tauri::command]
pub async fn webdav_test_connection(
    app: AppHandle,
    url: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let client = crate::build_http_client(&app)?;
    let propfind = reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| format!("HTTP 方法创建失败: {e}"))?;
    let resp = send_authed(
        &client, propfind, &url, &username, &password,
        Some(vec![("Depth", "0")]), None,
    ).await.map_err(|e| format!("连接失败: {e}"))?;

    let status = resp.status();
    if status.is_success() || status.as_u16() == 207 {
        Ok(())
    } else {
        Err(format!("连接失败，状态码: {}", status.as_u16()))
    }
}

#[tauri::command]
pub async fn webdav_propfind(
    app: AppHandle,
    url: String,
    username: String,
    password: String,
    path: String,
) -> Result<Vec<WebDavEntry>, String> {
    validate_webdav_path(&path)?;
    let client = crate::build_http_client(&app)?;
    let propfind = reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| format!("HTTP 方法创建失败: {e}"))?;
    let full_url = build_url(&url, &path);

    let resp = send_authed(
        &client, propfind, &full_url, &username, &password,
        Some(vec![("Depth", "1")]), None,
    ).await.map_err(|e| format!("列目录失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() && status.as_u16() != 207 {
        return Err(format!("列目录失败，状态码: {}", status.as_u16()));
    }

    let xml = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    parse_propfind_xml(&xml, &path)
}

#[tauri::command]
pub async fn webdav_put(
    app: AppHandle,
    url: String,
    username: String,
    password: String,
    path: String,
    data: String,
) -> Result<(), String> {
    validate_webdav_path(&path)?;
    let client = crate::build_http_client(&app)?;
    let bytes = BASE64.decode(&data).map_err(|e| format!("Base64 解码失败: {e}"))?;

    ensure_parent_dirs(&client, &url, &username, &password, &path).await?;

    let full_url = build_url(&url, &path);
    let resp = send_authed(
        &client, reqwest::Method::PUT, &full_url, &username, &password,
        None, Some(bytes),
    ).await.map_err(|e| format!("上传失败: {e}"))?;

    let status = resp.status();
    if status.is_success() || status.as_u16() == 201 || status.as_u16() == 204 {
        Ok(())
    } else if status.as_u16() == 507 {
        Err("存储空间不足".into())
    } else {
        Err(format!("上传失败，状态码: {}", status.as_u16()))
    }
}

#[tauri::command]
pub async fn webdav_get(
    app: AppHandle,
    url: String,
    username: String,
    password: String,
    path: String,
) -> Result<String, String> {
    validate_webdav_path(&path)?;
    let client = crate::build_http_client(&app)?;
    let full_url = build_url(&url, &path);

    let resp = send_authed(
        &client, reqwest::Method::GET, &full_url, &username, &password,
        None, None,
    ).await.map_err(|e| format!("下载失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("下载失败，状态码: {}", status.as_u16()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败: {e}"))?;
    Ok(BASE64.encode(&bytes))
}

#[tauri::command]
pub async fn webdav_delete(
    app: AppHandle,
    url: String,
    username: String,
    password: String,
    path: String,
) -> Result<(), String> {
    validate_webdav_path(&path)?;
    let client = crate::build_http_client(&app)?;
    let full_url = build_url(&url, &path);

    let resp = send_authed(
        &client, reqwest::Method::DELETE, &full_url, &username, &password,
        None, None,
    ).await.map_err(|e| format!("删除失败: {e}"))?;

    let status = resp.status();
    // 200, 204 = success; 404 = already deleted
    if status.is_success() || status.as_u16() == 204 || status.as_u16() == 404 {
        Ok(())
    } else {
        Err(format!("删除失败，状态码: {}", status.as_u16()))
    }
}
