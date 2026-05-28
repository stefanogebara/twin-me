// TwinMe Desktop — Clip sync loop (Phase 3)
// ==========================================
// Real HTTPS sync of unsynced clips to the TwinMe backend. Runs every 2 min:
// load auth token -> pull a batch of unsynced clips -> POST -> mark the ones
// the server accepted (and the ones it explicitly dropped, so we don't retry
// rejects forever). On network/5xx error we leave them unsynced for next tick.
use crate::{clips, config};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const SYNC_INTERVAL: Duration = Duration::from_secs(120);
const DEFAULT_ENDPOINT: &str = "https://twinme.me/api/observations/clip";
const BATCH_SIZE: usize = 50;

// WIRE CONTRACT: serde_json omits `None` fields here (no key emitted). The
// backend's zod schema uses `.optional()`, which accepts a MISSING key but
// REJECTS an explicit `null`. Do NOT add a serialize_with / representation that
// emits `null` for these Options — it would 400 every sync.
#[derive(Debug, Serialize)]
struct OutgoingClip<'a> {
    local_id: i64,
    app_name: &'a str,
    window_title: Option<&'a str>,
    content: Option<&'a str>,
    started_at: i64,
    ended_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SyncedRow {
    pub local_id: i64,
    #[allow(dead_code)]
    pub memory_id: String,
}

#[derive(Debug, Deserialize)]
pub struct DroppedRow {
    pub local_id: i64,
    #[allow(dead_code)]
    pub reason: String,
}

#[derive(Debug, Deserialize)]
pub struct SyncResult {
    pub synced: Vec<SyncedRow>,
    #[serde(default)]
    pub dropped: Vec<DroppedRow>,
}

pub async fn post_batch(
    endpoint: &str,
    token: &str,
    clips: &[clips::Clip],
) -> Result<SyncResult, reqwest::Error> {
    let outgoing: Vec<OutgoingClip> = clips
        .iter()
        .map(|c| OutgoingClip {
            local_id: c.id,
            app_name: &c.app_name,
            window_title: c.window_title.as_deref(),
            content: c.content.as_deref(),
            started_at: c.started_at,
            ended_at: c.ended_at,
        })
        .collect();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let resp = client
        .post(endpoint)
        .bearer_auth(token)
        .json(&serde_json::json!({ "clips": outgoing }))
        .send()
        .await?
        .error_for_status()?;
    resp.json::<SyncResult>().await
}

pub async fn run() {
    let conn = match clips::open() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[sync] open clip store: {err}");
            return;
        }
    };

    loop {
        tokio::time::sleep(SYNC_INTERVAL).await;

        let Some(token) = config::load_auth() else {
            continue; // not signed in yet
        };

        let pending = match clips::list_unsynced(&conn, BATCH_SIZE) {
            Ok(c) => c,
            Err(err) => {
                eprintln!("[sync] list_unsynced: {err}");
                continue;
            }
        };
        if pending.is_empty() {
            continue;
        }

        let endpoint = std::env::var("TWINME_SYNC_ENDPOINT")
            .unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());

        match post_batch(&endpoint, &token, &pending).await {
            Ok(result) => {
                let synced_ids: Vec<i64> = result.synced.iter().map(|r| r.local_id).collect();
                if !synced_ids.is_empty() {
                    if let Err(err) = clips::mark_synced(&conn, &synced_ids) {
                        eprintln!("[sync] mark_synced: {err}");
                    }
                }
                // Mark dropped clips synced too, so the server's rejects aren't
                // retried forever.
                let dropped_ids: Vec<i64> = result.dropped.iter().map(|r| r.local_id).collect();
                if !dropped_ids.is_empty() {
                    let _ = clips::mark_synced(&conn, &dropped_ids);
                }
                // Log unconditionally (incl. all-dropped batches) for observability.
                if !synced_ids.is_empty() || !dropped_ids.is_empty() {
                    println!(
                        "[sync] uploaded {} clips, dropped {}",
                        result.synced.len(),
                        result.dropped.len()
                    );
                }
            }
            Err(err) => eprintln!("[sync] post_batch: {err} — leaving unsynced for next tick"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    #[tokio::test]
    async fn posts_batch_and_returns_synced_ids() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/api/observations/clip")
            .match_header("authorization", "Bearer test-token")
            .with_status(200)
            .with_body(r#"{"success":true,"synced":[{"local_id":1,"memory_id":"abc"}],"dropped":[]}"#)
            .create_async()
            .await;

        let url = format!("{}/api/observations/clip", server.url());
        let clips = vec![clips::Clip {
            id: 1,
            app_name: "Safari".into(),
            window_title: Some("test".into()),
            content: None,
            started_at: 1,
            ended_at: Some(2),
            synced_at: None,
        }];

        let result = post_batch(&url, "test-token", &clips).await.unwrap();
        assert_eq!(result.synced.len(), 1);
        assert_eq!(result.synced[0].local_id, 1);
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn returns_err_on_5xx() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("POST", "/api/observations/clip")
            .with_status(500)
            .create_async()
            .await;
        let url = format!("{}/api/observations/clip", server.url());
        let result = post_batch(&url, "t", &[]).await;
        assert!(result.is_err());
    }
}
