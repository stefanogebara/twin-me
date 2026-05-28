// TwinMe Desktop — Clip store (Phase 2)
// =====================================
// Local SQLite-backed store for foreground-app "clips" — jo-style activity
// records persisted on-device. Each clip is one continuous focus session on
// a single (app, window) pair. Synced to twinme.me later via `sync.rs`.
//
// The DB lives at the OS-specific data dir (e.g. macOS:
// ~/Library/Application Support/TwinMe/clips.db) so it survives app updates
// and never appears in iCloud Documents.

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::PathBuf;

/// One foreground-app clip. `content` is filled in Phase 3 once the
/// Accessibility API extraction lands; for the scaffold it stays None.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Clip {
    pub id: i64,
    pub app_name: String,
    pub window_title: Option<String>,
    pub content: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    #[serde(skip)]
    pub synced_at: Option<i64>,
}

/// Where the clip DB lives. Falls back to the current dir if the OS data
/// dir can't be resolved — we'd rather log noisily than panic.
pub fn db_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("TwinMe")
        .join("clips.db")
}

/// Open (or create) the clip DB and ensure the schema exists. Callers are
/// expected to hold their own `Connection` — rusqlite connections are not
/// `Send` across threads in WAL mode, so each task opens its own.
pub fn open() -> Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(&path)?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS clips (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          app_name TEXT NOT NULL,
          window_title TEXT,
          content TEXT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          synced_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS clips_started ON clips(started_at);
        CREATE INDEX IF NOT EXISTS clips_unsynced ON clips(synced_at);

        CREATE TABLE IF NOT EXISTS excluded_apps (
          app_name TEXT PRIMARY KEY,
          added_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        "#,
    )?;
    Ok(())
}

/// Persist the global "indexing paused" flag. Stored in `app_settings` so it
/// survives restarts. The tray "Pause/Resume indexing" toggle writes here and
/// the clip indexer reads it each tick.
pub fn set_pause(conn: &Connection, paused: bool) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('paused', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![if paused { "1" } else { "0" }],
    )?;
    Ok(())
}

/// True if indexing is currently paused. Absent row → not paused (default).
pub fn is_paused(conn: &Connection) -> Result<bool> {
    let row: Option<String> = conn
        .query_row("SELECT value FROM app_settings WHERE key = 'paused'", [], |r| r.get(0))
        .optional()?;
    Ok(row.as_deref() == Some("1"))
}

/// Start a new clip for a freshly-focused (app, title). Returns the new
/// row id, which the indexer keeps until the focus changes again.
pub fn insert_clip(conn: &Connection, app: &str, title: Option<&str>) -> Result<i64> {
    let now = Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO clips (app_name, window_title, started_at) VALUES (?1, ?2, ?3)",
        params![app, title, now],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Close an open clip by stamping `ended_at` and optionally attaching
/// extracted content (Phase 3 will fill this once Accessibility lands).
pub fn close_clip(conn: &Connection, id: i64, content: Option<&str>) -> Result<()> {
    let now = Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE clips SET ended_at = ?1, content = COALESCE(?2, content) WHERE id = ?3",
        params![now, content, id],
    )?;
    Ok(())
}

/// Pull at most `limit` finished-but-unsynced clips for the sync loop.
/// Only returns clips with `ended_at IS NOT NULL` — an open clip is still
/// being written to, syncing it would race.
pub fn list_unsynced(conn: &Connection, limit: usize) -> Result<Vec<Clip>> {
    let mut stmt = conn.prepare(
        "SELECT id, app_name, window_title, content, started_at, ended_at, synced_at
         FROM clips
         WHERE synced_at IS NULL AND ended_at IS NOT NULL
         ORDER BY started_at ASC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(Clip {
            id: row.get(0)?,
            app_name: row.get(1)?,
            window_title: row.get(2)?,
            content: row.get(3)?,
            started_at: row.get(4)?,
            ended_at: row.get(5)?,
            synced_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

/// Mark a batch of clips as synced. Called by `sync.rs` after a 2xx from
/// the backend. Wrapped in a single transaction to keep the write cheap.
pub fn mark_synced(conn: &Connection, ids: &[i64]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let now = Utc::now().timestamp_millis();
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare("UPDATE clips SET synced_at = ?1 WHERE id = ?2")?;
        for id in ids {
            stmt.execute(params![now, id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// True if the user has asked us to ignore this app entirely (e.g.
/// 1Password, Banking, anything sensitive). No clip is ever created
/// for an excluded app — exclusion happens before insert.
pub fn is_excluded(conn: &Connection, app: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM excluded_apps WHERE app_name = ?1",
        params![app],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn exclude_app(conn: &Connection, app: &str) -> Result<()> {
    let now = Utc::now().timestamp_millis();
    conn.execute(
        "INSERT OR IGNORE INTO excluded_apps (app_name, added_at) VALUES (?1, ?2)",
        params![app, now],
    )?;
    Ok(())
}

pub fn unexclude_app(conn: &Connection, app: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM excluded_apps WHERE app_name = ?1",
        params![app],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_toggle_round_trips() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        assert!(!is_paused(&conn).unwrap());
        set_pause(&conn, true).unwrap();
        assert!(is_paused(&conn).unwrap());
        set_pause(&conn, false).unwrap();
        assert!(!is_paused(&conn).unwrap());
    }
}
