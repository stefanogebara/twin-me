/**
 * Department Budget Service — Per-Department LLM Spend Tracking
 * ==============================================================
 * Tracks monthly LLM cost per department per user. Each department
 * has a configurable monthly budget. Actions are blocked when the
 * department budget is exhausted, preventing runaway costs.
 *
 * Tables:
 *   - department_budgets: per-user, per-department monthly budget + spend
 *   - action_cost_log: individual cost entries per tool execution
 *
 * Caching: Budget lookups cached in Redis for 5 minutes.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { get as cacheGet, set as cacheSet, del as cacheDel } from './redisClient.js';
import { getDepartmentConfig, DEPARTMENT_NAMES } from '../config/departmentConfig.js';

const log = createLogger('DepartmentBudget');

const BUDGET_CACHE_TTL_S = 300; // 5 minutes

function budgetCacheKey(userId, department) {
  return `dept_budget:${userId}:${department}`;
}

/**
 * Get the budget record for a user + department.
 * Creates a default record from departmentConfig if none exists.
 */
export async function getDepartmentBudget(userId, department) {
  if (!userId || !department) {
    throw new Error('userId and department are required');
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  // Check cache first
  const cacheKey = budgetCacheKey(userId, department);
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;
  } catch (err) {
    log.warn('Budget cache read failed', { error: err.message });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('department_budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('department', department)
      .single();

    if (data && !error) {
      await cacheSet(cacheKey, data, BUDGET_CACHE_TTL_S);
      return data;
    }

    // Create default budget record
    const defaultRecord = {
      user_id: userId,
      department,
      monthly_budget_usd: config.defaultMonthlyBudget,
      spent_this_month_usd: 0,
      budget_month: getCurrentMonth(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('department_budgets')
      .upsert(defaultRecord, { onConflict: 'user_id,department' })
      .select()
      .single();

    if (insertError) {
      log.error('Failed to create default budget', { userId, department, error: insertError });
      return defaultRecord;
    }

    await cacheSet(cacheKey, inserted, BUDGET_CACHE_TTL_S);
    return inserted;
  } catch (err) {
    log.error('getDepartmentBudget failed', { userId, department, error: err.message });
    throw err;
  }
}

/**
 * Sum cost from action_cost_log for the current month.
 */
export async function getDepartmentSpent(userId, department) {
  if (!userId || !department) return 0;

  try {
    const monthStart = getMonthStartISO();

    const { data, error } = await supabaseAdmin
      .from('action_cost_log')
      .select('cost_usd')
      .eq('user_id', userId)
      .eq('department', department)
      .gte('created_at', monthStart);

    if (error) {
      log.warn('getDepartmentSpent query failed', { userId, department, error });
      return 0;
    }

    return (data || []).reduce((sum, row) => sum + (row.cost_usd || 0), 0);
  } catch (err) {
    log.error('getDepartmentSpent failed', { userId, department, error: err.message });
    return 0;
  }
}

/**
 * Check if a department action is within budget.
 * Returns { allowed, remaining, spent, budget }.
 */
export async function checkDepartmentBudget(userId, department, estimatedCost = 0) {
  const budgetRecord = await getDepartmentBudget(userId, department);
  const spent = await getDepartmentSpent(userId, department);

  const budget = budgetRecord.monthly_budget_usd || 0;
  const remaining = Math.max(0, budget - spent);
  const allowed = remaining >= estimatedCost;

  if (!allowed) {
    log.info('Department budget exceeded', {
      userId, department, spent: spent.toFixed(4),
      budget: budget.toFixed(2), estimatedCost: estimatedCost.toFixed(4),
    });
  }

  return { allowed, remaining, spent, budget };
}

/**
 * Record the cost of a single tool execution.
 * Inserts into action_cost_log and invalidates the budget cache.
 */
export async function recordActionCost(userId, department, toolName, cost) {
  if (!userId || !department || cost == null) {
    throw new Error('userId, department, and cost are required');
  }

  try {
    const { error } = await supabaseAdmin
      .from('action_cost_log')
      .insert({
        user_id: userId,
        department,
        tool_name: toolName || 'unknown',
        cost_usd: cost,
        created_at: new Date().toISOString(),
      });

    if (error) {
      log.error('Failed to record action cost', { userId, department, toolName, error });
      return;
    }

    // Invalidate budget cache so next read is fresh
    try {
      await cacheDel(budgetCacheKey(userId, department));
    } catch (cacheErr) {
      log.warn('Cache invalidation failed after cost record', { error: cacheErr.message });
    }

    log.info('Action cost recorded', {
      userId, department, toolName, cost: cost.toFixed(6),
    });
  } catch (err) {
    log.error('recordActionCost failed', { userId, department, error: err.message });
  }
}

/**
 * Reset spent_this_month_usd to 0 for all budgets whose budget_month
 * does not match the current month. Called on-demand or by a monthly cron.
 */
export async function resetMonthlyBudgets() {
  const currentMonth = getCurrentMonth();

  try {
    const { data: stale, error: fetchError } = await supabaseAdmin
      .from('department_budgets')
      .select('id, user_id, department')
      .neq('budget_month', currentMonth);

    if (fetchError) {
      log.error('Failed to fetch stale budgets for reset', { error: fetchError });
      return { reset: 0 };
    }

    if (!stale || stale.length === 0) {
      log.info('No stale budgets to reset');
      return { reset: 0 };
    }

    const staleIds = stale.map(row => row.id);

    const { error: updateError } = await supabaseAdmin
      .from('department_budgets')
      .update({
        spent_this_month_usd: 0,
        budget_month: currentMonth,
        updated_at: new Date().toISOString(),
      })
      .in('id', staleIds);

    if (updateError) {
      log.error('Failed to reset monthly budgets', { error: updateError });
      return { reset: 0 };
    }

    // Invalidate cache for affected users
    for (const row of stale) {
      try {
        await cacheDel(budgetCacheKey(row.user_id, row.department));
      } catch (cacheErr) {
        // Non-fatal
      }
    }

    log.info('Monthly budgets reset', { count: stale.length, month: currentMonth });
    return { reset: stale.length };
  } catch (err) {
    log.error('resetMonthlyBudgets failed', { error: err.message });
    return { reset: 0 };
  }
}

/**
 * Get all department budgets for a user (settings UI).
 * Returns one entry per department, creating defaults for missing ones.
 */
export async function getAllDepartmentBudgets(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const results = await Promise.all(
      DEPARTMENT_NAMES.map(dept => getDepartmentBudget(userId, dept))
    );

    // Enrich each budget with live spent data
    const enriched = await Promise.all(
      results.map(async (budget) => {
        const spent = await getDepartmentSpent(userId, budget.department);
        return {
          ...budget,
          spent_this_month_usd: spent,
          remaining_usd: Math.max(0, (budget.monthly_budget_usd || 0) - spent),
        };
      })
    );

    return enriched;
  } catch (err) {
    log.error('getAllDepartmentBudgets failed', { userId, error: err.message });
    return [];
  }
}

// ========================================================================
// Helpers
// ========================================================================

function getCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
