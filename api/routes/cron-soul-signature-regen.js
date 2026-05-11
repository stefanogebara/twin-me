/**
 * Cron: Soul Signature Auto-Regeneration
 *
 * Audit 2026-05-09 D-H2: refreshes soul_signatures rows that have gone
 * stale relative to the user's accumulated memory stream.
 *
 * Eligibility (all must hold):
 *   - soul_signatures.updated_at older than SIGNATURE_STALE_DAYS
 *   - new memories since signature.updated_at exceed MIN_NEW_MEMORIES
 *   - user has at least one connected platform (signals active use)
 *
 * Per-run cap: MAX_USERS_PER_RUN keeps the LLM bill bounded and the cron
 * inside Vercel's 60s function-duration ceiling. Eligible users not
 * processed this run get picked up on the next daily cycle.
 *
 * Schedule: vercel.json registers this as `0 6 * * *` (daily 06:00 UTC),
 * low-load window where ingestion crons aren't fighting for pgbouncer
 * slots.
 *
 * Security: CRON_SECRET bearer token (same as every other cron route).
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { regenerateSoulSignature } from '../services/soulSignatureRegenService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronSoulSignatureRegen');

const router = express.Router();

const SIGNATURE_STALE_DAYS = 14;
const MIN_NEW_MEMORIES = 500;
const MAX_USERS_PER_RUN = 3;
const WALL_CLOCK_BUDGET_MS = 45_000; // 15s margin to Vercel's 60s ceiling

router.all('/', async (req, res) => {
  const startTime = Date.now();
  const auth = verifyCronSecret(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const stats = { eligible: 0, processed: 0, skippedThin: 0, failed: 0, archetypeChanges: 0 };

  try {
    // Pull signature rows older than the stale threshold. We over-fetch a
    // bit (limit 50) then filter by memory-delta in the loop — Supabase can't
    // easily express the JOIN-with-count predicate in a single REST query.
    const staleSince = new Date(Date.now() - SIGNATURE_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleSigs, error: sigErr } = await supabaseAdmin
      .from('soul_signatures')
      .select('user_id, archetype_name, updated_at')
      .lt('updated_at', staleSince)
      .order('updated_at', { ascending: true })
      .limit(50);

    if (sigErr) {
      log.error('Failed to fetch stale signatures', { error: sigErr.message });
      await logCronExecution('soul-signature-regen', 'error', Date.now() - startTime, null, sigErr.message);
      return res.status(500).json({ success: false, error: 'fetch_failed' });
    }

    if (!staleSigs || staleSigs.length === 0) {
      log.info('No stale signatures found');
      await logCronExecution('soul-signature-regen', 'success', Date.now() - startTime, { ...stats, reason: 'no_stale_signatures' });
      return res.json({ success: true, ...stats });
    }

    log.info('Found stale signatures', { count: staleSigs.length });

    // Filter by memory-delta — only refresh signatures whose user has
    // accumulated enough new signal since the last update.
    const eligible = [];
    for (const sig of staleSigs) {
      if (Date.now() - startTime > WALL_CLOCK_BUDGET_MS - 5000) {
        // Reserve at least 5s headroom on eligibility scan so LLM calls have time.
        log.info('Wall-clock budget approaching, stopping eligibility scan');
        break;
      }

      const { count: newMemCount } = await supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sig.user_id)
        .gt('created_at', sig.updated_at);

      if ((newMemCount || 0) < MIN_NEW_MEMORIES) continue;

      // Confirm at least one connected platform — skip dormant users.
      const { count: connCount } = await supabaseAdmin
        .from('platform_connections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sig.user_id)
        .eq('status', 'connected');

      if (!connCount || connCount === 0) continue;

      eligible.push({ ...sig, newMemCount });
      if (eligible.length >= MAX_USERS_PER_RUN) break;
    }

    stats.eligible = eligible.length;

    if (eligible.length === 0) {
      log.info('No users met memory-delta + active-platform threshold');
      await logCronExecution('soul-signature-regen', 'success', Date.now() - startTime, { ...stats, reason: 'no_eligible_users' });
      return res.json({ success: true, ...stats });
    }

    // Run regen serially — bounded by wall-clock budget, not concurrency.
    // Serial keeps the LLM bill predictable and avoids hammering the
    // embedding API in parallel with N other concurrent users.
    for (const sig of eligible) {
      if (Date.now() - startTime > WALL_CLOCK_BUDGET_MS) {
        log.info('Wall-clock budget reached', {
          processed: stats.processed,
          remaining: eligible.length - stats.processed,
        });
        break;
      }
      try {
        const result = await regenerateSoulSignature(sig.user_id);
        if (result.ok) {
          stats.processed++;
          if (result.changedFromPrevious) stats.archetypeChanges++;
        } else if (result.reason === 'insufficient_memory_signal') {
          stats.skippedThin++;
        } else {
          stats.failed++;
          log.warn('Regen failed for user', { userId: sig.user_id, reason: result.reason });
        }
      } catch (err) {
        stats.failed++;
        log.error('Regen threw for user', { userId: sig.user_id, error: err?.message });
      }
    }

    await logCronExecution('soul-signature-regen', 'success', Date.now() - startTime, stats);
    return res.json({ success: true, ...stats });

  } catch (err) {
    log.error('Cron threw', { error: err?.message });
    await logCronExecution('soul-signature-regen', 'error', Date.now() - startTime, null, err?.message || 'unknown');
    return res.status(500).json({ success: false, error: 'cron_threw' });
  }
});

export default router;
