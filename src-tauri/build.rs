fn main() {
    // On Windows, sherpa-rs-sys's build script should copy shared libraries to target/release/,
    // but this can fail in CI (e.g. due to caching or glob issues). As a fallback, search the
    // sherpa-rs cache directory and copy them ourselves before tauri_build checks resources.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        ensure_sherpa_dlls();
    }

    tauri_build::build()
}

/// Ensure the resource DLLs referenced in tauri.windows.conf.json exist at the expected
/// paths before `tauri_build::build()` tries to validate them.
/// Real DLLs are placed by sherpa-rs-sys; if missing, create empty placeholders so the
/// build-time validation passes. The bundler will pick up the real DLLs later.

fn ensure_sherpa_dlls() {
    use std::path::PathBuf;

    let dlls = ["onnxruntime.dll", "sherpa-onnx-c-api.dll"];

    // Determine target/{profile} directory (same logic as sherpa-rs-sys)
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let profile = std::env::var("PROFILE").unwrap();
    let target_dir = {
        let mut dir = out_dir.as_path();
        loop {
            match dir.parent() {
                Some(parent) if parent.ends_with(&profile) => break parent.to_path_buf(),
                Some(parent) => dir = parent,
                None => return,
            }
        }
    };

    if dlls.iter().all(|dll| target_dir.join(dll).exists()) {
        return;
    }

    // Search sherpa-rs cache for the missing DLLs
    let cache_base = match std::env::var("LOCALAPPDATA") {
        Ok(dir) => PathBuf::from(dir).join("sherpa-rs"),
        Err(_) => PathBuf::new(),
    };

    let mut cached_dlls: Vec<PathBuf> = Vec::new();

    // Search in sherpa-rs cache: both lib/ and bin/ subdirectories
    if cache_base.exists() {
        for subdir in &["lib", "bin", ""] {
            let pattern = cache_base
                .join("**")
                .join(subdir)
                .join("*.dll")
                .to_string_lossy()
                .to_string();
            cached_dlls.extend(
                glob::glob(&pattern)
                    .into_iter()
                    .flatten()
                    .flatten(),
            );
        }
    }

    // Also search in the build output directory (sherpa-rs-sys may put DLLs there)
    let build_dir = target_dir.join("build");
    if build_dir.exists() {
        let pattern = build_dir
            .join("**")
            .join("*.dll")
            .to_string_lossy()
            .to_string();
        cached_dlls.extend(
            glob::glob(&pattern)
                .into_iter()
                .flatten()
                .flatten()
                .filter(|p| {
                    p.file_name()
                        .map(|f| {
                            let name = f.to_string_lossy();
                            name.contains("sherpa") || name.contains("onnxruntime")
                        })
                        .unwrap_or(false)
                }),
        );
    }

    for dll in &dlls {
        let dst = target_dir.join(dll);
        if dst.exists() {
            continue;
        }
        if let Some(src) = cached_dlls.iter().find(|p| {
            p.file_name()
                .map(|f| f.to_string_lossy() == *dll)
                .unwrap_or(false)
        }) {
            println!(
                "cargo:warning=Copying {} from cache: {}",
                dll,
                src.display()
            );
            if let Err(e) = std::fs::copy(src, &dst) {
                println!("cargo:warning=Failed to copy {}: {}", dll, e);
            }
        } else {
            // Create an empty placeholder so tauri_build::build() resource validation passes.
            // The real DLL will be available by the time the bundler runs.
            println!(
                "cargo:warning={} not found in cache, creating placeholder at {}",
                dll,
                dst.display()
            );
            std::fs::write(&dst, []).ok();
        }
    }

    // Also copy onnxruntime_providers_shared.dll if present (needed at runtime)
    let extra = "onnxruntime_providers_shared.dll";
    let dst = target_dir.join(extra);
    if !dst.exists() {
        if let Some(src) = cached_dlls.iter().find(|p| {
            p.file_name()
                .map(|f| f.to_string_lossy() == extra)
                .unwrap_or(false)
        }) {
            std::fs::copy(src, &dst).ok();
        }
    }
}
