/**
 * Cron: Nudge Inactive Users
 * ===========================
 * Sends platform connection nudge emails to users who signed up
 * but never connected platforms or chatted with their twin.
 *
 * Schedule: 0 14 * * * (daily at 14:00 UTC / 11:00 São Paulo)
 * Security: protected by CRON_SECRET Bearer token.
 *
 * Rules:
 * - Only users signed up > 24h ago
 * - 0 platform connections AND 0 conversations
 * - Not already nudged (platform_nudge_sent_at IS NULL)
 * - Not unsubscribed from emails
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { sendNudgeEmails } from '../services/nudgeService.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronNudgeInactive');
const router = express.Router();

router.post('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const result = await sendNudgeEmails();
    const elapsed = Date.now() - startTime;

    log.info('Nudge cron complete', { ...result, elapsedMs: elapsed });
    await logCronExecution('nudge-inactive', 'success', elapsed, result);

    return res.json({ success: true, ...result, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('nudge-inactive', 'error', elapsed, null, err.message);
    log.error('Nudge cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
