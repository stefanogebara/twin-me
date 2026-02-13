/**
 * Privacy Settings API Routes
 *
 * RESTful API endpoints for managing privacy settings, contextual twins, and cluster-based privacy controls.
 * Handles all privacy-related operations for the Soul Signature platform.
 */

import express from 'express';
const router = express.Router();

// Import privacy service functions
import * as privacyService from '../services/privacyService.js';

// Middleware to extract user ID from JWT token
const authMiddleware = (req, res, next) => {
  try {
    // Assuming JWT verification is done elsewhere and user ID is attached to req
    // This can be expanded based on your authentication setup
    const userId = req.user?.id || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - User ID not found',
      });
    }

    req.userId = userId;
    next();
  } catch (error) {
    console.error('[PrivacyRoutes] Auth middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }
};

// Apply auth middleware to all routes
router.use(authMiddleware);

// ================================
// PRIVACY SETTINGS ENDPOINTS
// ================================

/**
 * GET /api/privacy-settings
 * Get user's privacy settings
 */
router.get('/', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] GET /api/privacy-settings - User: ${req.userId}`);

    const result = await privacyService.getPrivacySettings(req.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching privacy settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PUT /api/privacy-settings
 * Update user's privacy settings
 */
router.put('/', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] PUT /api/privacy-settings - User: ${req.userId}`);

    const updates = req.body;

    // Validate updates
    if (updates.global_privacy !== undefined) {
      const level = parseInt(updates.global_privacy);
      if (isNaN(level) || level < 0 || level > 100) {
        return res.status(400).json({
          success: false,
          error: 'global_privacy must be between 0 and 100',
        });
      }
    }

    const result = await privacyService.updatePrivacySettings(req.userId, updates);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error updating privacy settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/privacy-settings/apply-template/:templateId
 * Apply a privacy template to user settings
 */
