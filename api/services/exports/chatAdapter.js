/**
 * Chat-dispatcher adapter for upload-based (no-token) export platforms.
 *
 * Unlike OAuth platforms, exports never get refreshed. The "run" path
 * here just reads the latest aggregates from platform_exports — same
 * shape result as live API runs (kind, summary, raw) so the rest of
 * twinContextBuilder can stay uniform.
 *
 * Each platform plugs in its detector, formatter, and per-platform
 * reflection metadata key.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import {
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const log = createLogger('ExportChatAdapter');

/**
 * Build the run() function. Always reads the persisted aggregates;
 * no fallback to live data — this whole adapter exists because there
 * is no live data path.
 */
export function makeExportRun({ platform, formatAggregates }) {
  return async function run(_token, ctx = {}) {
    const userId = ctx.userId;
    if (!userId) return null;
    const { data, error } = await supabaseAdmin
      .from('platform_exports')
      .select('aggregates, parsed_at')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('status', 'parsed')
      .maybeSingle();
    if (error || !data?.aggregates) return null;
    const summary = formatAggregates(data.aggregates, { parsedAt: data.parsed_at });
    if (!summary) return null;
    return { kind: 'export', summary, raw: data.aggregates };
  };
}

/**
 * Generic export reflection hook. Same dedup contract as other learning
 * hooks: one reflection per (user, platform, date).
 */
export function makeExportLearn({ platform, sourceKey, summarizeForReflection }) {
  return async function learn(userId, raw, summary) {
    if (!userId || !raw || !summary) return;
    const today = todayUTC();
    try {
      await persistDedupedReflection({
        userId,
        content: summarizeForReflection
          ? summarizeForReflection({ today, summary, raw })
          : `My ${platform} snapshot on ${today}: ${summary}`,
        metadata: {
          source: sourceKey,
          [`${sourceKey}_date`]: today,
        },
        dedupMetadataKey: `${sourceKey}_date`,
        dedupMetadataValue: today,
      });
    } catch (err) {
      log.warn(`${platform} learn() failed`, { error: err?.message ?? String(err) });
    }
  };
}
