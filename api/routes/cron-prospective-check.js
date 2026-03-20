/**
 * Cron: Prospective Memory Check
 * ================================
 * Runs every 5 minutes to check for due time-triggered prospective memories.
 * When triggered, injects the memory as a high-priority proactive insight
 * that the twin will surface in the next conversation.
 *
 * Schedule: */5 * * * * (every 5 minutes)
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { checkTimeTriggered } from '../services/prospectiveMemoryService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronProspective');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    // Verify cron secret (timing-safe)
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const startTime = Date.now();
    const triggered = await checkTimeTriggered();

    const elapsed = Date.now() - startTime;
    log.info('Prospective memory check complete', {
      triggered: triggered.length,
      elapsedMs: elapsed
    });

    return res.json({
      success: true,
      triggered: triggered.length,
      memories: triggered.map(m => ({
        id: m.id,
        action: m.action?.slice(0, 80),
        triggerType: m.trigger_type
      })),
      elapsedMs: elapsed
    });
  } catch (err) {
    log.error('Prospective memory cron failed', { error: err.message });
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
