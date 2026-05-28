// TwinMe Desktop (Phase 1 — Tauri 2 shell + Phase 2 clip indexer scaffold)
// =========================================================================
// This is the Rust entrypoint for the desktop app. Phase 1 stays thin: it
// wraps https://twinme.me in a webview, adds a system tray icon, a global
// hotkey (Cmd/Ctrl+Shift+T) to show/focus the main window, and wires the
// notification + shell plugins for future use.
//
// Phase 2 (this commit) adds the structural pieces of the local clip
// indexer — see clips.rs / active_window.rs / clip_indexer.rs / sync.rs.
// Two background tasks are spawned from setup(): the 5s poll loop and the
// 2-min sync loop. Both no-op safely while active_window::current() stays
// stubbed.
//
// Phase 3+ will fill in the macOS Accessibility implementation, real HTTP
// sync, mic capture for meeting notes, and a Hummingbird-style widget.

mod active_window;
mod clip_indexer;
mod clips;
mod config;
mod sync;

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Show + focus the main TwinMe window. Used by the tray click handler,
/// the tray menu, and the global hotkey.
fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hide the main window (keeps it running in the tray).
fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

/// Tray menu event handler. Routes "open", "hide", and "quit" actions.
fn on_tray_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "open" => focus_main_window(app),
        "hide" => hide_main_window(app),
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Cmd+Shift+T on macOS, Ctrl+Shift+T on Windows/Linux. Same chord as
    // "reopen closed tab" in browsers, but we own the shortcut globally
    // so it triggers app-wide.
    let summon_shortcut = Shortcut::new(
        Some(Modifiers::SHIFT | Modifiers::SUPER),
        Code::KeyT,
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &summon_shortcut && event.state == ShortcutState::Pressed {
                        focus_main_window(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Register the summon hotkey. If registration fails (e.g. another
            // app has already claimed the chord), log it but don't crash —
            // the user can rebind later from settings.
            if let Err(err) = app.global_shortcut().register(summon_shortcut.clone()) {
                eprintln!("[twinme-desktop] global shortcut register failed: {err}");
            }

            // Tray menu. Keep it minimal for Phase 1: Open / Hide / separator
            // / Quit. Phase 2 will add "Pause context awareness for 15 min"
            // and similar Littlebird-style controls.
            let open_item = MenuItem::with_id(app, "open", "Open TwinMe", true, Some("CmdOrCtrl+Shift+T"))?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &hide_item, &separator, &quit_item])?;

            // Build the tray icon. menuOnLeftClick is false in tauri.conf.json,
            // so left-click → focus window, right-click → menu.
            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("TwinMe — Cmd+Shift+T to open")
                .on_menu_event(on_tray_menu_event)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Phase 2 background loops. Tauri owns the async runtime, so we
            // use its handle rather than pulling in tokio directly. Both
            // tasks no-op safely on errors (DB open failure → early return)
            // and during Phase 2 the indexer effectively idles because
            // active_window::current() returns None.
            tauri::async_runtime::spawn(clip_indexer::run());
            tauri::async_runtime::spawn(sync::run());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building TwinMe Desktop")
        .run(|app, event| {
            // Don't quit when the main window closes — minimize to tray instead.
            // Matches Littlebird/jo behavior. User must explicitly Quit from
            // the tray menu (or Cmd+Q on macOS) to fully exit.
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } = &event
            {
                if label == "main" {
                    api.prevent_close();
                    hide_main_window(app);
                }
            }
        });
}
