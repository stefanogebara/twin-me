// TwinMe Desktop — Clip sync loop (Phase 2 scaffold)
// ===================================================
// Every 2 minutes, drains unsynced clips from the local store and (will)
// POST them to twinme.me. Phase 2 only logs what it *would* sync — the
// HTTP call lands in Phase 3 alongside auth-token plumbing.

use crate::clips;
use std::time::Duration;

const SYNC_INTERVAL: Duration = Duration::from_secs(120);
const SYNC_ENDPOINT: &str = "https://twinme.me/api/observations/clip";

pub async fn run() {
    let conn = match clips::open() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[sync] failed to open clip store: {err}");
            return;
        }
    };

    loop {
        tokio::time::sleep(SYNC_INTERVAL).await;

        match clips::list_unsynced(&conn, 50) {
            Ok(pending) if pending.is_empty() => {}
            Ok(pending) => {
                // TODO(phase-3): POST batch to SYNC_ENDPOINT with auth token.
                //   reqwest::Client::new().post(SYNC_ENDPOINT).json(&pending).send().await
                //   On 2xx, call clips::mark_synced(&conn, &ids).
                //   On 4xx/5xx, leave for the next loop iteration.
                println!(
                    "[sync] would sync {} clips to {SYNC_ENDPOINT}",
                    pending.len()
                );
            }
            Err(err) => eprintln!("[sync] list_unsynced failed: {err}"),
        }
    }
}
