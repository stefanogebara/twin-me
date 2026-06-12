// TwinMe Desktop — Clip sync loop (Phase 3)
// ==========================================
// Real HTTPS sync of unsynced clips to the TwinMe backend. Runs every 2 min:
// load auth token -> pull a batch of unsynced clips -> POST -> mark the ones
// the server accepted (and the ones it explicitly dropped, so we don't retry
// rejects forever). On network/5xx error we leave them unsynced for next tick.
//
// P1 wire-the-loop: the same 2-min loop also carries the MORNING BRIEFING
// poll — between 7 and 9am local, once per day, fetch the briefing from
// GET /api/morning-briefing/generate and surface it as a native notification
// (greeting + schedule summary only; the full JSON goes into BriefingState
// for the bundled briefing-detail screen).
use crate::{clips, config, meetings};
use chrono::Timelike;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

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
// Windows silently drops toast bodies past ~256 BYTES, so the briefing toast
// body is truncated to fit; the full briefing renders in the in-app card.
const TOAST_BODY_MAX_BYTES: usize = 256;

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
// but kept Option to mirror the wire shape and avoid an unwrap. `transcript`
// (Phase 5B, on-device whisper) is None until the meeting recorder attaches one;
// None omits the key, which the backend's `.nullish()` transcript field accepts.
#[derive(Debug, Serialize)]
struct OutgoingMeeting<'a> {
    local_id: i64,
    platform: &'a str,
    title: Option<&'a str>,
    started_at: i64,
    ended_at: Option<i64>,
    transcript: Option<&'a str>,
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
            transcript: m.transcript.as_deref(),
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

// ── Morning briefing (P1 wire-the-loop) ──────────────────────────────────

/// Envelope of GET /api/morning-briefing/generate. The briefing itself stays an
/// untyped serde_json::Value: the desktop only reads two string fields for the
/// toast and hands the rest verbatim to the briefing-detail screen, so a typed
/// mirror of the backend shape would just be a second contract to keep in sync.
#[derive(Debug, Deserialize)]
struct BriefingEnvelope {
    #[serde(default)]
    success: bool,
    briefing: Option<serde_json::Value>,
}

/// Resolve the briefing endpoint from the sync endpoint convention — same
/// path-swap pattern as the meeting endpoint and auth_refresh::refresh_endpoint,
/// so a TWINME_SYNC_ENDPOINT override redirects all desktop traffic at once.
fn briefing_endpoint_from(clip_endpoint: &str) -> String {
    clip_endpoint.replace("/observations/clip", "/morning-briefing/generate")
}

/// GET the morning briefing. Returns Ok(Some(briefing)) on a successful
/// envelope, Ok(None) when the backend answered 2xx but had no briefing, and
/// Err on network / non-2xx (incl. 401, which the authed wrapper handles).
pub async fn fetch_briefing(
    endpoint: &str,
    token: &str,
) -> Result<Option<serde_json::Value>, reqwest::Error> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let resp = client
        .get(endpoint)
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()?;
    let body: BriefingEnvelope = resp.json().await?;
    Ok(if body.success { body.briefing } else { None })
}

/// `fetch_briefing` with the same one-shot 401 auth recovery as
/// `post_batch_authed`: refresh the access token from the stored refresh token
/// and retry once; any other error propagates so the caller retries next tick.
async fn fetch_briefing_authed(
    endpoint: &str,
    token: &mut String,
) -> Result<Option<serde_json::Value>, reqwest::Error> {
    match fetch_briefing(endpoint, token.as_str()).await {
        Err(err) if err.status() == Some(reqwest::StatusCode::UNAUTHORIZED) => {
            match crate::auth_refresh::refresh_access_token().await {
                Some(fresh) => {
                    *token = fresh;
                    fetch_briefing(endpoint, token.as_str()).await
                }
                None => Err(err),
            }
        }
        other => other,
    }
}

