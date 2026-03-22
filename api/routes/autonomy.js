/**
 * Autonomy Settings API Routes
 * ==============================
 * CRUD endpoints for per-user, per-skill autonomy level management.
 * Powers the Autonomy Spectrum settings UI.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import {
  getUserSkillSettings,
  setAutonomyLevel,
  logAgentAction,
  recordActionResponse,
  AUTONOMY_LABELS
} from '../services/autonomyService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('AutonomyRoutes');
const router = express.Router();

/**
 * GET /api/autonomy/settings
 * Get all skill settings with effective autonomy levels for current user.
 */
router.get('/settings', authenticateUser, async (req, res) => {
  try {
    const settings = await getUserSkillSettings(req.user.id);
    return res.json({
      success: true,
      settings,
      levels: AUTONOMY_LABELS
    });
  } catch (err) {
    log.error('Failed to get autonomy settings', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/autonomy/settings/:skillId
 * Set autonomy level for a specific skill.
 */
router.put('/settings/:skillId', authenticateUser, async (req, res) => {
  try {
    const { skillId } = req.params;
    const { autonomyLevel } = req.body;

    if (autonomyLevel == null || autonomyLevel < 0 || autonomyLevel > 4) {
      return res.status(400).json({ success: false, error: 'autonomyLevel must be 0-4' });
    }

    const result = await setAutonomyLevel(req.user.id, skillId, autonomyLevel);
    return res.json({
      success: true,
      setting: result,
      label: AUTONOMY_LABELS[autonomyLevel]
    });
  } catch (err) {
    log.error('Failed to set autonomy level', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to update setting' });
  }
});

export default router;
