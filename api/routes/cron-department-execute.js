/**
 * Cron: Department Autonomous Execution
 * ======================================
 * Schedule: every 3 hours (0 star-slash-3 * * *)
 *
 * Executes pending department proposals for users whose departments
 * have ACT_NOTIFY (3) or AUTONOMOUS (4) autonomy levels.
 *
 * Safety guards:
 * - Only executes proposals for departments at autonomy >= 3
 * - Checks department budget before execution
 * - Max 5 actions per user per run
 * - Max 10 users per run (round-robin fairness)
 * - Logs everything for audit trail
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronDeptExecute');
const router = express.Router();

const MAX_USERS_PER_RUN = 10;
const MAX_ACTIONS_PER_USER = 5;
const MIN_AUTONOMY_FOR_EXECUTION = 3; // ACT_NOTIFY

router.all('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // 1. Find pending proposals in autonomous departments (early return if none)
    const { data: pendingActions, error: fetchError } = await supabaseAdmin
      .from('agent_actions')
      .select('id, user_id, department, action_type, proposed_action, estimated_cost_usd')
      .is('user_response', null)
      .not('department', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      log.error('Failed to fetch pending actions', { error: fetchError.message });
      const elapsed = Date.now() - startTime;
      await logCronExecution('department-execute', 'error', elapsed, null, fetchError.message);
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    if (!pendingActions || pendingActions.length === 0) {
      const elapsed = Date.now() - startTime;
      await logCronExecution('department-execute', 'success', elapsed, { executed: 0, skipped: 0, users: 0 });
      return res.json({ success: true, message: 'No pending autonomous actions', executed: 0, skipped: 0, users: 0, elapsedMs: elapsed });
    }

    // 2. Group by user (immutable aggregation)
    const byUser = {};
    for (const action of pendingActions) {
      if (!byUser[action.user_id]) {
        byUser[action.user_id] = [];
      }
      byUser[action.user_id].push(action);
    }

    const userIds = Object.keys(byUser).slice(0, MAX_USERS_PER_RUN);
    let totalExecuted = 0;
    let totalSkipped = 0;

    // 3. For each user, check autonomy level and execute eligible actions
    for (const userId of userIds) {
      const userActions = byUser[userId].slice(0, MAX_ACTIONS_PER_USER);

      // Fetch department autonomy levels for this user
      let deptAutonomy = {};
      try {
        const { getAllDepartments } = await import('../services/departmentService.js');
        const departments = await getAllDepartments(userId);
        for (const d of departments) {
          deptAutonomy[d.department] = d.autonomyLevel;
        }
      } catch (err) {
        log.warn('Failed to fetch department autonomy', { userId: userId.slice(0, 8), error: err.message });
        totalSkipped += userActions.length;
        continue;
      }

      for (const action of userActions) {
        const autonomy = deptAutonomy[action.department] || 0;

        // Only auto-execute if autonomy >= ACT_NOTIFY (3)
        if (autonomy < MIN_AUTONOMY_FOR_EXECUTION) {
          totalSkipped++;
          continue;
        }

        // Check budget before executing
        try {
          const { checkDepartmentBudget } = await import('../services/departmentBudgetService.js');
          const budgetCheck = await checkDepartmentBudget(userId, action.department, action.estimated_cost_usd || 0.001);
          if (!budgetCheck.allowed) {
            log.info('Auto-execution blocked by budget', { userId: userId.slice(0, 8), department: action.department });
            totalSkipped++;
            continue;
          }
        } catch (budgetErr) {
          log.warn('Budget check failed, skipping action', { userId: userId.slice(0, 8), actionId: action.id, error: budgetErr.message });
          totalSkipped++;
          continue;
        }

        // Execute the approved action
        try {
          const { executeApprovedAction } = await import('../services/autonomyService.js');
          await executeApprovedAction(userId, action.id);
          totalExecuted++;
          log.info('Auto-executed action', { userId: userId.slice(0, 8), actionId: action.id, department: action.department });

          // Fire-and-forget push notification (non-fatal)
          try {
            const { sendWebPush } = await import('../services/webPushService.js');
            await sendWebPush(userId, {
              title: `${action.department}: Action completed`,
              body: `Automatically executed: ${action.action_type}`,
              url: '/departments',
              tag: `department_executed_${action.id}`,
              category: 'department_executed',
            });
          } catch (_) { /* push failure is non-fatal */ }
        } catch (execErr) {
          log.error('Auto-execution failed', { userId: userId.slice(0, 8), actionId: action.id, error: execErr.message });
          totalSkipped++;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const result = { executed: totalExecuted, skipped: totalSkipped, users: userIds.length };
    log.info('Department execute cron complete', { ...result, elapsedMs: elapsed });
    await logCronExecution('department-execute', 'success', elapsed, result);

    return res.json({ success: true, ...result, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('department-execute', 'error', elapsed, null, err.message);
    log.error('Department execute cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
