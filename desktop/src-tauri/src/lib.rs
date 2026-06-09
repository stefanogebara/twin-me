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
mod audio_capture;
mod audio_permission;
mod auth_refresh;
mod clip_indexer;
mod clips;
mod config;
mod meeting_recorder;
mod meetings;
mod model;
mod sync;
mod transcribe;
mod update;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

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

/// Show a native notification (via the notification plugin). The body is
/// truncated to ~200 chars so a long transcript doesn't overflow the OS toast.
/// Falls back to eprintln! if the notification can't be shown (e.g. permission
/// denied) so the result is never silently lost.
fn notify(app: &AppHandle, title: &str, body: &str) {
    let body = if body.chars().count() > 200 {
        let truncated: String = body.chars().take(200).collect();
        format!("{truncated}…")
    } else {
        body.to_string()
    };
    if let Err(err) = app
        .notification()
        .builder()
        .title(title)
        .body(&body)
        .show()
    {
        eprintln!("[twinme-desktop] notification failed ({title}): {err} — body: {body}");
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

/// Loose shape check for the opaque REFRESH token. Unlike the access token it is
/// NOT a JWT (the backend mints it as crypto.randomBytes(64).toString('hex') →
/// 128 lowercase hex chars), so looks_like_jwt would wrongly reject it. We only
/// stop obvious junk (empty/short/non-hex) from landing in the keyring; the
/// backend re-validates the token on every /auth/refresh anyway.
fn looks_like_refresh_token(token: &str) -> bool {
    (32..=256).contains(&token.len()) && token.chars().all(|c| c.is_ascii_hexdigit())
}

/// Command: persist the long-lived REFRESH token the web app pushes after a
/// desktop sign-in into its own keyring entry, so the sync loop (and the webview,
/// via get_fresh_access_token) can mint fresh access tokens WITHOUT the refresh
/// cookie that WebView2 drops on twinme:// deep-link navigations. Same narrow
/// remote-origin scoping as store_auth_token (capabilities/twinme-auth-bridge.json).
#[tauri::command]
fn store_refresh_token(token: String) {
    let token = token.trim();
    if !looks_like_refresh_token(token) {
        eprintln!("[twinme-desktop] store_refresh_token: rejected malformed refresh token");
        return;
    }
    if let Err(err) = config::store_refresh(token) {
        eprintln!("[twinme-desktop] store_refresh_token: keyring write failed: {err}");
    }
}

/// Command: exchange the stored refresh token for a fresh access token
/// (cookie-independent — see auth_refresh.rs). Returns the access token so the
/// webview can restore its session on app restart without re-signing-in; the
/// refresh token itself never leaves Rust. Returns None when there is no stored
/// refresh token or the refresh fails (the webview then falls back to sign-in).
#[tauri::command]
async fn get_fresh_access_token() -> Option<String> {
    auth_refresh::refresh_access_token().await
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

/// Command: return recent local activity for the onboarding demo screen, one
/// row per app.
///
/// The 5s indexer poll produces many near-identical clips for a single focused
/// window (e.g. "brave" six times in a row), which would make the "here's what
/// TwinMe noticed" list look repetitive and broken. So we pull a generous window
/// of recent clips, drop any belonging to the TwinMe app itself (we don't show
/// us watching us), then DEDUPE by app — keeping each app's most-recent title —
/// and cap at a handful of distinct apps. On any DB error we return an empty
/// list rather than failing the screen.
#[tauri::command]
fn demo_get_clips() -> Vec<DemoClip> {
    const MAX_APPS: usize = 6;
    let conn = match clips::open() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[onboarding] demo_get_clips: open failed: {err}");
            return Vec::new();
        }
    };
    // Fetch more than we show: dedup-by-app needs enough rows to surface several
    // DISTINCT apps out of the duplicate-heavy recent history.
    let recent = clips::list_recent(&conn, 80).unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<DemoClip> = Vec::new();
    for c in recent {
        // Exclude our own app so the demo reflects the user's work, not TwinMe.
        if c.app_name.contains("TwinMe") {
            continue;
        }
        // One row per app; list_recent is newest-first, so the first time we see
        // an app we keep its most-recent title.
        if !seen.insert(c.app_name.to_lowercase()) {
            continue;
        }
        out.push(DemoClip {
            app: c.app_name,
            title: c.window_title.unwrap_or_default(),
        });
        if out.len() >= MAX_APPS {
            break;
        }
    }
    out
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

/// Label for the meeting-transcription opt-in toggle given the current state.
fn transcription_label(on: bool) -> &'static str {
    if on {
        "Meeting transcription: On"
    } else {
        "Meeting transcription: Off"
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

/// Open a URL in the user's default system browser. Restricted to the TwinMe
/// origin so this can never become an arbitrary-launch primitive — the only
/// caller is the onboarding "Continue with Google" button, which opens
/// https://twinme.me/api/auth/oauth/google?desktop=true. Google blocks OAuth
/// inside embedded webviews, so it must run in the real browser; the signed-in
/// session returns via the twinme:// deep link (see handle_deep_link).
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://twinme.me/") || url.starts_with("https://www.twinme.me/")) {
        return Err("blocked: only twinme.me URLs may be opened externally".into());
    }
    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(url, None)
        .map_err(|e| format!("failed to open browser: {e}"))
}

/// Handle an inbound twinme:// deep link. After the user signs in with Google in
/// the system browser, the backend OAuth callback redirects to
/// `twinme://auth?auth_code=<code>&provider=google`. We forward that one-time
/// code to the web app's existing /oauth/callback page, which exchanges it for a
/// session and (via apiBase.ts) stores the JWT in the OS keyring — the same path
/// the web flow uses. No token ever travels in the deep link itself.
fn handle_deep_link(app: &AppHandle, urls: Vec<url::Url>) {
    for u in urls {
        if u.scheme() != "twinme" {
            continue;
        }
        let Some(query) = u.query() else { continue };
        if !query.contains("auth_code=") {
            continue;
        }
        // Forward to the web app's existing /oauth/callback page (which exchanges
        // the one-time code and stores the session via the keyring bridge). We
        // use eval — already used elsewhere in this file, so it's a known-good
        // API surface — and escape the query for the single-quoted JS string.
        let escaped = query.replace('\\', "\\\\").replace('\'', "\\'");
        if let Some(win) = app.get_webview_window("main") {
            let js =
                format!("window.location.replace('https://twinme.me/oauth/callback?{escaped}')");
            let _ = win.eval(&js);
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
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

    let mut builder = tauri::Builder::default();

    // Single-instance MUST be registered before the deep-link plugin so an
    // incoming twinme:// link (from the Google OAuth callback) is folded into
    // the already-running app on Windows/Linux instead of spawning a second
    // process. Desktop-only.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // The deep-link event fires separately (single-instance "deep-link"
            // feature forwards it); here we just surface the existing window.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));

        // Auto-updater: self-update from signed GitHub releases so binary fixes
        // reach users without a manual re-download. The check is kicked off from
        // setup() (see update::check_and_install); registering the plugin here
        // gives that call the `app.updater()` extension. Desktop-only.
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
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
            store_refresh_token,
            get_fresh_access_token,
            settings_get,
            settings_set_paused,
            settings_unexclude,
            request_mic_permission,
            demo_get_clips,
            open_external
        ])
        .setup(move |app| {
            // --- Deep link (twinme://) — return path for system-browser OAuth ---
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // On Windows/Linux, register the scheme at runtime too so dev and
                // non-installed (AppImage) runs work; installers register it via
                // tauri.conf.json's plugins.deep-link.desktop.schemes.
                #[cfg(any(windows, target_os = "linux"))]
                {
                    let _ = app.deep_link().register_all();
                }
                // Cold start: the app may have been launched by the deep link.
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    handle_deep_link(app.handle(), urls);
                }
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    handle_deep_link(&handle, event.urls());
                });
            }

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

            // Phase 5B live test: record 10s from the mic, run it through the
            // whisper model (downloading it on first use), and show the
            // transcript in a notification. Proves capture + model + whisper
            // work end-to-end on real hardware (no mic exists in CI).
            let test_mic_item =
                MenuItem::with_id(app, "test_mic", "Test mic capture (10s)", true, None::<&str>)?;

            // Phase 5B opt-in: meeting transcription (default OFF). When on, the
            // indexer records the mic during detected meetings, transcribes
            // on-device, and attaches the transcript to the synced session. Off
            // until the user explicitly enables it — it captures others' voices.
            let transcription_on = clips::open()
                .ok()
                .and_then(|c| clips::is_transcription_enabled(&c).ok())
                .unwrap_or(false);
            let transcription_item = MenuItem::with_id(
                app,
                "toggle_transcription",
                transcription_label(transcription_on),
                true,
                None::<&str>,
            )?;

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
                    &test_mic_item,
                    &transcription_item,
                    &excluded_submenu,
                    &separator,
                    &quit_item,
                ],
            )?;

            // Handles captured by the menu-event closure so it can mutate the
            // live menu after the setup closure returns. Both are Arc-backed,
            // so the clones point at the same underlying menu items.
            let pause_handle = pause_item.clone();
            let transcription_handle = transcription_item.clone();
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
                        "toggle_transcription" => {
                            // Flip the meeting-transcription opt-in + relabel. The
                            // indexer reads the flag when a meeting opens.
                            if let Ok(conn) = clips::open() {
                                let now = clips::is_transcription_enabled(&conn).unwrap_or(false);
                                let next = !now;
                                if let Err(err) = clips::set_transcription_enabled(&conn, next) {
                                    eprintln!("[tray] set_transcription_enabled: {err}");
                                } else {
                                    let _ = transcription_handle.set_text(transcription_label(next));
                                    if next {
                                        // One-time consent confirmation at opt-in.
                                        notify(
                                            app,
                                            "Meeting transcription on",
                                            "TwinMe will record + transcribe detected meetings on-device. Audio never leaves your device — only the text transcript syncs. Turn it off here anytime.",
                                        );
                                    }
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
                        "test_mic" => {
                            // Live mic->transcript test. Recording (10s) + model
                            // download (~141MB first run) + whisper are blocking,
                            // and cpal's Stream is !Send, so the heavy work runs
                            // on a blocking thread. ensure_model is async, so the
                            // outer task is spawned on the async runtime; the
                            // blocking record+transcribe goes through
                            // spawn_blocking (Stream never crosses an .await).
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let model = match crate::model::ensure_model().await {
                                    Ok(p) => p,
                                    Err(e) => {
                                        notify(&app_handle, "TwinMe", &format!("Model error: {e}"));
                                        return;
                                    }
                                };
                                let wav = std::env::temp_dir().join("twinme-mic-test.wav");
                                let wav_s = wav.to_string_lossy().to_string();
                                let model_s = model.to_string_lossy().to_string();
                                let result = tauri::async_runtime::spawn_blocking(move || {
                                    crate::audio_capture::record_to_wav(&wav_s, 10)?;
                                    crate::transcribe::transcribe_wav(&model_s, &wav_s)
                                })
                                .await;
                                match result {
                                    Ok(Ok(text)) => notify(
                                        &app_handle,
                                        "Mic test transcript",
                                        if text.trim().is_empty() {
                                            "(no speech detected)"
                                        } else {
                                            text.trim()
                                        },
                                    ),
                                    Ok(Err(e)) => {
                                        notify(&app_handle, "TwinMe mic test failed", &e)
                                    }
                                    Err(e) => notify(
                                        &app_handle,
                                        "TwinMe mic test failed",
                                        &format!("task: {e}"),
                                    ),
                                }
                            });
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
            tauri::async_runtime::spawn(clip_indexer::run(app.handle().clone()));
            tauri::async_runtime::spawn(sync::run());

            // Auto-update: one silent check shortly after startup. Best-effort —
            // any failure is logged and swallowed (see update.rs). A newer version
            // is downloaded + installed in the background and applies on next launch.
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    update::check_and_install(handle).await;
                });
            }

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
