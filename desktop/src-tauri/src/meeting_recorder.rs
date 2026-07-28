// TwinMe Desktop — Meeting recorder (Phase 5B)
// ============================================
// When the clip indexer opens a meeting session AND the user has opted into
// meeting transcription, it starts one of these recorders. The recorder:
//   1. ensures the whisper model is present (downloads ~141MB on first use),
//   2. records the mic continuously until the indexer sets the stop flag (the
//      meeting ended) or a safety cap elapses,
//   3. transcribes the captured audio on-device, then
//   4. writes the transcript onto the meeting row and stamps `ended_at` — IN
//      THAT ORDER. sync.rs's list_unsynced filters on `ended_at IS NOT NULL`, so
//      the row is sync-invisible during the (minutes-long) transcription, and
//      becomes uploadable only AFTER the transcript is attached. That ordering
//      is what prevents a race where a half-transcribed meeting uploads first
//      and then the late transcript never syncs.
//
// Everything is best-effort: any capture/transcribe/model failure still stamps
// `ended_at` so the meeting syncs (without a transcript) instead of leaking an
// open session. cpal's `Stream` is `!Send` and whisper is CPU-blocking, so the
// heavy work runs on a blocking thread; only the async model download touches
// the runtime. Audio is never written to disk and never leaves the device — only
// the resulting text transcript syncs.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::AppHandle;

// Safety cap on a single recording. ~2h of 16kHz mono f32 is ~460MB held in
// memory before transcription; the cap bounds worst-case RAM and a runaway
// "meeting" left focused indefinitely.
const MAX_RECORD_SECS: u32 = 2 * 60 * 60;

/// Start a recorder for an open meeting session. `stop` is shared with the clip
/// indexer, which sets it when the session ends. Fire-and-forget: the recorder
/// finalizes the row on its own DB connection and never blocks the indexer loop.
/// `app` is used only to surface a recording indicator (consent/transparency);
/// `platform` labels that notification.
pub fn start(app: AppHandle, meeting_id: i64, platform: String, stop: Arc<AtomicBool>) {
    tauri::async_runtime::spawn(async move {
        // Model download is async; do it before the blocking capture so a missing
        // model never holds a cpal stream open. On failure we record None and
        // still close the meeting below (it syncs without a transcript).
        let model = match crate::model::ensure_model().await {
            Ok(p) => Some(p.to_string_lossy().to_string()),
            Err(e) => {
                eprintln!("[meeting_recorder] model unavailable for meeting {meeting_id}: {e}");
                None
            }
        };

        // Recording indicator (consent): tell the user, every time, that this
        // meeting is being recorded for transcription and that the audio stays
        // local. Fires once recording is actually about to begin (model ready).
        crate::notify(
            &app,
            "TwinMe is transcribing this meeting",
            &format!("Recording the {platform} call — your mic and the call audio — for your notes. Audio stays on your device — only the text transcript syncs. Turn this off from the tray."),
        );

        // Capture-until-stop + transcribe on a blocking thread (cpal Stream is
        // !Send, whisper is blocking). Mixed capture = mic + system loopback
        // (both sides of the call); degrades to mic-only where loopback is
        // unavailable (e.g. macOS for now). Returns (ended_at, transcript).
        let result = tauri::async_runtime::spawn_blocking(move || {
            let samples = crate::audio_capture::record_until_stopped_mixed(stop, MAX_RECORD_SECS)?;
            // Stamp the end time at the moment capture stops — NOT when the
            // (minutes-long) transcription finishes — so the meeting's duration
            // reflects the real session, not the processing time.
            let ended_at = chrono::Utc::now().timestamp_millis();
            let transcript = match &model {
                Some(m) => crate::transcribe::transcribe_samples(m, &samples).unwrap_or_default(),
                None => String::new(),
            };
            Ok::<(i64, String), String>((ended_at, transcript))
        })
        .await;

        // Finalize on a FRESH connection — rusqlite Connections aren't Send, so we
        // never carry one across the await / thread boundary.
        let conn = match crate::clips::open() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[meeting_recorder] cannot open DB to finalize meeting {meeting_id}: {e}");
                return;
            }
        };

        match result {
            Ok(Ok((ended_at, transcript))) => {
                if finalize_meeting(&conn, meeting_id, ended_at, &transcript) {
                    crate::notify(
                        &app,
                        "Meeting transcript saved",
                        &format!("Your {platform} meeting was transcribed on-device and added to your twin's memory."),
                    );
                }
            }
            Ok(Err(e)) => {
                eprintln!("[meeting_recorder] capture/transcribe failed for meeting {meeting_id}: {e}");
                // Still close so the meeting syncs (no transcript) rather than leak.
                let now = chrono::Utc::now().timestamp_millis();
                let _ = crate::meetings::close_meeting(&conn, meeting_id, now);
            }
            Err(e) => {
                eprintln!("[meeting_recorder] recorder task failed for meeting {meeting_id}: {e}");
                let now = chrono::Utc::now().timestamp_millis();
                let _ = crate::meetings::close_meeting(&conn, meeting_id, now);
            }
        }
    });
}

