/**
 * Soul Matching API Routes
 * Endpoints for finding compatible soul signatures
 */

import express from 'express';
import soulMatchingService from '../services/soulMatchingService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Find soul signature matches for the authenticated user
 * GET /api/soul-matching/find-matches
 */
router.get('/find-matches', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      limit = 20,
      minCompatibility = 50,
      includeOpposites = false,
      privacyLevel = 'medium'
    } = req.query;

    console.log(`[API] Finding soul matches for user ${userId}`);

    const result = await soulMatchingService.findMatches(userId, {
      limit: parseInt(limit),
      minCompatibility: parseFloat(minCompatibility),
      includeOpposites: includeOpposites === 'true',
      privacyLevel
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[API] Soul matching error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to find soul matches'
    });
  }
});

/**
 * Calculate compatibility with a specific user
 * POST /api/soul-matching/calculate-compatibility
 */
router.post('/calculate-compatibility', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { targetUserId, includeOpposites = false } = req.body;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'Target user ID is required'
      });
    }

    console.log(`[API] Calculating compatibility between ${userId} and ${targetUserId}`);

    // Get both soul signatures
    const userSignature = await soulMatchingService.getSoulSignature(userId);
    const targetSignature = await soulMatchingService.getSoulSignature(targetUserId);

    if (!userSignature || !targetSignature) {
      return res.status(404).json({
        success: false,
        error: 'Soul signature not found for one or both users'
      });
    }

    // Calculate compatibility
    const compatibility = await soulMatchingService.calculateCompatibility(
      userSignature,
      targetSignature,
      { includeOpposites }
    );

    res.json({
      success: true,
      compatibility: {
        userId: targetUserId,
        userName: targetSignature.userName,
        avatar: targetSignature.avatar,
        score: compatibility.totalScore,
        breakdown: compatibility.breakdown,
        sharedInterests: compatibility.sharedInterests,
        matchReason: compatibility.matchReason
      }
    });

  } catch (error) {
    console.error('[API] Compatibility calculation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate compatibility'
    });
  }
});

/**
 * Get match statistics for the user
 * GET /api/soul-matching/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's soul signature to check completeness
    const userSignature = await soulMatchingService.getSoulSignature(userId);

    if (!userSignature) {
      return res.json({
        success: true,
        stats: {
          hasProfile: false,
          canMatch: false,
          message: 'Create your soul signature to start finding matches'
        }
      });
    }

    // Get all candidates to calculate potential matches
    const candidates = await soulMatchingService.getCandidateSignatures(userId, 'medium');

    res.json({
      success: true,
      stats: {
        hasProfile: true,
        canMatch: true,
        totalUsers: candidates.length,
        profileCompleteness: calculateProfileCompleteness(userSignature)
      }
    });

  } catch (error) {
    console.error('[API] Match stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get match statistics'
    });
  }
});

/**
 * Update matching preferences (privacy settings)
 * PUT /api/soul-matching/preferences
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      allowSoulMatching = true,
      minCompatibility = 50,
      includeOpposites = false,
      visibleToOthers = true
    } = req.body;

    // Update digital twin privacy settings
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('digital_twins')
      .update({
        privacy_settings: {
          allowSoulMatching,
          minCompatibility,
          includeOpposites,
          visibleToOthers
        },
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('type', 'personal')
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update matching preferences');
    }

    res.json({
      success: true,
      preferences: data.privacy_settings,
      message: 'Matching preferences updated successfully'
    });

  } catch (error) {
    console.error('[API] Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update matching preferences'
    });
  }
});

/**
 * Helper: Calculate profile completeness percentage
 */
function calculateProfileCompleteness(signature) {
  let completeness = 0;
  let totalFields = 5;

  if (signature.personalityTraits && Object.keys(signature.personalityTraits).length > 0) {
    completeness += 20;
  }

  if (signature.interests && signature.interests.length > 0) {
    completeness += 20;
  }

  if (signature.communicationStyle && Object.keys(signature.communicationStyle).length > 0) {
    completeness += 20;
  }

  if (signature.values && signature.values.length > 0) {
    completeness += 20;
  }

  if (signature.userName && signature.userName !== 'Anonymous') {
    completeness += 20;
  }

  return completeness;
}

export default router;
