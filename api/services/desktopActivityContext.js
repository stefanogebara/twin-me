/**
 * Desktop Activity Context (Hummingbird clips)
 * ============================================
 * Pure helpers — no DB, no LLM, no imports. The desktop app's Hummingbird
 * panel seeds chat requests with recent window activity
 * (context.hummingbird_clips: [{ app, title }]). These helpers sanitize
 * that untrusted client input and render the system-prompt section.
 *
 * Lives in its own module (instead of twinContextBuilder.js, which the
 * P1 plan named) because twinContextBuilder is too heavy to import in
 * unit tests — see tests/api/services/whoop/runWhoopAnalytics.test.js
 * header. twinContextBuilder.js re-exports buildRecentActivitySection
 * so callers can still find it at the planned location.
 */

export const MAX_HUMMINGBIRD_CLIPS = 6;
export const MAX_CLIP_FIELD_CHARS = 200;

// C0 controls (0x00-0x1F), DEL (0x7F), C1 controls (0x80-0x9F).
// Built via fromCharCode (not a literal character class) so the source
// file itself contains no control bytes and no-control-regex stays quiet.
const CONTROL_CHARS = new RegExp(
  '[' +
    String.fromCharCode(0x00) + '-' + String.fromCharCode(0x1f) +
    String.fromCharCode(0x7f) + '-' + String.fromCharCode(0x9f) +
  ']',
  'g'
);

/**
 * Sanitize a single clip field (app name or window title).
 * Strips C0/C1 control characters (window titles can contain anything),
 * collapses whitespace, trims, and caps length. Returns '' for non-strings.
 */
function sanitizeClipField(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CLIP_FIELD_CHARS);
}

/**
 * Validate + sanitize the raw hummingbird_clips payload from the client.
 *
 * Accepts anything; returns a clean array of at most MAX_HUMMINGBIRD_CLIPS
 * entries of shape { app, title } with both fields non-empty, control-char
 * free, and capped at MAX_CLIP_FIELD_CHARS. Non-arrays and malformed
 * entries are dropped silently — desktop context is best-effort garnish,
 * never a reason to fail a chat turn.
 */
export function sanitizeHummingbirdClips(raw) {
  if (!Array.isArray(raw)) return [];
  const clips = [];
  for (const item of raw) {
    if (clips.length >= MAX_HUMMINGBIRD_CLIPS) break;
    const app = sanitizeClipField(item?.app);
    const title = sanitizeClipField(item?.title);
    if (!app || !title) continue;
    clips.push({ app, title });
  }
  return clips;
}

/**
 * Render the system-prompt section for desktop activity.
 *
 * @param {unknown} rawClips - context.hummingbird_clips as sent by client
 *   (or an already-sanitized array — sanitization is idempotent).
 * @returns {string|null} The section text, or null when there is nothing
 *   to show (caller should skip appending).
 */
export function buildRecentActivitySection(rawClips) {
  const clips = sanitizeHummingbirdClips(rawClips);
  if (clips.length === 0) return null;
  const lines = clips.map((c) => `- ${c.app}: ${c.title}`);
  return `=== RECENT ACTIVITY (from your desktop) ===\n${lines.join('\n')}`;
}
