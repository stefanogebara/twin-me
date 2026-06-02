// TwinMe Desktop (Phase 1 — Tauri 2 shell + Phase 2 clip indexer scaffold)
// =========================================================================
// This is the Rust entrypoint for the desktop app. The main window shows a
// native first-run onboarding (www/index.html) and then the TwinMe web app;
// there's a system tray icon and a global hotkey (Cmd/Ctrl+Shift+T).
//
// Phase 2 adds the structural pieces of the local clip indexer — see
// clips.rs / active_window.rs / clip_indexer.rs / sync.rs. Two background
// tasks are spawned from setup(): the 5s poll loop and the 2-min sync loop.
// Phases 3-5 filled in macOS/Windows/Linux active-window detection, real
// HTTP sync, the OS keyring auth token, and on-device meeting transcription.
//
// Phase 6 (this change) adds the Hummingbird quick panel: a second,
// always-on-top, frameless overlay window (label "hummingbird", loads
// www/hummingbird.html). The global hotkey toggles it; it dismisses on blur
// or Esc; its buttons call the open_route / open_main_window commands to
// drive the main window.

mod active_window;
mod audio_permission;
mod clip_indexer;
mod clips;
mod config;
mod meetings;
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

/// Show + focus the Hummingbird quick panel (the always-on-top overlay).
/// The panel loads https://twinme.me/widget, sharing the main window's session
/// cookie. If it got bounced to /auth (e.g. summoned on first run, before the
/// user logged in via the main window), nudge it back to /widget on show so it
/// re-checks the now-present session. The guard makes it a no-op once it's
/// already on /widget, so an in-progress conversation is preserved.
fn show_hummingbird(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("hummingbird") {
        let _ = window.eval(
            "if(!location.pathname.startsWith('/widget')){location.replace('https://twinme.me/widget?panel=1')}",
        );
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Toggle the Hummingbird quick panel: hide it if it's already up front,
/// otherwise summon it. Used by the global hotkey. With blur-to-dismiss the
/// panel is only ever visible while focused, so this reads as a clean toggle.
fn toggle_hummingbird(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("hummingbird") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            show_hummingbird(app);
        }
    }
}

/// Command: hide the Hummingbird panel (Esc / close button in the widget).
#[tauri::command]
fn hide_hummingbird(app: AppHandle) {
    if let Some(window) = app.get_webview_window("hummingbird") {
        let _ = window.hide();
    }
}

/// Loose shape check: does `token` look like a JWT (three non-empty,
/// dot-separated segments)? We deliberately do NOT verify the signature or
/// decode the claims — the desktop has no business holding the JWT secret, and
/// the backend re-validates every Bearer token anyway. This guard only stops us
/// from persisting obvious junk (empty strings, a stray word, a half-rotated
/// value) into the keyring.
fn looks_like_jwt(token: &str) -> bool {
    let parts: Vec<&str> = token.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty())
}

/// Command: persist the TwinMe access token the web app pushes after login (and
/// on every ~25-min rotation) into the OS keyring, so the headless clip/meeting
/// sync loop in sync.rs can authenticate its uploads. Without this bridge the
/// keyring is never populated and every sync POST goes out unauthenticated.
///
/// SECURITY: this command is reachable from the REMOTE https://twinme.me page in
/// the "main" window — see capabilities/twinme-auth-bridge.json, which scopes it
/// to that one origin, that one window, and this one command. We therefore treat
/// `token` as untrusted input: validate it looks like a JWT before touching the
/// keyring, and never echo it back or panic. Keyring write failures are logged
/// and swallowed (a missing token just means sync stays idle until next push).
#[tauri::command]
fn store_auth_token(token: String) {
    let token = token.trim();
    if !looks_like_jwt(token) {
        eprintln!("[twinme-desktop] store_auth_token: rejected non-JWT-shaped token");
        return;
    }
    if let Err(err) = config::store_auth(token) {
        // Best-effort: a keyring failure (locked keychain, no Secret Service)
        // shouldn't crash the app — sync simply stays unauthenticated until the
        // next push succeeds.
        eprintln!("[twinme-desktop] store_auth_token: keyring write failed: {err}");
    }
}

/// Command: bring the full app forward (and dismiss the panel).
#[tauri::command]
fn open_main_window(app: AppHandle) {
    focus_main_window(&app);
    if let Some(hb) = app.get_webview_window("hummingbird") {
        let _ = hb.hide();
    }
}

/// Show + focus the native Settings window. Tray-invoked (a plain helper, not an
/// IPC command), so it needs no permission/capability of its own.
fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Snapshot of local desktop settings rendered by the Settings window.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsState {
    paused: bool,
    excluded: Vec<String>,
    auth_connected: bool,
    hotkey: String,
}

/// Command: read current local settings (capture pause, excluded apps, whether
/// an auth token is present, the summon hotkey label) for the Settings UI.
#[tauri::command]
fn settings_get() -> SettingsState {
    let conn = clips::open().ok();
    let paused = conn.as_ref().and_then(|c| clips::is_paused(c).ok()).unwrap_or(false);
    let excluded = conn
        .as_ref()
        .and_then(|c| clips::list_excluded(c).ok())
        .unwrap_or_default();
    SettingsState {
        paused,
        excluded,
        auth_connected: config::load_auth().is_some(),
        hotkey: if cfg!(target_os = "macos") {
            "Cmd + Shift + T".to_string()
        } else {
            "Ctrl + Shift + T".to_string()
        },
    }
}

