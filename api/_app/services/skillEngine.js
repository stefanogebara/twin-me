/**
 * Skill Engine — Load, Filter, and Execute Twin Skills
 * =====================================================
 * Skills define what the twin can do. Each skill has a trigger,
 * required platforms, actions, and a default autonomy level.
 *
 * The SkillEngine loads skill definitions from the database,
 * filters by user's connected platforms and autonomy settings,
 * and coordinates execution via the AgenticCore.
 *
 * Inspired by OpenClaw SKILL.md + ClawHub auto-discovery.
 */

import { supabaseAdmin } from './database.js';
import { getAutonomyLevel, canAct, AUTONOMY_LEVELS } from './autonomyService.js';
import { checkPolicy } from './policyEngine.js';
import { runAgentLoop } from './agenticCore.js';
import { getBlocks } from './coreMemoryService.js';
import { createLogger } from './logger.js';

const log = createLogger('SkillEngine');

/**
 * Load a skill definition by ID or name.
 */
export async function loadSkill(skillIdOrName) {
  const isUuid = /^[0-9a-f]{8}-/.test(skillIdOrName);
  const column = isUuid ? 'id' : 'name';

  const { data, error } = await supabaseAdmin
    .from('skill_definitions')
    .select('*')
    .eq(column, skillIdOrName)
    .single();

  if (error || !data) {
    log.warn('Skill not found', { [column]: skillIdOrName, error: error?.message });
    return null;
  }

  return data;
}

/**
 * Get all skills available to a user.
 * Filters by: enabled globally, user has required platforms connected,
 * and user hasn't disabled the skill.
 */
export async function getAvailableSkills(userId) {
  // Get all enabled skills
  const { data: skills } = await supabaseAdmin
    .from('skill_definitions')
    .select('*')
    .eq('is_enabled', true)
    .order('category');

  if (!skills?.length) return [];

  // Get user's connected platforms
  const { data: connections } = await supabaseAdmin
    .from('platform_connections')
    .select('platform')
    .eq('user_id', userId);

  const connectedPlatforms = new Set((connections || []).map(c => c.platform));

  // Get user's skill settings
  const { data: userSettings } = await supabaseAdmin
    .from('user_skill_settings')
    .select('skill_id, autonomy_level, is_enabled')
    .eq('user_id', userId);

  const settingsMap = {};
  for (const s of (userSettings || [])) {
    settingsMap[s.skill_id] = s;
  }

  // Filter and annotate skills
  return skills
    .filter(skill => {
      // Check if user has disabled this skill
      const userSetting = settingsMap[skill.id];
      if (userSetting?.is_enabled === false) return false;

      // Check if required platforms are connected
      if (skill.required_platforms?.length > 0) {
        const hasAll = skill.required_platforms.every(p => connectedPlatforms.has(p));
        if (!hasAll) return false;
      }

      return true;
    })
    .map(skill => {
      const userSetting = settingsMap[skill.id];
      return {
        ...skill,
        effective_autonomy: userSetting?.autonomy_level ?? skill.default_autonomy_level,
        has_user_override: !!userSetting,
      };
    });
}

/**
 * Execute a skill for a user.
 * Checks autonomy, loads personality context, and runs the agent loop.
 */
export async function executeSkill(userId, skillIdOrName, triggerContext = {}) {
  const skill = await loadSkill(skillIdOrName);
  if (!skill) {
    return { success: false, error: `Skill not found: ${skillIdOrName}` };
  }

  // Check autonomy
  const autonomyLevel = await getAutonomyLevel(userId, skill.id);
  if (autonomyLevel === -1) {
    return { success: false, error: 'Skill is disabled by user', skillName: skill.name };
  }

  const permission = canAct(autonomyLevel, 'execute');

  // Policy engine check (allowlist + rate limits)
  const policy = await checkPolicy(userId, autonomyLevel, 'execute', skill.name);
  if (!policy.allowed) {
    log.info('Skill blocked by policy', { userId, skill: skill.name, reason: policy.reason });
    return { success: false, error: policy.reason, skillName: skill.name };
  }

  // For suggest-only autonomy, create a suggestion instead of executing
  if (!permission.allowed) {
    if (autonomyLevel >= AUTONOMY_LEVELS.SUGGEST) {
      // Create a suggestion instead of executing
      const suggestion = await createSkillSuggestion(userId, skill, triggerContext);
      return {
        success: true,
        mode: 'suggestion',
        suggestion,
        skillName: skill.name,
        autonomyLevel,
      };
    }

    return {
      success: false,
      error: 'Insufficient autonomy level',
      skillName: skill.name,
      autonomyLevel,
      requiredLevel: permission.requiredLevel,
    };
  }

  // Run the agent loop with skill context
  const taskDescription = buildTaskDescription(skill, triggerContext);
  const result = await runAgentLoop(userId, taskDescription, {
    skillName: skill.name,
    maxSteps: skill.actions?.length || 5,
  });

  log.info('Skill executed', {
    userId,
    skill: skill.name,
    success: result.success,
    mode: permission.requiresConfirmation ? 'draft_confirm' : 'execute',
  });

  return {
    ...result,
    skillName: skill.name,
    autonomyLevel,
  };
}

/**
 * Build a task description from a skill definition and trigger context.
 */
function buildTaskDescription(skill, triggerContext) {
  let description = skill.description;

  if (triggerContext.reason) {
    description += `\n\nTriggered because: ${triggerContext.reason}`;
  }

  if (triggerContext.platformData) {
    description += `\n\nRelevant data: ${JSON.stringify(triggerContext.platformData).slice(0, 500)}`;
  }

  return description;
}

/**
 * Create a suggestion (for Level 1 autonomy) instead of executing.
 * Stores as a proactive insight for delivery in chat.
 */
async function createSkillSuggestion(userId, skill, triggerContext) {
  const coreBlocks = await getBlocks(userId);

  const suggestion = `I could ${skill.description.toLowerCase()}. ${triggerContext.reason || 'Want me to do this?'}`;

  await supabaseAdmin
    .from('proactive_insights')
    .insert({
      user_id: userId,
      insight: suggestion,
      urgency: 'medium',
      category: 'suggestion',
      delivered: false,
    });

  log.info('Skill suggestion created', { userId, skill: skill.name });
  return suggestion;
}
