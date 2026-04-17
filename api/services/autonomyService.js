/**
 * Autonomy Service — Per-Skill, Per-User Autonomy Controls
 * ==========================================================
 * Implements the 5-level Autonomy Spectrum for twin actions.
 * Users control what the twin can do per skill category.
 *
 * Levels:
 *   0 = OBSERVE    — Twin watches, learns, never acts
 *   1 = SUGGEST    — Twin suggests actions in chat
 *   2 = DRAFT      — Twin prepares actions, waits for approval
 *   3 = ACT_NOTIFY — Twin acts, then notifies what it did
 *   4 = AUTONOMOUS — Twin acts silently, surfaces outcomes only
 *
 * Research:
 *   - Smashing Magazine Agentic AI UX Patterns (2026)
 *   - Anthropic Measuring Agent Autonomy (2025)
 *   - NemoClaw Policy-Based Guardrails
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('Autonomy');

export const AUTONOMY_LEVELS = Object.freeze({
  OBSERVE: 0,
  SUGGEST: 1,
  DRAFT_CONFIRM: 2,
  ACT_NOTIFY: 3,
  AUTONOMOUS: 4
});

export const AUTONOMY_LABELS = Object.freeze({
  0: 'Observe Only',
  1: 'Suggest',
  2: 'Draft & Confirm',
  3: 'Act & Notify',
  4: 'Full Autonomy'
});

/**
 * Get effective autonomy level for a user + skill combination.
 * Priority: user override > skill default > global default (1 = SUGGEST)
 */
export async function getAutonomyLevel(userId, skillId) {
  try {
    // Check for user override
    const { data: userSetting } = await supabaseAdmin
      .from('user_skill_settings')
      .select('autonomy_level, is_enabled')
      .eq('user_id', userId)
      .eq('skill_id', skillId)
      .single();

    if (userSetting) {
      if (!userSetting.is_enabled) return -1; // Skill disabled
      return userSetting.autonomy_level;
    }

    // Fall back to skill default
    const { data: skill } = await supabaseAdmin
      .from('skill_definitions')
      .select('default_autonomy_level')
      .eq('id', skillId)
      .single();

    return skill?.default_autonomy_level ?? AUTONOMY_LEVELS.SUGGEST;
  } catch (err) {
    log.warn('Failed to get autonomy level, defaulting to SUGGEST', { userId, skillId, error: err.message });
    return AUTONOMY_LEVELS.SUGGEST;
  }
}

/**
 * Get autonomy level by skill name (convenience method).
 */
export async function getAutonomyBySkillName(userId, skillName) {
  try {
    const { data: skill } = await supabaseAdmin
      .from('skill_definitions')
      .select('id, default_autonomy_level')
      .eq('name', skillName)
      .single();

    if (!skill) return AUTONOMY_LEVELS.SUGGEST;

    return getAutonomyLevel(userId, skill.id);
  } catch (err) {
    log.warn('Failed to get autonomy by skill name', { userId, skillName, error: err.message });
    return AUTONOMY_LEVELS.SUGGEST;
  }
}

/**
 * Set autonomy level for a user + skill combination.
 */
