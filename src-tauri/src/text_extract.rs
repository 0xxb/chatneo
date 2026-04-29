//! Shared text extraction utilities used by both knowledge base and tool modules.

use scraper::ElementRef;

/// Recursively extract visible text from an HTML element, skipping noise tags.
pub fn extract_text_from_html(element: &ElementRef, skip_tags: &[&str], out: &mut String) {
    use scraper::Node;
    for child in element.children() {
        match child.value() {
            Node::Text(text) => {
                out.push_str(text);
            }
            Node::Element(el) => {
                let tag = el.name();
                if skip_tags.contains(&tag) {
                    continue;
                }
                if let Some(child_ref) = ElementRef::wrap(child) {
                    extract_text_from_html(&child_ref, skip_tags, out);
                }
            }
            _ => {}
        }
    }
}

/// Collapse runs of whitespace into single spaces and trim.
pub fn collapse_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut prev_ws = true; // trim leading whitespace
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !prev_ws {
                result.push(' ');
                prev_ws = true;
            }
        } else {
            result.push(ch);
            prev_ws = false;
        }
    }
    if result.ends_with(' ') {
        result.pop();
    }
    result
}

/// Default set of HTML tags to skip when extracting text.
pub const SKIP_TAGS: [&str; 7] = ["script", "style", "nav", "header", "footer", "aside", "noscript"];

/// Extract text from PDF bytes.
pub fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| format!("解析 PDF 失败: {e}"))
}
