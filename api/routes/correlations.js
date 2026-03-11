/**
 * Correlation Engine API Routes
 *
 * Endpoints for cross-platform pattern detection and learning
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CorrelationsRoute');
import {
  analyzeCorrelations,
  getStoredCorrelations,
  getCorrelationStats
} from '../services/correlationEngine.js';

const router = express.Router();

/**
 * GET /api/correlations/stats - Get correlation analysis statistics
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await getCorrelationStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    log.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get correlation stats'
    });
  }
});

/**
 * GET /api/correlations - Get stored correlations
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, minConfidence = 0.5 } = req.query;

    const correlations = await getStoredCorrelations(userId, {
      limit: parseInt(limit),
      minConfidence: parseFloat(minConfidence)
    });

    res.json({
      success: true,
      count: correlations.length,
      correlations
    });
  } catch (error) {
    log.error('Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get correlations'
    });
  }
});

/**
 * POST /api/correlations/analyze - Run correlation analysis
 */
router.post('/analyze', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30, dryRun = false } = req.body;

    log.info(`Analysis requested for user ${userId}`);

    const result = await analyzeCorrelations(userId, { days, dryRun });

    res.json({
      success: result.success,
      message: result.success ? 'Analysis completed' : 'Analysis failed',
      correlations: result.correlations || [],
      summary: result.summary,
      error: result.error
    });
  } catch (error) {
    log.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run correlation analysis'
    });
  }
});

/**
 * POST /api/correlations/analyze-background - Run analysis in background
 */
router.post('/analyze-background', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.body;

    // Return immediately
    res.json({
      success: true,
      message: 'Correlation analysis started in background',
      note: 'Check /stats endpoint for progress'
    });

    // Run in background
    analyzeCorrelations(userId, { days })
      .then(result => {
        log.info(`Background analysis complete:`, result.summary);
      })
      .catch(err => {
        log.error(`Background analysis error:`, err);
      });

  } catch (error) {
    log.error('Background analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start analysis'
    });
  }
});

export default router;