/// On-demand entry point for the `poll_morning_briefing` command (lib.rs):
/// keyring token -> GET briefing -> JSON or None. None covers every miss case
/// (not signed in, network error, backend had nothing) — the webview falls
/// back to its no-briefing state; the error itself is logged here.
pub async fn fetch_morning_briefing() -> Option<serde_json::Value> {
    let Some(mut token) = config::load_auth() else {
        return None; // not signed in — nothing to poll
    };
    let endpoint = std::env::var("TWINME_SYNC_ENDPOINT")
        .unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());
    match fetch_briefing_authed(&briefing_endpoint_from(&endpoint), &mut token).await {
        Ok(briefing) => briefing,
        Err(err) => {
            eprintln!("[briefing] on-demand fetch failed: {err}");
            None
        }
    }
}

/// Truncate to at most `max_bytes` BYTES on a char boundary, appending "..."
/// when cut. Windows toasts silently drop bodies past ~256 bytes, so the
/// schedule summary must be clipped rather than risk a blank notification.
fn truncate_toast(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    // Reserve 3 bytes for the ellipsis, then back up to a char boundary so we
    // never slice mid-UTF-8-sequence (which would panic).
    let mut end = max_bytes.saturating_sub(3);
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &s[..end])
}

/// Local calendar date ("YYYY-MM-DD") the briefing notification last fired, or
/// None if never. Same app_settings key/value pattern as clips::is_paused.
fn briefing_shown_on(conn: &rusqlite::Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'briefing_shown_on'",
        [],
        |r| r.get(0),
    )
    .optional()
    .unwrap_or_else(|err| {
        eprintln!("[briefing] briefing_shown_on read failed: {err}");
        None
    })
}

/// Persist today's local date as "briefing shown", so the 2-min loop fires the
/// notification at most once per day. Mirrors clips::set_pause's upsert.
fn mark_briefing_shown(conn: &rusqlite::Connection, date: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('briefing_shown_on', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![date],
    )?;
    Ok(())
}

