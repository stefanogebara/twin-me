/**
 * Cron: Intelligent Triggers Check
 * ==================================
 * Daily at 10am UTC (7am São Paulo). Evaluates 6 proactive trigger
 * conditions for all active users and delivers personality-filtered
 * suggestions via message router.
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronIntelligentTriggers');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Early-exit: skip if already ran successfully within the last 20h (prevents double-fire)
    if (await wasRecentlyRun('intelligent-triggers')) {
      return res.json({ success: true, triggered: 0, reason: 'cooldown' });
    }

    // Get active users (had conversation or platform data in last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeUsers } = await supabaseAdmin
      .from('user_memories')
      .select('user_id')
      .gte('created_at', weekAgo)
      .limit(200);

    const uniqueUserIds = [...new Set((activeUsers || []).map(u => u.user_id))];

    let triggered = 0;
    for (const userId of uniqueUserIds) {
      try {
        await inngest.send({ name: EVENTS.INTELLIGENT_TRIGGERS, data: { userId } });
        triggered++;
      } catch (err) {
        log.warn('Failed to trigger', { userId, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    log.info('Intelligent triggers cron complete', { users: uniqueUserIds.length, triggered, elapsedMs: elapsed });

    await logCronExecution('intelligent-triggers', 'success', elapsed, { users: uniqueUserIds.length, triggered });

    return res.json({ success: true, users: uniqueUserIds.length, triggered, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('intelligent-triggers', 'error', elapsed, null, err.message);
    log.error('Cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
