/**
 * Queue Dashboard Routes - Bull Board Web UI
 * Provides web-based monitoring and management for background jobs
 */

import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { getQueues, getQueueStats, areQueuesAvailable } from '../services/queueService.js';

const router = express.Router();

// Create Bull Board server adapter
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/queues/dashboard');

/**
 * Initialize Bull Board
 * Only initialize if queues are available (Redis configured)
 */
function initializeBullBoard() {
  const { extractionQueue, soulSignatureQueue } = getQueues();

  if (!extractionQueue || !soulSignatureQueue) {
    console.warn('⚠️ Bull Board not initialized - queues not available');
    return null;
  }

  try {
    createBullBoard({
      queues: [
        new BullAdapter(extractionQueue),
        new BullAdapter(soulSignatureQueue),
      ],
      serverAdapter,
    });

    console.log('✅ Bull Board initialized at /api/queues/dashboard');
    return serverAdapter;
  } catch (error) {
    console.error('❌ Failed to initialize Bull Board:', error);
    return null;
  }
}

// Initialize Bull Board (will be null if Redis not configured)
const bullBoard = initializeBullBoard();

/**
 * Bull Board UI routes
 * Accessible at /api/queues/dashboard
 */
if (bullBoard) {
  router.use('/dashboard', serverAdapter.getRouter());
} else {
  // Fallback route if Bull Board not available
  router.get('/dashboard', (req, res) => {
    res.status(503).json({
      success: false,
      error: 'Queue dashboard not available',
      message: 'Redis is not configured. Background jobs run synchronously.',
    });
  });
}

/**
 * GET /api/queues/stats
 * Get queue statistics (JSON API alternative to Bull Board UI)
 */
router.get('/stats', async (req, res) => {
  try {
    if (!areQueuesAvailable()) {
      return res.json({
        success: true,
        available: false,
        message: 'Queues not initialized - Redis not configured',
      });
    }

    const stats = await getQueueStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue stats',
    });
  }
});

/**
 * GET /api/queues/health
 * Health check for queue system
 */
router.get('/health', async (req, res) => {
  try {
    const available = areQueuesAvailable();

    res.json({
      success: true,
      data: {
        available,
        queues: available ? ['extraction', 'soul-signature'] : [],
        message: available
          ? 'Queues operational'
          : 'Queues not initialized - jobs run synchronously',
      },
    });
  } catch (error) {
    console.error('Error checking queue health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check queue health',
    });
  }
});

export default router;
