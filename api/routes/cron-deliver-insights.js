/**
 * Cron: Deliver Pending Insights to Messaging Channels
 * =====================================================
 * Runs hourly. Finds undelivered proactive insights for users
 * with enabled messaging channels and delivers via the message router.
 *
 * Schedule: 0 * * * * (hourly) in vercel.json
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { deliverPendingInsights } from '../services/messageRouter.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronDeliverInsights');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const stats = await deliverPendingInsights();
    const elapsed = Date.now() - startTime;

    if (stats.delivered > 0) {
      log.info('Insights delivered', { ...stats, elapsedMs: elapsed });
    }

    await logCronExecution('deliver-insights', 'success', elapsed, stats);

    return res.json({ success: true, ...stats, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('deliver-insights', 'error', elapsed, null, err.message);
    log.error('Insight delivery cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
