#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    let mut fonts = get_system_fonts_impl();
    fonts.sort_unstable();
    fonts.dedup();
    fonts
}

#[cfg(target_os = "macos")]
fn get_system_fonts_impl() -> Vec<String> {
    use core_text::font_collection::create_for_all_families;

    let collection = create_for_all_families();
    let descriptors = match collection.get_descriptors() {
        Some(d) => d,
        None => return Vec::new(),
    };

    let mut fonts = Vec::with_capacity(descriptors.len() as usize);
    for i in 0..descriptors.len() {
        if let Some(desc) = descriptors.get(i) {
            let name = desc.family_name();
            if !name.starts_with('.') && !name.starts_with("__") {
                fonts.push(name);
            }
        }
    }
    fonts
}

#[cfg(target_os = "windows")]
fn get_system_fonts_impl() -> Vec<String> {
    Vec::new()
}

#[cfg(target_os = "linux")]
fn get_system_fonts_impl() -> Vec<String> {
    if let Ok(output) = std::process::Command::new("fc-list")
        .args(["--format", "%{family}\n"])
        .output()
    {
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|l| l.split(',').next().unwrap_or(l).trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        Vec::new()
    }
}
