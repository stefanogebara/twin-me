/**
 * Cron: Calendar Optimization
 * ============================
 * Runs weekdays at 8am UTC (5am São Paulo). Triggers the Calendar
 * Optimization Inngest workflow for all active users.
 *
 * Schedule: 0 8 * * 1-5 (weekdays at 08:00 UTC)
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronCalendarOptimization');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Early-exit: skip if already ran successfully within the last 20h (prevents double-fire)
    if (await wasRecentlyRun('calendar-optimization')) {
      return res.json({ success: true, triggered: 0, reason: 'cooldown' });
    }

    // Get active users (had conversation or platform data in the last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeUsers } = await supabaseAdmin
      .from('user_memories')
      .select('user_id')
      .gte('created_at', weekAgo)
      .limit(200);

    const uniqueUserIds = [...new Set((activeUsers || []).map(u => u.user_id))];

    if (uniqueUserIds.length === 0) {
      return res.json({ success: true, triggered: 0, reason: 'no_active_users' });
    }

    // Send Inngest event for each active user
    let triggered = 0;
    for (const userId of uniqueUserIds) {
      try {
        await inngest.send({ name: EVENTS.CALENDAR_OPTIMIZATION, data: { userId } });
        triggered++;
      } catch (err) {
        log.warn('Failed to trigger calendar optimization', { userId, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    log.info('Calendar optimization cron complete', { activeUsers: uniqueUserIds.length, triggered, elapsedMs: elapsed });

    await logCronExecution('calendar-optimization', 'success', elapsed, { activeUsers: uniqueUserIds.length, triggered });

    return res.json({
      success: true,
      activeUsers: uniqueUserIds.length,
      triggered,
      elapsedMs: elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('calendar-optimization', 'error', elapsed, null, err.message);
    log.error('Calendar optimization cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
