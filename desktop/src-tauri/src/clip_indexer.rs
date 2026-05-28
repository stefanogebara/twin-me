// TwinMe Desktop — Clip indexer (Phase 2 scaffold)
// =================================================
// Polls the foreground app every 5 seconds. Every time the (app, window)
// pair changes, the previous clip is closed and a new one is started.
// Excluded apps are skipped entirely (never inserted).
//
// During Phase 2 `active_window::current()` returns None, so this loop
// is effectively a no-op. The plumbing is here so Phase 3 only has to
// fill in the Accessibility implementation.

use crate::{active_window, clips};
use std::time::Duration;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

pub async fn run() {
    let conn = match clips::open() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[clip_indexer] failed to open clip store: {err}");
            return;
        }
    };

    let mut current_clip_id: Option<i64> = None;
    let mut current_window: Option<active_window::ActiveWindow> = None;

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;

        let window = active_window::current();

        // Skip if no active window detected (Phase 2 default — see
        // active_window.rs). Phase 3 will start returning Some(...).
        let Some(window) = window else { continue };

        // Skip if app is in the excluded list.
        match clips::is_excluded(&conn, &window.app_name) {
            Ok(true) => continue,
            Err(err) => {
                eprintln!("[clip_indexer] is_excluded query failed: {err}");
                continue;
            }
            Ok(false) => {}
        }

        // Window changed → close prev clip and open a new one.
        if current_window.as_ref() != Some(&window) {
            if let Some(prev_id) = current_clip_id {
                if let Err(err) = clips::close_clip(&conn, prev_id, None) {
                    eprintln!("[clip_indexer] close_clip({prev_id}) failed: {err}");
                }
            }
            match clips::insert_clip(&conn, &window.app_name, window.title.as_deref()) {
                Ok(id) => {
                    current_clip_id = Some(id);
                    current_window = Some(window);
                }
                Err(err) => {
                    eprintln!("[clip_indexer] insert_clip failed: {err}");
                }
            }
        }
    }
}