/// Command: pause or resume context capture (persisted; the indexer reads the
/// flag each tick).
#[tauri::command]
fn settings_set_paused(paused: bool) {
    if let Ok(conn) = clips::open() {
        if let Err(err) = clips::set_pause(&conn, paused) {
            eprintln!("[settings] set_pause: {err}");
        }
    }
}

/// Command: remove an app from the exclude list.
#[tauri::command]
fn settings_unexclude(app: String) {
    if let Ok(conn) = clips::open() {
        if let Err(err) = clips::unexclude_app(&conn, &app) {
            eprintln!("[settings] unexclude_app: {err}");
        }
    }
}

/// Command: trigger the OS microphone permission prompt during onboarding.
///
/// We briefly open the default input device via cpal — just enough for the OS
/// to surface its mic-access dialog (macOS TCC). We do NOT record, buffer, or
/// transcribe anything: the data callback is a no-op, the stream is played for
/// a moment and then dropped. On Windows/Linux there is usually no modal prompt
/// (mic access is settings-gated, not per-app at runtime), so this just opens
/// and closes the device successfully.
///
/// The actual cpal work is blocking + uses a `!Send` stream, so it runs inside
/// `spawn_blocking` (keeping the stream off the async runtime and never across
/// an await). `JoinHandle` resolves to `tauri::Result<R>`, so awaiting yields
/// `Result<Result<(), String>, tauri::Error>`: map the join error to a String,
/// then `?` unwraps it to surface the inner cpal result to the JS side.
#[tauri::command]
async fn request_mic_permission() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(audio_permission::prompt_microphone)
        .await
        .map_err(|e| format!("mic permission task failed: {e}"))?
}

/// A single recent activity item surfaced in the onboarding "what TwinMe
/// noticed" demo. Only the app name and (optional) window title are exposed —
/// never extracted content.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoClip {
    app: String,
    title: String,
}

/// Command: return the most recent local clips for the onboarding demo screen.
///
/// Reads the latest ~15 clips from the on-device SQLite, drops any belonging to
/// the TwinMe app itself (so the demo shows the user's *other* activity, not us
/// watching us), and maps each to a {app, title} pair (empty title -> ""). On
/// any DB error we return an empty list rather than failing the screen.
#[tauri::command]
fn demo_get_clips() -> Vec<DemoClip> {
    let conn = match clips::open() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[onboarding] demo_get_clips: open failed: {err}");
            return Vec::new();
        }
    };
    let recent = clips::list_recent(&conn, 15).unwrap_or_default();
    recent
        .into_iter()
        // Exclude our own app so the demo reflects the user's work, not TwinMe.
        .filter(|c| !c.app_name.contains("TwinMe"))
        .map(|c| DemoClip {
            app: c.app_name,
            title: c.window_title.unwrap_or_default(),
        })
        .collect()
}

/// Command: focus the main window and navigate it to a twinme.me route, then
/// dismiss the panel. `path` is an app-internal absolute path (e.g.
/// "/talk-to-twin"); we only navigate when it is a safe same-site path so the
/// panel can never be used to open an arbitrary URL.
#[tauri::command]
fn open_route(app: AppHandle, path: String) {
    let safe = path.starts_with('/')
        && !path.contains("//")
        && !path.contains('\'')
        && !path.contains('"')
        && !path.contains(' ');
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if safe {
            let url = format!("https://twinme.me{path}");
            let _ = window.eval(&format!("window.location.href = '{url}';"));
        }
    }
    if let Some(hb) = app.get_webview_window("hummingbird") {
        let _ = hb.hide();
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
                        toggle_hummingbird(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_hummingbird,
            open_main_window,
            open_route,
            store_auth_token,
            settings_get,
            settings_set_paused,
            settings_unexclude,
            request_mic_permission,
            demo_get_clips
        ])
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
            let open_item = MenuItem::with_id(app, "open", "Open TwinMe", true, None::<&str>)?;
            let quickpanel_item =
                MenuItem::with_id(app, "quickpanel", "Quick panel", true, Some("CmdOrCtrl+Shift+T"))?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;

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
                    &quickpanel_item,
                    &hide_item,
                    &settings_item,
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
                .tooltip("TwinMe — Cmd+Shift+T for quick panel")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "open" => focus_main_window(app),
                        "quickpanel" => show_hummingbird(app),
                        "hide" => hide_main_window(app),
                        "settings" => open_settings(app),
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
            if let RunEvent::WindowEvent { label, event: win_event, .. } = &event {
                match win_event {
                    // Don't quit when the main window closes — minimize to tray
                    // instead (Littlebird/jo behavior). Quit explicitly from the
                    // tray menu (or Cmd+Q on macOS) to fully exit.
                    WindowEvent::CloseRequested { api, .. } if label == "main" => {
                        api.prevent_close();
                        hide_main_window(app);
                    }
                    // Blur-to-dismiss for the Hummingbird quick panel: when it
                    // loses focus (click elsewhere, or open the main app) hide it,
                    // so the global hotkey always reads as a clean toggle.
                    WindowEvent::Focused(false) if label == "hummingbird" => {
                        if let Some(w) = app.get_webview_window("hummingbird") {
                            let _ = w.hide();
                        }
                    }
                    _ => {}
                }
            }
        });
}
