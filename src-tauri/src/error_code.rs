/// Wraps an error message with a machine-readable error code prefix.
/// Format: `[ERROR_CODE] human-readable message`
/// Frontend can parse the code from the bracket prefix.
pub fn coded(code: &str, message: impl std::fmt::Display) -> String {
    format!("[{code}] {message}")
}
