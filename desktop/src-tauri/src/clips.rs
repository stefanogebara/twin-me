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

/// Create every table the desktop app needs in the shared clips.db.
/// `pub(crate)` so sibling modules (e.g. `meetings`) can build the same
/// schema in their in-memory test connections — all tables live in this one
/// DB so `open()` hands back a connection that has them all.
pub(crate) fn init_schema(conn: &Connection) -> Result<()> {
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

        CREATE TABLE IF NOT EXISTS meetings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          title TEXT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          transcript TEXT,
          synced_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS meetings_unsynced ON meetings(synced_at);
        "#,
    )?;
    // Forward migration for DBs created before Phase 5B: the meetings table
    // existed without `transcript`, and CREATE TABLE IF NOT EXISTS won't add it.
    ensure_column(conn, "meetings", "transcript", "TEXT")?;
    Ok(())
}

/// Add `column` (`decl` type) to `table` only when it isn't already present —
/// SQLite has no `ADD COLUMN IF NOT EXISTS`. New installs get the column from
/// CREATE TABLE; older installs get it via the ALTER here. `table`/`column` are
/// always hardcoded literals (never user input), so the format!ed SQL is safe.
fn ensure_column(conn: &Connection, table: &str, column: &str, decl: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    // PRAGMA table_info columns: cid(0), name(1), type(2), notnull(3), ...
    let present = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|c| c.ok())
        .any(|name| name == column);
    drop(stmt); // release the borrow on `conn` before the ALTER below
    if !present {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"), [])?;
    }
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

/// Attach in-window content to a clip, captured once at clip-open by the
/// indexer (Phase 4, macOS Accessibility traversal). Overwrites any prior
/// content for the row — capture happens exactly once per clip so there's
/// nothing to preserve.
pub fn set_content(conn: &Connection, id: i64, content: &str) -> Result<()> {
    conn.execute("UPDATE clips SET content = ?1 WHERE id = ?2", params![content, id])?;
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

/// Pull the most recent `limit` clips regardless of sync state. Backs the
/// onboarding "here's what TwinMe noticed" demo, which wants a quick peek at
/// the latest activity (synced or not, ended or still open). Mirrors
/// `list_unsynced`'s columns but orders newest-first with no filters.
pub fn list_recent(conn: &Connection, limit: usize) -> Result<Vec<Clip>> {
    let mut stmt = conn.prepare(
        "SELECT id, app_name, window_title, content, started_at, ended_at, synced_at
         FROM clips
         ORDER BY started_at DESC
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

/// All currently-excluded app names, most-recently-added first. Backs the
/// tray "Excluded apps" submenu so the user can see and re-include them.
pub fn list_excluded(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT app_name FROM excluded_apps ORDER BY added_at DESC")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    rows.collect()
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

    #[test]
    fn set_content_round_trips() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let id = insert_clip(&conn, "Safari", Some("Example")).unwrap();
        set_content(&conn, id, "hello world").unwrap();
        // Read it back via a direct query on the content column.
        let got: Option<String> = conn
            .query_row("SELECT content FROM clips WHERE id = ?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(got.as_deref(), Some("hello world"));
    }

    #[test]
    fn list_recent_returns_newest_first() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        // Insert three clips with explicit, increasing started_at so ordering
        // is deterministic (insert_clip uses wall-clock millis otherwise).
        conn.execute(
            "INSERT INTO clips (app_name, window_title, started_at) VALUES ('A', 'first', 1000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO clips (app_name, window_title, started_at) VALUES ('B', 'second', 2000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO clips (app_name, window_title, started_at) VALUES ('C', NULL, 3000)",
            [],
        )
        .unwrap();

        let recent = list_recent(&conn, 2).unwrap();
        assert_eq!(recent.len(), 2);
        // Newest first, and the LIMIT is honored.
        assert_eq!(recent[0].app_name, "C");
        assert_eq!(recent[1].app_name, "B");
        // Recent clips are returned even when never synced / still open.
        assert!(recent[0].window_title.is_none());
        assert!(recent[0].synced_at.is_none());
    }

    #[test]
    fn ensure_column_adds_missing_meetings_transcript() {
        let conn = Connection::open_in_memory().unwrap();
        // Simulate a pre-5B DB: a meetings table WITHOUT the transcript column.
        conn.execute_batch(
            "CREATE TABLE meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, \
             title TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, synced_at INTEGER);",
        )
        .unwrap();
        // Migrate it in.
        ensure_column(&conn, "meetings", "transcript", "TEXT").unwrap();
        // The column is now present + writable.
        conn.execute(
            "INSERT INTO meetings (platform, started_at, transcript) VALUES ('Zoom', 1, 'hi')",
            [],
        )
        .unwrap();
        let got: Option<String> = conn
            .query_row("SELECT transcript FROM meetings WHERE platform = 'Zoom'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(got.as_deref(), Some("hi"));
        // Idempotent: a second call on an existing column is a no-op, not an error.
        ensure_column(&conn, "meetings", "transcript", "TEXT").unwrap();
    }

    #[test]
    fn list_excluded_round_trips() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        assert!(list_excluded(&conn).unwrap().is_empty());

        exclude_app(&conn, "1Password").unwrap();
        exclude_app(&conn, "Banking").unwrap();
        let listed = list_excluded(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.contains(&"1Password".to_string()));
        assert!(listed.contains(&"Banking".to_string()));

        unexclude_app(&conn, "1Password").unwrap();
        let after = list_excluded(&conn).unwrap();
        assert_eq!(after, vec!["Banking".to_string()]);
    }
}