export async function setAutonomyLevel(userId, skillId, level) {
  if (level < 0 || level > 4) {
    throw new Error(`Invalid autonomy level: ${level}. Must be 0-4.`);
  }

  const { data, error } = await supabaseAdmin
    .from('user_skill_settings')
    .upsert({
      user_id: userId,
      skill_id: skillId,
      autonomy_level: level,
      is_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,skill_id' })
    .select()
    .single();

  if (error) {
    log.error('Failed to set autonomy level', { userId, skillId, level, error });
    throw error;
  }

  log.info('Autonomy level set', { userId, skillId, level, label: AUTONOMY_LABELS[level] });
  return data;
}

/**
 * Check if the twin can take a specific action type at the current autonomy level.
 *
 * @returns {Object} { allowed, level, requiresConfirmation, label }
 */
export function canAct(autonomyLevel, actionType) {
  // Map action types to minimum required autonomy level
  const ACTION_THRESHOLDS = {
    observe: 0,     // Just watching — always allowed
    suggest: 1,     // Suggest in chat
    draft: 2,       // Prepare draft for approval
    execute: 3,     // Actually do something
    silent: 4       // Do without notifying
  };

  const requiredLevel = ACTION_THRESHOLDS[actionType] ?? 1;

  return {
    allowed: autonomyLevel >= requiredLevel,
    level: autonomyLevel,
    requiredLevel,
    requiresConfirmation: autonomyLevel === AUTONOMY_LEVELS.DRAFT_CONFIRM && actionType === 'execute',
    label: AUTONOMY_LABELS[autonomyLevel]
  };
}

/**
 * Get all skill settings for a user (for the settings UI).
 * Returns skills with their effective autonomy levels.
 */
export async function getUserSkillSettings(userId) {
  try {
    // Get all skills
    const { data: skills } = await supabaseAdmin
      .from('skill_definitions')
      .select('id, name, display_name, description, category, default_autonomy_level, is_enabled, required_platforms')
      .eq('is_enabled', true)
      .order('category');

    if (!skills) return [];

    // Get user overrides
    const { data: userSettings } = await supabaseAdmin
      .from('user_skill_settings')
      .select('skill_id, autonomy_level, is_enabled')
      .eq('user_id', userId);

    const overrideMap = {};
    for (const s of (userSettings || [])) {
      overrideMap[s.skill_id] = s;
    }

    // Merge
    return skills.map(skill => {
      const override = overrideMap[skill.id];
      return {
        ...skill,
        effective_autonomy_level: override?.autonomy_level ?? skill.default_autonomy_level,
        user_enabled: override?.is_enabled ?? true,
        has_override: !!override,
        autonomy_label: AUTONOMY_LABELS[override?.autonomy_level ?? skill.default_autonomy_level]
      };
    });
  } catch (err) {
    log.error('Failed to get user skill settings', { userId, error: err.message });
    return [];
  }
}

/**
 * Log an agent action with autonomy context.
 */
export async function logAgentAction(userId, actionData) {
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .insert({
        user_id: userId,
        skill_name: actionData.skillName || null,
        action_type: actionData.actionType,
        action_content: actionData.content,
        autonomy_level: actionData.autonomyLevel || 1,
        personality_context: actionData.personalityContext || null,
        platform_sources: actionData.platformSources || [],
      })
      .select()
      .single();

    if (error) {
      log.error('Failed to log agent action', { userId, error });
      return null;
    }

    return data;
  } catch (err) {
    log.error('Error logging agent action', { userId, error: err.message });
    return null;
  }
}

/**
 * Queue an action for user approval (DRAFT_CONFIRM level).
 * Stores the proposed action in agent_actions as a pending item
 * that the user can later approve or reject via the approval queue.
 *
 * @param {string} userId
 * @param {{ toolName: string, params: object, context?: string, skillName?: string }} actionData
 * @returns {string} The created action ID
 */
export async function queueActionForApproval(userId, { toolName, params, context, skillName, department }) {
  if (!userId || !toolName) {
    throw new Error('userId and toolName are required to queue an action');
  }

  // action_type must be one of: suggestion, draft, execution, nudge, reminder, briefing, insight_delivery
  const actionType = toolName?.startsWith('gmail_') || toolName?.startsWith('calendar_') || toolName?.startsWith('docs_')
    ? 'draft' : 'suggestion';

  const { data, error } = await supabaseAdmin
    .from('agent_actions')
    .insert({
      user_id: userId,
      action_type: actionType,
      action_content: context || `${toolName} action`,
      skill_name: skillName || `${toolName.split('_')[0]}_actions`,
      proposed_action: JSON.stringify({ toolName, params }),
      context_summary: context || '',
      department: department || null,
      created_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    log.error('Failed to queue action for approval', { userId, toolName, error });
    throw error;
  }

  log.info('Action queued for approval', { userId, actionId: data.id, toolName });
  return data.id;
}

/**
 * Execute a previously queued action that the user has approved.
 * Only pending actions (user_response IS NULL) can be executed.
 *
 * @param {string} userId
 * @param {string} actionId
 * @returns {object} The execution result from the tool
 */
export async function executeApprovedAction(userId, actionId) {
  if (!userId || !actionId) {
    throw new Error('userId and actionId are required');
  }

  // Fetch the action — must belong to this user and be pending
  const { data: action, error: fetchError } = await supabaseAdmin
    .from('agent_actions')
    .select('*')
    .eq('id', actionId)
    .eq('user_id', userId)
    .is('user_response', null)
    .single();

  if (fetchError || !action) {
    throw new Error('Action not found or already processed');
  }

  if (!action.proposed_action) {
    throw new Error('Action has no proposed_action to execute');
  }

  // Parse the stored action (immutable — original action row unchanged)
  const { toolName, params } = JSON.parse(action.proposed_action);

  if (!toolName) {
    throw new Error('Stored action is missing toolName');
  }

  // 'suggest' is a placeholder for text-only proposals (no actual tool execution).
  // Approving them simply acknowledges the suggestion — no API call needed.
  if (toolName === 'suggest') {
    await recordActionResponse(actionId, 'accepted', {
      executionResult: { success: true, type: 'suggestion_acknowledged' },
      executedAt: new Date().toISOString()
    });
    log.info('Suggestion acknowledged', { userId, actionId });
    return { success: true, type: 'suggestion_acknowledged' };
  }

  // Execute via tool registry — bypass autonomy check because the user explicitly approved
  const { executeTool } = await import('./toolRegistry.js');
  const result = await executeTool(userId, toolName, params, { bypassAutonomy: true });

  // Record the outcome (throws on DB failure — data integrity requirement)
  await recordActionResponse(actionId, 'accepted', {
    executionResult: result,
    executedAt: new Date().toISOString()
  });

  // Record department cost AFTER successful tool execution so the budget reflects reality.
  // Cost recording is non-fatal — tool already ran, we don't want to fail the caller.
  if (action.department) {
    try {
      const { recordActionCost } = await import('./departmentBudgetService.js');
      const { TOOL_COST_ESTIMATES } = await import('../config/departmentConfig.js');
      const estimatedCost = action.estimated_cost_usd || TOOL_COST_ESTIMATES[action.action_type] || TOOL_COST_ESTIMATES[toolName] || 0.001;
      await recordActionCost(userId, action.department, action.action_type || toolName, estimatedCost);
    } catch (costErr) {
      log.warn('Failed to record action cost', { actionId, error: costErr.message });
    }
  }

  log.info('Approved action executed', { userId, actionId, toolName });
  return result;
}

/**
 * Record user response to an agent action.
 */
export async function recordActionResponse(actionId, response, outcomeData = null) {
  if (!actionId) {
    throw new Error('actionId is required to record action response');
  }

  // First, get the action to know the skill_name and user_id
  const { data: action, error: fetchError } = await supabaseAdmin
    .from('agent_actions')
    .select('user_id, skill_name')
    .eq('id', actionId)
    .single();

  if (fetchError) {
    log.error('Failed to fetch action for response recording', { actionId, error: fetchError });
    throw fetchError;
  }

  // Main action response write MUST throw on failure — data integrity requirement
  const { error: updateError } = await supabaseAdmin
    .from('agent_actions')
    .update({
      user_response: response,
      outcome_data: outcomeData,
      resolved_at: new Date().toISOString()
    })
    .eq('id', actionId);

  if (updateError) {
    log.error('Failed to record action response', { actionId, error: updateError });
    throw updateError;
  }

  // Hebbian update: strengthen/weaken procedural memory based on feedback (non-critical)
  if (action?.user_id && action?.skill_name) {
    try {
      const { strengthenProcedure, weakenProcedure } = await import('./proceduralMemoryService.js');
      if (response === 'accepted' || response === 'positive') {
        await strengthenProcedure(action.user_id, action.skill_name);
      } else if (response === 'rejected' || response === 'negative') {
        await weakenProcedure(action.user_id, action.skill_name);
      }
    } catch (err) {
      log.warn('Hebbian update failed', { actionId, error: err.message });
    }
  }
}
