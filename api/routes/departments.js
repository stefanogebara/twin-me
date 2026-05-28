/**
 * Department API Routes — SoulOS Department Management
 * =====================================================
 * Endpoints for listing departments, managing autonomy levels,
 * viewing activity, and handling department proposals (approve/reject).
 */

import express from 'express';
import { authenticateUser, userRateLimit } from '../middleware/auth.js';
import { DEPARTMENT_NAMES } from '../config/departmentConfig.js';
import { createLogger } from '../services/logger.js';

// Lazy-loaded services to avoid circular dependencies
const getDepartmentService = () => import('../services/departmentService.js');
const getBudgetService = () => import('../services/departmentBudgetService.js');
const getAutonomyService = () => import('../services/autonomyService.js');

const log = createLogger('DepartmentRoutes');
const router = express.Router();

// Rate limiters — protect mutating + expensive endpoints from abuse.
// approvalLimiter: approve/reject — generous, user-driven UI clicks
// proposeLimiter: TalkToTwin DEPT_SUGGEST inline cards — tight cap
// autonomyLimiter: autonomy/toggle — generous
const approvalLimiter = userRateLimit(60, 60 * 1000);
const proposeLimiter = userRateLimit(10, 60 * 1000);
const autonomyLimiter = userRateLimit(30, 60 * 1000);

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
// GET /api/departments/health/correlations — Whoop + Calendar cross-correlation
// ========================================================================

router.get('/health/correlations', authenticateUser, async (req, res) => {
  try {
    const { analyzeHealthPatterns } = await import('../services/departmentExecutors/healthCorrelationAnalyzer.js');
    const result = await analyzeHealthPatterns(req.user.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Health correlation analysis failed', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Health correlation analysis failed' });
  }
});

// ========================================================================
// POST /api/departments/proposals/:id/approve — Approve a proposal
// ========================================================================

router.post('/proposals/:id/approve', authenticateUser, approvalLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { executeApprovedAction } = await getAutonomyService();
    const result = await executeApprovedAction(req.user.id, id);
    return res.json({ success: true, result });
  } catch (err) {
    log.error('Failed to approve proposal', { userId: req.user.id, proposalId: req.params.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to approve proposal' });
  }
});

// ========================================================================
// POST /api/departments/proposals/:id/reject — Reject a proposal
// ========================================================================

router.post('/proposals/:id/reject', authenticateUser, approvalLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { recordActionResponse } = await getAutonomyService();
    // C1 fix: pass userId so recordActionResponse can verify ownership before
    // writing user_response or poisoning procedural memory via weakenProcedure.
    await recordActionResponse(req.user.id, id, 'rejected', { rejectedAt: new Date().toISOString() });
    return res.json({ success: true, actionId: id, response: 'rejected' });
  } catch (err) {
    log.error('Failed to reject proposal', { userId: req.user.id, proposalId: req.params.id, error: err.message });
    if (err.message === 'Action not found or not owned by caller') {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }
    return res.status(500).json({ success: false, error: 'Failed to reject proposal' });
  }
});

// ========================================================================
// PUT /api/departments/:name/toggle — Enable or disable a department
// ========================================================================

router.put('/:name/toggle', authenticateUser, autonomyLimiter, async (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
    }

    // Toggle = set autonomy to 1 (SUGGEST) if enabling, 0 (OBSERVE) if disabling
    const { updateDepartmentAutonomy } = await getDepartmentService();
    const level = enabled ? 1 : 0;
    const result = await updateDepartmentAutonomy(req.user.id, name, level);
    return res.json({ success: true, department: name, enabled, autonomyLevel: level, ...result });
  } catch (err) {
    log.error('Failed to toggle department', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to toggle department' });
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

router.put('/:name/autonomy', authenticateUser, autonomyLimiter, async (req, res) => {
  try {
    const { name } = req.params;
    const { autonomyLevel } = req.body;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    // M2 fix: validate autonomyLevel is an integer 0-4. Previously type-coerced
    // values like "3" or 3.9 slipped past `< 0 || > 4`.
    if (!Number.isInteger(autonomyLevel) || autonomyLevel < 0 || autonomyLevel > 4) {
      return res.status(400).json({ success: false, error: 'autonomyLevel must be an integer 0-4' });
    }

    // Step-up auth: autonomy level 3+ requires fresh JWT (< 5 min old).
    // M1 fix: fail closed if iat is absent — never silently skip the freshness
    // check just because the token shape is missing a claim.
    if (autonomyLevel >= 3) {
      if (!req.user.iat) {
        log.warn('Step-up auth blocked: missing iat claim', { userId: req.user.id });
        return res.status(403).json({
          success: false,
          error: 'reauth_required',
          message: 'Enabling autonomous mode requires recent authentication. Please sign in again.',
        });
      }
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
// POST /api/departments/:name/propose — Queue a department action
// (TalkToTwin DEPT_SUGGEST inline approval cards)
// ========================================================================

router.post('/:name/propose', authenticateUser, proposeLimiter, async (req, res) => {
  try {
    const { name } = req.params;

    if (!validateDepartmentName(name)) {
      return res.status(400).json({ success: false, error: `Unknown department: ${name}` });
    }

    const { proposeDepartmentAction, validateHeartbeatProposal } = await getDepartmentService();
    const { toolName, params, context, reasoning } = req.body || {};

    // C2 fix: this endpoint used to accept arbitrary tool/params from the
    // client, bypassing the LLM-side heartbeat whitelist. Reuse the same
    // validation gate the heartbeat path uses so the only proposals the
    // user can manually queue are ones the department system could have
    // generated on its own.
    const validation = validateHeartbeatProposal({ toolName, params });
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        error: 'invalid_proposal',
        reason: validation.reason,
        details: validation.details,
      });
    }

    // Context must be a string if present; cap length to avoid abuse.
    const safeContext = typeof context === 'string' ? context.slice(0, 500) : undefined;

    // Noise gate: a `suggest` proposal with no context becomes a generic
    // "<Dept> department action" placeholder in the inbox. Reject those at
    // the door — TalkToTwin DEPT_SUGGEST always passes context, the only
    // historical callers without context were ad-hoc tests.
    if (validation.toolName === 'suggest' && (!safeContext || safeContext.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_proposal',
        reason: 'suggest_requires_context',
        details: { hint: 'Pass a non-empty `context` describing what the user should consider.' },
      });
    }

    // Reasoning is the LLM's evidence/observation citation. Optional from the
    // route — TalkToTwin sends it when known, plain tests may omit it. String
    // only; cap length to mirror context.
    const safeReasoning = typeof reasoning === 'string' && reasoning.trim().length > 0
      ? reasoning.slice(0, 1000)
      : undefined;

    const proposal = await proposeDepartmentAction(req.user.id, name, {
      toolName: validation.toolName,
      params: validation.params,
      context: safeContext,
      reasoning: safeReasoning,
      priority: 5,
    });
    return res.json({ success: true, proposal });
  } catch (err) {
    log.error('Failed to trigger department proposal', { userId: req.user.id, department: req.params.name, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to generate proposal' });
  }
});

export default router;
