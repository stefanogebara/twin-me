/**
 * Twin Pipeline API Routes
 *
 * Endpoints for managing the digital twin formation pipeline.
 */

import express from 'express';
import twinPipelineOrchestrator from '../services/twinPipelineOrchestrator.js';
import twinFormationService from '../services/twinFormationService.js';
import twinEvolutionService from '../services/twinEvolutionService.js';
import personalityAggregator from '../services/personalityAggregator.js';

const router = express.Router();

/**
 * POST /api/twin/form
 * Trigger the full twin formation pipeline
 */
router.post('/form', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const options = {
      forceRefresh: req.body.forceRefresh || false
    };

    const result = await twinPipelineOrchestrator.runFullPipeline(userId, options);

    res.json(result);

  } catch (error) {
    console.error('[TwinPipeline API] Form error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/twin/status/:userId
 * Get current pipeline and twin status
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const status = await twinPipelineOrchestrator.getFullTwinStatus(userId);

    res.json(status);

  } catch (error) {
    console.error('[TwinPipeline API] Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/twin/profile/:userId
 * Get the complete twin profile
 */
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const twinResult = await twinFormationService.getTwin(userId);

    if (!twinResult.success) {
      return res.status(404).json({
        success: false,
        error: 'Twin not found',
        message: 'Run the formation pipeline first'
      });
    }

    // Get personality profile for additional data
    const profileResult = await personalityAggregator.getPersonalityProfile(userId);

    res.json({
      success: true,
      twin: twinResult.twin,
      personality: profileResult.success ? profileResult.profile : null
    });

  } catch (error) {
    console.error('[TwinPipeline API] Profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/twin/refresh/:platform
 * Refresh data from a single platform
 */
router.post('/refresh/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const result = await twinPipelineOrchestrator.runIncrementalUpdate(userId, platform);

    res.json(result);

  } catch (error) {
    console.error('[TwinPipeline API] Refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/twin/evolution/:userId
 * Get evolution history and timeline
 */
router.get('/evolution/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, timeRange } = req.query;

    const [historyResult, timelineResult, summaryResult] = await Promise.all([
      twinEvolutionService.getEvolutionHistory(userId, {
        limit: parseInt(limit),
        timeRange: timeRange ? parseInt(timeRange) : null
      }),
      twinEvolutionService.getScoreTimeline(userId, { limit: 30 }),
      twinEvolutionService.getEvolutionSummary(userId)
    ]);

    res.json({
      success: true,
      history: historyResult.events,
      timeline: timelineResult.timeline,
      trends: timelineResult.trends,
      summary: summaryResult.success ? summaryResult.summary : null
    });

  } catch (error) {
    console.error('[TwinPipeline API] Evolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/twin/personality/:userId
 * Get just the personality scores with confidence
 */
router.get('/personality/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await personalityAggregator.getPersonalityProfile(userId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error || 'Personality data not found'
      });
    }

    res.json({
      success: true,
      profile: result.profile
    });

  } catch (error) {
    console.error('[TwinPipeline API] Personality error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/twin/pipeline-status/:userId
 * Get real-time pipeline execution status
 */
router.get('/pipeline-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const status = twinPipelineOrchestrator.getPipelineStatus(userId);

    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('[TwinPipeline API] Pipeline status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
