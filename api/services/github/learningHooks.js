/**
 * GitHub learning hooks. Two writes:
 *   1. Daily coding-activity reflection — dedup by today's date.
 *   2. Single-repo focus insight — fires when one repo takes
 *      >=60% of the events in the window. That's a "deep work on X"
 *      signal worth marking.
 */

import {
  insertDedupedInsight,
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const SOURCE = 'github_activity';
const FOCUS_THRESHOLD = 0.6;

/**
 * @param {string} userId
 * @param {object} activity  Output of analytics/getRecentActivity.js
 * @param {string} summary  Output of formatRecentActivity.
 */
export async function persistGithubLearning(userId, activity, summary) {
  if (!userId || !activity || !summary) return;
  const today = todayUTC();

  // 1. Reflection — same shape as Spotify; "what I was coding" is
  //    a piece of identity that compounds in the retrieval layer.
  await persistDedupedReflection({
    userId,
    content: `My GitHub activity on ${today}: ${summary}`,
    metadata: {
      source: SOURCE,
      github_date: today,
      github_total_events: activity.totals?.events,
      github_total_commits: activity.totals?.commits,
      github_repos_touched: activity.totals?.repos_touched,
    },
    dedupMetadataKey: 'github_date',
    dedupMetadataValue: today,
  });

  // 2. Single-repo focus anomaly — fires when there's a clear
  //    deep-work signal. Threshold 60% is high enough to filter
  //    the "one repo had 5 events out of 10 total" noise.
  const totalEvents = activity.totals?.events ?? 0;
  const topRepo = activity.top_repos?.[0];
  if (totalEvents >= 15 && topRepo && topRepo.events / totalEvents >= FOCUS_THRESHOLD) {
    const pct = Math.round((topRepo.events / totalEvents) * 100);
    await insertDedupedInsight({
      userId,
      insight: `You're locked into ${topRepo.repo} — ${topRepo.events} of your last ${totalEvents} GitHub events (${pct}%), ${topRepo.commits} commits. That's a real focus stretch.`,
      dedupKey: `github_focus:${topRepo.repo}:${today}`,
      urgency: 'low',
      category: 'work',
    });
  }
}
