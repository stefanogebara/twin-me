/**
 * hummingbirdWidget — pure helpers for the desktop Hummingbird /widget surface.
 * =============================================================================
 * Two concerns, both side-effect free so they are unit-testable in node:
 *
 * 1. Context seeding (P1 wire-the-loop): the desktop "hummingbird" window
 *    hosts the REMOTE https://twinme.me/widget page, which cannot invoke
 *    Tauri commands itself. So the Rust side (show_hummingbird in
 *    desktop/src-tauri/src/lib.rs) gathers `demo_get_clips` and evals a
 *    sessionStorage write of { clips, timestamp } under 'hummingbird_context'
 *    into the page on every summon. `parseHummingbirdContext` is the read
 *    side: validate, normalize app-name casing (the clip indexer reports raw
 *    process names like "brave" / "CODE"), drop stale payloads.
 *
 * 2. Action summaries: Widget.tsx renders twin tool calls as plain text lines
 *    instead of the full interactive pill flow (that is Phase 2).
 *    action_start -> "Checking Gmail..." ; action_result -> the summary line
 *    from `summarizeActionResult` replaces it.
 */

export interface HummingbirdClip {
  app: string;
  title: string;
}

export const HUMMINGBIRD_CONTEXT_KEY = 'hummingbird_context';

/** Context older than this is ignored — yesterday's window titles would only
 * mislead the twin about "what I'm working on right now". */
export const HUMMINGBIRD_CONTEXT_TTL_MS = 30 * 60 * 1000;

const MAX_CLIPS = 6;
const MAX_TITLE_LEN = 160;

/**
 * Normalize a clip app name for rendering/sending. The desktop indexer emits
 * whatever the OS reports ("brave", "CODE", "Google Chrome"), and dedup on the
 * Rust side is by lowercased name, so casing here is purely cosmetic — but a
 * twin that says "I saw you in brave" reads broken. Single-case names get
 * title-cased per word; mixed-case names (e.g. "VS Code", "IntelliJ IDEA")
 * are preserved as-is.
 */
export function normalizeClipAppName(app: string): string {
  const trimmed = app.trim();
  if (trimmed.length === 0) return '';
  const isSingleCase = trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase();
  if (!isSingleCase) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse the raw sessionStorage payload written by the desktop quick panel.
 * Returns a normalized clip list, or [] for anything malformed, empty, or
 * stale. Never throws — a broken payload just means an unseeded chat.
 */
export function parseHummingbirdContext(
  raw: string | null | undefined,
  nowMs: number = Date.now(),
): HummingbirdClip[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const { clips, timestamp } = parsed as { clips?: unknown; timestamp?: unknown };
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return [];
    if (nowMs - timestamp > HUMMINGBIRD_CONTEXT_TTL_MS || timestamp > nowMs + 60_000) return [];
    if (!Array.isArray(clips)) return [];

    const out: HummingbirdClip[] = [];
    for (const clip of clips) {
      if (typeof clip !== 'object' || clip === null) continue;
      const { app, title } = clip as { app?: unknown; title?: unknown };
      if (typeof app !== 'string') continue;
      const normalizedApp = normalizeClipAppName(app);
      if (!normalizedApp) continue;
      const safeTitle = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE_LEN) : '';
      out.push({ app: normalizedApp, title: safeTitle });
      if (out.length >= MAX_CLIPS) break;
    }
    return out;
  } catch {
    // Malformed JSON in sessionStorage — treat as no context.
    return [];
  }
}

// ── Action text summaries ──────────────────────────────────────────────────

/** Tools that write rather than list — counting "result items" on these would
 * produce a misleading "No emails found." for a successful send. Mirrors
 * isWriteTool in components/chat/WorkspaceActionCard.tsx. */
const WRITE_TOOLS = new Set([
  'calendar_create',
  'calendar_modify_event',
  'calendar_delete_event',
  'gmail_send',
  'gmail_draft',
  'docs_create',
  'sheets_create',
]);

/** Human label for a tool id, for the "Checking X..." line. */
function toolLabel(tool: string): string {
  if (tool.startsWith('gmail')) return 'Gmail';
  if (tool.startsWith('calendar')) return 'your calendar';
  if (tool.startsWith('drive')) return 'Drive';
  if (tool.startsWith('contacts')) return 'your contacts';
  if (tool === 'get_meeting_prep') return 'your meetings';
  // Fall back to the raw id, de-snake-cased ("web_search" -> "web search").
  return tool.replace(/_/g, ' ');
}

/** Count items in an action_result payload. Mirrors the shapes accepted by
 * getResultItems in WorkspaceActionCard.tsx. */
function countResultItems(data: unknown): number | null {
  if (data == null) return null;
  if (Array.isArray(data)) return data.length;
  if (typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  for (const key of ['messages', 'emails', 'events', 'files', 'contacts', 'meetings', 'results']) {
    if (Array.isArray(d[key])) return (d[key] as unknown[]).length;
  }
  if (typeof d.count === 'number' && Number.isFinite(d.count)) return d.count;
  if (typeof d.total === 'number' && Number.isFinite(d.total)) return d.total;
  return null;
}

/** Loading line shown when the twin starts a tool call. */
export function summarizeActionStart(tool: string): string {
  return `Checking ${toolLabel(tool)}...`;
}

/**
 * One-line text summary of a successful action_result.
 *   gmail*    -> "Found N emails."
 *   calendar* -> "N events on your calendar."
 *   default   -> "Done."
 */
export function summarizeActionResult(tool: string, data: unknown): string {
  if (WRITE_TOOLS.has(tool)) return 'Done.';
  const count = countResultItems(data);
  if (tool.startsWith('gmail')) {
    if (count === null) return 'Checked Gmail.';
    if (count === 0) return 'No emails found.';
    return count === 1 ? 'Found 1 email.' : `Found ${count} emails.`;
  }
  if (tool.startsWith('calendar')) {
    if (count === null) return 'Checked your calendar.';
    if (count === 0) return 'Nothing on your calendar.';
    return count === 1 ? '1 event on your calendar.' : `${count} events on your calendar.`;
  }
  return 'Done.';
}

/** Visible failure line — tool errors must never disappear silently. */
export function summarizeActionFailure(tool: string): string {
  return `Couldn't check ${toolLabel(tool)}.`;
}
