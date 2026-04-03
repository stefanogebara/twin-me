/**
 * Cron: Morning Briefing
 * =======================
 * Runs daily at 10am UTC (7am São Paulo). Triggers the Morning Briefing
 * Inngest workflow for all active users who have the skill enabled.
 *
 * Schedule: 0 10 * * * (daily at 10:00 UTC)
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronMorningBriefing');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
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
        await inngest.send({ name: EVENTS.GENERATE_BRIEFING, data: { userId } });
        triggered++;
      } catch (err) {
        log.warn('Failed to trigger morning briefing', { userId, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    log.info('Morning briefing cron complete', { activeUsers: uniqueUserIds.length, triggered, elapsedMs: elapsed });

    await logCronExecution('morning-briefing', 'success', elapsed, { activeUsers: uniqueUserIds.length, triggered });

    return res.json({
      success: true,
      activeUsers: uniqueUserIds.length,
      triggered,
      elapsedMs: elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('morning-briefing', 'error', elapsed, null, err.message);
    log.error('Morning briefing cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
