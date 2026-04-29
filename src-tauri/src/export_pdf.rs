#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;
    use std::rc::Rc;

    use block2::RcBlock;
    use objc2::{msg_send, MainThreadMarker};
    use objc2_foundation::{NSData, NSError, NSObject, NSString};
    use objc2_web_kit::{WKPDFConfiguration, WKWebView, WKWebViewConfiguration};

    fn spin_runloop_until(condition: impl Fn() -> bool, timeout_secs: u64) -> Result<(), String> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
        while !condition() {
            if std::time::Instant::now() >= deadline {
                return Err("操作超时".to_string());
            }
            unsafe {
                let run_loop: &NSObject = msg_send![objc2::class!(NSRunLoop), currentRunLoop];
                let date: &NSObject =
                    msg_send![objc2::class!(NSDate), dateWithTimeIntervalSinceNow: 0.05f64];
                let _: () = msg_send![run_loop, runUntilDate: date];
            }
        }
        Ok(())
    }

    /// Pump the run loop for the given duration (seconds) without blocking it.
    fn pump_runloop(secs: f64) {
        unsafe {
            let run_loop: &NSObject = msg_send![objc2::class!(NSRunLoop), currentRunLoop];
            let date: &NSObject =
                msg_send![objc2::class!(NSDate), dateWithTimeIntervalSinceNow: secs];
            let _: () = msg_send![run_loop, runUntilDate: date];
        }
    }

    /// Must be called on the main thread.
    pub fn generate_pdf(html: &str) -> Result<Vec<u8>, String> {
        let mtm = unsafe { MainThreadMarker::new_unchecked() };

        let frame = objc2_foundation::NSRect::new(
            objc2_foundation::NSPoint::new(0.0, 0.0),
            objc2_foundation::NSSize::new(800.0, 600.0),
        );
        let config = unsafe { WKWebViewConfiguration::new(mtm) };
        let webview = unsafe {
            WKWebView::initWithFrame_configuration(mtm.alloc::<WKWebView>(), frame, &config)
        };

        let ns_html = NSString::from_str(html);
        unsafe {
            webview.loadHTMLString_baseURL(&ns_html, None);
        }

        let wv_ref = &webview;
        spin_runloop_until(|| unsafe { !msg_send![wv_ref, isLoading] }, 30)?;
        // 等待渲染完成（图片、布局等）— WKWebView 没有可靠的渲染完成回调
        pump_runloop(0.2);

        let result: Rc<RefCell<Option<Result<Vec<u8>, String>>>> = Rc::new(RefCell::new(None));
        let result_clone = result.clone();
        let pdf_config = unsafe { WKPDFConfiguration::new(mtm) };

        unsafe {
            let block = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
                if !data.is_null() {
                    let len: usize = msg_send![&*data, length];
                    let ptr: *const u8 = msg_send![&*data, bytes];
                    let bytes = std::slice::from_raw_parts(ptr, len).to_vec();
                    *result_clone.borrow_mut() = Some(Ok(bytes));
                } else {
                    let err_msg = if !error.is_null() {
                        let desc: *mut NSString = msg_send![&*error, localizedDescription];
                        if !desc.is_null() {
                            (*desc).to_string()
                        } else {
                            "PDF 生成失败".to_string()
                        }
                    } else {
                        "PDF 生成失败".to_string()
                    };
                    *result_clone.borrow_mut() = Some(Err(err_msg));
                }
            });
            webview.createPDFWithConfiguration_completionHandler(Some(&pdf_config), &block);
        }

        spin_runloop_until(|| result.borrow().is_some(), 30)?;

        let ret = result
            .borrow()
            .clone()
            .unwrap_or(Err("PDF 生成超时".to_string()));
        ret
    }
}

