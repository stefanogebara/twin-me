/**
 * Discord learning hooks. One write per analytics turn:
 *
 *   Daily reflection — dedup by today's date. Stamps top 3 active
 *   servers + total messages-sent + style classification into metadata
 *   so future calls have a baseline for drift detection (mirrors the
 *   reddit interest-drift pattern).
 *
 * The cold-start window matches reddit (>=7 days of accumulated
 * reflections needed before drift can fire). Drift hook deliberately
 * NOT enabled yet — Discord activity volume needs at least a week of
 * real extension data before the comparison is meaningful.
 */

import { createLogger } from '../logger.js';
import {
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const log = createLogger('DiscordLearningHooks');

const SOURCE = 'discord_activity';

function summaryOf(snapshot) {
  const sent = snapshot.extension?.totals?.messages_sent ?? 0;
  const dwellMin = Math.round((snapshot.extension?.totals?.dwell_seconds ?? 0) / 60);
  if (sent === 0 && dwellMin === 0) return 'lurker';
  if (sent === 0) return 'pure-lurker';
  if (sent < 5) return 'mostly-lurker';
  if (sent < 20) return 'light-chatter';
  return 'active-participant';
}

/**
 * @param {string} userId
 * @param {object} snapshot - Output of analytics/getDiscordSnapshot.js
 * @param {string} summary  - Output of formatDiscordSnapshot
 */
export async function persistDiscordLearning(userId, snapshot, summary) {
  if (!userId || !snapshot || !summary) return;
  const today = todayUTC();

  const topServerNames = (snapshot.extension?.top_servers ?? [])
    .slice(0, 3)
    .map((s) => s.name ?? `server-${s.server_id}`)
    .filter(Boolean);
  const style = summaryOf(snapshot);

  try {
    await persistDedupedReflection({
      userId,
      content: `My Discord snapshot on ${today}: ${summary}`,
      metadata: {
        source: SOURCE,
        discord_date: today,
        discord_guild_count: snapshot.guilds?.length ?? 0,
        discord_top_servers: topServerNames,
        discord_style: style,
        discord_messages_sent_14d: snapshot.extension?.totals?.messages_sent ?? 0,
        discord_dwell_seconds_14d: snapshot.extension?.totals?.dwell_seconds ?? 0,
      },
      dedupMetadataKey: 'discord_date',
      dedupMetadataValue: today,
    });
  } catch (err) {
    log.warn('persistDiscordLearning failed', { error: err?.message ?? String(err) });
  }
}
