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
pub fn current() -> Option<ActiveWindow> {
    // TODO(phase-3): real implementation via accessibility-sys.
    //
    // Sketch:
    //   1. AXUIElementCreateSystemWide() → system-wide AX element.
    //   2. Copy kAXFocusedApplicationAttribute → focused app element.
    //   3. From the focused app, copy kAXTitleAttribute → app name.
    //   4. Copy kAXFocusedWindowAttribute → focused window element.
    //   5. From the window, copy kAXTitleAttribute → window title.
    //
    // Requires the user to grant Accessibility permission in
    // System Settings → Privacy & Security → Accessibility. Until that's
    // wired (and an onboarding flow handles the prompt), we return None
    // so the indexer no-ops safely and never inserts an empty clip.
    None
}

#[cfg(not(target_os = "macos"))]
pub fn current() -> Option<ActiveWindow> {
    // TODO(phase-3+): Windows uses GetForegroundWindow + GetWindowText via
    // the `windows` crate; Linux varies wildly between X11 and Wayland.
    // Both land after the macOS path is solid.
    None
}
