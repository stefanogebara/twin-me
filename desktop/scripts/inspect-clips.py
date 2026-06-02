#!/usr/bin/env python3
"""Inspect the TwinMe Desktop local clip store (clips.db).

Confirms the on-device context indexer is actually capturing activity — i.e.
whether the onboarding "Live observe" screen will show real data. Mirrors what
the `demo_get_clips` Rust command reads: the most recent 15 clips, excluding the
app's own window (app_name containing "TwinMe").

Run anytime (no args), ideally after using the desktop app for a minute:

    python desktop/scripts/inspect-clips.py

Read-only: never writes to the DB. Uses only the Python stdlib (sqlite3).
"""
import os
import sqlite3
import sys
from datetime import datetime, timezone


def candidate_paths():
    # Tauri/dirs::data_dir() on Windows = %APPDATA% (Roaming). Check Local too,
    # and the macOS/Linux locations, so this works wherever it's run.
    paths = []
    appdata = os.environ.get("APPDATA")
    local = os.environ.get("LOCALAPPDATA")
    home = os.path.expanduser("~")
    if appdata:
        paths.append(os.path.join(appdata, "TwinMe", "clips.db"))
    if local:
        paths.append(os.path.join(local, "TwinMe", "clips.db"))
    paths.append(os.path.join(home, "Library", "Application Support", "TwinMe", "clips.db"))  # macOS
    paths.append(os.path.join(home, ".local", "share", "TwinMe", "clips.db"))  # Linux
    return paths


def find_db():
    for p in candidate_paths():
        if os.path.isfile(p):
            return p
    return None


def fmt_ts(raw):
    if raw is None:
        return "(open)"
    # started_at may be seconds or milliseconds depending on the writer.
    secs = raw / 1000.0 if raw > 1_000_000_000_000 else float(raw)
    try:
        return datetime.fromtimestamp(secs, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except (OverflowError, OSError, ValueError):
        return str(raw)


def main():
    # Window titles can contain characters the Windows console's default cp1252
    # codec can't encode (emoji, braille spinners, CJK, ...). Force UTF-8 with
    # replacement so printing never crashes.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    db = find_db()
    if not db:
        print("clips.db NOT FOUND in any expected location:")
        for p in candidate_paths():
            print(f"   - {p}")
        print("\n=> The desktop app hasn't created it yet. Install + launch v0.1.7,")
        print("   use your computer for a minute, then re-run this.")
        return 0

    size = os.path.getsize(db)
    print(f"clips.db: {db}")
    print(f"size: {size:,} bytes\n")

    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    total = c.execute("SELECT COUNT(*) FROM clips").fetchone()[0]
    print(f"total clips captured: {total}")

    paused_row = c.execute("SELECT value FROM app_settings WHERE key='paused'").fetchone()
    paused = paused_row["value"] if paused_row else "(unset -> capturing)"
    print(f"capture paused flag: {paused}")

    excluded = [r["app_name"] for r in c.execute("SELECT app_name FROM excluded_apps ORDER BY app_name")]
    print(f"excluded apps: {excluded if excluded else '(none)'}")

    meetings = c.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
    print(f"meetings recorded: {meetings}\n")

    # Exactly what demo_get_clips returns: recent 15, newest first, minus TwinMe.
    rows = c.execute(
        "SELECT app_name, window_title, started_at FROM clips "
        "WHERE app_name NOT LIKE '%TwinMe%' "
        "ORDER BY started_at DESC LIMIT 15"
    ).fetchall()
    print("=== what the onboarding Live-observe screen WOULD show ===")
    if not rows:
        print("(empty) -> Live observe would fall back to its 'Look again' hint.")
        print("   If total clips > 0 but this is empty, everything captured was TwinMe itself.")
    else:
        for r in rows:
            title = (r["window_title"] or "").strip()
            line = f"   - {r['app_name']}"
            if title:
                line += f"  ::  {title[:60]}"
            line += f"   [{fmt_ts(r['started_at'])}]"
            print(line)

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
