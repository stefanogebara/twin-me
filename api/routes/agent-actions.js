/**
 * Agent Actions API Routes
 * =========================
 * Endpoints for logging, querying, and responding to twin agent actions.
 * Tracks all twin actions with outcomes for procedural memory generation.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { logAgentAction, recordActionResponse } from '../services/autonomyService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('AgentActionsRoutes');
const router = express.Router();

/**
 * GET /api/agent-actions
 * List recent agent actions for current user.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { limit = 20, status } = req.query;

    let query = supabaseAdmin
      .from('agent_actions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit) || 20, 100));

    if (status === 'pending') {
      query = query.is('user_response', null);
    } else if (status === 'resolved') {
      query = query.not('user_response', 'is', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({ success: true, actions: data || [] });
  } catch (err) {
    log.error('Failed to list agent actions', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch actions' });
  }
});

/**
 * POST /api/agent-actions/:actionId/respond
 * Record user response to an agent action (accepted/rejected/modified/ignored).
 */
router.post('/:actionId/respond', authenticateUser, async (req, res) => {
  try {
    const { actionId } = req.params;
    const { response, outcomeData } = req.body;

    if (!['accepted', 'rejected', 'modified', 'ignored'].includes(response)) {
      return res.status(400).json({
        success: false,
        error: 'response must be: accepted, rejected, modified, or ignored'
      });
    }

    // Verify the action belongs to this user
    const { data: action } = await supabaseAdmin
      .from('agent_actions')
      .select('id, user_id')
      .eq('id', actionId)
      .eq('user_id', req.user.id)
      .single();

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    await recordActionResponse(actionId, response, outcomeData);

    return res.json({ success: true, actionId, response });
  } catch (err) {
    log.error('Failed to record action response', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to record response' });
  }
});

/**
 * GET /api/agent-actions/stats
 * Get action acceptance stats (for procedural memory learning).
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .select('action_type, user_response, skill_name')
      .eq('user_id', req.user.id)
      .not('user_response', 'is', null);

    if (error) throw error;

    // Compute acceptance rates per action type
    const stats = {};
    for (const action of (data || [])) {
      const key = action.skill_name || action.action_type;
      if (!stats[key]) {
        stats[key] = { total: 0, accepted: 0, rejected: 0, modified: 0, ignored: 0 };
      }
      stats[key].total++;
      stats[key][action.user_response]++;
    }

    // Add acceptance rate
    for (const key of Object.keys(stats)) {
      stats[key].acceptanceRate = stats[key].total > 0
        ? Math.round((stats[key].accepted / stats[key].total) * 100)
        : 0;
    }

    return res.json({ success: true, stats });
  } catch (err) {
    log.error('Failed to get action stats', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
