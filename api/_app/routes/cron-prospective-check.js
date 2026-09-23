/**
 * Cron: Prospective Memory Check
 * ================================
 * Runs every 15 minutes to check for due time-triggered prospective memories.
 * When triggered, injects the memory as a high-priority proactive insight
 * that the twin will surface in the next conversation.
 *
 * Schedule: every 15 minutes in vercel.json
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { checkTimeTriggered } from '../services/prospectiveMemoryService.js';
import { deliverDueReminders } from '../services/reminderService.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronProspective');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    // Verify cron secret (timing-safe)
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    const triggered = await checkTimeTriggered();

    // Piggyback reminder delivery on this every-15-min cron (no new cron
    // invocations — Vercel cost rule). Reminders fire within 15 min of set time.
    const reminders = await deliverDueReminders().catch(err => {
      log.warn('reminder delivery failed (non-fatal)', { error: err.message });
      return { delivered: 0, scanned: 0 };
    });

    const elapsed = Date.now() - startTime;
    log.info('Prospective memory check complete', {
      triggered: triggered.length,
      remindersDelivered: reminders.delivered,
      elapsedMs: elapsed
    });

    await logCronExecution('prospective-check', 'success', elapsed, { triggered: triggered.length, reminders });

    return res.json({
      success: true,
      triggered: triggered.length,
      reminders,
      memories: triggered.map(m => ({
        id: m.id,
        action: m.action?.slice(0, 80),
        triggerType: m.trigger_type
      })),
      elapsedMs: elapsed
    });
  } catch (err) {
    log.error('Prospective memory cron failed', { error: err.message });
    await logCronExecution('prospective-check', 'error', Date.now() - startTime, null, err.message);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error'
    });
  }
});

export default router;
