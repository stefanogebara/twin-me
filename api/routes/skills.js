/**
 * Skills API Routes
 * ==================
 * List and manage available twin skills.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getAvailableSkills, executeSkill, loadSkill } from '../services/skillEngine.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('SkillsRoutes');
const router = express.Router();

/**
 * GET /api/skills
 * List all skills available to the current user.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const skills = await getAvailableSkills(req.user.id);
    return res.json({ success: true, skills });
  } catch (err) {
    log.error('Failed to list skills', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch skills' });
  }
});

/**
 * GET /api/skills/:skillId
 * Get a single skill definition.
 */
router.get('/:skillId', authenticateUser, async (req, res) => {
  try {
    const skill = await loadSkill(req.params.skillId);
    if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
    return res.json({ success: true, skill });
  } catch (err) {
    log.error('Failed to get skill', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch skill' });
  }
});

/**
 * POST /api/skills/:skillId/execute
 * Manually trigger a skill execution.
 */
router.post('/:skillId/execute', authenticateUser, async (req, res) => {
  try {
    const result = await executeSkill(req.user.id, req.params.skillId, req.body.context || {});
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Skill execution failed', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Skill execution failed' });
  }
});

export default router;
