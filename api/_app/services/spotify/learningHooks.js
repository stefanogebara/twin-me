/**
 * Spotify learning hooks. Two writes:
 *   1. Daily listening reflection — dedup key = today's date.
 *   2. Artist-concentration insight — fires when one artist takes
 *      >=40% of the recent window. That's an unusual "deep-dive"
 *      signal worth surfacing ("you've been on a Drake loop —
 *      28 of your last 50 plays").
 */

import {
  insertDedupedInsight,
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const SOURCE = 'spotify_listening';
const CONCENTRATION_THRESHOLD = 0.4;

/**
 * @param {string} userId
 * @param {object} recent  Output of analytics/getRecentListening.js
 * @param {string} summary  Output of formatRecentListening (already in prompt).
 */
export async function persistSpotifyLearning(userId, recent, summary) {
  if (!userId || !recent || !summary) return;
  const today = todayUTC();

  // 1. Reflection — the formatted summary is exactly what a future
  //    chat-turn retriever wants to see.
  await persistDedupedReflection({
    userId,
    content: `My Spotify listening on ${today}: ${summary}`,
    metadata: {
      source: SOURCE,
      spotify_date: today,
      spotify_total_plays: recent.totals?.plays,
      spotify_unique_artists: recent.totals?.unique_artists,
    },
    dedupMetadataKey: 'spotify_date',
    dedupMetadataValue: today,
  });

  // 2. Artist concentration anomaly — fire only if there are enough
  //    plays in the window for the ratio to be meaningful.
  const totalPlays = recent.totals?.plays ?? 0;
  const topArtist = recent.top_artists?.[0];
  if (totalPlays >= 10 && topArtist && topArtist.plays / totalPlays >= CONCENTRATION_THRESHOLD) {
    const pct = Math.round((topArtist.plays / totalPlays) * 100);
    await insertDedupedInsight({
      userId,
      insight: `You're deep in a ${topArtist.artist} loop — ${topArtist.plays} of your last ${totalPlays} plays (${pct}%). Worth flagging if it's a phase or a vibe.`,
      dedupKey: `spotify_concentration:${topArtist.artist}:${today}`,
      urgency: 'low',
      category: 'culture',
    });
  }
}
