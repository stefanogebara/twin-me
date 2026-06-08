// TwinMe Desktop — Auto-update (Phase 7, background + silent)
// ============================================================
// On startup we ask GitHub for the latest signed release manifest (latest.json,
// configured in tauri.conf.json `plugins.updater.endpoints`). If a newer version
// is available we download + install it in the background; the new version
// applies the next time the user opens TwinMe.
//
// Why this exists: most desktop fixes ship server-side, but a few live in the
// Rust binary (e.g. the canonical-host sync fix). Without an updater, users on an
// old build stay broken until they manually re-download. This closes that gap so
// binary fixes propagate automatically from this version onward.
//
// Safety / discipline:
//   - The check runs from RUST, not the webview, so no JS capability is granted
//     and the remote twinme.me page can never trigger an update.
//   - The downloaded artifact is verified against the embedded minisign public
//     key before install (Tauri does this); a tampered build is rejected.
//   - Every failure (offline, missing manifest, signature mismatch) is logged and
//     swallowed — a flaky update must NEVER disrupt the running app.
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

/// Check once for an update; if one exists, download + install it silently. The
/// new version applies on the next launch (we do not force a restart mid-session).
pub async fn check_and_install(app: AppHandle) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(err) => {
            eprintln!("[updater] init failed: {err}");
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            println!("[updater] update available: {version} — downloading");
            // The two closures are progress hooks (per-chunk, on-finish). We don't
            // surface a progress bar for a background update, so both are no-ops.
            match update.download_and_install(|_downloaded, _total| {}, || {}).await {
                Ok(()) => {
                    println!("[updater] installed {version}; will apply on next launch");
                    let _ = app
                        .notification()
                        .builder()
                        .title("TwinMe updated")
                        .body(format!(
                            "Version {version} is ready — it will apply next time you open TwinMe."
                        ))
                        .show();
                }
                Err(err) => eprintln!("[updater] download/install failed: {err}"),
            }
        }
        Ok(None) => println!("[updater] already up to date"),
        Err(err) => eprintln!("[updater] check failed: {err}"),
    }
}
