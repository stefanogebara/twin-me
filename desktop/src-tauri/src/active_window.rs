// TwinMe Desktop — Active window detection (Phase 2 scaffold)
// ============================================================
// Cross-platform shape for "which app + window does the user have focused
// right now?". Phase 2 only ships the cross-platform type and stub —
// Phase 3 wires the real macOS Accessibility implementation (unsafe Core
// Foundation calls into AXUIElement), and Phase 3+ adds Win/Linux.

/// A snapshot of the currently focused app + window. Cheap to clone;
/// the indexer keeps the last-seen value and compares for changes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveWindow {
    pub app_name: String,
    pub title: Option<String>,
}

#[cfg(target_os = "macos")]
mod macos_impl {
    // Real macOS Accessibility implementation. Reads the focused application
    // and its focused window title via the system-wide AXUIElement.
    //
    //   1. AXUIElementCreateSystemWide() -> system-wide AX element.
    //   2. Copy kAXFocusedApplicationAttribute -> focused app element.
    //   3. From the focused app, copy kAXTitleAttribute -> app name.
    //   4. Copy kAXFocusedWindowAttribute -> focused window element.
    //   5. From the window, copy kAXTitleAttribute -> window title.
    //
    // Requires the user to grant Accessibility permission in System Settings
    // -> Privacy & Security -> Accessibility. Without it the AX copy calls
    // return an error and we yield None, so the indexer no-ops safely and
    // never inserts an empty clip.
    use accessibility_sys::{
        kAXFocusedApplicationAttribute, kAXFocusedWindowAttribute, kAXTitleAttribute,
        AXError, AXUIElementCopyAttributeValue, AXUIElementCreateSystemWide, AXUIElementRef,
    };
    use core_foundation::base::{CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};

    pub fn fetch_focused() -> Option<super::ActiveWindow> {
        // SAFETY: every raw pointer returned by the AX/CF calls is null-checked
        // before use, and CFString values are wrapped under the create rule so
        // Drop releases the +1 retain we receive from the Copy* calls.
        unsafe {
            let sys = AXUIElementCreateSystemWide();
            if sys.is_null() {
                return None;
            }

            let app_elem =
                copy_attr_value(sys, kAXFocusedApplicationAttribute)? as AXUIElementRef;
            if app_elem.is_null() {
                return None;
            }

            let app_name = copy_attr_string(app_elem, kAXTitleAttribute)?;

            let window_title = copy_attr_value(app_elem, kAXFocusedWindowAttribute)
                .map(|p| p as AXUIElementRef)
                .filter(|w| !w.is_null())
                .and_then(|w| copy_attr_string(w, kAXTitleAttribute));

            // TODO(phase-4): wrap the app/window AXUIElementRefs in a TCFType so
            // their +1 retain is released. They leak one ref per poll today —
            // acceptable for the 5s indexer loop in Phase 3.
            Some(super::ActiveWindow {
                app_name,
                title: window_title,
            })
        }
    }

    /// Copy an attribute value as a raw CFTypeRef. Returns None on AX error or
    /// a null result. accessibility-sys attribute constants are `&'static str`,
    /// so we build a CFString key from them.
    unsafe fn copy_attr_value(elem: AXUIElementRef, attr_name: &str) -> Option<CFTypeRef> {
        let key = CFString::new(attr_name);
        let mut value: CFTypeRef = std::ptr::null();
        let err: AXError =
            AXUIElementCopyAttributeValue(elem, key.as_concrete_TypeRef(), &mut value);
        if err != 0 || value.is_null() {
            return None;
        }
        Some(value)
    }

