// TwinMe Desktop — Access-token refresh (Phase 6)
// ================================================
// The headless clip/meeting sync (sync.rs) and the webview both need a valid,
// non-expired ACCESS token. Access tokens live ~30 min; this module exchanges
// the long-lived REFRESH token (stored in the OS keyring, never handed back to
// JS) for a fresh access token via the backend's body-based /api/auth/refresh.
//
// Why body-based: the desktop webview is WebView2, which drops the sameSite=
// Strict refresh COOKIE on twinme:// deep-link navigations — so cookie refresh
// 401s. The backend also accepts the refresh token in the request BODY
// (auth-simple.js: `req.cookies?.refresh_token || req.body?.refreshToken`) and
// returns the rotated refresh token when the client identifies as `mobile`
// (shouldExposeRefreshToken). We reuse that mobile path — no backend change.
//
// Refresh tokens ROTATE on every use (the backend invalidates the old one), so
// two concurrent refreshes would make one lose the race. A process-wide async
// Mutex serializes refreshes across the sync loop and the get_fresh_access_token
// command so they always read-then-store the latest token in order.
use crate::config;
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Mutex;

const DEFAULT_REFRESH_ENDPOINT: &str = "https://twinme.me/api/auth/refresh";

fn refresh_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Mirror sync's TWINME_SYNC_ENDPOINT override convention so tests/staging can
/// point at a local server: derive the refresh URL from the clip endpoint.
fn refresh_endpoint() -> String {
    std::env::var("TWINME_SYNC_ENDPOINT")
        .map(|e| e.replace("/observations/clip", "/auth/refresh"))
        .unwrap_or_else(|_| DEFAULT_REFRESH_ENDPOINT.to_string())
}

#[derive(Deserialize)]
struct RefreshResponse {
    #[serde(rename = "accessToken")]
    access_token: String,
    // Present because we send client=mobile (shouldExposeRefreshToken). Optional
    // so a missing key doesn't fail the parse — we keep the current token then.
    #[serde(rename = "refreshToken")]
    refresh_token: Option<String>,
}

/// POST the refresh token (body-based, no cookie) with client=mobile so the
/// rotated refresh token comes back too. Returns (access_token, new_refresh_token)
/// on success, or None on any network / non-2xx / parse error. Does NOT touch the
/// keyring (the caller persists), so it is unit-testable against a mock server.
pub async fn refresh_with(url: &str, refresh_token: &str) -> Option<(String, String)> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .ok()?;
    let resp = client
        .post(url)
        .json(&serde_json::json!({ "refreshToken": refresh_token, "client": "mobile" }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body: RefreshResponse = resp.json().await.ok()?;
    let new_refresh = body
        .refresh_token
        .unwrap_or_else(|| refresh_token.to_string());
    Some((body.access_token, new_refresh))
}

/// Serialized refresh: load the stored refresh token, exchange it for a fresh
/// access token (rotating the refresh token), persist BOTH back into the keyring,
/// and return the new access token. Returns None when there is no stored refresh
/// token or the exchange fails (the sync then stays unauthenticated until the
/// next sign-in re-seeds the keyring). Used by both the sync loop (on 401) and
/// the webview's get_fresh_access_token command.
pub async fn refresh_access_token() -> Option<String> {
    let _guard = refresh_lock().lock().await;
    let refresh_token = config::load_refresh()?;
    let (access, new_refresh) = refresh_with(&refresh_endpoint(), &refresh_token).await?;
    // Best-effort persistence: a keyring write failure must not drop the fresh
    // access token we already hold — return it so this cycle still authenticates.
    let _ = config::store_auth(&access);
    let _ = config::store_refresh(&new_refresh);
    Some(access)
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    #[tokio::test]
    async fn refresh_with_returns_rotated_tokens_on_200() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/api/auth/refresh")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"success":true,"accessToken":"new-access","refreshToken":"new-refresh"}"#)
            .create_async()
            .await;

        let url = format!("{}/api/auth/refresh", server.url());
        let (access, refresh) = refresh_with(&url, "old-refresh").await.unwrap();
        assert_eq!(access, "new-access");
        assert_eq!(refresh, "new-refresh");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn refresh_with_keeps_old_refresh_when_response_omits_it() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("POST", "/api/auth/refresh")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"success":true,"accessToken":"a2"}"#)
            .create_async()
            .await;
        let url = format!("{}/api/auth/refresh", server.url());
        let (access, refresh) = refresh_with(&url, "keep-me").await.unwrap();
        assert_eq!(access, "a2");
        assert_eq!(refresh, "keep-me");
    }

    #[tokio::test]
    async fn refresh_with_returns_none_on_401() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("POST", "/api/auth/refresh")
            .with_status(401)
            .with_body(r#"{"error":"Invalid refresh token"}"#)
            .create_async()
            .await;
        let url = format!("{}/api/auth/refresh", server.url());
        assert!(refresh_with(&url, "bad").await.is_none());
    }
}
