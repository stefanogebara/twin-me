// TwinMe Desktop — Meeting detection + session store (Phase 5A)
// =============================================================
// Heuristic detection of whether the focused window is a video meeting,
// by matching the app name / window title against a curated list of
// platforms. No audio — Phase 5B adds capture + transcription.
//
// The meetings table lives in the shared clips.db (created in
// clips::init_schema). Sessions are tracked by the indexer (U3): open on a
// meeting window appearing, close when it goes away, then synced to the
// backend as observations.

use rusqlite::{params, Connection, Result};

/// Classify the focused (app, title) as a meeting platform, or None.
/// PURE + deterministic — this is the unit-tested heart of detection.
/// Heuristic: matches known meeting apps; for browser-based Meet it keys off
/// the window title. Case-insensitive. Phase 5B can refine "actually in a
/// call" using audio activity.
pub fn classify_meeting(app_name: &str, title: Option<&str>) -> Option<&'static str> {
    let app = app_name.to_ascii_lowercase();
    let t = title.unwrap_or("").to_ascii_lowercase();

    // Native desktop meeting apps (match on app name).
    if app.contains("zoom") {
        return Some("Zoom");
    }
    if app.contains("microsoft teams") || app == "teams" || app.contains("teams.exe") {
        return Some("Microsoft Teams");
    }
    if app.contains("webex") {
        return Some("Webex");
    }
    if app == "facetime" {
        return Some("FaceTime");
    }
    // Slack huddle: only when the title indicates a huddle (Slack is usually
    // just chat, not a call).
    if app.contains("slack") && t.contains("huddle") {
        return Some("Slack Huddle");
    }
    // Browser-based Google Meet: the app is a browser, so key off the title.
    let is_browser = app.contains("chrome") || app.contains("safari") || app.contains("firefox")
        || app.contains("edge") || app.contains("arc") || app.contains("brave");
    if is_browser && (t.contains("meet.google.com") || t.contains("google meet") || t.starts_with("meet - ") || t.contains("| google meet")) {
        return Some("Google Meet");
    }

    None
}

#[derive(Debug)]
pub struct Meeting {
    pub id: i64,
    pub platform: String,
    pub title: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

pub fn insert_meeting(conn: &Connection, platform: &str, title: Option<&str>, started_at: i64) -> Result<i64> {
    conn.execute(
        "INSERT INTO meetings (platform, title, started_at) VALUES (?1, ?2, ?3)",
        params![platform, title, started_at],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn close_meeting(conn: &Connection, id: i64, ended_at: i64) -> Result<()> {
    conn.execute("UPDATE meetings SET ended_at = ?1 WHERE id = ?2", params![ended_at, id])?;
    Ok(())
}

/// Unsynced meetings that have already ENDED (ended_at IS NOT NULL) — we only
/// sync completed sessions, never the one currently in progress.
pub fn list_unsynced(conn: &Connection, limit: usize) -> Result<Vec<Meeting>> {
    let mut stmt = conn.prepare(
        "SELECT id, platform, title, started_at, ended_at FROM meetings
         WHERE synced_at IS NULL AND ended_at IS NOT NULL
         ORDER BY started_at ASC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], |r| {
        Ok(Meeting {
            id: r.get(0)?,
            platform: r.get(1)?,
            title: r.get(2)?,
            started_at: r.get(3)?,
            ended_at: r.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn mark_synced(conn: &Connection, ids: &[i64]) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    for id in ids {
        conn.execute("UPDATE meetings SET synced_at = ?1 WHERE id = ?2", params![now, id])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clips;

    #[test]
    fn classifies_known_platforms() {
        assert_eq!(classify_meeting("zoom.us", Some("Zoom Meeting")), Some("Zoom"));
        assert_eq!(classify_meeting("Microsoft Teams", Some("Standup | Microsoft Teams")), Some("Microsoft Teams"));
        assert_eq!(classify_meeting("Cisco Webex Meetings", None), Some("Webex"));
        assert_eq!(classify_meeting("FaceTime", None), Some("FaceTime"));
        assert_eq!(classify_meeting("Slack", Some("Huddle in #eng")), Some("Slack Huddle"));
        assert_eq!(classify_meeting("Google Chrome", Some("Standup - meet.google.com")), Some("Google Meet"));
        assert_eq!(classify_meeting("Safari", Some("Google Meet")), Some("Google Meet"));
    }

    #[test]
    fn ignores_non_meetings() {
        assert_eq!(classify_meeting("Safari", Some("TwinMe — Soul Signature")), None);
        assert_eq!(classify_meeting("Slack", Some("#general")), None); // chat, not a huddle
        assert_eq!(classify_meeting("Google Chrome", Some("GitHub — pull request")), None);
        assert_eq!(classify_meeting("Notes", None), None);
        assert_eq!(classify_meeting("", None), None);
    }

    #[test]
    fn meeting_crud_round_trips() {
        let conn = Connection::open_in_memory().unwrap();
        clips::init_schema(&conn).unwrap();
        let id = insert_meeting(&conn, "Zoom", Some("Standup"), 1_000).unwrap();
        // Not listed until ended.
        assert!(list_unsynced(&conn, 10).unwrap().is_empty());
        close_meeting(&conn, id, 1_000 + 45 * 60_000).unwrap();
        let pending = list_unsynced(&conn, 10).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].platform, "Zoom");
        mark_synced(&conn, &[id]).unwrap();
        assert!(list_unsynced(&conn, 10).unwrap().is_empty());
    }
}
