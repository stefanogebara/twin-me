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
  getGoalSummary,
} from '../services/goalTrackingService.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

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
    console.error('[Goals API] List error:', error.message);
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
    console.error('[Goals API] Suggestions error:', error.message);
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
    console.error('[Goals API] Summary error:', error.message);
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
    console.error('[Goals API] Get goal error:', error.message);
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
    console.error('[Goals API] Accept error:', error.message);
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
    console.error('[Goals API] Dismiss error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to dismiss goal' });
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
    console.error('[Goals API] Abandon error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to abandon goal' });
  }
});

export default router;
