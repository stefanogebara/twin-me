/**
 * Recent Platform Digest — last-two-weeks grounding block
 * ========================================================
 * Candidate context feature (Phase 3, fidelity-gated). The v2 battery
 * re-trial measured the twin at 0.0000 on temporal-recall items: the
 * memory stream HOLDS the recent platform data (782 platform_data rows in
 * the eval user's last 14 days) but identity-weighted retrieval surfaces
 * ~6 of them, so the twin answers "what have I been doing lately" from
 * trait-level identity. This module renders the recent platform_data
 * directly — per-platform event counts plus the freshest items — as a
 * compact block a prompt can inject.
 *
 * Ships only if it moves the measured score (twin-research/fidelity-eval.js
 * 'digest' arm). Until then nothing in production imports it.
 */

import { createLogger } from './logger.js';

const log = createLogger('RecentPlatformDigest');

/** Most items shown per platform — counts stay exact, items are sampled. */
const DEFAULT_PER_PLATFORM = {
  spotify: 6,
  github: 5,
  google_calendar: 5,
  whoop: 4,
  google_gmail: 3,
  youtube: 3,
  web: 3,
};
const FALLBACK_PER_PLATFORM = 3;
const MAX_ITEM_CHARS = 110;
const MAX_ROWS = 1000;

/**
 * Self-imposed char budget, trimmed by whole SECTIONS so the block stays
 * well-formed — the prompt builder's clamp would chop a line mid-sentence.
 * Kept in lockstep with MAX_DIGEST_CHARS in twinSystemPromptBuilder.js.
 */
const MAX_TEXT_CHARS = 3000;

const dayFormatter = (timeZone) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone });

/**
 * When an event actually HAPPENED, not when we ingested it.
 * `created_at` is ingestion time and lags reality by up to ~17 days on the
 * batch-ingested platforms (measured on the eval user: Gmail 421h, GitHub
 * 374h, YouTube 355h), so dating lines by it mislabels the day and leaks
 * pre-window events into a "last two weeks" block. metadata.timestamp is
 * present on 100% of platform_data rows. Falls back to created_at when the
 * timestamp is missing, unparseable, or implausibly in the future (a
 * scheduled calendar entry must not be narrated as something already done).
 */
function eventTimeMs(row, nowMs) {
  const raw = row.metadata?.timestamp;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed <= nowMs + 60 * 60 * 1000) return parsed;
  }
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) ? created : nowMs;
}

/**
 * Rhythm of a platform's events across the window, from timestamps only —
 * no content parsing, no LLM. This is the fix for the measured
 * interpretation gap: given only the newest few items, the model guessed
 * "bursts" for a calendar the user experiences as "packed", because
 * distribution across days was never in the prompt.
 */
/**
 * Per-platform activity spread (events per calendar day). MEASURED AND NOT
 * RENDERED: a v2 attempt printed this as a rhythm line per platform
 * ("33 events on 8 of the last 15 days") to answer the packed-vs-bursts
 * question the sampled item lines cannot. It did not move the fidelity
 * score, so it stays out of the prompt per the ship-only-if-it-moves-the-
 * score rule. Kept as a pure function because the eval can re-trial it as a
 * candidate arm without reconstructing the logic — and because the *reason*
 * it failed may be that the item is unwinnable, not that spread is useless
 * (the user calls a calendar "packed" that the data shows active on 8 of 15
 * days). See twin-research/fidelity-eval.js verdict log.
 */
export function activitySpread(times, fmt) {
  const perDay = new Map();
  for (const t of times) {
    const key = fmt.format(new Date(t));
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  const activeDays = perDay.size;
  const [busiestDay, busiestCount] = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  return { activeDays, busiestDay, busiestCount, perActiveDay: times.length / activeDays };
}

/**
 * Render the digest. Returns { text, events, platforms } — text is ''
 * when there is no platform_data in the window (caller decides fallback).
 *
 * One DB query; grouping and rendering are plain code. `supabase` is
 * injected (same pattern as the timeline spine had) so the eval and any
 * future production call site share the exact block.
 */
export async function renderRecentPlatformDigest(userId, { supabase, days = 14, perPlatform = DEFAULT_PER_PLATFORM, timeZone = 'UTC' } = {}) {
  if (!supabase) throw new Error('renderRecentPlatformDigest requires a supabase client');

  const nowMs = Date.now();
  const sinceMs = nowMs - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  // count:'exact' rides along with the same query — the row cap must never be
  // reported as if it were the user's true event volume.
  const { data: rows, error, count } = await supabase
    .from('user_memories')
    .select('content, created_at, metadata', { count: 'exact' })
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    log.warn('Digest query failed', { userId, error: error.message });
    return { text: '', events: 0, totalEvents: 0, capped: false, platforms: 0 };
  }
  if (!rows || rows.length === 0) {
    return { text: '', events: 0, totalEvents: 0, capped: false, platforms: 0 };
  }

  const fmt = dayFormatter(timeZone);

  // Re-anchor on event time, then drop anything that HAPPENED before the
  // window. Ingestion always follows the event, so the created_at query above
  // is a superset of what event time can admit — filtering here loses nothing
  // and stops a three-week-old email from being narrated as this week's news.
  const dated = rows
    .map(row => ({ row, t: eventTimeMs(row, nowMs) }))
    .filter(({ t }) => t >= sinceMs)
    .sort((a, b) => b.t - a.t);

  if (dated.length === 0) {
    return { text: '', events: 0, totalEvents: 0, capped: false, platforms: 0 };
  }

  // Rows come newest-first, so hitting the cap means the digest covers a
  // SHORTER window than `days` — the rendered date range narrows with it and
  // the per-platform counts stay exact for the window actually shown.
  const totalEvents = typeof count === 'number' ? count : rows.length;
  const capped = rows.length < totalEvents;

  // Group by platform, newest first within each.
  const byPlatform = new Map();
  for (const entry of dated) {
    const platform = entry.row.metadata?.platform || 'other';
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform).push(entry);
  }

  // Busiest platforms first — volume is itself the rhythm signal.
  const platforms = [...byPlatform.entries()].sort((a, b) => b[1].length - a[1].length);

  const sections = [];
  for (const [platform, items] of platforms) {
    const cap = perPlatform[platform] ?? FALLBACK_PER_PLATFORM;
    const lines = items.slice(0, cap).map(({ row, t }) => {
      const content = (row.content || '').replace(/\s+/g, ' ').trim().substring(0, MAX_ITEM_CHARS);
      return `- [${fmt.format(new Date(t))}] ${content}`;
    });
    sections.push(`${platform.toUpperCase().replace(/_/g, ' ')} (${items.length} events):\n${lines.join('\n')}`);
  }

  const from = fmt.format(new Date(dated[dated.length - 1].t));
  const to = fmt.format(new Date(dated[0].t));
  const header = capped
    ? `=== MY RECENT ACTIVITY (platform data, ${from} - ${to}; newest ${dated.length} of ${totalEvents} events in the last ${days} days) ===`
    : `=== MY LAST TWO WEEKS (platform data, ${from} - ${to}) ===`;

  // Trim whole sections from the tail (least active platforms) rather than
  // letting the prompt-builder clamp chop a line in half.
  let text = `${header}\n${sections.join('\n')}`;
  let kept = sections.length;
  while (text.length > MAX_TEXT_CHARS && kept > 1) {
    kept -= 1;
    text = `${header}\n${sections.slice(0, kept).join('\n')}`;
  }

  return { text, events: dated.length, totalEvents, capped, platforms: platforms.length };
}
