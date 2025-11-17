/**
 * BEHAVIORAL PATTERNS API ENDPOINTS
 *
 * RESTful API for managing cross-platform behavioral pattern recognition.
 *
 * ENDPOINTS:
 * - POST   /api/behavioral-patterns/detect          - Detect patterns for user
 * - GET    /api/behavioral-patterns                 - Get all user patterns
 * - GET    /api/behavioral-patterns/:id             - Get specific pattern
 * - PUT    /api/behavioral-patterns/:id             - Update pattern
 * - DELETE /api/behavioral-patterns/:id             - Delete pattern
 * - POST   /api/behavioral-patterns/track           - Trigger manual tracking
 * - GET    /api/behavioral-patterns/tracking/status - Get tracking status
 * - GET    /api/behavioral-patterns/insights        - Get pattern insights
 * - POST   /api/behavioral-patterns/insights/:id/dismiss - Dismiss insight
 * - POST   /api/behavioral-patterns/insights/:id/rate    - Rate insight
 * - POST   /api/behavioral-patterns/:id/predict    - Predict next occurrence
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  detectAndStoreBehavioralPatterns,
  getUserPatterns,
  getHighConfidencePatterns,
  deletePattern,
  scorePatternConfidence
} from '../services/behavioralPatternRecognition.js';
import {
  trackUserPatterns,
  getPatternTrackingStatus,
  triggerManualTracking,
  predictNextPatternOccurrence
} from '../services/patternTracker.js';
import {
  generatePatternInsights,
  getUserInsights,
  dismissInsight,
  rateInsight,
  generateCrossPatternInsights
} from '../services/patternInsightGenerator.js';

const router = express.Router();

// ====================================================================
// PATTERN DETECTION
// ====================================================================

/**
 * POST /api/behavioral-patterns/detect
 * Detect and store behavioral patterns for the authenticated user
 *
 * Body:
 * - timeWindowDays (optional): Days of history to analyze (default: 30)
 * - minOccurrences (optional): Minimum pattern occurrences (default: 3)
 * - minConfidence (optional): Minimum confidence score (default: 50)
 */
router.post('/detect', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      timeWindowDays = 30,
      minOccurrences = 3,
      minConfidence = 50
    } = req.body;

    console.log(`🔍 [Behavioral Patterns API] Detecting patterns for user ${userId}`);

    const result = await detectAndStoreBehavioralPatterns(userId, {
      timeWindowDays,
      minOccurrences,
      minConfidence
    });

    res.json({
      success: true,
      message: `Detected ${result.patternsStored} patterns`,
      data: {
        patternsDetected: result.patternsDetected,
        patternsStored: result.patternsStored,
        patterns: result.patterns
      }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error detecting patterns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to detect patterns',
      error: error.message
    });
  }
});

// ====================================================================
// PATTERN RETRIEVAL
// ====================================================================

/**
 * GET /api/behavioral-patterns
 * Get all behavioral patterns for the authenticated user
 *
 * Query params:
 * - minConfidence (optional): Filter by minimum confidence score
 * - patternType (optional): Filter by pattern type
 * - platform (optional): Filter by response platform
 * - highConfidenceOnly (optional): Only patterns with confidence >= 70%
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      minConfidence,
      patternType,
      platform,
      highConfidenceOnly
    } = req.query;

    console.log(`📊 [Behavioral Patterns API] Getting patterns for user ${userId}`);

    let patterns;

    if (highConfidenceOnly === 'true') {
      patterns = await getHighConfidencePatterns(userId);
    } else {
      const filters = {};
      if (minConfidence) filters.minConfidence = parseFloat(minConfidence);
      if (patternType) filters.patternType = patternType;
      if (platform) filters.platform = platform;

      patterns = await getUserPatterns(userId, filters);
    }

    res.json({
      success: true,
      data: {
        patterns,
        count: patterns.length
      }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error getting patterns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patterns',
      error: error.message
    });
  }
});

/**
 * GET /api/behavioral-patterns/:id
 * Get a specific behavioral pattern
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const patternId = req.params.id;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: pattern, error } = await supabase
      .from('behavioral_patterns')
      .select('*, pattern_observations(*)')
      .eq('id', patternId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    if (!pattern) {
      return res.status(404).json({
        success: false,
        message: 'Pattern not found'
      });
    }

    res.json({
      success: true,
      data: { pattern }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error getting pattern:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pattern',
      error: error.message
    });
  }
});

// ====================================================================
// PATTERN MANAGEMENT
// ====================================================================

/**
 * PUT /api/behavioral-patterns/:id
 * Update a behavioral pattern
 *
 * Body:
 * - pattern_name (optional): New pattern name
 * - user_confirmed (optional): User confirmation
 * - user_notes (optional): User's notes about pattern
 * - is_active (optional): Active status
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const patternId = req.params.id;
    const updates = req.body;

    // Only allow certain fields to be updated
    const allowedUpdates = [
      'pattern_name',
      'pattern_description',
      'user_confirmed',
      'user_notes',
      'is_active'
    ];

    const filteredUpdates = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: pattern, error } = await supabase
      .from('behavioral_patterns')
      .update(filteredUpdates)
      .eq('id', patternId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Pattern updated successfully',
      data: { pattern }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error updating pattern:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update pattern',
      error: error.message
    });
  }
});

/**
 * DELETE /api/behavioral-patterns/:id
 * Delete a behavioral pattern
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const patternId = req.params.id;

    await deletePattern(userId, patternId);

    res.json({
      success: true,
      message: 'Pattern deleted successfully'
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error deleting pattern:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete pattern',
      error: error.message
    });
  }
});

// ====================================================================
// PATTERN TRACKING
// ====================================================================

/**
 * POST /api/behavioral-patterns/track
 * Manually trigger pattern tracking for the authenticated user
 */