#[tauri::command]
pub async fn export_pdf(app: tauri::AppHandle, html: String) -> Result<Vec<u8>, String> {
    tracing::info!("开始 PDF 导出, HTML 大小: {} 字节", html.len());
    #[cfg(target_os = "macos")]
    {
        let main_wv = app.get_webview_window("main").ok_or("找不到主窗口")?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();

        main_wv
            .with_webview(move |_| {
                let _ = tx.send(macos::generate_pdf(&html));
            })
            .map_err(|e| e.to_string())?;

        rx.recv().map_err(|e| e.to_string())?
    }

    #[cfg(target_os = "windows")]
    {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        let seq = COUNTER.fetch_add(1, Ordering::Relaxed);

        let html_path = std::env::temp_dir()
            .join(format!("chatneo_html_{}_{}.html", std::process::id(), seq));
        std::fs::write(&html_path, &html)
            .map_err(|e| format!("写入临时 HTML 文件失败: {}", e))?;
        let file_url = format!(
            "file:///{}",
            html_path.to_string_lossy().replace('\\', "/")
        );

        let label = format!("pdf-export-{}", seq);
        let pdf_wv = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::External(file_url.parse().map_err(|e| format!("URL 解析失败: {e}"))?),
        )
        .visible(false)
        .inner_size(800.0, 600.0)
        .build()
        .map_err(|e| format!("创建 PDF 导出窗口失败: {}", e))?;

        // 等待 WebView 初始化完成
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        loop {
            if std::time::Instant::now() >= deadline {
                let _ = pdf_wv.close();
                let _ = std::fs::remove_file(&html_path);
                return Err("HTML 加载超时".to_string());
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            if pdf_wv.eval("void 0").is_ok() {
                break;
            }
        }
        // 注入 load 事件监听并通过轮询 document.title 检测页面加载完成
        let _ = pdf_wv.eval(
            "if (document.readyState === 'complete') { document.title = '__PDF_READY__'; } \
             else { window.addEventListener('load', function() { document.title = '__PDF_READY__'; }); }"
        );
        let load_deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            if std::time::Instant::now() >= load_deadline {
                tracing::warn!("PDF 导出: 页面加载检测超时，继续导出");
                break;
            }
            if let Ok(title) = pdf_wv.title() {
                if title == "__PDF_READY__" {
                    break;
                }
            }
        }
        // 额外等待确保 CSS/图片/布局渲染完成
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();
        let pdf_path = std::env::temp_dir()
            .join(format!("chatneo_pdf_{}_{}.pdf", std::process::id(), seq));
        let pdf_path_for_handler = pdf_path.clone();

        pdf_wv
            .with_webview(move |wv| {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
                use windows::core::{Interface, HSTRING};

                unsafe {
                    let controller = wv.controller();
                    let core = match controller.CoreWebView2() {
                        Ok(c) => c,
                        Err(e) => { let _ = tx.send(Err(format!("获取 WebView2 核心失败: {e}"))); return; }
                    };
                    let core7: ICoreWebView2_7 = match core.cast() {
                        Ok(c) => c,
                        Err(e) => { let _ = tx.send(Err(format!("WebView2 版本不兼容: {e}"))); return; }
                    };

                    let h_path = HSTRING::from(pdf_path_for_handler.to_string_lossy().as_ref());
                    let tmp_clone = pdf_path_for_handler.clone();

                    let tx_fallback = tx.clone();
                    let handler = webview2_com::PrintToPdfCompletedHandler::create(Box::new(
                        move |_hr, _success| {
                            let result = std::fs::read(&tmp_clone)
                                .map_err(|e| format!("读取 PDF 临时文件失败: {}", e));
                            let _ = std::fs::remove_file(&tmp_clone);
                            let _ = tx.send(result);
                            Ok(())
                        },
                    ));
                    if let Err(e) = core7.PrintToPdf(&h_path, None, &handler) {
                        let _ = tx_fallback.send(Err(format!("PDF 打印请求失败: {e}")));
                    }
                }
            })
            .map_err(|e| e.to_string())?;

        // 不论超时还是成功都要清理：把 recv 结果拿到手后再 cleanup，避免超时分支遗留临时文件和隐藏 webview。
        let recv_result = rx.recv_timeout(std::time::Duration::from_secs(30));

        let _ = std::fs::remove_file(&html_path);
        let _ = pdf_wv.close();

        match recv_result {
            Ok(r) => r,
            Err(_) => Err("PDF 生成超时".to_string()),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, html);
        Err("当前平台暂不支持 PDF 导出".to_string())
    }
}