pub async fn run(app: tauri::AppHandle) {
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

        // ── Morning briefing notification (P1 wire-the-loop) ─────────────
        // Between 7 and 9am LOCAL, at most once per day (persisted across
        // restarts via app_settings, like the pause flag): fetch the briefing
        // and surface it as a native toast. The toast carries only greeting +
        // schedule summary (Windows drops bodies past ~256 bytes); the FULL
        // JSON goes into BriefingState so the bundled briefing-detail screen
        // can render the whole card. Fetch failures retry on the next 2-min
        // tick while still inside the window; "shown" is only recorded after
        // the notification actually went out.
        let now_local = chrono::Local::now();
        let today = now_local.format("%Y-%m-%d").to_string();
        if (7..9).contains(&now_local.hour())
            && briefing_shown_on(&conn).as_deref() != Some(today.as_str())
        {
            let briefing_endpoint = briefing_endpoint_from(&endpoint);
            match fetch_briefing_authed(&briefing_endpoint, &mut token).await {
                Ok(Some(briefing)) => {
                    let greeting = briefing
                        .get("greeting")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Good morning")
                        .to_string();
                    // schedule_summary is absent on the backend's no-data
                    // fallback briefing — degrade to the suggestion, then to a
                    // generic line, so the toast never ships an empty body.
                    let body = briefing
                        .get("schedule_summary")
                        .and_then(|v| v.as_str())
                        .or_else(|| briefing.get("suggestion").and_then(|v| v.as_str()))
                        .unwrap_or("Your morning briefing is ready.");
                    let body = truncate_toast(body, TOAST_BODY_MAX_BYTES);

                    // Stash the full briefing BEFORE notifying, so the card is
                    // ready the moment the user clicks through.
                    if let Some(state) = app.try_state::<crate::BriefingState>() {
                        if let Ok(mut slot) = state.0.lock() {
                            *slot = Some(briefing.clone());
                        }
                    }

                    match app
                        .notification()
                        .builder()
                        .title(greeting.as_str())
                        .body(body.as_str())
                        .show()
                    {
                        Ok(()) => {
                            println!("[briefing] notified: {greeting}");
                            if let Err(err) = mark_briefing_shown(&conn, &today) {
                                eprintln!("[briefing] mark shown failed: {err}");
                            }
                            // Ready the Brief in whichever surface the main
                            // window is showing. The bundled page listens for
                            // 'twinme:briefing-ready' and renders its in-page
                            // briefing-detail screen. The REMOTE twinme.me app
                            // has no such screen, so send it to the /briefing
                            // route (replan-2026-06-10 desktop-product P2) — the
                            // hostname guard mirrors handle_deep_link's
                            // bundled-vs-remote detection (lib.rs), so the
                            // bundled page (tauri.localhost) never navigates.
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.eval(
                                    "window.dispatchEvent(new CustomEvent('twinme:briefing-ready'));\
                                     if(location.hostname.endsWith('twinme.me')&&!location.pathname.startsWith('/briefing')){location.assign('https://twinme.me/briefing')}",
                                );
                            }
                        }
                        Err(err) => eprintln!("[briefing] notification failed: {err}"),
                    }
                }
                Ok(None) => {
                    // 2xx but no briefing in the envelope — retry next tick.
                    eprintln!("[briefing] backend returned no briefing — retrying next tick");
                }
                Err(err) => {
                    eprintln!("[briefing] fetch failed: {err} — retrying next tick")
                }
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

    // ── Morning briefing (P1 wire-the-loop) ──────────────────────────────

    #[tokio::test]
    async fn fetch_briefing_returns_briefing_json_on_200() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/api/morning-briefing/generate")
            .match_header("authorization", "Bearer test-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{"success":true,"briefing":{"greeting":"Good Morning, Stefano","schedule_summary":"Two meetings, then clear."},"cached":true}"#,
            )
            .create_async()
            .await;

        let url = format!("{}/api/morning-briefing/generate", server.url());
        let briefing = fetch_briefing(&url, "test-token").await.unwrap().unwrap();
        assert_eq!(
            briefing.get("greeting").and_then(|v| v.as_str()),
            Some("Good Morning, Stefano")
        );
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn fetch_briefing_returns_none_when_success_false() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("GET", "/api/morning-briefing/generate")
            .with_status(200)
            .with_body(r#"{"success":false,"error":"Failed to generate morning briefing"}"#)
            .create_async()
            .await;
        let url = format!("{}/api/morning-briefing/generate", server.url());
        assert!(fetch_briefing(&url, "t").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn fetch_briefing_errs_on_401() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("GET", "/api/morning-briefing/generate")
            .with_status(401)
            .create_async()
            .await;
        let url = format!("{}/api/morning-briefing/generate", server.url());
        assert!(fetch_briefing(&url, "expired").await.is_err());
    }

    #[test]
    fn briefing_endpoint_derives_from_clip_endpoint() {
        assert_eq!(
            briefing_endpoint_from(DEFAULT_ENDPOINT),
            "https://www.twinme.me/api/morning-briefing/generate"
        );
        assert_eq!(
            briefing_endpoint_from("http://127.0.0.1:3004/api/observations/clip"),
            "http://127.0.0.1:3004/api/morning-briefing/generate"
        );
    }

    #[test]
    fn truncate_toast_passes_short_strings_through() {
        assert_eq!(truncate_toast("Two meetings today.", 256), "Two meetings today.");
        // Exactly at the limit: untouched.
        let exact = "x".repeat(256);
        assert_eq!(truncate_toast(&exact, 256), exact);
    }

    #[test]
    fn truncate_toast_clips_to_byte_budget_with_ellipsis() {
        let long = "a".repeat(300);
        let out = truncate_toast(&long, 256);
        assert!(out.len() <= 256, "got {} bytes", out.len());
        assert!(out.ends_with("..."));
    }

    #[test]
    fn truncate_toast_never_splits_a_multibyte_char() {
        // "é" is 2 bytes in UTF-8; a naive byte slice at the budget would
        // panic on a char boundary violation.
        let long = "é".repeat(200); // 400 bytes
        let out = truncate_toast(&long, 256);
        assert!(out.len() <= 256);
        assert!(out.ends_with("..."));
        // If we got here without panicking, the boundary backoff worked.
    }

    #[test]
    fn briefing_shown_marker_round_trips() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        clips::init_schema(&conn).unwrap();
        assert!(briefing_shown_on(&conn).is_none());
        mark_briefing_shown(&conn, "2026-06-11").unwrap();
        assert_eq!(briefing_shown_on(&conn).as_deref(), Some("2026-06-11"));
        // Next day overwrites in place (single-row upsert, like the pause flag).
        mark_briefing_shown(&conn, "2026-06-12").unwrap();
        assert_eq!(briefing_shown_on(&conn).as_deref(), Some("2026-06-12"));
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
