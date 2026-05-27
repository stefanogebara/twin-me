/**
 * Vercel Cron Job: Twin Self-Improvement (pi-reflect pattern)
 * =============================================================
 * Runs daily at 04:00 UTC. Walks each recently-active user's last 24h of
 * chat messages, extracts durable directives from any user corrections,
 * and either reinforces existing similar directives or inserts new ones.
 *
 * Why daily, not real-time:
 *   - Avoids LLM cost on every user message (most aren't corrections).
 *   - Vercel kills serverless functions after res.end() — pi-reflect work
 *     mid-chat would get truncated. A cron is the clean home for it.
 *   - Compounds slowly. Twin gets visibly better week-over-week.
 *
 * Budget guards:
 *   - MAX_USERS_PER_RUN caps how many users we visit per cron tick.
 *   - twinSelfImprovement.runCycle() caps LLM calls per user.
 *   - Function maxDuration stays 60s (Vercel cost rule).
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { runCycle } from '../services/twinSelfImprovement.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronTwinSelfImprovement');

const router = express.Router();

/**
 * Hard cap on users per cron tick. With 5 LLM calls/user cap and ~10s
 * worst-case work per user, this leaves headroom under the 60s function
 * timeout while still letting the platform scale to thousands of users
 * (most days, only a handful actually correct the twin).
 */
const MAX_USERS_PER_RUN = 50;

/**
 * Window we consider a user "active enough to evaluate."
 * Matches the 24h slice runCycle() walks internally.
 */
const ACTIVITY_WINDOW_HOURS = 24;

router.all('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error });
    }

    log.info('Starting daily pass');

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    // Find users who had any twin chat activity in the last 24h. We scope
    // off twin_conversations rather than user_memories because we only
    // care about users who actually chatted (corrections require chat).
    const sinceTs = new Date(Date.now() - ACTIVITY_WINDOW_HOURS * 3600_000).toISOString();
    const { data: activeRows, error: queryErr } = await supabaseAdmin
      .from('twin_conversations')
      .select('user_id')
      .gte('updated_at', sinceTs)
      .limit(500); // small headroom; we dedupe to unique users below

    if (queryErr) {
      log.error('Active user query failed', { error: queryErr.message });
      await logCronExecution('twin-self-improvement', 'error', Date.now() - startTime, null, queryErr.message);
      return res.status(500).json({ error: 'Active user query failed' });
    }

    const uniqueUserIds = Array.from(new Set((activeRows || [])
      .map(r => r.user_id)
      .filter(Boolean)));

    const userIds = uniqueUserIds.slice(0, MAX_USERS_PER_RUN);
    log.info('Active users this window', {
      total: uniqueUserIds.length,
      processing: userIds.length,
      skipped: Math.max(0, uniqueUserIds.length - userIds.length),
    });

    const stats = {
      usersProcessed: 0,
      usersWithCorrections: 0,
      directivesCreated: 0,
      directivesReinforced: 0,
      budgetExhaustedUsers: 0,
      errors: [],
    };

    for (const userId of userIds) {
      try {
        const cycleStats = await runCycle(userId);
        stats.usersProcessed++;
        if (cycleStats.directivesCreated > 0 || cycleStats.directivesReinforced > 0) {
          stats.usersWithCorrections++;
        }
        stats.directivesCreated += cycleStats.directivesCreated;
        stats.directivesReinforced += cycleStats.directivesReinforced;
        if (cycleStats.budgetExhausted) stats.budgetExhaustedUsers++;
      } catch (userErr) {
        log.warn('runCycle failed for user', { userId, error: userErr.message });
        stats.errors.push(`${userId.slice(0, 8)}: ${userErr.message.slice(0, 100)}`);
      }
    }

    const durationMs = Date.now() - startTime;
    log.info('Daily pass complete', { durationMs, ...stats });

    await logCronExecution('twin-self-improvement', 'success', durationMs, stats);

    res.json({
      success: true,
      ...stats,
      durationMs,
      windowHours: ACTIVITY_WINDOW_HOURS,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('twin-self-improvement', 'error', durationMs, null, err.message);
    log.error('Unexpected error', { error: err.message });
    res.status(500).json({
      error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error',
    });
  }
});

export default router;
