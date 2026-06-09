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

// Safety cap on a single recording. ~2h of 16kHz mono f32 is ~460MB held in
// memory before transcription; the cap bounds worst-case RAM and a runaway
// "meeting" left focused indefinitely.
const MAX_RECORD_SECS: u32 = 2 * 60 * 60;

/// Start a recorder for an open meeting session. `stop` is shared with the clip
/// indexer, which sets it when the session ends. Fire-and-forget: the recorder
/// finalizes the row on its own DB connection and never blocks the indexer loop.
pub fn start(meeting_id: i64, stop: Arc<AtomicBool>) {
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

        // Capture-until-stop + transcribe on a blocking thread (cpal Stream is
        // !Send, whisper is blocking). Returns (ended_at, transcript).
        let result = tauri::async_runtime::spawn_blocking(move || {
            let samples = crate::audio_capture::record_until_stopped(&stop, MAX_RECORD_SECS)?;
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
                let transcript = transcript.trim();
                // Transcript FIRST (while ended_at is still NULL → row is
                // sync-invisible), THEN stamp ended_at to release it to sync.
                if !transcript.is_empty() {
                    let _ = crate::meetings::set_transcript(&conn, meeting_id, transcript);
                }
                let _ = crate::meetings::close_meeting(&conn, meeting_id, ended_at);
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
