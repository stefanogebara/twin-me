/**
 * Extraction Status API Routes
 *
 * Endpoints for checking extraction job status and history.
 * SECURITY FIX: All endpoints now require authentication
 */

import express from 'express';
import extractionOrchestrator from '../services/extractionOrchestrator.js';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/extraction/status
 * Get extraction status for authenticated user
 * SECURITY FIX: Removed :userId param, uses authenticated user
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

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

// Legacy route for backwards compatibility (still requires auth, validates ownership)
router.get('/status/:userId', authenticateUser, async (req, res) => {
  try {
    // SECURITY: Only allow accessing own data
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const status = await extractionOrchestrator.getExtractionStatus(req.user.id);
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
 * GET /api/extraction/jobs
 * Get extraction job history for authenticated user
 * SECURITY FIX: Removed :userId param, uses authenticated user
 */
router.get('/jobs', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
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

// Legacy route for backwards compatibility
router.get('/jobs/:userId', authenticateUser, async (req, res) => {
  try {
    // SECURITY: Only allow accessing own data
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { limit = 20, platform } = req.query;

    let query = supabaseAdmin
      .from('data_extraction_jobs')
      .select('*')
      .eq('user_id', req.user.id)
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
 * SECURITY FIX: Now requires authentication
 */
router.post('/trigger/:platform', authenticateUser, async (req, res) => {
  try {
    const { platform } = req.params;
    // SECURITY FIX: Always use authenticated user ID
    const userId = req.user.id;

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
 * SECURITY FIX: Now requires authentication
 */
router.post('/trigger-all', authenticateUser, async (req, res) => {
  try {
    // SECURITY FIX: Always use authenticated user ID
    const userId = req.user.id;

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
 * SECURITY FIX: Now requires authentication
 */
router.post('/retry-failed', authenticateUser, async (req, res) => {
  try {
    // SECURITY FIX: Always use authenticated user ID
    const userId = req.user.id;

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
 * GET /api/extraction/features
 * Get behavioral features for authenticated user
 * SECURITY FIX: Removed :userId param, uses authenticated user
 */
router.get('/features', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
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

// Legacy route for backwards compatibility
router.get('/features/:userId', authenticateUser, async (req, res) => {
  try {
    // SECURITY: Only allow accessing own data
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { platform, limit = 50 } = req.query;

    let query = supabaseAdmin
      .from('behavioral_features')
      .select('*')
      .eq('user_id', req.user.id)
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
