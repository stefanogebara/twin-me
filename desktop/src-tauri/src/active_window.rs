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

#[cfg(target_os = "macos")]
pub fn current() -> Option<ActiveWindow> {
    macos_impl::fetch_focused()
}

#[cfg(not(target_os = "macos"))]
pub fn current() -> Option<ActiveWindow> {
    // TODO(phase-3+): Windows uses GetForegroundWindow + GetWindowText via
    // the `windows` crate; Linux varies wildly between X11 and Wayland.
    // Both land after the macOS path is solid.
    None
}

#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use super::*;

    #[test]
    fn current_returns_none_on_non_macos() {
        assert!(current().is_none());
    }
}
