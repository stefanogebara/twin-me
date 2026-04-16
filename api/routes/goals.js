/**
 * Goals API Routes
 * ================
 * Endpoints for the twin-driven goal tracking system.
 * All endpoints require JWT authentication.
 *
 * GET  /api/goals              - List goals (filter by status)
 * GET  /api/goals/suggestions  - Pending suggestions
 * GET  /api/goals/summary      - Dashboard summary
 * GET  /api/goals/:id          - Goal with progress log
 * POST /api/goals/:id/accept   - Accept a suggested goal
 * POST /api/goals/:id/dismiss  - Dismiss a suggestion
 * POST /api/goals/:id/abandon  - Abandon an active goal
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import {
  getUserGoals,
  getGoalWithProgress,
  acceptGoal,
  abandonGoal,
  dismissGoal,
  createManualGoal,
  completeGoal,
  getGoalSummary,
} from '../services/goalTrackingService.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Goals');

const router = express.Router();

/**
 * GET /api/goals - List goals with optional status filter
 * Query params: ?status=active (or suggested, completed, abandoned)
 */
const VALID_GOAL_STATUSES = new Set(['suggested', 'active', 'completed', 'abandoned']);

router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    const { page, limit, offset } = parsePagination(req);

    if (status && !VALID_GOAL_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status filter' });
    }

    const { data: goals, total } = await getUserGoals(userId, status || null, { limit, offset });

    res.json({
      success: true,
      data: goals,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (error) {
    log.error('List error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch goals' });
  }
});

/**
 * GET /api/goals/suggestions - Get pending goal suggestions
 */
router.get('/suggestions', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const suggestions = await getUserGoals(userId, 'suggested');

    res.json({ success: true, data: suggestions });
  } catch (error) {
    log.error('Suggestions error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch suggestions' });
  }
});

/**
 * GET /api/goals/summary - Dashboard summary (counts, best streak)
 */
router.get('/summary', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await getGoalSummary(userId);

    res.json({ success: true, data: summary });
  } catch (error) {
    log.error('Summary error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch goal summary' });
  }
});

/**
 * GET /api/goals/:id - Goal with progress log
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const goal = await getGoalWithProgress(id, userId);

    if (!goal) {
      return res.status(404).json({ success: false, error: 'Goal not found' });
    }

    res.json({ success: true, data: goal });
  } catch (error) {
    log.error('Get goal error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch goal' });
  }
});

/**
 * POST /api/goals/:id/accept - Accept a suggested goal
 */
router.post('/:id/accept', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const result = await acceptGoal(id, userId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    log.error('Accept error', { error });
    res.status(500).json({ success: false, error: 'Failed to accept goal' });
  }
});

/**
 * POST /api/goals/:id/dismiss - Dismiss a suggested goal
 */
router.post('/:id/dismiss', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const result = await dismissGoal(id, userId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    log.error('Dismiss error', { error });
    res.status(500).json({ success: false, error: 'Failed to dismiss goal' });
  }
});

/**
 * POST /api/goals - Create a manual goal (immediately active)
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const result = await createManualGoal(userId, title.trim(), description?.trim() || null);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    log.error('Create goal error', { error });
    res.status(500).json({ success: false, error: 'Failed to create goal' });
  }
});

/**
 * POST /api/goals/:id/complete - Mark an active goal as completed
 */
router.post('/:id/complete', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const result = await completeGoal(id, userId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    log.error('Complete goal error', { error });
    res.status(500).json({ success: false, error: 'Failed to complete goal' });
  }
});

/**
 * POST /api/goals/:id/abandon - Abandon an active goal
 */
router.post('/:id/abandon', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const result = await abandonGoal(id, userId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    log.error('Abandon error', { error });
    res.status(500).json({ success: false, error: 'Failed to abandon goal' });
  }
});

export default router;
