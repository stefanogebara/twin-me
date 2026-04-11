/**
 * Cron: Action Reflection — Twin Learns from Outcomes
 * =====================================================
 * Daily at 5am UTC. Triggers action reflection for all active users
 * to analyze resolved agent_actions and codify learned patterns.
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronActionReflection');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Early-exit: skip if already ran successfully within the last 20h (prevents double-fire)
    if (await wasRecentlyRun('action-reflection')) {
      return res.json({ success: true, triggered: 0, reason: 'cooldown' });
    }

    // Get users with resolved agent_actions in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: usersWithActions } = await supabaseAdmin
      .from('agent_actions')
      .select('user_id')
      .not('resolved_at', 'is', null)
      .gte('created_at', weekAgo);

    const uniqueUserIds = [...new Set((usersWithActions || []).map(u => u.user_id))];

    let triggered = 0;
    for (const userId of uniqueUserIds) {
      try {
        await inngest.send({ name: EVENTS.ACTION_REFLECTION, data: { userId } });
        triggered++;
      } catch (err) {
        log.warn('Failed to trigger reflection', { userId, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    log.info('Action reflection cron complete', { users: uniqueUserIds.length, triggered, elapsedMs: elapsed });

    await logCronExecution('action-reflection', 'success', elapsed, { users: uniqueUserIds.length, triggered });

    return res.json({ success: true, users: uniqueUserIds.length, triggered, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('action-reflection', 'error', elapsed, null, err.message);
    log.error('Cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
