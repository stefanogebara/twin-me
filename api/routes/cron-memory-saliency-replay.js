/**
 * Vercel Cron Job: Memory Saliency Replay
 * =========================================
 * Runs daily at 4am UTC. Implements CL1-inspired sleep consolidation:
 * replays high-importance stale memories to prevent silent forgetting.
 *
 * Process:
 * - Finds memories with importance >= 7 not accessed in 14+ days
 * - Refreshes their last_accessed_at (restores recency in retrieval)
 * - Triggers reflection engine for fresh cross-temporal insights
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { runSaliencyReplay } from '../services/saliencyReplayService.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronSaliencyReplay');

const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    log.info('Starting daily pass');

    const stats = await runSaliencyReplay();

    // Nightly session reflection: trigger for any user who chatted today
    // but whose session hasn't been reflected yet (15-min gap detection
    // only fires when the NEXT message comes in — overnight gaps are missed)
    let reflectionsTriggered = 0;
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: chatUsers } = await supabaseAdmin
        .from('user_memories')
        .select('user_id')
        .eq('memory_type', 'conversation')
        .gte('created_at', todayStart.toISOString())
        .limit(50);

      const uniqueUsers = [...new Set((chatUsers || []).map(u => u.user_id))];
      for (const userId of uniqueUsers) {
        await inngest.send({ name: EVENTS.SESSION_ENDED, data: { userId } }).catch(() => {});
        reflectionsTriggered++;
      }
      if (reflectionsTriggered > 0) {
        log.info('Nightly session reflections triggered', { count: reflectionsTriggered });
      }
    } catch (err) {
      log.warn('Nightly reflection trigger failed (non-fatal)', { error: err.message });
    }

    const durationMs = Date.now() - startTime;
    log.info('Daily pass complete', { durationMs });

    await logCronExecution('memory-saliency-replay', 'success', durationMs, { ...stats, reflectionsTriggered });

    res.json({
      success: true,
      ...stats,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('memory-saliency-replay', 'error', durationMs, null, err.message);
    log.error('Unexpected error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
