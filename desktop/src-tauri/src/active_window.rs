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

#[cfg(target_os = "linux")]
mod linux_impl {
    // Real Linux/X11 implementation via the EWMH _NET_ACTIVE_WINDOW protocol:
    //
    //   1. x11rb::connect(None) -> (RustConnection, screen_num). Any connect
    //      failure (no $DISPLAY, headless CI, refused socket) yields None.
    //   2. root = conn.setup().roots[screen_num].root.
    //   3. Intern _NET_ACTIVE_WINDOW / _NET_WM_NAME / UTF8_STRING atoms.
    //   4. get_property(root, _NET_ACTIVE_WINDOW, WINDOW) -> focused window id.
    //   5. get_property(win, _NET_WM_NAME, UTF8_STRING) -> title (fallback to
    //      WM_NAME/STRING for older clients).
    //   6. get_property(win, WM_CLASS, STRING) -> "instance\0class\0"; the
    //      class (second field) is the app name.
    //
    // Wayland sessions expose no portable active-window API, so we detect
    // WAYLAND_DISPLAY up front and return None. Every fallible X call uses
    // `?`/`.ok()?` inside `inner()`, so nothing here can panic — failures just
    // collapse to None and the indexer no-ops rather than inserting an empty
    // clip.
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt, Window};

    pub fn fetch_focused() -> Option<super::ActiveWindow> {
        // No portable way to read the focused window under Wayland; bail before
        // touching X so we don't accidentally talk to an XWayland shim.
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return None;
        }
        inner()
    }

    /// All X11 work lives here so `?` short-circuits any error to None.
    fn inner() -> Option<super::ActiveWindow> {
        let (conn, screen_num) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen_num)?.root;

        // Helper: intern an atom by name, None on any failure.
        let intern = |name: &[u8]| -> Option<Atom> {
            Some(conn.intern_atom(false, name).ok()?.reply().ok()?.atom)
        };

        let net_active_window = intern(b"_NET_ACTIVE_WINDOW")?;
        let net_wm_name = intern(b"_NET_WM_NAME")?;
        let utf8_string = intern(b"UTF8_STRING")?;

        let win = active_window_id(&conn, root, net_active_window)?;

        let title = window_title(&conn, win, net_wm_name, utf8_string);
        let app_name = window_app_name(&conn, win)
            .unwrap_or_else(|| "Unknown".to_string());

        Some(super::ActiveWindow { app_name, title })
    }

    /// Read the focused window id from the root's _NET_ACTIVE_WINDOW property.
    /// Returns None when the property is absent or the id is 0 (no focus).
    fn active_window_id(
        conn: &impl Connection,
        root: Window,
        net_active_window: Atom,
    ) -> Option<Window> {
        let reply = conn
            .get_property(false, root, net_active_window, AtomEnum::WINDOW, 0, 1)
            .ok()?
            .reply()
            .ok()?;
        // The property is a single 32-bit window id (format 32).
        let win = reply.value32()?.next()?;
        if win == 0 {
            None
        } else {
            Some(win)
        }
    }

    /// Read the window title: _NET_WM_NAME (UTF8_STRING) preferred, falling back
    /// to the legacy WM_NAME (STRING) for clients that don't set the EWMH name.
    /// Empty/whitespace titles collapse to None.
    fn window_title(
        conn: &impl Connection,
        win: Window,
        net_wm_name: Atom,
        utf8_string: Atom,
    ) -> Option<String> {
        read_string(conn, win, net_wm_name, utf8_string)
            .or_else(|| read_string(conn, win, AtomEnum::WM_NAME.into(), AtomEnum::STRING.into()))
    }

    /// Read the app name from WM_CLASS. WM_CLASS is two NUL-separated strings:
    /// "instance\0class\0". We prefer the class (second field, e.g. "Firefox"),
    /// falling back to the instance if the class is empty.
    fn window_app_name(conn: &impl Connection, win: Window) -> Option<String> {
        let reply = conn
            .get_property(
                false,
                win,
                AtomEnum::WM_CLASS,
                AtomEnum::STRING,
                0,
                1024,
            )
            .ok()?
            .reply()
            .ok()?;
        if reply.value.is_empty() {
            return None;
        }

        // Split on NUL and keep the non-empty fields in order: [instance, class].
        let mut fields = reply
            .value
            .split(|&b| b == 0)
            .filter(|s| !s.is_empty())
            .map(|s| String::from_utf8_lossy(s).trim().to_string())
            .filter(|s| !s.is_empty());

        let first = fields.next();
        let second = fields.next();
        // Prefer the class (second field); fall back to the instance.
        second.or(first)
    }

    /// Fetch a string property as UTF-8 (lossy), trimmed; empty -> None.
    fn read_string(
        conn: &impl Connection,
        win: Window,
        property: Atom,
        type_: Atom,
    ) -> Option<String> {
        let reply = conn
            .get_property(false, win, property, type_, 0, 1024)
            .ok()?
            .reply()
            .ok()?;
        if reply.value.is_empty() {
            return None;
        }
        let s = String::from_utf8_lossy(&reply.value);
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
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

#[cfg(target_os = "linux")]
pub fn current() -> Option<ActiveWindow> {
    linux_impl::fetch_focused()
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn current() -> Option<ActiveWindow> {
    // Other platforms (BSD, etc.) have no active-window impl yet, so they yield
    // None and the indexer no-ops safely rather than inserting an empty clip.
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_is_safe_to_call() {
        // On headless CI there's no display/foreground window, so this is
        // typically None — but the contract we assert is "never panics".
        let _ = current();
    }
}
