/**
 * YouTube learning hooks. One write today:
 *   1. Daily watching reflection — dedup by today's date.
 *
 * No anomaly insight yet because the data source is the liked-videos
 * playlist (most users tap likes irregularly, not daily), so "today
 * had unusual likes" isn't reliably signal vs noise. Topic drift over
 * weeks would be a better surface — separate work item.
 */

import { persistDedupedReflection, todayUTC } from '../platformAnalytics/sharedHooks.js';

const SOURCE = 'youtube_watching';

/**
 * @param {string} userId
 * @param {object} watching  Output of analytics/getRecentWatching.js
 * @param {string} summary  Output of formatRecentWatching.
 */
export async function persistYoutubeLearning(userId, watching, summary) {
  if (!userId || !watching || !summary) return;
  const today = todayUTC();

  await persistDedupedReflection({
    userId,
    content: `My YouTube library on ${today}: ${summary}`,
    metadata: {
      source: SOURCE,
      youtube_date: today,
      youtube_liked_videos: watching.totals?.liked_videos,
      youtube_unique_channels: watching.totals?.unique_channels,
    },
    dedupMetadataKey: 'youtube_date',
    dedupMetadataValue: today,
  });
}
