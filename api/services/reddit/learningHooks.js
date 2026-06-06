/**
 * Reddit learning hooks. Two writes:
 *   1. Daily activity reflection — dedup by today's date. Stamps
 *      top-3 active subreddits + activity style (lurker / engager /
 *      poster) into metadata so future calls have a baseline.
 *   2. Interest-shift insight — fires when current top 3 active
 *      subreddits share ZERO overlap with a baseline reflection
 *      >=7 days old. Same shape as YouTube's topic drift: a clear
 *      "what you're posting about changed" signal.
 *
 * The shift hook needs a week of accumulated reflections before it can
 * fire, same cold-start pattern as YouTube and Gmail.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import {
  insertDedupedInsight,
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const log = createLogger('RedditLearningHooks');

const SOURCE = 'reddit_activity';
const BASELINE_MIN_AGE_DAYS = 7;
const MIN_SUBS_FOR_DRIFT = 2;

function describeActivityStyle(activity) {
  const c = activity?.comments ?? 0;
  const s = activity?.submissions ?? 0;
  if (c + s === 0) return 'lurker';
  if (s === 0) return 'commenter';
  if (c === 0) return 'submitter';
  if (activity?.ratio != null && activity.ratio < 0.1) return 'engager';
  if (activity?.ratio != null && activity.ratio > 1) return 'poster';
  return 'mixed';
}

async function fetchBaselineReflection(userId) {
  try {
    const cutoffMs = Date.now() - BASELINE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .eq('metadata->>source', SOURCE)
      .lte('created_at', new Date(cutoffMs).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    let subs = row.metadata?.reddit_top_subs;
    if (typeof subs === 'string') {
      try {
        subs = JSON.parse(subs);
      } catch {
        subs = [];
      }
    }
    if (!Array.isArray(subs) || subs.length === 0) return null;
    return {
      top_subs: subs,
      date: row.metadata?.reddit_date ?? row.created_at?.slice(0, 10),
    };
  } catch (err) {
    log.warn('fetchBaselineReflection failed', { error: err?.message ?? String(err) });
    return null;
  }
}

/**
 * @param {string} userId
 * @param {object} activity  Output of analytics/getRedditActivity.js
 * @param {string} summary  Output of formatRedditActivity.
 */
export async function persistRedditLearning(userId, activity, summary) {
  if (!userId || !activity || !summary) return;
  const today = todayUTC();

  const currentTopSubs = (activity.top_active_subs ?? [])
    .slice(0, 3)
    .map((s) => s.subreddit)
    .filter(Boolean);
  const style = describeActivityStyle(activity.activity_split);

  await persistDedupedReflection({
    userId,
    content: `My Reddit activity on ${today}: ${summary}`,
    metadata: {
      source: SOURCE,
      reddit_date: today,
      reddit_subscriptions_count: activity.subscriptions?.count,
      reddit_total_karma: activity.identity?.total_karma,
      reddit_top_subs: currentTopSubs,
      reddit_activity_style: style,
    },
    dedupMetadataKey: 'reddit_date',
    dedupMetadataValue: today,
  });

  // Interest drift — same shape as YouTube.
  if (currentTopSubs.length < MIN_SUBS_FOR_DRIFT) return;
  const baseline = await fetchBaselineReflection(userId);
  if (!baseline || baseline.top_subs.length < MIN_SUBS_FOR_DRIFT) return;

  const overlap = currentTopSubs.filter((s) => baseline.top_subs.includes(s));
  if (overlap.length === 0) {
    await insertDedupedInsight({
      userId,
      insight:
        `Your Reddit focus shifted — your top subs lately are ${currentTopSubs.map((s) => `r/${s}`).join(', ')}, ` +
        `but on ${baseline.date} you were active in ${baseline.top_subs.slice(0, 3).map((s) => `r/${s}`).join(', ')}. ` +
        `New interest, or moved on from those communities?`,
      dedupKey: `reddit_drift:${today}`,
      urgency: 'low',
      category: 'culture',
    });
  }
}
