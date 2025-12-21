/**
 * Privacy Controls API Routes
 *
 * Enhanced privacy control endpoints using the privacy service layer.
 * Provides granular cluster-based privacy management and data filtering.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import * as privacyService from '../services/privacyService.js';

const router = express.Router();

/**
 * GET /api/privacy-controls/profile/:userId
 * Get complete privacy profile with all cluster settings
 */
router.get('/profile/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify user can only access their own profile
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Access denied. You can only access your own privacy profile.'
      });
    }

    const result = await privacyService.getOrCreatePrivacyProfile(userId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get privacy profile',
        details: result.error
      });
    }

    res.json({
      success: true,
      profile: result.profile,
      clusterMapping: privacyService.PLATFORM_CLUSTER_MAPPING
    });
  } catch (error) {
    console.error('Error fetching privacy profile:', error);
    res.status(500).json({
      error: 'Failed to fetch privacy profile',
      details: error.message
    });
  }
});

/**
 * PUT /api/privacy-controls/global/:userId
 * Update global privacy level
 */
router.put('/global/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { globalLevel } = req.body;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate input
    if (globalLevel < 0 || globalLevel > 100) {
      return res.status(400).json({
        error: 'Global privacy level must be between 0 and 100'
      });
    }

    const result = await privacyService.updateGlobalPrivacyLevel(userId, globalLevel);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to update global privacy level',
        details: result.error
      });
    }

    res.json({
      success: true,
      profile: result.profile,
      message: `Global privacy level updated to ${globalLevel}%`
    });
  } catch (error) {
    console.error('Error updating global privacy level:', error);
    res.status(500).json({
      error: 'Failed to update global privacy level',
      details: error.message
    });
  }
});

/**
 * PUT /api/privacy-controls/cluster/:userId
 * Update specific cluster privacy level
 */
router.put('/cluster/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { clusterId, revelationLevel, enabled } = req.body;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate input
    if (!clusterId) {
      return res.status(400).json({ error: 'Cluster ID is required' });
    }

    if (revelationLevel < 0 || revelationLevel > 100) {
      return res.status(400).json({
        error: 'Revelation level must be between 0 and 100'
      });
    }

    const result = await privacyService.updateClusterPrivacy(
      userId,
      clusterId,
      revelationLevel,
      enabled !== undefined ? enabled : true
    );

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to update cluster privacy',
        details: result.error
      });
    }

    res.json({
      success: true,
      profile: result.profile,
      message: `Cluster ${clusterId} updated to ${revelationLevel}%`
    });
  } catch (error) {
    console.error('Error updating cluster privacy:', error);
    res.status(500).json({
      error: 'Failed to update cluster privacy',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-controls/cluster/batch/:userId
 * Batch update multiple clusters
 */
router.post('/cluster/batch/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { clusters } = req.body;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate input
    if (!Array.isArray(clusters) || clusters.length === 0) {
      return res.status(400).json({
        error: 'Clusters array is required and must not be empty'
      });
    }

    // Validate each cluster update
    for (const cluster of clusters) {
      if (!cluster.clusterId || cluster.revelationLevel < 0 || cluster.revelationLevel > 100) {
        return res.status(400).json({
          error: 'Invalid cluster data. Each cluster must have clusterId and revelationLevel (0-100)'
        });
      }
    }

    const result = await privacyService.batchUpdateClusters(userId, clusters);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to batch update clusters',
        details: result.error
      });
    }

    res.json({
      success: true,
      profile: result.profile,
      message: `${clusters.length} clusters updated successfully`
    });
  } catch (error) {
    console.error('Error batch updating clusters:', error);
    res.status(500).json({
      error: 'Failed to batch update clusters',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-controls/contexts/:userId
 * Get context-specific privacy settings (professional, social, dating, etc.)
 */
router.get('/contexts/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await privacyService.getOrCreatePrivacyProfile(userId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get context settings',
        details: result.error
      });
    }

    const contexts = result.profile.audience_specific_settings || {};

    res.json({
      success: true,
      contexts,
      availableContexts: [
        { id: 'social', name: 'Social', icon: 'Users', description: 'Friends and social connections' },
        { id: 'professional', name: 'Professional', icon: 'Briefcase', description: 'Work and career connections' },
        { id: 'dating', name: 'Dating', icon: 'Heart', description: 'Dating and romantic connections' },
        { id: 'public', name: 'Public', icon: 'Globe', description: 'Public profile and search results' },
        { id: 'family', name: 'Family', icon: 'Home', description: 'Family members' }
      ]
    });
  } catch (error) {
    console.error('Error fetching context settings:', error);
    res.status(500).json({
      error: 'Failed to fetch context settings',
      details: error.message
    });
  }
});

