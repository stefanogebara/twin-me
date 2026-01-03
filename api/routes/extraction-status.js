/**
 * Extraction Status API Routes
 *
 * Endpoints for checking extraction job status and history.
 */

import express from 'express';
import extractionOrchestrator from '../services/extractionOrchestrator.js';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

/**
 * GET /api/extraction/status/:userId
 * Get extraction status for all platforms
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const status = await extractionOrchestrator.getExtractionStatus(userId);

    res.json(status);

  } catch (error) {
    console.error('[Extraction API] Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/extraction/jobs/:userId
 * Get extraction job history
 */
router.get('/jobs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, platform } = req.query;

    let query = supabaseAdmin
      .from('data_extraction_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(parseInt(limit));

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: jobs, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      jobs: jobs || [],
      count: jobs?.length || 0
    });

  } catch (error) {
    console.error('[Extraction API] Jobs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/extraction/trigger/:platform
 * Manually trigger extraction for a platform
 */
router.post('/trigger/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const result = await extractionOrchestrator.extractPlatform(userId, platform);

    res.json(result);

  } catch (error) {
    console.error('[Extraction API] Trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/extraction/trigger-all
 * Trigger extraction for all connected platforms
 */
router.post('/trigger-all', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const result = await extractionOrchestrator.extractAllPlatforms(userId);

    res.json(result);

  } catch (error) {
    console.error('[Extraction API] Trigger all error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/extraction/retry-failed
 * Retry failed extractions
 */
router.post('/retry-failed', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id;

    const result = await extractionOrchestrator.retryFailedExtractions(userId);

    res.json(result);

  } catch (error) {
    console.error('[Extraction API] Retry error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/extraction/features/:userId
 * Get behavioral features for a user
 */
router.get('/features/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { platform, limit = 50 } = req.query;

    let query = supabaseAdmin
      .from('behavioral_features')
      .select('*')
      .eq('user_id', userId)
      .order('extracted_at', { ascending: false })
      .limit(parseInt(limit));

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: features, error } = await query;

    if (error) throw error;

    // Group by platform for easier consumption
    const byPlatform = {};
    for (const feature of features || []) {
      if (!byPlatform[feature.platform]) {
        byPlatform[feature.platform] = [];
      }
      byPlatform[feature.platform].push(feature);
    }

    res.json({
      success: true,
      features: features || [],
      byPlatform,
      count: features?.length || 0
    });

  } catch (error) {
    console.error('[Extraction API] Features error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
