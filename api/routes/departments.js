/**
 * Department API Routes — SoulOS Department Management
 * =====================================================
 * Endpoints for listing departments, managing autonomy levels,
 * viewing activity, and handling department proposals (approve/reject).
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { DEPARTMENT_NAMES } from '../config/departmentConfig.js';
import { createLogger } from '../services/logger.js';

// Lazy-loaded services to avoid circular dependencies
const getDepartmentService = () => import('../services/departmentService.js');
const getBudgetService = () => import('../services/departmentBudgetService.js');
const getAutonomyService = () => import('../services/autonomyService.js');

const log = createLogger('DepartmentRoutes');
const router = express.Router();

// ========================================================================
// Param validation helper
// ========================================================================

function validateDepartmentName(name) {
  return DEPARTMENT_NAMES.includes(name);
}

// ========================================================================
// GET /api/departments — List all departments with status
// ========================================================================

router.get('/', authenticateUser, async (req, res) => {
  try {
    const { getAllDepartments } = await getDepartmentService();
    const departments = await getAllDepartments(req.user.id);
    return res.json({ success: true, departments });
  } catch (err) {
    log.error('Failed to list departments', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch departments' });
  }
});

// ========================================================================
// GET /api/departments/proposals — All pending proposals across departments
// ========================================================================

router.get('/proposals', authenticateUser, async (req, res) => {
  try {
    const { getPendingProposals } = await getDepartmentService();
    const proposals = await getPendingProposals(req.user.id);
    return res.json({ success: true, proposals });
  } catch (err) {
    log.error('Failed to list proposals', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch proposals' });
  }
});

// ========================================================================
// GET /api/departments/budgets — All department budget summaries
// ========================================================================

router.get('/budgets', authenticateUser, async (req, res) => {
  try {
    const { getAllDepartmentBudgets } = await getBudgetService();
    const budgets = await getAllDepartmentBudgets(req.user.id);
    return res.json({ success: true, budgets });
  } catch (err) {
    log.error('Failed to list department budgets', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch budgets' });
  }
});

// ========================================================================
// POST /api/departments/proposals/:id/approve — Approve a proposal
// ========================================================================

router.post('/proposals/:id/approve', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { executeApprovedAction } = await getAutonomyService();
    const result = await executeApprovedAction(req.user.id, id);
    return res.json({ success: true, result });
  } catch (err) {
    log.error('Failed to approve proposal', { userId: req.user.id, proposalId: req.params.id, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Failed to approve proposal' });
  }
});

// ========================================================================
// POST /api/departments/proposals/:id/reject — Reject a proposal
// ========================================================================

router.post('/proposals/:id/reject', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { recordActionResponse } = await getAutonomyService();
    await recordActionResponse(id, 'rejected', { rejectedAt: new Date().toISOString() });
    return res.json({ success: true, actionId: id, response: 'rejected' });
  } catch (err) {
    log.error('Failed to reject proposal', { userId: req.user.id, proposalId: req.params.id, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Failed to reject proposal' });
  }
});

// ========================================================================
// POST /api/departments/heartbeat — Manual heartbeat trigger (bypasses cooldown)
// ========================================================================

router.post('/heartbeat', authenticateUser, async (req, res) => {
  try {
    const { checkDepartmentHeartbeats } = await getDepartmentService();
    const result = await checkDepartmentHeartbeats(req.user.id, { skipCooldown: true });
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Manual heartbeat failed', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================================
// GET /api/departments/:name — Single department detail
// ========================================================================

router.get('/:name', authenticateUser, async (req, res) => {
  try {
    const { name } = req.params;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    const { getDepartmentStatus } = await getDepartmentService();
    const department = await getDepartmentStatus(req.user.id, name);
    return res.json({ success: true, department });
  } catch (err) {
    log.error('Failed to get department detail', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch department' });
  }
});

// ========================================================================
// PUT /api/departments/:name/autonomy — Update department autonomy level
// ========================================================================

router.put('/:name/autonomy', authenticateUser, async (req, res) => {
  try {
    const { name } = req.params;
    const { autonomyLevel } = req.body;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    if (autonomyLevel == null || autonomyLevel < 0 || autonomyLevel > 4) {
      return res.status(400).json({ success: false, error: 'autonomyLevel must be 0-4' });
    }

    // Step-up auth: autonomy level 3+ requires fresh JWT (< 5 min old)
    if (autonomyLevel >= 3 && req.user.iat) {
      const tokenAge = Date.now() - (req.user.iat * 1000);
      if (tokenAge > 5 * 60 * 1000) {
        return res.status(403).json({
          success: false,
          error: 'reauth_required',
          message: 'Enabling autonomous mode requires recent authentication. Please sign in again.',
        });
      }
    }

    // Scope escalation: Communications at autonomy 2+ needs Gmail write scopes
    if (name === 'communications' && autonomyLevel >= 2) {
      const { checkUserHasWriteScopes } = await import('../services/scopeEscalationService.js');
      const hasScopes = await checkUserHasWriteScopes(req.user.id, 'communications');
      if (!hasScopes) {
        const { updateDepartmentAutonomy: updateAuto } = await getDepartmentService();
        const result = await updateAuto(req.user.id, name, autonomyLevel);
        return res.json({
          success: true,
          ...result,
          scopeUpgradeRequired: true,
          message: 'Gmail write access needed to enable email actions. Please reconnect Gmail with expanded permissions.',
          reconnectUrl: '/settings?reconnect=gmail&scopes=write',
        });
      }
    }

    // Scope escalation: Scheduling at autonomy 2+ needs Calendar write scopes
    if (name === 'scheduling' && autonomyLevel >= 2) {
      const { checkUserHasWriteScopes } = await import('../services/scopeEscalationService.js');
      const hasScopes = await checkUserHasWriteScopes(req.user.id, 'scheduling');
      if (!hasScopes) {
        const { updateDepartmentAutonomy: updateAuto } = await getDepartmentService();
        const result = await updateAuto(req.user.id, name, autonomyLevel);
        return res.json({
          success: true,
          ...result,
          scopeUpgradeRequired: true,
          message: 'Calendar write access needed to enable scheduling actions. Please reconnect Google Calendar with expanded permissions.',
          reconnectUrl: '/settings?reconnect=calendar&scopes=write',
        });
      }
    }

    const { updateDepartmentAutonomy } = await getDepartmentService();
    const result = await updateDepartmentAutonomy(req.user.id, name, autonomyLevel);
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Failed to update department autonomy', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to update autonomy level' });
  }
});

// ========================================================================
// GET /api/departments/:name/activity — Recent department actions
// ========================================================================

router.get('/:name/activity', authenticateUser, async (req, res) => {
  try {
    const { name } = req.params;
    const { limit = 20 } = req.query;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    const { getDepartmentActivity } = await getDepartmentService();
    const activity = await getDepartmentActivity(req.user.id, name, Math.min(parseInt(limit) || 20, 100));
    return res.json({ success: true, activity });
  } catch (err) {
    log.error('Failed to get department activity', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch activity' });
  }
});

// ========================================================================
// POST /api/departments/:name/propose — Manually trigger a department proposal (testing)
// ========================================================================

router.post('/:name/propose', authenticateUser, async (req, res) => {
  try {
    const { name } = req.params;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    const { proposeDepartmentAction } = await getDepartmentService();
    const { toolName, params, context } = req.body || {};
    const proposal = await proposeDepartmentAction(req.user.id, name, { toolName, params, context, priority: 5 });
    return res.json({ success: true, proposal });
  } catch (err) {
    log.error('Failed to trigger department proposal', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Failed to generate proposal' });
  }
});

export default router;
