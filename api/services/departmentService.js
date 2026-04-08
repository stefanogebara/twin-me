/**
 * Department Service — SoulOS Department Orchestration Layer
 * ===========================================================
 * Core service for managing the 7 SoulOS departments. Each department
 * is a specialized agent team that proposes and executes actions on
 * behalf of the user, subject to autonomy controls and budget limits.
 *
 * Depends on:
 *   - departmentConfig.js  — department definitions
 *   - autonomyService.js   — per-skill autonomy levels + action queuing
 *   - departmentBudgetService.js — per-department LLM spend tracking
 *   - database.js          — Supabase admin client
 */

import { DEPARTMENTS, DEPARTMENT_NAMES, getDepartmentConfig } from '../config/departmentConfig.js';
import { queueActionForApproval, getAutonomyBySkillName, AUTONOMY_LEVELS } from './autonomyService.js';
import { checkDepartmentBudget } from './departmentBudgetService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('DepartmentService');

/**
 * Get full status for a single department: config + autonomy + budget + recent activity count.
 */
export async function getDepartmentStatus(userId, department) {
  if (!userId || !department) {
    throw new Error('userId and department are required');
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  try {
    // Fetch autonomy, budget, and recent action count in parallel
    const [autonomyLevel, budgetStatus, recentCount] = await Promise.all([
      resolveAutonomyLevel(userId, department, config),
      checkDepartmentBudget(userId, department, 0),
      countRecentActions(userId, department),
    ]);

    return {
      department,
      ...config,
      autonomyLevel,
      budget: budgetStatus,
      recentActionsCount: recentCount,
    };
  } catch (err) {
    log.error('getDepartmentStatus failed', { userId, department, error: err.message });
    throw err;
  }
}

/**
 * Get all 7 departments with status for the dashboard.
 */
export async function getAllDepartments(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const statuses = await Promise.all(
      DEPARTMENT_NAMES.map(dept => getDepartmentStatus(userId, dept).catch(err => {
        log.warn('Failed to get status for department', { department: dept, error: err.message });
        return { department: dept, ...DEPARTMENTS[dept], error: err.message };
      }))
    );

    return statuses;
  } catch (err) {
    log.error('getAllDepartments failed', { userId, error: err.message });
    return [];
  }
}

/**
 * Propose an action from a department. Validates budget, checks autonomy,
 * and queues via queueActionForApproval if level is DRAFT_CONFIRM.
 *
 * @returns {{ actionId: string|null, status: string }}
 */
export async function proposeDepartmentAction(userId, department, { toolName, params, context, priority }) {
  if (!userId || !department || !toolName) {
    throw new Error('userId, department, and toolName are required');
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  try {
    // Budget check (estimate 0.01 as a default estimated cost)
    const estimatedCost = 0.01;
    const budgetResult = await checkDepartmentBudget(userId, department, estimatedCost);
    if (!budgetResult.allowed) {
      log.info('Action blocked by budget', { userId, department, toolName });
      return { actionId: null, status: 'budget_exceeded' };
    }

    // Autonomy check
    const autonomyLevel = await resolveAutonomyLevel(userId, department, config);
    if (autonomyLevel <= AUTONOMY_LEVELS.OBSERVE) {
      log.info('Action blocked by autonomy (OBSERVE)', { userId, department, toolName });
      return { actionId: null, status: 'autonomy_blocked' };
    }

    // Queue for approval
    const skillName = `${department}_actions`;
    const actionId = await queueActionForApproval(userId, {
      toolName,
      params: { ...params, department, priority: priority || 'medium' },
      context: context || `${config.name} department action`,
      skillName,
    });

    log.info('Department action proposed', { userId, department, toolName, actionId });
    return { actionId, status: 'pending_approval' };
  } catch (err) {
    log.error('proposeDepartmentAction failed', { userId, department, toolName, error: err.message });
    throw err;
  }
}

/**
 * Get pending department proposals for a user.
 * Returns actions where department IS NOT NULL and user_response IS NULL.
 */
export async function getPendingProposals(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id, skill_name, action_type, proposed_action, context_summary, created_at')
      .eq('user_id', userId)
      .is('user_response', null)
      .not('skill_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('getPendingProposals query failed', { userId, error });
      return [];
    }

    // Enrich with department name parsed from skill_name (e.g., "communications_actions")
    return (data || []).map(action => {
      const department = extractDepartmentFromSkillName(action.skill_name);
      return { ...action, department };
    });
  } catch (err) {
    log.error('getPendingProposals failed', { userId, error: err.message });
    return [];
  }
}