/// Write the capture outcome onto the meeting row. Transcript FIRST (while
/// `ended_at` is still NULL the row is invisible to sync — see the module
/// comment), THEN stamp `ended_at` to release it. Whitespace-only transcripts
/// count as absent: the row still closes (so it syncs, transcript-less, rather
/// than leaking an open session) but nothing is stored. Returns true when a
/// non-empty transcript was stored — that drives the "transcript saved" toast.
///
/// Extracted verbatim from `start`'s success arm so this ordering/trim contract
/// is unit-testable against an in-memory DB — no recorder, model, audio
/// hardware, or Tauri runtime involved. Both writes stay best-effort (`let _`),
/// matching the recorder's everything-degrades-gracefully policy.
fn finalize_meeting(
    conn: &rusqlite::Connection,
    meeting_id: i64,
    ended_at: i64,
    transcript: &str,
) -> bool {
    let transcript = transcript.trim();
    if !transcript.is_empty() {
        let _ = crate::meetings::set_transcript(conn, meeting_id, transcript);
    }
    let _ = crate::meetings::close_meeting(conn, meeting_id, ended_at);
    !transcript.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{clips, meetings};
    use rusqlite::Connection;

    /// In-memory clips.db with one OPEN meeting (ended_at NULL) — the state a
    /// recorder finds when capture stops.
    fn mem_db_with_open_meeting() -> (Connection, i64) {
        let conn = Connection::open_in_memory().unwrap();
        clips::init_schema(&conn).unwrap();
        let id = meetings::insert_meeting(&conn, "Zoom", Some("Standup"), 1_000).unwrap();
        (conn, id)
    }

    #[test]
    fn finalize_attaches_transcript_then_releases_to_sync() {
        let (conn, id) = mem_db_with_open_meeting();
        // While recording (ended_at NULL) the row must be sync-invisible.
        assert!(meetings::list_unsynced(&conn, 10).unwrap().is_empty());

        let stored = finalize_meeting(&conn, id, 61_000, "We agreed to ship on Friday.");
        assert!(stored, "a real transcript reports stored=true (drives the toast)");

        // The row becomes syncable only WITH its transcript already attached —
        // the ordering that stops a transcript-less half-meeting uploading early.
        let pending = meetings::list_unsynced(&conn, 10).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].ended_at, Some(61_000));
        assert_eq!(
            pending[0].transcript.as_deref(),
            Some("We agreed to ship on Friday.")
        );
    }

    #[test]
    fn finalize_trims_transcript_edges() {
        let (conn, id) = mem_db_with_open_meeting();
        assert!(finalize_meeting(&conn, id, 2_000, "  hello world \n"));
        let pending = meetings::list_unsynced(&conn, 10).unwrap();
        assert_eq!(pending[0].transcript.as_deref(), Some("hello world"));
    }

    #[test]
    fn finalize_whitespace_only_transcript_still_closes_meeting() {
        let (conn, id) = mem_db_with_open_meeting();
        // Whisper on silence can yield blank output. The meeting must STILL
        // close (best-effort: it syncs without a transcript) and must not
        // store whitespace or claim a transcript was saved.
        let stored = finalize_meeting(&conn, id, 3_000, "   \n\t");
        assert!(!stored, "blank transcript must not trigger the saved toast");

        let pending = meetings::list_unsynced(&conn, 10).unwrap();
        assert_eq!(pending.len(), 1, "row released to sync even with no transcript");
        assert_eq!(pending[0].ended_at, Some(3_000));
        assert_eq!(pending[0].transcript, None);
    }

    #[test]
    fn finalize_empty_transcript_reports_not_stored() {
        let (conn, id) = mem_db_with_open_meeting();
        assert!(!finalize_meeting(&conn, id, 4_000, ""));
        let pending = meetings::list_unsynced(&conn, 10).unwrap();
        assert_eq!(pending[0].transcript, None);
        assert_eq!(pending[0].ended_at, Some(4_000));
    }
}
