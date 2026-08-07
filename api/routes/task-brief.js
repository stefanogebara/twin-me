/**
 * Task Brief API
 * ==============
 * POST /api/task-brief — compile a handoff brief for an execution agent
 *
 * Thin by design: auth guard, validation, service delegation, error mapping.
 * All compilation logic lives in api/services/taskBriefService.js. LLM-backed,
 * so rate-limited via aiLimiter in server.js.
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { compileTaskBrief } from '../services/taskBriefService.js';

const router = Router();

router.use(authenticateUser);

router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { task } = req.body || {};
    if (!task || typeof task !== 'string' || task.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'task is required (min 3 characters)' });
    }
    if (task.length > 2000) {
      return res.status(400).json({ success: false, error: 'task too long (max 2000 characters)' });
    }

    const data = await compileTaskBrief(userId, task.trim());
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

export default router;