router.post('/track', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`🔍 [Behavioral Patterns API] Manual tracking triggered for user ${userId}`);

    const result = await triggerManualTracking(userId);

    res.json({
      success: true,
      message: 'Pattern tracking completed',
      data: result
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error tracking patterns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track patterns',
      error: error.message
    });
  }
});

/**
 * GET /api/behavioral-patterns/tracking/status
 * Get pattern tracking status for the authenticated user
 */
router.get('/tracking/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const status = await getPatternTrackingStatus(userId);

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error getting tracking status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking status',
      error: error.message
    });
  }
});

/**
 * POST /api/behavioral-patterns/:id/predict
 * Predict next occurrence of a pattern
 */
router.post('/:id/predict', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const patternId = req.params.id;

    const prediction = await predictNextPatternOccurrence(userId, patternId);

    res.json({
      success: true,
      data: prediction
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error predicting pattern:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to predict pattern occurrence',
      error: error.message
    });
  }
});

// ====================================================================
// PATTERN INSIGHTS
// ====================================================================

/**
 * GET /api/behavioral-patterns/insights
 * Get pattern insights for the authenticated user
 *
 * Query params:
 * - minConfidence (optional): Minimum confidence score
 * - insightType (optional): Filter by insight type
 * - generate (optional): Generate new insights if true
 */
router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { minConfidence, insightType, generate } = req.query;

    // Generate new insights if requested
    if (generate === 'true') {
      await generatePatternInsights(userId);
    }

    const filters = {};
    if (minConfidence) filters.minConfidence = parseFloat(minConfidence);
    if (insightType) filters.insightType = insightType;

    const insights = await getUserInsights(userId, filters);

    res.json({
      success: true,
      data: {
        insights,
        count: insights.length
      }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error getting insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get insights',
      error: error.message
    });
  }
});

/**
 * POST /api/behavioral-patterns/insights/generate
 * Generate new pattern insights
 *
 * Body:
 * - includeCrossPatterns (optional): Include cross-pattern correlations
 */
router.post('/insights/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { includeCrossPatterns = false } = req.body;

    console.log(`🧠 [Behavioral Patterns API] Generating insights for user ${userId}`);

    const insights = await generatePatternInsights(userId);

    let crossPatternInsights = [];
    if (includeCrossPatterns) {
      crossPatternInsights = await generateCrossPatternInsights(userId);
    }

    res.json({
      success: true,
      message: `Generated ${insights.length + crossPatternInsights.length} insights`,
      data: {
        insights,
        crossPatternInsights,
        totalGenerated: insights.length + crossPatternInsights.length
      }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error generating insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate insights',
      error: error.message
    });
  }
});

/**
 * POST /api/behavioral-patterns/insights/:id/dismiss
 * Dismiss a pattern insight
 */
router.post('/insights/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const insightId = req.params.id;

    await dismissInsight(userId, insightId);

    res.json({
      success: true,
      message: 'Insight dismissed successfully'
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error dismissing insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss insight',
      error: error.message
    });
  }
});

/**
 * POST /api/behavioral-patterns/insights/:id/rate
 * Rate a pattern insight
 *
 * Body:
 * - rating: 1-5 stars
 * - feedback (optional): User feedback text
 */
router.post('/insights/:id/rate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const insightId = req.params.id;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    await rateInsight(userId, insightId, rating, feedback);

    res.json({
      success: true,
      message: 'Insight rated successfully'
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error rating insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate insight',
      error: error.message
    });
  }
});

// ====================================================================
// PATTERN STATISTICS
// ====================================================================

/**
 * GET /api/behavioral-patterns/stats
 * Get pattern statistics for the authenticated user
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get pattern counts by type
    const { data: patternsByType } = await supabase
      .from('behavioral_patterns')
      .select('pattern_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    // Get confidence distribution
    const { data: allPatterns } = await supabase
      .from('behavioral_patterns')
      .select('confidence_score, occurrence_count, consistency_rate')
      .eq('user_id', userId)
      .eq('is_active', true);

    // Get recent observations count
    const { count: recentObservations } = await supabase
      .from('pattern_observations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('observed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Calculate statistics
    const typeCounts = {};
    patternsByType?.forEach(p => {
      typeCounts[p.pattern_type] = (typeCounts[p.pattern_type] || 0) + 1;
    });

    const confidenceDistribution = {
      very_high: allPatterns?.filter(p => p.confidence_score >= 90).length || 0,
      high: allPatterns?.filter(p => p.confidence_score >= 70 && p.confidence_score < 90).length || 0,
      medium: allPatterns?.filter(p => p.confidence_score >= 50 && p.confidence_score < 70).length || 0,
      low: allPatterns?.filter(p => p.confidence_score < 50).length || 0
    };

    const avgConfidence = allPatterns?.length > 0
      ? allPatterns.reduce((sum, p) => sum + p.confidence_score, 0) / allPatterns.length
      : 0;

    res.json({
      success: true,
      data: {
        totalPatterns: allPatterns?.length || 0,
        patternsByType: typeCounts,
        confidenceDistribution,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        recentObservations: recentObservations || 0,
        lastWeekActivity: recentObservations || 0
      }
    });

  } catch (error) {
    console.error('❌ [Behavioral Patterns API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
});

export default router;
