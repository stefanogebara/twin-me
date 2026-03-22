/**
 * Cron: Deliver Pending Insights to Messaging Channels
 * =====================================================
 * Runs every 5 minutes. Finds undelivered proactive insights for users
 * with enabled messaging channels and delivers via the message router.
 *
 * Schedule: every 5 minutes
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { deliverPendingInsights } from '../services/messageRouter.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronDeliverInsights');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const startTime = Date.now();
    const stats = await deliverPendingInsights();
    const elapsed = Date.now() - startTime;

    if (stats.delivered > 0) {
      log.info('Insights delivered', { ...stats, elapsedMs: elapsed });
    }

    return res.json({ success: true, ...stats, elapsedMs: elapsed });
  } catch (err) {
    log.error('Insight delivery cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
