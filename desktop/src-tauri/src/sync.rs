// TwinMe Desktop — Clip sync loop (Phase 3)
// ==========================================
// Real HTTPS sync of unsynced clips to the TwinMe backend. Runs every 2 min:
// load auth token -> pull a batch of unsynced clips -> POST -> mark the ones
// the server accepted (and the ones it explicitly dropped, so we don't retry
// rejects forever). On network/5xx error we leave them unsynced for next tick.
use crate::{clips, config, meetings};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const SYNC_INTERVAL: Duration = Duration::from_secs(120);
// MUST be the canonical host (www), NOT the bare apex. The apex twinme.me
// 307-redirects to www.twinme.me, and reqwest STRIPS the Authorization header
// across that host change — so every clip/meeting POST would arrive with no
// auth ("Missing authorization header" → 401). The body survives the redirect,
// which is why /auth/refresh (token in body) worked while capture silently
// 401'd. Hitting www directly = no redirect = the bearer token is preserved.
const DEFAULT_ENDPOINT: &str = "https://www.twinme.me/api/observations/clip";
const BATCH_SIZE: usize = 50;
// Meeting sessions shorter than this are treated as noise (accidental focus on
// a meeting window, a misfire of classify_meeting) and never posted — they're
// marked synced locally so they clear the queue without spamming the backend.
const MIN_MEETING_MS: i64 = 60_000; // 1 minute

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

// Same WIRE CONTRACT as OutgoingClip: serde_json omits `None` fields (the
// backend zod schema rejects an explicit `null` on `.optional()` keys). `title`
// stays an Option so an untitled session emits NO key, not `"title":null`.
// `ended_at` is always Some here (list_unsynced only returns ended sessions),
// but kept Option to mirror the wire shape and avoid an unwrap.
#[derive(Debug, Serialize)]
struct OutgoingMeeting<'a> {
    local_id: i64,
    platform: &'a str,
    title: Option<&'a str>,
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

/// POST a batch of ended meeting sessions. Mirrors `post_batch` — same auth,
/// timeout, and `SyncResult` response shape (the backend's meeting endpoint
/// returns the identical { success, synced, dropped } envelope as clips).
pub async fn post_meetings(
    endpoint: &str,
    token: &str,
    meetings: &[meetings::Meeting],
) -> Result<SyncResult, reqwest::Error> {
    let outgoing: Vec<OutgoingMeeting> = meetings
        .iter()
        .map(|m| OutgoingMeeting {
            local_id: m.id,
            platform: &m.platform,
            title: m.title.as_deref(),
            started_at: m.started_at,
            ended_at: m.ended_at,
        })
        .collect();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let resp = client
        .post(endpoint)
        .bearer_auth(token)
        .json(&serde_json::json!({ "meetings": outgoing }))
        .send()
        .await?
        .error_for_status()?;
    resp.json::<SyncResult>().await
}

/// `post_batch` with one-shot auth recovery: on HTTP 401 (the access token
/// expired), refresh it from the stored refresh token, update `token` in place,
/// and retry once. Any other error (network/5xx) propagates unchanged so the
/// caller leaves the batch unsynced for the next tick. If the refresh itself
/// fails (no/invalid refresh token) the original 401 is returned.
async fn post_batch_authed(
    endpoint: &str,
    token: &mut String,
    clips: &[clips::Clip],
) -> Result<SyncResult, reqwest::Error> {
    match post_batch(endpoint, token.as_str(), clips).await {
        Err(err) if err.status() == Some(reqwest::StatusCode::UNAUTHORIZED) => {
            match crate::auth_refresh::refresh_access_token().await {
                Some(fresh) => {
                    *token = fresh;
                    post_batch(endpoint, token.as_str(), clips).await
                }
                None => Err(err),
            }
        }
        other => other,
    }
}

