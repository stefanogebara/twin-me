# P1 Wire-the-Loop — Implementation Map (recon 2026-06-11)

Verdict: P1 is 5-7 days incl. dual-OS testing; 4-5 days if action-pill text
summaries slip to P2. The notification layer is the only missing piece — the
briefing infrastructure is complete and cacheable.

## 1. Brief card + native notification

Source endpoint EXISTS: GET /api/morning-briefing/generate
(api/routes/morning-briefing.js:45; JWT auth; Redis-cached 4h TTL via
morning_briefing_cache row). Response shape:
{ success, briefing: { greeting, schedule[], schedule_summary, insights[],
  patterns[], rest, music, suggestion, generatedAt }, cached }

Changes:
- desktop/src-tauri/src/lib.rs (~500-530): new tauri command
  poll_morning_briefing() — keyring token -> GET briefing -> JSON or null.
  Setup() timer task fires at 7am local.
- desktop/src-tauri/src/sync.rs: into the 2-min loop — if hour in [7,9) and
  !briefing_shown_today -> poll + notify; persist briefing_shown_today
  (clip_indexer.rs settings pattern).
- desktop/src-tauri/src/update.rs (~40-60): already uses
  tauri_plugin_notification::NotificationExt — add
  send_briefing_notification(briefing) (title=greeting,
  body=schedule_summary).
- desktop/www/index.html: notification click listener + new
  screen.briefing-detail (greeting, schedule summary, 3 insight cards glass
  style, rest/music collapsible, suggestion prominent, dismiss). ~150 lines.
- Backend changes: NONE.

GOTCHAS: macOS main-thread notification dispatch (plugin handles, test both
OS); 256-byte notification text limit — only greeting+schedule_summary in
the toast, full JSON via app state; test Windows too.

## 2. Context-seeded Hummingbird panel

- Clip store: desktop/src-tauri/src/clips.rs:56-67 SQLite
  (id, app_name, window_title, content nullable, started_at, ended_at,
  synced_at).
- EXISTING command demo_get_clips() (lib.rs:280-313): Vec<{app,title}>,
  6 distinct apps, dedup-by-app, excludes TwinMe — this IS the context
  source; no new command needed.
- desktop/www/hummingbird.html (~200-236): pre-load script — invoke
  demo_get_clips -> sessionStorage 'hummingbird_context' -> navigate to
  /widget?panel=1. ~15 lines.
- src/pages/Widget.tsx: read sessionStorage hook; include
  context.hummingbird_clips in POST /api/chat/message body. ~25 lines.
- api/services/twinContextBuilder.js (optional ~10 lines): render
  "=== RECENT ACTIVITY (from your desktop) ===" section from
  context.hummingbird_clips.
- Panel auth: webview shares cookies but restarts clear them — use existing
  get_fresh_access_token() (lib.rs:162) for robust panel auth.
- Clip dedup is case-sensitive by app name — normalize.

## 3. Action pills in Widget (CORRECTION to internal audit)

The chat surface EXISTS (Widget.tsx reuses MessageList + full SSE); Widget
INTENTIONALLY drops action_start/action_result (line ~198) for text-only
design. Full interactive pills need the action_pending_confirmation flow =
Phase 2 (1-2 sessions). P1 fallback (~1 hour): render text summaries —
action_start -> "Checking {tool}...", action_result -> summarizeActionResult
(gmail -> "Found N emails.", calendar -> "N events."), replacing the loading
line. MessageList unchanged.

## 4. Ready-made Brief ingredients (no changes)

- POST /api/desktop/extracted-facts (desktop-extracted-facts.js:274; JWT;
  1h Redis cache) -> { facts[{id,icon,text,source,confidence,editable}],
  facts_count, cached }
- POST /api/desktop/observe-summary (desktop-observe-summary.js:132;
  unauthenticated + rate-limited) -> { summary, insight, actions[] } from
  { clips[{app,title}], name }

## Files summary

NEW: briefing-detail screen (or section in index.html).
MODIFY: lib.rs (+30), sync.rs (+20), index.html (+100), hummingbird.html
(+15), Widget.tsx (+25), twinContextBuilder.js (+10 optional).
ENDPOINTS: zero new; zero backend changes required for P1 core.
