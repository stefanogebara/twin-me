/**
 * Mem0 → Brain Sync API Routes
 *
 * Endpoints to sync memories to the knowledge graph
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { syncMem0ToBrain, getSyncStatus } from '../services/mem0BrainSync.js';

const router = express.Router();

/**
 * GET /api/mem0-sync/status - Get sync status
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await getSyncStatus(userId);

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('[Mem0Sync API] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status'
    });
  }
});

/**
 * POST /api/mem0-sync/sync - Trigger sync
 */
router.post('/sync', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, dryRun = false } = req.body;

    console.log(`[Mem0Sync API] Sync requested for user ${userId}`);

    const result = await syncMem0ToBrain(userId, { limit, dryRun });

    res.json({
      success: result.success,
      message: result.success ? 'Sync completed' : 'Sync failed',
      results: result.results,
      error: result.error
    });
  } catch (error) {
    console.error('[Mem0Sync API] Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync memories to brain'
    });
  }
});

/**
 * POST /api/mem0-sync/sync-all - Sync all unsynced (background job)
 */
router.post('/sync-all', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Return immediately, run in background
    res.json({
      success: true,
      message: 'Sync started in background',
      note: 'Check /status endpoint for progress'
    });

    // Run sync in background (not awaited)
    syncMem0ToBrain(userId, { limit: 100 })
      .then(result => {
        console.log(`[Mem0Sync API] Background sync complete:`, result.results);
      })
      .catch(err => {
        console.error(`[Mem0Sync API] Background sync error:`, err);
      });

  } catch (error) {
    console.error('[Mem0Sync API] Sync-all error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start sync'
    });
  }
});

export default router;
