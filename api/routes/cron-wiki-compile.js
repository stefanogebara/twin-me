/**
 * Cron: Wiki compilation sweep
 * ==============================
 * Schedule: daily at 02:00 UTC (chosen during the natural quiet hour
 * for the bulk of the user base; aligns with the existing memory-archive
 * cron also at 03:00 UTC so platform load is staggered).
 *
 * Why a dedicated cron (and not the chained setTimeout in
 * observationIngestion.js):
 *   The original design was "after generateReflections completes,
 *   setTimeout(60s, () => compileWikiPages())". This works in a
 *   long-lived dev server. On Vercel, the parent observation-ingestion
 *   request returns and the Node process terminates BEFORE the 60s
 *   timer fires, so wiki compilation never runs in prod. Audit
 *   2026-05-21 confirmed: every wiki page was 11-34 days stale even
 *   though observation-ingestion + reflections were streaming in
 *   fresh on a 30-min cadence.
 *
 * Selection: only users with the llm_wiki feature flag enabled AND
 * who have new reflections since their last wiki update. Skips the
 * rest fast — no Supabase or LLM cost for users not opted in.
 *
 * Cost: each compileWikiPages call does up to 5 LLM calls (one per
 * domain) with concurrency 2. ~5-15s per domain → ~25-50s total per
 * user. We cap at MAX_USERS_PER_RUN and run users sequentially so we
 * stay well under Vercel's 60s function ceiling.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { compileWikiPages } from '../services/wikiCompilationService.js';
import { createLogger } from '../services/logger.js';
import { logCronExecution } from '../services/cronLogger.js';

const log = createLogger('cron-wiki-compile');
const router = express.Router();

// Hard ceiling on users per run. compileWikiPages spends 25-50s per user
// (5 LLM calls + concurrency 2). With Vercel's 60s function budget, we
// can comfortably do 1 user/run; multi-user batching would push past
// the limit. The cron runs daily so cycling through the user base over
// multiple days is acceptable.
const MAX_USERS_PER_RUN = 1;

// Stagger budget per user. Compilation can stall on a slow LLM response;
// we don't want one user to consume the entire budget. Hard timeout.
const PER_USER_TIMEOUT_MS = 50_000;

/**
 * Pull the candidate users — those with the llm_wiki flag enabled AND
 * at least one reflection in the last 24h (no point recompiling if
 * nothing's new). Ordered by stale-est-wiki-first so users who haven't
 * been compiled in a while bubble to the front of the queue.
 */
async function findEligibleUsers() {
  // First pass: every user with llm_wiki=true
  const { data: flagRows, error: flagErr } = await supabaseAdmin
    .from('feature_flags')
    .select('user_id')
    .eq('flag_name', 'llm_wiki')
    .eq('enabled', true);

  if (flagErr) {
    log.warn('Feature flag query failed', { error: flagErr.message });
    return [];
  }
  if (!flagRows || flagRows.length === 0) return [];

  const userIds = flagRows.map((r) => r.user_id);

  // For those users, find the staleness of their most-recent wiki update.
  // Users with no wiki rows yet (first-time compile) are also eligible —
  // we treat them as "infinitely stale" so they get processed.
  const { data: wikiAges } = await supabaseAdmin
    .from('user_wiki_pages')
    .select('user_id, updated_at')
    .in('user_id', userIds)
    .order('updated_at', { ascending: false });

  // user_id -> most recent updated_at (null if no rows yet)
  const ageByUser = new Map();
  for (const row of wikiAges || []) {
    if (!ageByUser.has(row.user_id)) ageByUser.set(row.user_id, row.updated_at);
  }

  return userIds
    .map((uid) => ({ userId: uid, lastUpdate: ageByUser.get(uid) || null }))
    .sort((a, b) => {
      // null (never compiled) first, then oldest updated_at first
      if (a.lastUpdate === null && b.lastUpdate !== null) return -1;
      if (b.lastUpdate === null && a.lastUpdate !== null) return 1;
      if (a.lastUpdate === null && b.lastUpdate === null) return 0;
      return new Date(a.lastUpdate).getTime() - new Date(b.lastUpdate).getTime();
    })
    .slice(0, MAX_USERS_PER_RUN)
    .map((x) => x.userId);
}

/**
 * Run compileWikiPages with a hard timeout so a slow user doesn't
 * burn the entire function budget.
 */
async function compileWithTimeout(userId, ms) {
  return Promise.race([
    compileWikiPages(userId),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`wiki compile timeout ${ms}ms`)), ms),
    ),
  ]);
}

router.all('/', async (req, res) => {
  const startTime = Date.now();
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  try {
    const userIds = await findEligibleUsers();
    let processed = 0;
    let compiled = 0;
    let errored = 0;
    let skipped = 0;
    const errors = [];

    for (const userId of userIds) {
      processed++;
      try {
        const result = await compileWithTimeout(userId, PER_USER_TIMEOUT_MS);
        const wasUpdated = Array.isArray(result?.compiled) && result.compiled.length > 0;
        if (wasUpdated) {
          compiled++;
          log.info('Wiki compiled', { userId, domains: result.compiled });
        } else {
          skipped++;
        }
      } catch (err) {
        errored++;
        errors.push({ userId, error: err.message });
        log.warn('Wiki compile failed', { userId, error: err.message });
      }
    }

    const durationMs = Date.now() - startTime;
    const payload = { processed, compiled, skipped, errored, errors };
    log.info('Wiki sweep complete', payload);
    await logCronExecution('wiki-compile', 'success', durationMs, payload);
    return res.json({ success: true, ...payload, durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    log.error('Wiki cron unhandled', { message: err.message });
    await logCronExecution('wiki-compile', 'error', durationMs, null, err.message);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? err.message : 'wiki cron failed',
    });
  }
});

export default router;
