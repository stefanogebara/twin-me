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

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    console.log('[Cron] memory-saliency-replay: starting daily pass');
    const startTime = Date.now();

    const stats = await runSaliencyReplay();

    const durationMs = Date.now() - startTime;
    console.log(`[Cron] memory-saliency-replay: done in ${durationMs}ms`);

    res.json({
      success: true,
      ...stats,
      durationMs,
    });
  } catch (err) {
    console.error('[Cron] memory-saliency-replay: unexpected error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
