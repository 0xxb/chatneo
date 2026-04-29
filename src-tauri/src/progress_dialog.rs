//! macOS 原生进度弹窗：使用 NSWindow + NSProgressIndicator 手动搭建，
//! 完全控制布局，实现类似系统"软件更新"的原生体验。

use std::sync::Mutex;

use objc2::rc::Retained;
use objc2::{sel, MainThreadMarker};
use objc2_app_kit::{
    NSBackingStoreType, NSBezelStyle, NSButton, NSFloatingWindowLevel, NSFont,
    NSProgressIndicator, NSProgressIndicatorStyle, NSTextField, NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

struct State {
    window: Retained<NSWindow>,
    progress: Retained<NSProgressIndicator>,
}

// Safety: 所有公开函数仅通过 `run_on_main_thread` 在主线程调用，不会跨线程访问 UI 对象。
unsafe impl Send for State {}

static DIALOG: Mutex<Option<State>> = Mutex::new(None);

/// 显示原生进度弹窗。必须在主线程调用。
pub fn show(title: &str, message: &str, indeterminate: bool) {
    close();

    let mtm = MainThreadMarker::new().expect("must be on main thread");

    unsafe {
        let content_rect = NSRect::new(NSPoint::new(0., 0.), NSSize::new(400., 120.));
        let window = NSWindow::initWithContentRect_styleMask_backing_defer(
            mtm.alloc(),
            content_rect,
            NSWindowStyleMask::Titled,
            NSBackingStoreType::Buffered,
            false,
        );
        window.setTitle(&NSString::from_str(title));
        window.setReleasedWhenClosed(false);
        window.setLevel(NSFloatingWindowLevel);

        let content = window.contentView().expect("contentView");

        let label = NSTextField::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(20., 70.), NSSize::new(360., 22.)),
        );
        label.setStringValue(&NSString::from_str(message));
        label.setBezeled(false);
        label.setDrawsBackground(false);
        label.setEditable(false);
        label.setSelectable(false);
        label.setFont(Some(&NSFont::boldSystemFontOfSize(13.)));
        content.addSubview(&label);

        let progress = NSProgressIndicator::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(20., 42.), NSSize::new(360., 20.)),
        );
        progress.setStyle(NSProgressIndicatorStyle::Bar);
        progress.setIndeterminate(indeterminate);
        if indeterminate {
            progress.startAnimation(None);
        } else {
            progress.setMinValue(0.0);
            progress.setMaxValue(100.0);
            progress.setDoubleValue(0.0);
        }
        content.addSubview(&progress);

        let cancel = NSButton::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(290., 8.), NSSize::new(90., 28.)),
        );
        cancel.setTitle(&NSString::from_str("取消"));
        cancel.setBezelStyle(NSBezelStyle::Push);
        cancel.setTarget(Some(&window));
        cancel.setAction(Some(sel!(orderOut:)));
        content.addSubview(&cancel);

        window.center();
        window.makeKeyAndOrderFront(None);

        *DIALOG.lock().unwrap() = Some(State { window, progress });
    }
}

/// 更新进度值（0.0 ~ 100.0）。必须在主线程调用。
pub fn update_progress(value: f64) {
    if let Some(ref state) = *DIALOG.lock().unwrap() {
        if state.progress.isIndeterminate() {
            unsafe { state.progress.stopAnimation(None) };
            state.progress.setIndeterminate(false);
            state.progress.setMinValue(0.0);
            state.progress.setMaxValue(100.0);
        }
        state.progress.setDoubleValue(value);
    }
}

/// 关闭弹窗。必须在主线程调用。
pub fn close() {
    if let Some(state) = DIALOG.lock().unwrap().take() {
        state.window.close();
    }
}