router.post('/apply-template/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    console.log(`[PrivacyRoutes] POST /api/privacy-settings/apply-template/${templateId}`);

    const result = await privacyService.applyPrivacyTemplate(req.userId, templateId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error applying template:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/privacy-settings/statistics
 * Get privacy statistics for the user
 */
router.get('/statistics', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] GET /api/privacy-settings/statistics - User: ${req.userId}`);

    const result = await privacyService.getPrivacyStatistics(req.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ================================
// CONTEXTUAL TWINS ENDPOINTS
// ================================

/**
 * GET /api/privacy-settings/twins
 * Get all contextual twins for the user
 */
router.get('/twins', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] GET /api/privacy-settings/twins - User: ${req.userId}`);

    const result = await privacyService.getContextualTwins(req.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching contextual twins:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/privacy-settings/twins/:twinId
 * Get a specific contextual twin
 */
router.get('/twins/:twinId', async (req, res) => {
  try {
    const { twinId } = req.params;
    console.log(`[PrivacyRoutes] GET /api/privacy-settings/twins/${twinId}`);

    const result = await privacyService.getContextualTwin(twinId, req.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching contextual twin:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/privacy-settings/twins
 * Create a new contextual twin
 */
router.post('/twins', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] POST /api/privacy-settings/twins - User: ${req.userId}`);

    const twinData = req.body;

    // Validate required fields
    if (!twinData.name || !twinData.twin_type) {
      return res.status(400).json({
        success: false,
        error: 'name and twin_type are required',
      });
    }

    // Validate twin_type
    const validTypes = ['professional', 'social', 'dating', 'public', 'custom'];
    if (!validTypes.includes(twinData.twin_type)) {
      return res.status(400).json({
        success: false,
        error: `twin_type must be one of: ${validTypes.join(', ')}`,
      });
    }

    const result = await privacyService.createContextualTwin(req.userId, twinData);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error creating contextual twin:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PUT /api/privacy-settings/twins/:twinId
 * Update a contextual twin
 */
router.put('/twins/:twinId', async (req, res) => {
  try {
    const { twinId } = req.params;
    console.log(`[PrivacyRoutes] PUT /api/privacy-settings/twins/${twinId}`);

    const updates = req.body;

    // Validate twin_type if provided
    if (updates.twin_type) {
      const validTypes = ['professional', 'social', 'dating', 'public', 'custom'];
      if (!validTypes.includes(updates.twin_type)) {
        return res.status(400).json({
          success: false,
          error: `twin_type must be one of: ${validTypes.join(', ')}`,
        });
      }
    }

    const result = await privacyService.updateContextualTwin(twinId, req.userId, updates);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error updating contextual twin:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/privacy-settings/twins/:twinId
 * Delete a contextual twin
 */
router.delete('/twins/:twinId', async (req, res) => {
  try {
    const { twinId } = req.params;
    console.log(`[PrivacyRoutes] DELETE /api/privacy-settings/twins/${twinId}`);

    const result = await privacyService.deleteContextualTwin(twinId, req.userId);

    if (result.success) {
      res.json({ success: true, message: 'Contextual twin deleted successfully' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error deleting contextual twin:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/privacy-settings/twins/:twinId/activate
 * Activate a contextual twin (apply its settings)
 */
router.post('/twins/:twinId/activate', async (req, res) => {
  try {
    const { twinId } = req.params;
    console.log(`[PrivacyRoutes] POST /api/privacy-settings/twins/${twinId}/activate`);

    const result = await privacyService.activateContextualTwin(twinId, req.userId);

    if (result.success) {
      res.json({ success: true, message: 'Contextual twin activated successfully' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error activating contextual twin:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/privacy-settings/twins/deactivate
 * Deactivate the current contextual twin
 */
router.post('/twins/deactivate', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] POST /api/privacy-settings/twins/deactivate`);

    const result = await privacyService.deactivateContextualTwin(req.userId);

    if (result.success) {
      res.json({ success: true, message: 'Contextual twin deactivated successfully' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error deactivating contextual twin:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ================================
// CLUSTER ENDPOINTS
// ================================

/**
 * GET /api/privacy-settings/clusters/definitions
 * Get all cluster definitions
 */
router.get('/clusters/definitions', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] GET /api/privacy-settings/clusters/definitions`);

    const result = await privacyService.getClusterDefinitions();

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching cluster definitions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/privacy-settings/clusters
 * Get user's cluster settings
 */
router.get('/clusters', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] GET /api/privacy-settings/clusters - User: ${req.userId}`);

    const result = await privacyService.getUserClusterSettings(req.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching user cluster settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PUT /api/privacy-settings/clusters/:clusterId/privacy
 * Update cluster privacy level
 */
router.put('/clusters/:clusterId/privacy', async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { privacyLevel } = req.body;

    console.log(`[PrivacyRoutes] PUT /api/privacy-settings/clusters/${clusterId}/privacy`);

    // Validate privacy level
    const level = parseInt(privacyLevel);
    if (isNaN(level) || level < 0 || level > 100) {
      return res.status(400).json({
        success: false,
        error: 'privacyLevel must be between 0 and 100',
      });
    }

    const result = await privacyService.updateClusterPrivacy(req.userId, clusterId, level);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error updating cluster privacy:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PUT /api/privacy-settings/clusters/:clusterId/toggle
 * Toggle cluster enabled/disabled
 */
router.put('/clusters/:clusterId/toggle', async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { enabled } = req.body;

    console.log(`[PrivacyRoutes] PUT /api/privacy-settings/clusters/${clusterId}/toggle`);

    // Validate enabled value
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean',
      });
    }

    const result = await privacyService.toggleCluster(req.userId, clusterId, enabled);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error toggling cluster:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ================================
// AUDIENCE PRESETS ENDPOINTS
// ================================

/**
 * GET /api/privacy-settings/presets
 * Get all audience presets (system and user-created)
 */
router.get('/presets', async (req, res) => {
  try {
    console.log(`[PrivacyRoutes] GET /api/privacy-settings/presets - User: ${req.userId}`);

    const result = await privacyService.getAudiencePresets(req.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching audience presets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/privacy-settings/presets/:presetKey/apply
 * Apply an audience preset
 */
router.post('/presets/:presetKey/apply', async (req, res) => {
  try {
    const { presetKey } = req.params;
    console.log(`[PrivacyRoutes] POST /api/privacy-settings/presets/${presetKey}/apply`);

    const result = await privacyService.applyAudiencePreset(req.userId, presetKey);

    if (result.success) {
      res.json({ success: true, message: 'Audience preset applied successfully', data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error applying audience preset:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ================================
// AUDIT LOG ENDPOINTS
// ================================

/**
 * GET /api/privacy-settings/audit-log
 * Get privacy audit log for the user
 */
router.get('/audit-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    console.log(`[PrivacyRoutes] GET /api/privacy-settings/audit-log - User: ${req.userId}`);

    const result = await privacyService.getPrivacyAuditLog(req.userId, limit, offset);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[PrivacyRoutes] Error fetching audit log:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ================================
// EXPORT ROUTER
// ================================

export default router;
