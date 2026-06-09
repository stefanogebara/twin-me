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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// In-flight meeting session tracked by the indexer loop. `recorder_stop` is
/// Some when a transcription recorder is running for this session — setting it
/// hands the close off to the recorder (which stamps the end time + transcript),
/// so the indexer must NOT also close the row or the two would race.
struct MeetingTrack {
    id: i64,
    platform: String,
    recorder_stop: Option<Arc<AtomicBool>>,
}

/// Start a meeting recorder when transcription is opted in; returns the shared
/// stop flag to store on the track. None when transcription is off → the indexer
/// closes the session itself, exactly as in the original no-audio path.
fn maybe_start_recorder(
    app: &AppHandle,
    conn: &rusqlite::Connection,
    meeting_id: i64,
    platform: &str,
) -> Option<Arc<AtomicBool>> {
    if clips::is_transcription_enabled(conn).unwrap_or(false) {
        let stop = Arc::new(AtomicBool::new(false));
        crate::meeting_recorder::start(app.clone(), meeting_id, platform.to_string(), Arc::clone(&stop));
        Some(stop)
    } else {
        None
    }
}

/// End a tracked session. If a recorder owns it, signal stop (it finalizes the
/// row asynchronously — end time + transcript); otherwise close the row now.
fn end_track(conn: &rusqlite::Connection, track: &MeetingTrack, ended_at: i64) {
    match &track.recorder_stop {
        Some(stop) => stop.store(true, Ordering::Relaxed),
        None => {
            let _ = meetings::close_meeting(conn, track.id, ended_at);
        }
    }
}

pub async fn run(app: AppHandle) {
    let conn = match clips::open() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[clip_indexer] failed to open clip store: {err}");
            return;
        }
    };

    let mut current_clip_id: Option<i64> = None;
    let mut current_window: Option<active_window::ActiveWindow> = None;
    // Parallel meeting-session state (Phase 5A detection + 5B recorder).
    let mut current_meeting: Option<MeetingTrack> = None;

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
            // New meeting started → open the row and (if opted in) start recording.
            (None, Some(platform)) => {
                let now = chrono::Utc::now().timestamp_millis();
                match meetings::insert_meeting(&conn, platform, window.title.as_deref(), now) {
                    Ok(id) => {
                        let recorder_stop = maybe_start_recorder(&app, &conn, id, platform);
                        current_meeting = Some(MeetingTrack {
                            id,
                            platform: platform.to_string(),
                            recorder_stop,
                        });
                    }
                    Err(err) => eprintln!("[indexer] insert_meeting failed: {err}"),
                }
            }
            // A meeting is already tracked, and we're still in a meeting.
            (Some(track), Some(new_platform)) => {
                // &String vs &str: compare via as_str() so the types line up.
                if track.platform.as_str() != new_platform {
                    // Switched to a DIFFERENT meeting platform → end old, open new.
                    let now = chrono::Utc::now().timestamp_millis();
                    end_track(&conn, track, now);
                    match meetings::insert_meeting(&conn, new_platform, window.title.as_deref(), now) {
                        Ok(new_id) => {
                            let recorder_stop = maybe_start_recorder(&app, &conn, new_id, new_platform);
                            current_meeting = Some(MeetingTrack {
                                id: new_id,
                                platform: new_platform.to_string(),
                                recorder_stop,
                            });
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
            // Meeting tracked but the current window is NOT a meeting → end it.
            (Some(track), None) => {
                let now = chrono::Utc::now().timestamp_millis();
                end_track(&conn, track, now);
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
