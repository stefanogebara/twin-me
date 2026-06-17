/**
 * Focus Shape — the rhythm of your attention on the keyboard (2026-06-17)
 * =======================================================================
 * A first-party revelation built on the desktop window-mirroring stream (not an
 * API — our own client). The desktop app records which foreground app+window
 * you're looking at and how long you stay (a "clip"). This reads back the SHAPE
 * of that attention: most of the day is rapid-fire flipping between apps, a few
 * seconds at a time, but every so often you drop in and go deep.
 *
 * It is deliberately distinct from the browser-domain revelations (attention
 * gravity / day-night / curiosity): those answer "where on the web", this
 * answers "how you hold focus" at the OS-app level — duration and switching,
 * not sites. Pure tested core; same gather -> core -> candidate shape as the
 * others. Privacy: the user's own activity (app names + one window title),
 * reflected only to them.
 */
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('FocusShape');

export const WINDOW_DAYS = 28;
const MAX_ROWS = 4000;
const MIN_SESSIONS = 40;     // need a real activity history to characterize
const MIN_DISTINCT_APPS = 4; // ...spread across enough apps to call it switching
const MAX_MEDIAN_SEC = 30;   // the "fast" claim only holds if focuses are short
const MIN_DEEP_SEC = 600;    // and a genuine deep dive (>=10 min) must exist for
                             // the contrast — otherwise we'd nag with a one-sided
                             // "you're scattered", which isn't a revelation.

// Known OS process/app names → human labels. Anything unmapped is title-cased
// from its token (camelCase split), so a new app never breaks the sentence.
const APP_LABELS = {
  chrome: 'Chrome', brave: 'Brave', firefox: 'Firefox', msedge: 'Edge',
  edge: 'Edge', safari: 'Safari', arc: 'Arc', opera: 'Opera',
  slack: 'Slack', discord: 'Discord', telegram: 'Telegram', whatsapp: 'WhatsApp',
  code: 'VS Code', cursor: 'Cursor', windowsterminal: 'Windows Terminal',
  terminal: 'Terminal', iterm2: 'iTerm', explorer: 'File Explorer',
  finder: 'Finder', excel: 'Excel', winword: 'Word', powerpnt: 'PowerPoint',
  outlook: 'Outlook', notion: 'Notion', obsidian: 'Obsidian', figma: 'Figma',
  spotify: 'Spotify', zoom: 'Zoom', teams: 'Teams', notepad: 'Notepad',
  preview: 'Preview', acrobat: 'Acrobat',
};

/** PURE. Map a raw OS app/process name to a friendly label. */
export function friendlyApp(name) {
  if (!name || typeof name !== 'string') return null;
  const key = name.trim().toLowerCase().replace(/\.exe$/, '');
  if (!key) return null;
  if (APP_LABELS[key]) return APP_LABELS[key];
  // Fallback: split camelCase / separators and Title-Case each word.
  return name
    .trim()
    .replace(/\.exe$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** PURE. Median of a numeric array (sorted copy; no mutation of input). */
export function median(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Characterize the shape of attention: how short the typical focus is, across
 * how many apps, and the single longest unbroken stretch (the deep dive).
 * @param {Array<{app:string, dwellSec:number}>} sessions
 * @returns {object|null} { medianSec, distinctApps, longestMin, longestApp, totalSessions } or null
 */
export function computeFocusShape(sessions, {
  minSessions = MIN_SESSIONS,
  minDistinctApps = MIN_DISTINCT_APPS,
  maxMedianSec = MAX_MEDIAN_SEC,
  minDeepSec = MIN_DEEP_SEC,
} = {}) {
  if (!Array.isArray(sessions)) return null;
  const valid = sessions.filter(
    (s) => s && typeof s.app === 'string' && s.app.trim()
      && Number.isFinite(s.dwellSec) && s.dwellSec > 0,
  );
  if (valid.length < minSessions) return null;

  const apps = new Set(valid.map((s) => s.app));
  if (apps.size < minDistinctApps) return null;

  const med = median(valid.map((s) => s.dwellSec));
  if (med > maxMedianSec) return null; // not a fast-switching profile

  const deepest = valid.reduce((a, b) => (b.dwellSec > a.dwellSec ? b : a));
  if (deepest.dwellSec < minDeepSec) return null; // no real deep dive → no contrast

  return {
    medianSec: Math.round(med),
    distinctApps: apps.size,
    longestMin: Math.round(deepest.dwellSec / 60),
    longestApp: friendlyApp(deepest.app),
    totalSessions: valid.length,
  };
}

/** PURE. "barely a few seconds" / "about 12 seconds" — read median naturally. */
function phraseMedian(sec) {
  if (sec <= 7) return 'barely a few seconds';
  return `about ${sec} seconds`;
}

/** PURE. Candidate text (read back on the pull surface). */
export function buildFocusShapeCandidate(r) {
  if (!r || !r.longestApp || !r.longestMin) return null;
  return `Your attention moves fast: a typical app holds you for ${phraseMedian(r.medianSec)} `
    + `before you flip to the next thing, across ${r.distinctApps} different apps. `
    + `But you do go deep sometimes — your longest unbroken stretch was `
    + `${r.longestMin} minutes in ${r.longestApp}.`;
}

// ── gather (I/O, first-party DB: desktop window-mirroring clips) ──────────────
export async function gatherDesktopSessions(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  // Desktop clips land in the unified memory stream as observations tagged
  // metadata.source='desktop_clip' (see routes/observations-clip.js). Filter on
  // the JSON path server-side so we don't pull the reflection-heavy remainder.
  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'observation')
    .eq('metadata->>source', 'desktop_clip')
    .gte('created_at', since)
    .limit(MAX_ROWS);
  if (error) {
    log.warn('desktop clips fetch failed', { userId, error: error.message });
    return [];
  }
  const sessions = [];
  for (const row of data || []) {
    const m = row.metadata || {};
    const app = typeof m.app === 'string' ? m.app.trim() : '';
    const start = Number(m.started_at);
    const end = Number(m.ended_at);
    if (!app || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    sessions.push({ app, dwellSec: (end - start) / 1000 });
  }
  return sessions;
}

/** Returns a revelation object for the pull surface, or null. */
export async function computeFocusShapeRevelation(userId) {
  const sessions = await gatherDesktopSessions(userId);
  const result = computeFocusShape(sessions);
  const body = buildFocusShapeCandidate(result);
  if (!body) return null;
  return { kind: 'focus_shape', title: 'How you hold focus', body, source: 'desktop' };
}
