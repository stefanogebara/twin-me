/**
 * Cron: Nango Orphan Cleanup
 * ===========================
 * Schedule: weekly, Sunday 05:00 UTC (0 5 * * 0)
 *
 * Deletes orphaned Nango connections for RETIRED platforms across all users.
 * Retired platforms are removed from PLATFORM_CONFIGS, so their connections
 * can't be freed through the normal delete path and accumulate against the
 * GLOBAL Nango connection cap — eventually blocking every new connection and
 * reconnect account-wide (`resource_capped`). This reconciles them.
 *
 * Low frequency by design (retiring a platform is a rare code change); the
 * Editor of this codebase should keep RETIRED_PLATFORMS in sync when cutting
 * a platform. Idempotent: a run with nothing to clean is a cheap no-op.
 *
 * Security: protected by CRON_SECRET Bearer token.
 */
import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { cleanupOrphanedNangoConnections } from '../services/nangoOrphanCleanup.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronNangoOrphanCleanup');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const summary = await cleanupOrphanedNangoConnections();
    const elapsed = Date.now() - startTime;

    if (summary.error) {
      await logCronExecution('nango-orphan-cleanup', 'error', elapsed, null, summary.error);
      return res.status(500).json({ success: false, error: summary.error });
    }

    log.info('Nango orphan cleanup complete', { ...summary, elapsedMs: elapsed });
    await logCronExecution('nango-orphan-cleanup', 'success', elapsed, summary);
    return res.json({ success: true, ...summary, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('nango-orphan-cleanup', 'error', elapsed, null, err.message);
    log.error('Nango orphan cleanup cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
