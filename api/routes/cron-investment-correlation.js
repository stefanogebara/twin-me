/**
 * Cron: Investment-Correlation Insight Sweep — Financial-Emotional Twin (Phase 4.4)
 * =================================================================================
 * Runs daily. For every user with at least a handful of tagged investment
 * events in the lookback window, re-evaluates the three deterministic moat
 * patterns:
 *
 *   - sells_low_recovery
 *   - buys_high_stress
 *   - recovery_direction_gap
 *
 * Why a cron AND a post-Plaid-sync hook?
 *   The post-sync hook in plaidIngestion.js catches the case where the new
 *   data is a fresh trade. But the more interesting case for the moat is
 *   when the user CONNECTS Whoop AFTER they already had trades — the
 *   emotional_context backfill tags recovery_score onto previously-tagless
 *   investment events, suddenly making patterns detectable. That backfill
 *   never re-triggers the Plaid sync, so without this cron the user could
 *   sit on a perfect "you sell on low-recovery days" pattern that the
 *   detector never gets a chance to evaluate.
 *
 * Cost profile:
 *   - Pure SQL (no LLM) — runs entirely on the generator's deterministic
 *     pattern math.
 *   - 48h cooldown enforced inside the generator (`isOnCooldown`), so worst
 *     case we do one cheap aggregation query per user per run.
 *   - User selection prefilters down to users with >= 6 recent investment
 *     events. Most users have zero, so the working set stays small.
 *
 * Schedule: daily at 8:00 UTC (right after plaid-sync at 7:00 so any new
 * trades from that run are visible to the correlation pass).
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { generateInvestmentCorrelationInsights } from '../services/investmentCorrelationInsights.js';
import { tagTransactionsBatch } from '../services/transactions/transactionEmotionTagger.js';
import { createLogger } from '../services/logger.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';

const log = createLogger('cron-investment-correlation');
const router = express.Router();

const LOOKBACK_DAYS = 60;
const MIN_EVENTS_FOR_USER = 6;        // floor for inclusion in the sweep — matches MIN_TRADES_FOR_PATTERN * 2
const MAX_USERS_PER_RUN = 200;        // hard ceiling so a single run can never blow maxDuration
const RETAG_BATCH_LIMIT = 100;        // max investment events to backfill per user per run

/**
 * Pull the candidate user_ids that have enough recent investment activity
 * to possibly yield a correlation pattern. Uses a coarse aggregate so we
 * don't pull the per-row details into Node — Postgres counts cheaply.
 */
async function findEligibleUsers() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  // Cheap aggregate: user_id + count over investment events with at least
  // one signal tagged. We can't HAVING-count on Supabase REST easily, so
  // we pull DISTINCT user_ids that have ANY tagged investment row and
  // accept the false-positive cost — generateInvestmentCorrelationInsights
  // bails internally if there aren't enough events.
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select('user_id', { count: 'exact', head: false })
    .eq('account_type', 'investment')
    .gte('transaction_date', since)
    .limit(5000);
  if (error) {
    log.warn(`eligible-user query failed: ${error.message}`);
    return [];
  }
  // De-dupe in JS (Supabase has no distinct() yet) and cap.
  const counts = new Map();
  for (const row of data || []) {
    counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  }
  const eligible = [...counts.entries()]
    .filter(([, n]) => n >= MIN_EVENTS_FOR_USER)
    .map(([userId]) => userId)
    .slice(0, MAX_USERS_PER_RUN);
  return eligible;
}

/**
 * Find investment events in the lookback window whose emotional context still
 * has a null recovery_score and re-tag them. Closes the "user connected Whoop
 * AFTER their brokerage was already linked" gap: the Plaid sync only retags
 * the rows it just inserted, so older trades remain recovery-less until
 * something kicks the tagger again. Returns the number of rows retagged so
 * the sweep log surfaces it.
 */
async function backfillRecoveryForUser(userId) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select(`
      id,
      emotional_context:transaction_emotional_context (recovery_score)
    `)
    .eq('user_id', userId)
    .eq('account_type', 'investment')
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(RETAG_BATCH_LIMIT * 4);   // pull a wider window, then filter

  if (error) {
    log.warn(`backfill query failed for user ${userId}: ${error.message}`);
    return 0;
  }
  const needsRetag = (data || []).filter(row => {
    const ec = Array.isArray(row.emotional_context) ? row.emotional_context[0] : row.emotional_context;
    return !ec || ec.recovery_score == null;
  }).slice(0, RETAG_BATCH_LIMIT).map(row => row.id);

  if (needsRetag.length === 0) return 0;

  try {
    const result = await tagTransactionsBatch(userId, needsRetag);
    return result?.tagged || needsRetag.length;
  } catch (err) {
    log.warn(`retag failed for user ${userId}: ${err.message}`);
    return 0;
  }
}

/**
 * Run the correlation generator across every eligible user. Each call is
 * idempotent + cooldown-protected, so re-running on a tight schedule is
 * safe — the cooldown is the throttle.
 *
 * Two-pass per user: (1) surgical retag of untagged investment events so any
 * Whoop data ingested since the last sweep gets joined onto the trades, then
 * (2) the deterministic pattern detector reads the freshly-tagged rows.
 */
async function runSweep() {
  const userIds = await findEligibleUsers();
  let scanned = 0;
  let onCooldown = 0;
  let stored = 0;
  let noPattern = 0;
  let insufficient = 0;
  let retagged = 0;
  let errors = 0;

  for (const userId of userIds) {
    scanned++;
    try {
      retagged += await backfillRecoveryForUser(userId);
      const result = await generateInvestmentCorrelationInsights(userId);
      if (result.reason === 'cooldown') onCooldown++;
      else if (result.reason === 'no_pattern') noPattern++;
      else if (result.reason === 'insufficient_data') insufficient++;
      stored += result.stored || 0;
    } catch (err) {
      errors++;
      log.warn(`generator failed for user ${userId}: ${err.message}`);
    }
  }

  log.info(`sweep: scanned ${scanned} users, retagged ${retagged} events, stored ${stored} insights, ${onCooldown} on cooldown, ${noPattern} no pattern, ${insufficient} insufficient data, ${errors} errors`);
  return { scanned, retagged, stored, onCooldown, noPattern, insufficient, errors };
}

/**
 * Vercel cron entry. Schedule in vercel.json. Endpoint is also reachable
 * by hand for debugging — verifyCronSecret rejects anyone without the
 * shared secret.
 */
router.all('/', async (req, res) => {
  const startTime = Date.now();
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }
  try {
    const result = await runSweep();
    await logCronExecution('investment-correlation', 'success', Date.now() - startTime, result);
    res.json({ success: true, ...result });
  } catch (err) {
    log.error(`cron failed: ${err.message}\n${err.stack}`);
    await logCronExecution('investment-correlation', 'error', Date.now() - startTime, null, err.message);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? err.message : 'cron failed',
    });
  }
});

export default router;
