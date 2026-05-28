// TwinMe Desktop — Clip indexer (Phase 2 scaffold)
// =================================================
// Polls the foreground app every 5 seconds. Every time the (app, window)
// pair changes, the previous clip is closed and a new one is started.
// Excluded apps are skipped entirely (never inserted).
//
// During Phase 2 `active_window::current()` returns None, so this loop
// is effectively a no-op. The plumbing is here so Phase 3 only has to
// fill in the Accessibility implementation.
//
// Phase 4 (macOS only): on clip-open we additionally capture the text
// *inside* the focused window via `active_window::focused_content()` (a
// bounded AX-tree walk) and store it on the clip. Capture happens once per
// clip, after the exclude-list check, so sensitive apps are never read.
// Other platforms return None and the clip's `content` stays NULL.
//
// Phase 5A: a PARALLEL meeting-session tracker runs in the same loop off the
// same foreground `window`. When `meetings::classify_meeting` matches the
// focused (app, title) a session opens; it stays open until a non-meeting
// window is next focused, then closes. Sessions sync to the backend via
// sync.rs. No audio — Phase 5B adds true call presence + transcription.

use crate::{active_window, clips, meetings};
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
    // Parallel meeting-session state: (row id, platform, title at open).
    let mut current_meeting: Option<(i64, String, Option<String>)> = None;

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;

        // Honor the user's pause toggle before any window polling. While
        // paused the indexer does no work — it just idles on the 5s tick.
        match clips::is_paused(&conn) {
            Ok(true) => continue,
            Ok(false) => {}
            Err(err) => eprintln!("[indexer] is_paused: {err}"),
        }

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

        // ── Meeting-session tracking (Phase 5A) ──────────────────────────
        // Runs every tick off the same foreground `window`. Opens a session
        // when classify_meeting matches, closes it when a non-meeting window
        // is next focused.
        //
        // NOTE: this only runs once execution reaches here, i.e. when there IS
        // a non-excluded foreground window. If `active_window::current()`
        // returns None, or the focused app is excluded, the loop `continue`s
        // BEFORE this block — so an open meeting session is NOT closed on those
        // ticks. It stays open and closes only when a real, non-meeting window
        // is next focused. Acceptable for v1: window-title detection can't tell
        // "minimized but still in the call" from "left the call" anyway.
        // Phase 5B (audio) gives true call presence. No timeout here on purpose.
        let meeting_now = meetings::classify_meeting(&window.app_name, window.title.as_deref());
        match (&current_meeting, meeting_now) {
            // No meeting tracked, and this isn't a meeting → nothing to do.
            (None, None) => {}
            // New meeting started.
            (None, Some(platform)) => {
                let now = chrono::Utc::now().timestamp_millis();
                match meetings::insert_meeting(&conn, platform, window.title.as_deref(), now) {
                    Ok(id) => current_meeting = Some((id, platform.to_string(), window.title.clone())),
                    Err(err) => eprintln!("[indexer] insert_meeting failed: {err}"),
                }
            }
            // A meeting is already tracked, and we're still in a meeting.
            (Some((id, platform, _)), Some(new_platform)) => {
                // &String vs &str: compare via as_str() so the types line up.
                if platform.as_str() != new_platform {
                    // Switched to a DIFFERENT meeting platform → close old, open new.
                    let now = chrono::Utc::now().timestamp_millis();
                    let _ = meetings::close_meeting(&conn, *id, now);
                    match meetings::insert_meeting(&conn, new_platform, window.title.as_deref(), now) {
                        Ok(new_id) => {
                            current_meeting =
                                Some((new_id, new_platform.to_string(), window.title.clone()))
                        }
                        Err(err) => {
                            eprintln!("[indexer] insert_meeting failed: {err}");
                            current_meeting = None;
                        }
                    }
                }
                // Same platform → keep the session open (ignore title changes
                // within the same meeting).
            }
            // Meeting tracked but the current window is NOT a meeting → close it.
            (Some((id, _, _)), None) => {
                let now = chrono::Utc::now().timestamp_millis();
                let _ = meetings::close_meeting(&conn, *id, now);
                current_meeting = None;
            }
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
                    // Capture in-window content once, at clip open. NOT per tick —
                    // content is not part of ActiveWindow equality, so re-capturing
                    // would not retrigger change detection anyway, and once-at-open
                    // keeps cost bounded. Non-macOS returns None (no-op).
                    //
                    // focused_content() re-derives the currently-focused app
                    // independently, so re-verify it's STILL the same non-excluded
                    // app we just vetted before storing — closes a TOCTOU window
                    // where focus could flip to an excluded app between insert and
                    // content read.
                    if let Some((content_app, text)) = active_window::focused_content() {
                        let still_ok = content_app == window.app_name
                            && !clips::is_excluded(&conn, &content_app).unwrap_or(true); // fail closed on DB error
                        if still_ok {
                            if let Err(err) = clips::set_content(&conn, id, &text) {
                                eprintln!("[clip_indexer] set_content({id}) failed: {err}");
                            }
                        }
                    }
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