/**
 * PUT /api/privacy-controls/context/:userId
 * Update context-specific privacy overrides
 */
router.put('/context/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { contextName, clusterOverrides } = req.body;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate input
    if (!contextName || !clusterOverrides) {
      return res.status(400).json({
        error: 'Context name and cluster overrides are required'
      });
    }

    const result = await privacyService.updateContextPrivacy(
      userId,
      contextName,
      clusterOverrides
    );

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to update context privacy',
        details: result.error
      });
    }

    res.json({
      success: true,
      profile: result.profile,
      message: `Context "${contextName}" updated successfully`
    });
  } catch (error) {
    console.error('Error updating context privacy:', error);
    res.status(500).json({
      error: 'Failed to update context privacy',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-controls/reset/:userId
 * Reset privacy settings to defaults (all at 50%)
 */
router.post('/reset/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await privacyService.resetPrivacySettings(userId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to reset privacy settings',
        details: result.error
      });
    }

    res.json({
      success: true,
      profile: result.profile,
      message: 'Privacy settings reset to defaults (50% revelation)'
    });
  } catch (error) {
    console.error('Error resetting privacy settings:', error);
    res.status(500).json({
      error: 'Failed to reset privacy settings',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-controls/summary/:userId
 * Get privacy summary statistics
 */
router.get('/summary/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await privacyService.getPrivacyStats(userId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to get privacy summary',
        details: result.error
      });
    }

    res.json({
      success: true,
      stats: result.stats
    });
  } catch (error) {
    console.error('Error fetching privacy summary:', error);
    res.status(500).json({
      error: 'Failed to fetch privacy summary',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-controls/clusters
 * Get default life clusters configuration
 */
router.get('/clusters', authenticateUser, async (req, res) => {
  try {
    res.json({
      success: true,
      clusters: privacyService.DEFAULT_LIFE_CLUSTERS,
      platformMapping: privacyService.PLATFORM_CLUSTER_MAPPING,
      categories: {
        personal: {
          name: 'Personal Life',
          description: 'Entertainment, hobbies, social connections, and personal interests',
          color: '#8B5CF6'
        },
        professional: {
          name: 'Professional Life',
          description: 'Career, education, skills, and work achievements',
          color: '#3B82F6'
        },
        creative: {
          name: 'Creative Expression',
          description: 'Artistic pursuits, content creation, and creative outputs',
          color: '#EC4899'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching cluster configuration:', error);
    res.status(500).json({
      error: 'Failed to fetch cluster configuration',
      details: error.message
    });
  }
});

/**
 * POST /api/privacy-controls/check-revelation
 * Check if specific data should be revealed
 */
router.post('/check-revelation', authenticateUser, async (req, res) => {
  try {
    const { userId, clusterId, dataSensitivity, audienceId } = req.body;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const shouldReveal = await privacyService.shouldRevealData(
      userId,
      clusterId,
      dataSensitivity || 50,
      audienceId || 'social'
    );

    res.json({
      success: true,
      shouldReveal,
      clusterId,
      dataSensitivity,
      audienceId
    });
  } catch (error) {
    console.error('Error checking data revelation:', error);
    res.status(500).json({
      error: 'Failed to check data revelation',
      details: error.message
    });
  }
});

/**
 * GET /api/privacy-controls/effective-level
 * Get effective privacy level for a cluster considering audience
 */
router.get('/effective-level', authenticateUser, async (req, res) => {
  try {
    const { userId, clusterId, audienceId } = req.query;

    // Verify access
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!clusterId) {
      return res.status(400).json({ error: 'Cluster ID is required' });
    }

    const effectiveLevel = await privacyService.getEffectivePrivacyLevel(
      userId,
      clusterId,
      audienceId || 'social'
    );

    res.json({
      success: true,
      clusterId,
      audienceId: audienceId || 'social',
      effectivePrivacyLevel: effectiveLevel
    });
  } catch (error) {
    console.error('Error getting effective privacy level:', error);
    res.status(500).json({
      error: 'Failed to get effective privacy level',
      details: error.message
    });
  }
});

export default router;