/**
 * Get recent actions for a department (last N, default 20).
 */
export async function getDepartmentActivity(userId, department, limit = 20) {
  if (!userId || !department) {
    throw new Error('userId and department are required');
  }

  const skillName = `${department}_actions`;

  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id, action_type, proposed_action, context_summary, user_response, outcome_data, created_at, resolved_at')
      .eq('user_id', userId)
      .eq('skill_name', skillName)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('getDepartmentActivity query failed', { userId, department, error });
      return [];
    }

    return data || [];
  } catch (err) {
    log.error('getDepartmentActivity failed', { userId, department, error: err.message });
    return [];
  }
}

/**
 * Update autonomy level for all skills in a department.
 * Validates the level is 0-4 and updates user_skill_settings for each tool.
 */
export async function updateDepartmentAutonomy(userId, department, level) {
  if (!userId || !department) {
    throw new Error('userId and department are required');
  }

  if (typeof level !== 'number' || level < 0 || level > 4) {
    throw new Error(`Invalid autonomy level: ${level}. Must be 0-4.`);
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  const skillName = `${department}_actions`;

  try {
    // Look up or create the skill definition for this department
    let { data: skill } = await supabaseAdmin
      .from('skill_definitions')
      .select('id')
      .eq('name', skillName)
      .single();

    if (!skill) {
      // Create a department skill definition if it doesn't exist
      const { data: created, error: createError } = await supabaseAdmin
        .from('skill_definitions')
        .insert({
          name: skillName,
          display_name: `${config.name} Actions`,
          description: config.description,
          category: department,
          default_autonomy_level: config.defaultAutonomy,
          is_enabled: true,
        })
        .select('id')
        .single();

      if (createError) {
        log.error('Failed to create skill definition', { skillName, error: createError });
        throw createError;
      }
      skill = created;
    }

    // Upsert the user's autonomy override
    const { error: upsertError } = await supabaseAdmin
      .from('user_skill_settings')
      .upsert({
        user_id: userId,
        skill_id: skill.id,
        autonomy_level: level,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,skill_id' });

    if (upsertError) {
      log.error('Failed to update department autonomy', { userId, department, level, error: upsertError });
      throw upsertError;
    }

    log.info('Department autonomy updated', { userId, department, level });
    return { department, autonomyLevel: level };
  } catch (err) {
    log.error('updateDepartmentAutonomy failed', { userId, department, error: err.message });
    throw err;
  }
}

// ========================================================================
// Internal Helpers
// ========================================================================

/**
 * Resolve the effective autonomy level for a department.
 * Checks user override via the department's skill name, falls back to config default.
 */
async function resolveAutonomyLevel(userId, department, config) {
  try {
    const skillName = `${department}_actions`;
    const level = await getAutonomyBySkillName(userId, skillName);
    return level;
  } catch (err) {
    log.warn('Autonomy resolution failed, using config default', { department, error: err.message });
    return config.defaultAutonomy;
  }
}

/**
 * Count recent actions (last 7 days) for a department.
 */
async function countRecentActions(userId, department) {
  const skillName = `${department}_actions`;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('skill_name', skillName)
      .gte('created_at', sevenDaysAgo);

    if (error) {
      log.warn('countRecentActions query failed', { department, error: error.message });
      return 0;
    }

    return count || 0;
  } catch (err) {
    log.warn('countRecentActions failed', { department, error: err.message });
    return 0;
  }
}

/**
 * Heartbeat check — called from observation ingestion cron after new data arrives.
 * Lightweight: checks if any department should propose an action based on new observations.
 * Currently a stub that logs the check — will be extended in Phase 2 with LLM-driven proposals.
 */
export async function checkDepartmentHeartbeats(userId) {
  try {
    const departments = await getAllDepartments(userId);
    const activeDepts = departments.filter(d => d.autonomyLevel > 0);

    if (activeDepts.length === 0) return;

    log.debug('Department heartbeat check', {
      userId,
      activeDepartments: activeDepts.map(d => d.name),
    });

    // Phase 2: LLM-driven proposal generation based on recent observations
    // For now, just log that we checked
  } catch (err) {
    log.warn('Department heartbeat check failed', { userId, error: err.message });
  }
}

/**
 * Extract department key from a skill_name like "communications_actions".
 */
function extractDepartmentFromSkillName(skillName) {
  if (!skillName) return null;
  const suffix = '_actions';
  if (skillName.endsWith(suffix)) {
    return skillName.slice(0, -suffix.length);
  }
  return skillName.split('_')[0] || null;
}
