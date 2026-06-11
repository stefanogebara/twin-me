/**
 * Platform yield policy (replan-2026-06-10 Track C BUILD).
 * =========================================================
 * Pure helpers — no DB, no LLM, no side effects.
 *
 * The replan's portfolio diagnosis: 7 sources produce essentially all signal;
 * ~15 platform stacks are dead weight. The durable guard against the portfolio
 * re-bloating is a per-platform yield metric: how many memories did this
 * platform actually produce in the last 14 days?
 *
 * Policy (documented here for a future cycle — NOT wired into any tile
 * rendering yet): a platform earns a featured tile when ANY of:
 *   1. It is a mirror (browser extension "web" / desktop app) — the moat,
 *      always first-class regardless of week-to-week volume.
 *   2. It is on the explicitly-featured keeper list (replan Track C KEEP set).
 *   3. Its raw-signal yield is >= FEATURE_YIELD_THRESHOLD memories in the
 *      last YIELD_WINDOW_DAYS days.
 * Everything else demotes (still works if connected, just not featured).
 *
 * Tag normalization is driven by what the rows actually contain (inspected
 * 2026-06-10 against user_memories):
 *   - platform_data rows: metadata.platform is the canonical tag
 *     (google_gmail, github, spotify, whoop, google_calendar, youtube, web).
 *   - desktop rows: metadata.platform is null (desktop_clip) or a display
 *     name like "Google Meet" (desktop_meeting); metadata.source carries the
 *     real origin -> both map to "desktop".
 *   - a cohort of browser-extension rows double-encoded the whole metadata
 *     object INTO the platform/source fields (a JSON string like
 *     '{"source":"browser_extension","platform":"web",...}') -> parse and
 *     recover the inner platform.
 */

export const YIELD_WINDOW_DAYS = 14;
export const FEATURE_YIELD_THRESHOLD = 5;

/** Mirrors: always featured — they see everything and cost no API quota. */
export const MIRROR_PLATFORMS = Object.freeze(['web', 'desktop']);

/**
 * Replan Track C "KEEP + feature" set. Featured regardless of a slow week
 * (e.g. Whoop band left in a drawer for two weeks must not unfeature Whoop).
 * YouTube is deliberately absent: it stays connected as a Google-OAuth
 * passenger but only earns a featured tile on actual yield.
 */
export const FEATURED_KEEPERS = Object.freeze([
  'spotify',
  'google_gmail',
  'google_calendar',
  'whoop',
  'github',
  'pluggy',
]);

/** metadata.source values that identify a mirror regardless of metadata.platform. */
const SOURCE_TO_MIRROR = Object.freeze({
  desktop_clip: 'desktop',
  desktop_meeting: 'desktop',
  browser_extension: 'web',
});

/**
 * Recover a usable string from a tag field that may be a plain tag or a
 * double-encoded JSON object (see header). Returns null when unusable.
 */
function unwrapTag(value, key) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const inner = parsed && typeof parsed === 'object' ? parsed[key] : null;
      return typeof inner === 'string' && inner.trim() ? inner.trim() : null;
    } catch {
      // Not valid JSON after all — treat the raw string as the tag.
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Normalize one memory row's tags to a canonical platform id, or null when
 * the row carries no platform signal (e.g. twin_chat conversations).
 *
 * @param {{ platform?: string|null, source?: string|null }} row
 *   Values of metadata->>'platform' and metadata->>'source'.
 * @returns {string|null} canonical lowercase platform id
 */
export function normalizePlatformTag(row) {
  if (!row || typeof row !== 'object') return null;

  // Mirror sources win over the platform field: desktop_meeting rows carry a
  // display name ("Google Meet") in platform that must not become a platform id.
  const source = unwrapTag(row.source, 'source');
  if (source && SOURCE_TO_MIRROR[source.toLowerCase()]) {
    return SOURCE_TO_MIRROR[source.toLowerCase()];
  }

  const platform = unwrapTag(row.platform, 'platform');
  if (platform) return platform.toLowerCase();

  return null;
}

/**
 * Aggregate per-platform memory counts from raw rows.
 *
 * @param {Array<{ platform?: string|null, source?: string|null }>} rows
 * @returns {Record<string, number>} platform id -> count (rows with no
 *   resolvable platform are excluded)
 */
export function aggregatePlatformYield(rows) {
  const counts = {};
  for (const row of rows || []) {
    const platform = normalizePlatformTag(row);
    if (!platform) continue;
    counts[platform] = (counts[platform] || 0) + 1;
  }
  return counts;
}

/**
 * Featured-tile gating policy. PURE — documents the rule, wired nowhere yet.
 *
 * @param {string} platform - canonical platform id (case-insensitive)
 * @param {number} yieldCount - memories produced in the last YIELD_WINDOW_DAYS
 * @param {boolean} [isMirror=false] - explicit mirror override (extension /
 *   desktop surfaces that may not carry a platform id at the call site)
 * @returns {'keep'|'demote'}
 */
export function shouldFeaturePlatform(platform, yieldCount, isMirror = false) {
  const id = typeof platform === 'string' ? platform.trim().toLowerCase() : '';

  if (isMirror || MIRROR_PLATFORMS.includes(id)) return 'keep';
  if (FEATURED_KEEPERS.includes(id)) return 'keep';

  const count = Number(yieldCount);
  if (Number.isFinite(count) && count >= FEATURE_YIELD_THRESHOLD) return 'keep';

  return 'demote';
}
