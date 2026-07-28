/**
 * Cron: llm_usage_log table retention cleanup
 * ===========================================
 * Schedule: weekly, Sunday 05:30 UTC (30 5 * * 0)
 *
 * llm_usage_log is appended to on every LLM call by llmGateway.js (cost + token
 * attribution). The cost dashboards (admin-llm-costs.js, cost-dashboard.js) only
 * ever read a trailing window (~30d), so rows older than that are dead weight
 * that grows unbounded — at even a few thousand calls/day this is hundreds of
 * thousands of rows/year.
 *
 * Retention: 90 days. Generous margin past the ~30d dashboard window, leaving a
 * quarter of history for cost/incident review while bounding table growth.
 *
 * Security: protected by CRON_SECRET Bearer token (mirrors every other cron).
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';
import { logCronExecution } from '../services/cronLogger.js';

const log = createLogger('CronLlmUsageLogCleanup');
const router = express.Router();

const RETENTION_DAYS = 90;

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

    const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIso)
      .select('created_at', { count: 'exact' });

    if (error) {
      log.error('cleanup failed', { code: error.code, message: error.message });
      await logCronExecution('llm-usage-log-cleanup', 'error', Date.now() - startTime, null, error.message);
      return res.status(500).json({ success: false, error: 'cleanup failed' });
    }

    const deleted = Array.isArray(data) ? data.length : 0;
    const durationMs = Date.now() - startTime;
    log.info('cleanup complete', { deleted, retentionDays: RETENTION_DAYS, durationMs });
    await logCronExecution('llm-usage-log-cleanup', 'success', durationMs, { deleted, retentionDays: RETENTION_DAYS });
    return res.json({ success: true, deleted, retentionDays: RETENTION_DAYS, durationMs });
  } catch (err) {
    log.error('cleanup unhandled', { message: err.message });
    await logCronExecution('llm-usage-log-cleanup', 'error', Date.now() - startTime, null, err.message);
    return res.status(500).json({ success: false, error: 'cleanup failed' });
  }
});

export default router;
