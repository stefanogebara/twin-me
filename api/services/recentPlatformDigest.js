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

const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Render the digest. Returns { text, events, platforms } — text is ''
 * when there is no platform_data in the window (caller decides fallback).
 *
 * One DB query; grouping and rendering are plain code. `supabase` is
 * injected (same pattern as the timeline spine had) so the eval and any
 * future production call site share the exact block.
 */
export async function renderRecentPlatformDigest(userId, { supabase, days = 14, perPlatform = DEFAULT_PER_PLATFORM } = {}) {
  if (!supabase) throw new Error('renderRecentPlatformDigest requires a supabase client');

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

  // Rows come newest-first, so hitting the cap means the digest covers a
  // SHORTER window than `days` — the rendered date range narrows with it and
  // the per-platform counts stay exact for the window actually shown.
  const totalEvents = typeof count === 'number' ? count : rows.length;
  const capped = rows.length < totalEvents;

  // Group by platform, keeping DB ordering (newest first) within each.
  const byPlatform = new Map();
  for (const row of rows) {
    const platform = row.metadata?.platform || 'other';
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform).push(row);
  }

  // Busiest platforms first — volume is itself the rhythm signal.
  const platforms = [...byPlatform.entries()].sort((a, b) => b[1].length - a[1].length);

  const sections = [];
  for (const [platform, items] of platforms) {
    const cap = perPlatform[platform] ?? FALLBACK_PER_PLATFORM;
    const lines = items.slice(0, cap).map(item => {
      const content = (item.content || '').replace(/\s+/g, ' ').trim().substring(0, MAX_ITEM_CHARS);
      return `- [${shortDate(item.created_at)}] ${content}`;
    });
    sections.push(`${platform.toUpperCase().replace(/_/g, ' ')} (${items.length} events):\n${lines.join('\n')}`);
  }

  const from = shortDate(rows[rows.length - 1].created_at);
  const to = shortDate(rows[0].created_at);
  const header = capped
    ? `=== MY RECENT ACTIVITY (platform data, ${from} - ${to}; newest ${rows.length} of ${totalEvents} events in the last ${days} days) ===`
    : `=== MY LAST TWO WEEKS (platform data, ${from} - ${to}) ===`;
  const text = `${header}\n${sections.join('\n')}`;

  return { text, events: rows.length, totalEvents, capped, platforms: platforms.length };
}
