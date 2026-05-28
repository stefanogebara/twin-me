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
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, RunEvent, WindowEvent,
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

/// Label for the pause/resume tray item given the current paused state.
fn pause_label(paused: bool) -> &'static str {
    if paused {
        "Resume indexing"
    } else {
        "Pause indexing"
    }
}

/// (Re)populate the "Excluded apps" submenu from the persisted exclude list.
/// Clears any existing children, then adds one re-include item per excluded
/// app (id `unexclude:<app>`), or a single disabled "(none)" placeholder when
/// the list is empty. Called once at startup and again after every add/remove
/// so the submenu always mirrors the DB. The Submenu handle is Arc-backed, so
/// a captured clone mutates the live menu in place — no tray.set_menu needed.
fn populate_excluded_submenu<R: Runtime, M: Manager<R>>(
    manager: &M,
    submenu: &Submenu<R>,
) -> tauri::Result<()> {
    // Drain existing children. remove_at shifts indices down, so always pop 0.
    if let Ok(items) = submenu.items() {
        for _ in 0..items.len() {
            let _ = submenu.remove_at(0);
        }
    }

    let excluded = clips::open()
        .ok()
        .and_then(|c| clips::list_excluded(&c).ok())
        .unwrap_or_default();

    if excluded.is_empty() {
        // Disabled placeholder so the submenu is never empty/confusing.
        let none_item = MenuItem::with_id(manager, "excluded_none", "(none)", false, None::<&str>)?;
        submenu.append(&none_item)?;
    } else {
        for app_name in excluded {
            let item = MenuItem::with_id(
                manager,
                format!("unexclude:{app_name}"),
                &app_name,
                true,
                None::<&str>,
            )?;
            submenu.append(&item)?;
        }
    }

    Ok(())
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

            // Tray menu: Open / Hide / Pause-Resume / Exclude current app /
            // Excluded apps submenu / separator / Quit. The pause item's label
            // and the excluded submenu both reflect persisted state and update
            // live as the user toggles them (see on_menu_event below).
            let open_item = MenuItem::with_id(app, "open", "Open TwinMe", true, Some("CmdOrCtrl+Shift+T"))?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;

            // Initial pause label from the persisted flag so it's correct on
            // startup ("Resume indexing" if we were paused before quitting).
            let paused = clips::open()
                .ok()
                .and_then(|c| clips::is_paused(&c).ok())
                .unwrap_or(false);
            let pause_item =
                MenuItem::with_id(app, "pause", pause_label(paused), true, None::<&str>)?;

            // Exclude the current foreground app. Writes to the exclude list,
            // which the indexer honors on its next tick — no clip is created
            // for an excluded app.
            let exclude_item =
                MenuItem::with_id(app, "exclude_current", "Exclude current app", true, None::<&str>)?;

            // Excluded apps submenu — one re-include item per excluded app,
            // populated from the DB now and rebuilt in place on every change.
            let excluded_submenu = Submenu::with_id(app, "excluded_menu", "Excluded apps", true)?;
            populate_excluded_submenu(app, &excluded_submenu)?;

            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &hide_item,
                    &pause_item,
                    &exclude_item,
                    &excluded_submenu,
                    &separator,
                    &quit_item,
                ],
            )?;

            // Handles captured by the menu-event closure so it can mutate the
            // live menu after the setup closure returns. Both are Arc-backed,
            // so the clones point at the same underlying menu items.
            let pause_handle = pause_item.clone();
            let excluded_handle = excluded_submenu.clone();

            // Build the tray icon. menuOnLeftClick is false in tauri.conf.json,
            // so left-click → focus window, right-click → menu.
            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("TwinMe — Cmd+Shift+T to open")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "open" => focus_main_window(app),
                        "hide" => hide_main_window(app),
                        "pause" => {
                            // Flip the persisted flag, then relabel the item to
                            // match the new state. The indexer reads the flag
                            // each tick.
                            if let Ok(conn) = clips::open() {
                                let now = clips::is_paused(&conn).unwrap_or(false);
                                let next = !now;
                                if let Err(err) = clips::set_pause(&conn, next) {
                                    eprintln!("[tray] set_pause: {err}");
                                } else {
                                    let _ = pause_handle.set_text(pause_label(next));
                                }
                            }
                        }
                        "exclude_current" => {
                            // Snapshot the focused app and exclude it, then
                            // refresh the submenu so it shows up immediately.
                            if let Some(win) = active_window::current() {
                                if let Ok(conn) = clips::open() {
                                    if let Err(err) = clips::exclude_app(&conn, &win.app_name) {
                                        eprintln!("[tray] exclude_app: {err}");
                                    }
                                }
                            }
                            let _ = populate_excluded_submenu(app, &excluded_handle);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        other => {
                            // Re-include: ids are "unexclude:<app_name>".
                            if let Some(app_name) = other.strip_prefix("unexclude:") {
                                if let Ok(conn) = clips::open() {
                                    if let Err(err) = clips::unexclude_app(&conn, app_name) {
                                        eprintln!("[tray] unexclude_app: {err}");
                                    }
                                }
                                let _ = populate_excluded_submenu(app, &excluded_handle);
                            }
                        }
                    }
                })
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
