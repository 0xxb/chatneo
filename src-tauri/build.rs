fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        copy_sherpa_dlls();
    }

    tauri_build::build()
}

/// Copy sherpa/onnxruntime DLLs directly into CARGO_MANIFEST_DIR (src-tauri/)
/// so tauri_build can find them as resources via `./file.dll`.
///
/// sherpa-rs-sys downloads prebuilt shared libs but its extract_lib_assets()
/// only searches lib/ for DLLs (Windows archives put them in bin/).
fn copy_sherpa_dlls() {
    use std::path::PathBuf;

    let dlls = [
        "onnxruntime.dll",
        "sherpa-onnx-c-api.dll",
        "onnxruntime_providers_shared.dll",
    ];

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());

    // Determine target/{profile} directory from OUT_DIR (absolute, CWD-independent)
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

    // Collect candidate DLLs from target dir and sherpa-rs cache
    let mut sources: Vec<PathBuf> = Vec::new();

    // 1. Check target dir first (sherpa-rs-sys copies here)
    for dll in &dlls {
        let p = target_dir.join(dll);
        if p.exists() {
            sources.push(p);
        }
    }

    // 2. If not all found, search sherpa-rs download cache
    if !dlls[..2].iter().all(|d| {
        sources
            .iter()
            .any(|s| s.file_name().unwrap().to_string_lossy() == *d)
    }) {
        let cache_base = match std::env::var("LOCALAPPDATA") {
            Ok(dir) => PathBuf::from(dir).join("sherpa-rs"),
            Err(_) => PathBuf::new(),
        };
        if cache_base.exists() {
            find_dlls_recursive(&cache_base, &mut sources);
        }
        let build_dir = target_dir.join("build");
        if build_dir.exists() {
            let mut build_dlls = Vec::new();
            find_dlls_recursive(&build_dir, &mut build_dlls);
            sources.extend(build_dlls.into_iter().filter(|p| {
                p.file_name()
                    .map(|f| {
                        let n = f.to_string_lossy();
                        n.contains("sherpa") || n.contains("onnxruntime")
                    })
                    .unwrap_or(false)
            }));
        }
    }

    // Copy DLLs directly into src-tauri/ (next to Cargo.toml)
    for dll in &dlls {
        let dst = manifest_dir.join(dll);
        if dst.exists() {
            continue;
        }
        if let Some(src) = sources.iter().find(|p| {
            p.file_name()
                .map(|f| f.to_string_lossy() == *dll)
                .unwrap_or(false)
        }) {
            println!("cargo:warning=Copying {} from {}", dll, src.display());
            if let Err(e) = std::fs::copy(src, &dst) {
                println!("cargo:warning=Failed to copy {}: {}", dll, e);
            }
        } else if *dll != "onnxruntime_providers_shared.dll" {
            println!("cargo:warning={} not found, creating placeholder", dll);
            if let Err(e) = std::fs::write(&dst, []) {
                println!("cargo:warning=Failed to create placeholder: {}", e);
            }
        }
    }
}

/// Recursively find all .dll files under `dir`.
fn find_dlls_recursive(dir: &std::path::Path, results: &mut Vec<std::path::PathBuf>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            find_dlls_recursive(&path, results);
        } else if path.extension().and_then(|e| e.to_str()) == Some("dll") {
            results.push(path);
        }
    }
}
