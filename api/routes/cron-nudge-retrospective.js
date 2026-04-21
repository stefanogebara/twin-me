/**
 * Cron: Nudge Effectiveness Retrospective — Phase 3.4b
 * =========================================================
 * 24h after a stress_nudge fires, check whether the user actually changed
 * their behaviour or kept spending in the same category. Writes the
 * conclusion back into proactive_insights.nudge_followed + nudge_outcome
 * so we can (a) learn which nudge phrasings work, (b) surface "you listened
 * to the twin N times this month" affirmation UI.
 *
 * Runs daily at 5am UTC (= 2am SP, low-traffic window, also after the 4am
 * memory-saliency-replay cron so we don't double up on load).
 *
 * Heuristic for "followed":
 *   - Fetch tx in the SAME category, AFTER the nudge's source_tx, within 6h
 *     of the nudge delivery.
 *   - If total outflow in that category+window < source tx amount * 0.5 →
 *     "followed" (the nudge broke the pattern at least temporarily).
 *   - Otherwise → "not_followed" (user kept spending despite the nudge).
 *
 * This is lossy — a user who didn't shop again in 6h may have simply been
 * asleep or out. But it's a first pass and over enough nudges the signal
 * averages out.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';

const log = createLogger('cron-nudge-retro');
const router = express.Router();

const WINDOW_HOURS_AFTER_NUDGE = 6;
const FOLLOWED_THRESHOLD_RATIO = 0.5;

async function evaluateOne(insight) {
  const meta = insight.metadata || {};
  const sourceTxId = meta.source_tx_id;
  const category = meta.tx_category;
  const amount = Number(meta.amount) || 0;
  if (!sourceTxId || !category || !amount) return { skipped: 'missing_metadata' };

  // Use nudge delivery time (created_at) as t=0 for the retrospective window.
  const t0 = new Date(insight.created_at).getTime();
  const tEnd = new Date(t0 + WINDOW_HOURS_AFTER_NUDGE * 3600_000).toISOString();

  const { data: follows, error } = await supabaseAdmin
    .from('user_transactions')
    .select('id, amount, transaction_date')
    .eq('user_id', insight.user_id)
    .eq('category', category)
    .lt('amount', 0)
    .gt('transaction_date', new Date(t0).toISOString())
    .lt('transaction_date', tEnd)
    .neq('id', sourceTxId);
  if (error) {
    log.warn(`select follow-ups failed for insight ${insight.id}: ${error.message}`);
    return { skipped: 'db_error' };
  }

  const followUpOutflow = (follows || []).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const followed = followUpOutflow < amount * FOLLOWED_THRESHOLD_RATIO;
  const outcome = followed
    ? `followed: no meaningful ${category} spend in ${WINDOW_HOURS_AFTER_NUDGE}h after nudge`
    : `not_followed: ${follows.length} follow-up tx totaling ${followUpOutflow.toFixed(2)} in ${WINDOW_HOURS_AFTER_NUDGE}h`;

  const { error: updErr } = await supabaseAdmin
    .from('proactive_insights')
    .update({
      nudge_followed: followed,
      nudge_outcome: outcome,
      nudge_checked_at: new Date().toISOString(),
    })
    .eq('id', insight.id);
  if (updErr) {
    log.warn(`update insight ${insight.id} failed: ${updErr.message}`);
    return { skipped: 'update_error' };
  }

  return { followed, followUpCount: follows.length, followUpOutflow };
}

export async function runNudgeRetrospectiveSweep() {
  // Look at nudges fired >24h ago but <72h ago (give the 24h window to
  // accumulate then check; don't re-check forever).
  const now = Date.now();
  const minAge = new Date(now - 72 * 3600_000).toISOString();
  const maxAge = new Date(now - 24 * 3600_000).toISOString();

  const { data: nudges, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, user_id, metadata, created_at, nudge_checked_at')
    .eq('category', 'stress_nudge')
    .is('nudge_checked_at', null)
    .gte('created_at', minAge)
    .lte('created_at', maxAge)
    .limit(200);

  if (error) {
    log.error(`fetch nudges failed: ${error.message}`);
    return { processed: 0 };
  }

  let followed = 0;
  let notFollowed = 0;
  let skipped = 0;

  for (const n of nudges || []) {
    const res = await evaluateOne(n);
    if (res.skipped) skipped++;
    else if (res.followed) followed++;
    else notFollowed++;
  }

  log.info(`nudge retro: ${nudges?.length || 0} checked → ${followed} followed, ${notFollowed} ignored, ${skipped} skipped`);
  return { processed: nudges?.length || 0, followed, not_followed: notFollowed, skipped };
}

router.all('/', async (req, res) => {
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }
  try {
    const result = await runNudgeRetrospectiveSweep();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error(`cron failed: ${err.message}\n${err.stack}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