    /// Copy an attribute value and interpret it as a CFString -> Rust String.
    unsafe fn copy_attr_string(elem: AXUIElementRef, attr_name: &str) -> Option<String> {
        let raw = copy_attr_value(elem, attr_name)? as CFStringRef;
        // wrap_under_create_rule takes ownership of the +1 retain from the Copy
        // call, so Drop releases it for us.
        let cf: CFString = TCFType::wrap_under_create_rule(raw);
        Some(cf.to_string())
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    // Real Windows implementation. Reads the foreground window's title and the
    // file stem of its owning process via Win32:
    //
    //   1. GetForegroundWindow() -> HWND of the focused top-level window.
    //   2. GetWindowTextLengthW + GetWindowTextW -> window title (UTF-16).
    //   3. GetWindowThreadProcessId -> owning process id (PID).
    //   4. OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) -> process handle.
    //   5. QueryFullProcessImageNameW -> full exe path; we keep the file stem
    //      ("chrome" from "...\\chrome.exe") as the app name.
    //
    // No special permission is required for these calls. When the desktop
    // itself has focus GetForegroundWindow yields a null HWND and we return
    // None, so the indexer no-ops rather than inserting an empty clip.
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    pub fn fetch_focused() -> Option<super::ActiveWindow> {
        // SAFETY: all FFI happens here. GetForegroundWindow's HWND is checked
        // with is_invalid() before use; OpenProcess returns a Result that we
        // match on, and its HANDLE is always closed via CloseHandle; every
        // text buffer is sized from a preceding length/size query.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return None;
            }

            let title = window_title(hwnd);
            let app_name = process_name(hwnd);

            match (app_name, title) {
                // No process name but we did read a title: still a useful clip.
                (None, Some(title)) => Some(super::ActiveWindow {
                    app_name: "Unknown".to_string(),
                    title: Some(title),
                }),
                (None, None) => None,
                (Some(app_name), title) => Some(super::ActiveWindow { app_name, title }),
            }
        }
    }

    /// Read the foreground window's title. Returns None when the window has no
    /// title or the text comes back empty after trimming.
    ///
    /// SAFETY: caller guarantees `hwnd` is a valid, non-null window handle.
    unsafe fn window_title(hwnd: HWND) -> Option<String> {
        // GetWindowTextLengthW returns the length in chars, excluding the
        // trailing NUL. Non-positive means "no title".
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }

        // +1 for the NUL terminator GetWindowTextW writes.
        let mut buf = vec![0u16; len as usize + 1];
        let copied = GetWindowTextW(hwnd, &mut buf);
        if copied <= 0 {
            return None;
        }

        let title = String::from_utf16_lossy(&buf[..copied as usize]);
        let trimmed = title.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    /// Resolve the file stem of the process that owns `hwnd` (e.g. "chrome").
    /// Returns None if the PID can't be read, the process can't be opened, or
    /// the image path query fails.
    ///
    /// SAFETY: caller guarantees `hwnd` is a valid, non-null window handle.
    unsafe fn process_name(hwnd: HWND) -> Option<String> {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }

        // PROCESS_QUERY_LIMITED_INFORMATION is the least-privilege right that
        // still permits QueryFullProcessImageNameW. `false` = don't inherit.
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;

        // MAX_PATH is 260, but long paths can exceed it; size generously.
        let mut buf = vec![0u16; 1024];
        let mut size = buf.len() as u32;
        let query = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        );

        // Always release the handle, regardless of the query outcome.
        let _ = CloseHandle(handle);

        // On success `size` holds the char count written (excluding NUL).
        query.ok()?;
        let full_path = String::from_utf16_lossy(&buf[..size as usize]);
        file_stem(&full_path)
    }

    /// Extract the file stem from a Windows exe path: strip the directory and a
    /// trailing ".exe" (case-insensitive). "C:\\...\\chrome.exe" -> "chrome".
    fn file_stem(path: &str) -> Option<String> {
        let file = path.rsplit(['\\', '/']).next().unwrap_or(path).trim();
        if file.is_empty() {
            return None;
        }
        let stem = file
            .strip_suffix(".exe")
            .or_else(|| file.strip_suffix(".EXE"))
            .unwrap_or(file);
        if stem.is_empty() {
            None
        } else {
            Some(stem.to_string())
        }
    }
}

#[cfg(target_os = "macos")]
pub fn current() -> Option<ActiveWindow> {
    macos_impl::fetch_focused()
}

#[cfg(target_os = "windows")]
pub fn current() -> Option<ActiveWindow> {
    windows_impl::fetch_focused()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn current() -> Option<ActiveWindow> {
    // TODO(phase-4 U2): Linux active-window lands next (X11 via x11rb, with
    // Wayland varying by compositor). Until then non-macOS/Windows yields None
    // so the indexer no-ops safely.
    None
}

#[cfg(all(test, not(any(target_os = "macos", target_os = "windows"))))]
mod tests {
    use super::*;

    #[test]
    fn current_returns_none_on_non_macos() {
        // Linux/other still return None until Phase 4 U2 lands the X11 path.
        // Runs on the Linux CI runner where current() is the stub.
        assert!(current().is_none());
    }
}