/// Mirror of `post_batch_authed` for the meeting endpoint.
async fn post_meetings_authed(
    endpoint: &str,
    token: &mut String,
    meetings: &[meetings::Meeting],
) -> Result<SyncResult, reqwest::Error> {
    match post_meetings(endpoint, token.as_str(), meetings).await {
        Err(err) if err.status() == Some(reqwest::StatusCode::UNAUTHORIZED) => {
            match crate::auth_refresh::refresh_access_token().await {
                Some(fresh) => {
                    *token = fresh;
                    post_meetings(endpoint, token.as_str(), meetings).await
                }
                None => Err(err),
            }
        }
        other => other,
    }
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

        let Some(mut token) = config::load_auth() else {
            continue; // not signed in yet
        };

        // Resolve the clip endpoint once; both clip and meeting sync share it
        // (the meeting URL is derived from it below). The env override lets
        // tests/staging point at a local server.
        let endpoint = std::env::var("TWINME_SYNC_ENDPOINT")
            .unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());

        // ── Clip sync ────────────────────────────────────────────────────
        // Guarded (not early-`continue`d) so an empty clip queue doesn't skip
        // meeting sync below — the two queues drain independently.
        let pending = match clips::list_unsynced(&conn, BATCH_SIZE) {
            Ok(c) => c,
            Err(err) => {
                eprintln!("[sync] list_unsynced: {err}");
                Vec::new()
            }
        };
        if !pending.is_empty() {
            match post_batch_authed(&endpoint, &mut token, &pending).await {
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

        // ── Meeting sync (Phase 5A) ──────────────────────────────────────
        // Symmetric to the clip path. Derive the meeting endpoint from the
        // clip endpoint by swapping the path segment — works for both the
        // DEFAULT_ENDPOINT and any TWINME_SYNC_ENDPOINT override that targets
        // /observations/clip.
        let meeting_endpoint = endpoint.replace("/observations/clip", "/observations/meeting");

        let pending_meetings = match meetings::list_unsynced(&conn, BATCH_SIZE) {
            Ok(m) => m,
            Err(err) => {
                eprintln!("[sync] meetings list_unsynced: {err}");
                Vec::new()
            }
        };
        if !pending_meetings.is_empty() {
            // Noise filter: sessions shorter than MIN_MEETING_MS are cleared
            // locally (marked synced) without hitting the backend. ended_at is
            // always Some here (list_unsynced only returns ended sessions); the
            // unwrap_or keeps an unexpected NULL from counting as a short blip.
            let mut to_post: Vec<meetings::Meeting> = Vec::new();
            let mut skip_ids: Vec<i64> = Vec::new();
            for m in pending_meetings {
                let duration = m.ended_at.unwrap_or(m.started_at) - m.started_at;
                if duration < MIN_MEETING_MS {
                    skip_ids.push(m.id);
                } else {
                    to_post.push(m);
                }
            }
            if !skip_ids.is_empty() {
                let _ = meetings::mark_synced(&conn, &skip_ids);
            }

            if !to_post.is_empty() {
                match post_meetings_authed(&meeting_endpoint, &mut token, &to_post).await {
                    Ok(result) => {
                        let synced_ids: Vec<i64> =
                            result.synced.iter().map(|r| r.local_id).collect();
                        if !synced_ids.is_empty() {
                            if let Err(err) = meetings::mark_synced(&conn, &synced_ids) {
                                eprintln!("[sync] meetings mark_synced: {err}");
                            }
                        }
                        // Clear server-dropped sessions too, so rejects aren't retried.
                        let dropped_ids: Vec<i64> =
                            result.dropped.iter().map(|r| r.local_id).collect();
                        if !dropped_ids.is_empty() {
                            let _ = meetings::mark_synced(&conn, &dropped_ids);
                        }
                        if !synced_ids.is_empty()
                            || !dropped_ids.is_empty()
                            || !skip_ids.is_empty()
                        {
                            println!(
                                "[sync] uploaded {} meetings (skipped {} short), dropped {}",
                                result.synced.len(),
                                skip_ids.len(),
                                result.dropped.len()
                            );
                        }
                    }
                    Err(err) => {
                        eprintln!("[sync] post_meetings: {err} — leaving unsynced for next tick")
                    }
                }
            } else if !skip_ids.is_empty() {
                // All pending sessions were short blips — nothing posted.
                println!("[sync] uploaded 0 meetings (skipped {} short)", skip_ids.len());
            }
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

    // Regression guard for the capture-401 saga: the sync endpoint MUST target
    // the canonical www host. The apex twinme.me 307-redirects to www, and
    // reqwest drops the Authorization header on that host change, so an apex URL
    // makes every authenticated clip/meeting POST 401 with "missing auth header".
    #[test]
    fn default_endpoint_targets_canonical_www_host_not_apex() {
        assert!(
            DEFAULT_ENDPOINT.starts_with("https://www.twinme.me/"),
            "DEFAULT_ENDPOINT must use the canonical www host, got {DEFAULT_ENDPOINT}"
        );
        // The apex form is "https://twinme.me/..." → contains "//twinme.me/".
        assert!(
            !DEFAULT_ENDPOINT.contains("//twinme.me/"),
            "DEFAULT_ENDPOINT must NOT use the bare apex (it 307-redirects, stripping auth)"
        );
    }
}
