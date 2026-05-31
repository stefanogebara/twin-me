/**
 * Cron: Outcome Learning
 * ======================
 * Schedule: daily at 03:30 UTC (30 3 * * *)
 *
 * For every gmail_draft proposal the user accepted between 7d ago and 24h
 * ago, check the resulting draft's Gmail labels:
 *   SENT  → strengthenProcedure (user actually sent it — strong positive)
 *   TRASH → weakenProcedure  (user deleted it — soft negative)
 *   404   → weakenProcedure  (draft gone — soft negative)
 *   DRAFT → no update        (user hasn't decided — neutral)
 *
 * Cost guardrails live in the service: per-user cap (20), total cap (200),
 * skip already-evaluated rows so re-runs are idempotent. Per-request Gmail
 * timeout 10s; missing tokens are silently skipped.
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { runOutcomeLearning } from '../services/outcomeLearningService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronOutcomeLearning');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const result = await runOutcomeLearning();
    const elapsed = Date.now() - startTime;

    await logCronExecution('outcome-learning', 'success', elapsed, result);
    log.info('Outcome learning cron completed', { ...result, elapsedMs: elapsed });

    return res.json({ success: true, ...result, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('outcome-learning', 'error', elapsed, null, err.message);
    log.error('Outcome learning cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
