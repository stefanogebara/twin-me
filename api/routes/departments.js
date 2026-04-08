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
    const { listDepartments } = await getDepartmentService();
    const departments = await listDepartments(req.user.id);
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
    const { rejectProposal } = await getDepartmentService();
    const result = await rejectProposal(req.user.id, id);
    return res.json({ success: true, result });
  } catch (err) {
    log.error('Failed to reject proposal', { userId: req.user.id, proposalId: req.params.id, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Failed to reject proposal' });
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

    const { getDepartmentDetail } = await getDepartmentService();
    const department = await getDepartmentDetail(req.user.id, name);
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

    const { setDepartmentAutonomy } = await getDepartmentService();
    const result = await setDepartmentAutonomy(req.user.id, name, autonomyLevel);
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

    const { triggerDepartmentProposal } = await getDepartmentService();
    const proposal = await triggerDepartmentProposal(req.user.id, name);
    return res.json({ success: true, proposal });
  } catch (err) {
    log.error('Failed to trigger department proposal', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Failed to generate proposal' });
  }
});

export default router;
