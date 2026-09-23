/**
 * LinkedIn learning hooks. One write per analytics turn:
 *   Daily reflection — dedup by today's date. Stamps engagement totals
 *   + top searches into metadata so future calls have a baseline.
 *
 * Drift detection deferred until at least 7d of real extension data
 * accumulates.
 */

import { createLogger } from '../logger.js';
import {
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const log = createLogger('LinkedInLearningHooks');

const SOURCE = 'linkedin_activity';

export async function persistLinkedInLearning(userId, snapshot, summary) {
  if (!userId || !snapshot || !summary) return;
  const today = todayUTC();

  const topSearches = (snapshot.extension?.top_searches ?? [])
    .slice(0, 3)
    .map((s) => s.query)
    .filter(Boolean);

  try {
    await persistDedupedReflection({
      userId,
      content: `My LinkedIn snapshot on ${today}: ${summary}`,
      metadata: {
        source: SOURCE,
        linkedin_date: today,
        linkedin_headline: snapshot.profile?.headline ?? null,
        linkedin_top_searches: topSearches,
        linkedin_feed_seconds_14d: snapshot.extension?.totals?.feed_dwell_seconds ?? 0,
        linkedin_reactions_14d: snapshot.extension?.totals?.reactions ?? 0,
        linkedin_profile_views_14d: snapshot.extension?.totals?.profile_views ?? 0,
      },
      dedupMetadataKey: 'linkedin_date',
      dedupMetadataValue: today,
    });
  } catch (err) {
    log.warn('persistLinkedInLearning failed', { error: err?.message ?? String(err) });
  }
}
