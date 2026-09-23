/**
 * YouTube learning hooks. Two writes:
 *   1. Daily watching reflection — dedup by today's date. Also
 *      stamps the current top 3 channels and topics into metadata so
 *      future drift comparisons have a baseline to read against.
 *   2. Topic drift insight — fires when this turn's top 3 channels
 *      share ZERO overlap with a baseline reflection from 7+ days ago.
 *      That's a clear "focus shifted" signal — entertainment → learning,
 *      or one creator → another category entirely.
 *
 * The drift hook needs a week of accumulated reflections before it can
 * fire. On a fresh install / first run there's no baseline and the
 * drift check no-ops silently.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import {
  insertDedupedInsight,
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const log = createLogger('YoutubeLearningHooks');

const SOURCE = 'youtube_watching';
// Minimum age of the baseline reflection we compare against. 7 days
// captures "what was my YouTube last week" — short enough to be
// current, long enough that a single weird day doesn't trip it.
const BASELINE_MIN_AGE_DAYS = 7;
// Need at least N channels in BOTH current + baseline for the
// comparison to be meaningful. Below this the playlist is too sparse.
const MIN_CHANNELS_FOR_DRIFT = 2;

/**
 * Fetch the most-recent youtube_watching reflection that's at least
 * BASELINE_MIN_AGE_DAYS old, so we can compare current top channels
 * against where the user was a week ago.
 *
 * @param {string} userId
 * @returns {Promise<{ top_channels: string[], date: string }|null>}
 */
async function fetchBaselineReflection(userId) {
  try {
    const cutoffMs = Date.now() - BASELINE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .eq('metadata->>source', SOURCE)
      .lte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    // youtube_top_channels stamped as JSON in metadata; tolerate the
    // old shape (metadata only had totals).
    let channels = row.metadata?.youtube_top_channels;
    if (typeof channels === 'string') {
      try {
        channels = JSON.parse(channels);
      } catch {
        channels = [];
      }
    }
    if (!Array.isArray(channels) || channels.length === 0) return null;
    return {
      top_channels: channels,
      date: row.metadata?.youtube_date ?? row.created_at?.slice(0, 10) ?? null,
    };
  } catch (err) {
    log.warn('fetchBaselineReflection failed', { error: err?.message ?? String(err) });
    return null;
  }
}

/**
 * @param {string} userId
 * @param {object} watching  Output of analytics/getRecentWatching.js
 * @param {string} summary  Output of formatRecentWatching.
 */
export async function persistYoutubeLearning(userId, watching, summary) {
  if (!userId || !watching || !summary) return;
  const today = todayUTC();

  // Stamp the top 3 channels into metadata so a future call can
  // compare against this turn as a baseline.
  const currentTopChannels = (watching.top_channels ?? [])
    .slice(0, 3)
    .map((c) => c.channel)
    .filter(Boolean);
  const currentTopTopics = (watching.top_topics ?? [])
    .slice(0, 3)
    .map((t) => t.topic)
    .filter(Boolean);

  await persistDedupedReflection({
    userId,
    content: `My YouTube library on ${today}: ${summary}`,
    metadata: {
      source: SOURCE,
      youtube_date: today,
      youtube_liked_videos: watching.totals?.liked_videos,
      youtube_unique_channels: watching.totals?.unique_channels,
      youtube_top_channels: currentTopChannels,
      youtube_top_topics: currentTopTopics,
    },
    dedupMetadataKey: 'youtube_date',
    dedupMetadataValue: today,
  });

  // Topic drift check — only meaningful if we have a baseline at
  // least a week old AND both windows have enough channel diversity.
  if (currentTopChannels.length < MIN_CHANNELS_FOR_DRIFT) return;
  const baseline = await fetchBaselineReflection(userId);
  if (!baseline) return; // no historical data yet — first week of usage
  if (baseline.top_channels.length < MIN_CHANNELS_FOR_DRIFT) return;

  const overlap = currentTopChannels.filter((c) => baseline.top_channels.includes(c));
  if (overlap.length === 0) {
    const insightText =
      `Your YouTube focus shifted — lately your top channels are ${currentTopChannels.join(', ')}, ` +
      `but on ${baseline.date} it was ${baseline.top_channels.slice(0, 3).join(', ')}. ` +
      `Different mood, or context switch?`;
    await insertDedupedInsight({
      userId,
      insight: insightText,
      dedupKey: `youtube_drift:${today}`,
      urgency: 'low',
      category: 'culture',
    });
  }
}
