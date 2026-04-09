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

import { DEPARTMENTS, DEPARTMENT_NAMES, getDepartmentConfig, getToolCostEstimate } from '../config/departmentConfig.js';
import { queueActionForApproval, getAutonomyBySkillName, AUTONOMY_LEVELS } from './autonomyService.js';
import { checkDepartmentBudget } from './departmentBudgetService.js';
import { supabaseAdmin } from './database.js';
import { get as cacheGet, set as cacheSet } from './redisClient.js';
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';
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
    // Fetch autonomy, budget, recent action count, and proposal stats in parallel
    const [autonomyLevel, budgetStatus, recentCount, stats] = await Promise.all([
      resolveAutonomyLevel(userId, department, config),
      checkDepartmentBudget(userId, department, 0),
      countRecentActions(userId, department),
      getDepartmentStats(userId, department),
    ]);

    return {
      department,
      ...config,
      autonomyLevel,
      budget: budgetStatus,
      recentActionsCount: recentCount,
      stats,
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
    const estimatedCost = getToolCostEstimate(toolName);
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
      params: { ...params, priority: priority || 'medium' },
      context: context || `${config.name} department action`,
      skillName,
      department,
    });

    log.info('Department action proposed', { userId, department, toolName, actionId });

    // Fire-and-forget push notification (non-fatal)
    try {
      const { sendWebPush } = await import('./webPushService.js');
      const deptConfig = getDepartmentConfig(department);
      await sendWebPush(userId, {
        title: `${deptConfig?.name || department}: Action proposed`,
        body: context || 'Your AI department has a suggestion for you',
        url: '/departments',
        tag: `department_proposal_${actionId}`,
        category: 'department_proposal',
      });
    } catch (pushErr) {
      log.debug('Push notification failed (non-fatal)', { error: pushErr.message });
    }

    return { actionId, status: 'pending_approval' };
  } catch (err) {
    log.error('proposeDepartmentAction failed', { userId, department, toolName, error: err.message });
    throw err;
  }
}

/**
 * Generate a human-readable description from a proposal's raw data.
 */
function generateDisplayDescription(action) {
  const ctx = action.context_summary || '';
  const isGeneric = !ctx || ctx.endsWith('department action') || ctx === 'Pending action';
  if (ctx && !isGeneric) return ctx;

  try {
    const parsed = typeof action.proposed_action === 'string'
      ? JSON.parse(action.proposed_action)
      : action.proposed_action;
    if (!parsed) return ctx || 'Pending action';

    const tool = parsed.toolName || parsed.tool || '';
    const p = parsed.params || {};
    const desc = {
      gmail_send: () => p.to ? `Send email to ${p.to}${p.subject ? ': ' + p.subject : ''}` : 'Send email',
      gmail_reply: () => p.subject ? `Reply to: ${p.subject}` : 'Reply to email',
      gmail_draft: () => p.to ? `Draft email to ${p.to}${p.subject ? ': ' + p.subject : ''}` : 'Draft email',
      calendar_create: () => p.summary || p.title ? `Create event: ${p.summary || p.title}` : 'Create calendar event',
      calendar_modify_event: () => p.summary ? `Modify event: ${p.summary}` : 'Modify calendar event',
      docs_create: () => p.title ? `Create document: ${p.title}` : 'Create document draft',
      drive_search: () => p.query ? `Search files for "${p.query}"` : 'Search your files',
      suggest: () => p.suggestion || parsed.description || ctx || 'Suggestion from your twin',
    };
    if (desc[tool]) return desc[tool]();
    if (tool) return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch { /* JSON parse failed */ }

  return ctx || 'Pending action';
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
      .select('id, department, skill_name, action_type, proposed_action, context_summary, estimated_cost_usd, created_at')
      .eq('user_id', userId)
      .is('user_response', null)
      .not('department', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('getPendingProposals query failed', { userId, error });
      return [];
    }

    // Enrich with department name and human-readable description
    return (data || []).map(action => {
      const department = extractDepartmentFromSkillName(action.skill_name);
      const display_description = generateDisplayDescription(action);
      return { ...action, department, display_description };
    });
  } catch (err) {
    log.error('getPendingProposals failed', { userId, error: err.message });
    return [];
  }
}

/**
 * Get recent actions for a department (last N, default 20).
 * Returns formatted activity items with human-readable descriptions.
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

    return (data || []).map(row => formatActivityItem(row, department));
  } catch (err) {
    log.error('getDepartmentActivity failed', { userId, department, error: err.message });
    return [];
  }
}

/**
 * Get recent activity across ALL departments (unified feed, sorted by recency).
 */
export async function getAllDepartmentActivity(userId, limit = 50) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id, action_type, proposed_action, context_summary, user_response, outcome_data, department, skill_name, created_at, resolved_at')
      .eq('user_id', userId)
      .not('department', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('getAllDepartmentActivity query failed', { userId, error });
      return [];
    }

    return (data || []).map(row => {
      const dept = row.department || extractDepartmentFromSkillName(row.skill_name);
      return formatActivityItem(row, dept);
    });
  } catch (err) {
    log.error('getAllDepartmentActivity failed', { userId, error: err.message });
    return [];
  }
}

/**
 * Transform a raw agent_actions row into a formatted activity item.
 */
function formatActivityItem(row, department) {
  const type = resolveActivityType(row);
  const config = getDepartmentConfig(department);
  const description = row.context_summary
    || row.proposed_action
    || `${config?.name || department} action`;
  const outcome = row.outcome_data
    ? (typeof row.outcome_data === 'string' ? row.outcome_data : row.outcome_data?.summary || null)
    : null;

  return {
    id: row.id,
    type,
    department: department || 'unknown',
    description,
    toolName: row.action_type || null,
    status: type,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
    outcome,
  };
}

/**
 * Derive activity type from user_response and resolved_at fields.
 */
function resolveActivityType(row) {
  if (row.user_response === 'approved' && row.resolved_at) return 'executed';
  if (row.user_response === 'approved') return 'approved';
  if (row.user_response === 'rejected') return 'rejected';
  if (row.user_response === null && !row.resolved_at) return 'proposal';
  return 'suggestion';
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
 * Get aggregate proposal stats for a department (total, approved, rejected, approval rate).
 * Uses a single query with client-side counting to keep it cheap.
 */
async function getDepartmentStats(userId, department) {
  const skillName = `${department}_actions`;
  const defaultStats = { totalProposals: 0, approved: 0, rejected: 0, approvalRate: 0 };

  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .select('user_response')
      .eq('user_id', userId)
      .eq('skill_name', skillName);

    if (error || !data) {
      log.warn('getDepartmentStats query failed', { department, error: error?.message });
      return defaultStats;
    }

    const totalProposals = data.length;
    const approved = data.filter(r => r.user_response === 'approved').length;
    const rejected = data.filter(r => r.user_response === 'rejected').length;
    const approvalRate = totalProposals > 0 ? Math.round((approved / totalProposals) * 100) : 0;

    return { totalProposals, approved, rejected, approvalRate };
  } catch (err) {
    log.warn('getDepartmentStats failed', { department, error: err.message });
    return defaultStats;
  }
}

/**
 * Heartbeat check — called from observation ingestion cron after new data arrives.
 * Analyzes recent observations via LLM and generates department action proposals.
 * Cost-controlled: 2-hour cooldown per user, TIER_EXTRACTION (cheapest model).
 */
export async function checkDepartmentHeartbeats(userId, options = {}) {
  const { skipCooldown = false } = options;

  try {
    const departments = await getAllDepartments(userId);
    const activeDepts = departments.filter(d => d.autonomyLevel > 0);
    if (activeDepts.length === 0) return { proposals: [], skipped: 'no_active_departments' };

    // 1. Cooldown — max 1 heartbeat per user per 2 hours
    const cooldownKey = `dept_heartbeat:${userId}`;
    if (!skipCooldown) {
      const lastRun = await cacheGet(cooldownKey);
      if (lastRun) return { proposals: [], skipped: 'cooldown' };
    }

    // 2. Fetch recent observations (last 6 hours, max 30)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recentObs } = await supabaseAdmin
      .from('user_memories')
      .select('content, memory_type, metadata, created_at')
      .eq('user_id', userId)
      .in('memory_type', ['observation', 'platform_data'])
      .gte('created_at', sixHoursAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!recentObs || recentObs.length < 3) return { proposals: [], skipped: 'insufficient_data' };

    // 3. Don't create duplicates — cap pending proposals
    const pending = await getPendingProposals(userId);
    if (pending.length >= 5) return { proposals: [], skipped: 'too_many_pending' };

    // 4. Fetch cross-department context for coordinated intelligence
    const { data: recentActions } = await supabaseAdmin
      .from('agent_actions')
      .select('department, action_type, context_summary, created_at')
      .eq('user_id', userId)
      .not('department', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const crossDeptContext = recentActions?.length > 0
      ? `\nRECENT DEPARTMENT ACTIVITY:\n${recentActions.map(a => `- [${a.department}] ${a.context_summary || a.action_type} (${new Date(a.created_at).toLocaleDateString()})`).join('\n')}`
      : '';

    // 4b. Consume pending cross-department signals for each active department
    const { consumeSignals } = await import('./departmentSignalService.js');
    const signalsByDept = {};
    for (const dept of activeDepts) {
      const signals = await consumeSignals(userId, dept.department);
      if (signals.length) signalsByDept[dept.department] = signals;
    }

    const signalContext = Object.keys(signalsByDept).length > 0
      ? '\nDEPARTMENT SIGNALS (from other departments):\n' +
        Object.entries(signalsByDept).map(([dept, sigs]) =>
          sigs.map(s => `- [${s.from_department} -> ${dept}] ${s.signal_type}: ${JSON.stringify(s.payload)}`).join('\n')
        ).join('\n')
      : '';

    // 4c. Auto-emit Health -> Scheduling signal on low recovery
    const recoveryObs = recentObs.find(o => o.content?.match(/recovery\s+\d+%/i));
    if (recoveryObs) {
      const match = recoveryObs.content.match(/recovery\s+(\d+)%/i);
      if (match && parseInt(match[1]) < 50) {
        const { emitSignal } = await import('./departmentSignalService.js');
        await emitSignal(userId, 'health', 'scheduling', 'low_recovery', {
          recoveryPercent: parseInt(match[1]),
          suggestion: 'Consider blocking recovery time or reducing meeting load',
        });
      }
    }

    // 4d. Fetch active goals for department context
    const { getActiveGoalContext } = await import('./goalTrackingService.js');
    const goalContext = await getActiveGoalContext(userId);
    const goalPromptSection = goalContext
      ? `\n${goalContext}\nDepartments should align proposals with these goals when relevant.`
      : '';

    // 5. Build LLM prompt
    const deptDescriptions = activeDepts.map(d => {
      const tools = (getDepartmentConfig(d.department)?.tools || []).join(', ') || 'none yet';
      return `- ${d.name} (${d.department}): ${d.description}. Tools: ${tools}`;
    }).join('\n');

    const obsText = recentObs.slice(0, 20).map(o => `- ${o.content}`).join('\n');

    const prompt = `You are the AI chief of staff for a user. Your departments are ready to take action on their behalf. Your job: look at their recent activity and propose 2-3 HELPFUL, SPECIFIC actions their departments should take RIGHT NOW.

ACTIVE DEPARTMENTS (pick from these keys): ${activeDepts.map(d => d.department).join(', ')}

${deptDescriptions}

RECENT USER ACTIVITY (last 6 hours):
${obsText}
${crossDeptContext}${signalContext}${goalPromptSection}

EXISTING PENDING PROPOSALS: ${pending.length}/5

YOUR TASK: Based on the data above, output a JSON array of 2-3 specific proposals. Be PROACTIVE, not conservative. If the user has a huge email backlog, propose a triage plan. If they've been listening to the same artist, propose a content idea. If their schedule looks packed, propose blocking focus time.

OUTPUT FORMAT (must be valid JSON):
[
  {"department":"communications","description":"Draft a weekend email triage plan for the 37k unread inbox","toolName":"gmail_draft","params":{"subject":"Inbox triage strategy"},"priority":3,"reasoning":"User has 37k unread emails, 92% unread rate indicates severe backlog"},
  {"department":"scheduling","description":"Block 90 minutes of deep work tomorrow morning","toolName":"calendar_create","params":{"title":"Deep work block"},"priority":4,"reasoning":"No focus blocks visible in recent calendar data"},
  {"department":"social","description":"Review relationship with top email senders — 3 are Substack newsletters","toolName":"suggest","params":{},"priority":6,"reasoning":"Most frequent senders are newsletters, not real people"}
]

RULES:
1. department MUST be one of: ${activeDepts.map(d => d.department).join(', ')}
2. For Health/Finance/Social/Research → toolName: "suggest" (these are observation departments)
3. For Communications → toolName: "gmail_draft" for drafts, "gmail_reply" for replies
4. For Scheduling → toolName: "calendar_create" or "calendar_modify_event"
5. For Content → toolName: "suggest" or "docs_create"
6. Description should be ONE sentence, specific to the data
7. reasoning should cite the specific observation that triggered the suggestion
8. Return an EMPTY array [] ONLY if there is genuinely no signal in the data

GO. Return only the JSON array, no other text:`;

    // 6. Call LLM (TIER_ANALYSIS — DeepSeek is much better than Mistral at structured output)
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS,
      maxTokens: 800,
      temperature: 0.5,
      userId,
      serviceName: 'department-heartbeat',
    });

    // 7. Parse response and create proposals (robust JSON extraction)
    const text = response?.content || '';
    log.info('Heartbeat LLM response', {
      userId: userId.slice(0, 8),
      textLen: text.length,
      preview: text.slice(0, 300)
    });
    // Try greedy match first (captures full array even with nested objects)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log.warn('No JSON array in LLM response', { userId: userId.slice(0, 8), textPreview: text.slice(0, 200) });
      return { proposals: [], count: 0 };
    }

    let suggestions;
    try {
      // Clean common LLM JSON issues: trailing commas, single quotes, unquoted keys
      const cleaned = jsonMatch[0]
        .replace(/,\s*([}\]])/g, '$1')           // trailing commas
        .replace(/'/g, '"')                        // single quotes
        .replace(/(\w+)\s*:/g, '"$1":')            // unquoted keys
        .replace(/""/g, '"');                       // double-double quotes from key fix
      suggestions = JSON.parse(cleaned);
    } catch (parseErr) {
      log.warn('Heartbeat JSON parse failed, attempting line-by-line', { error: parseErr.message });
      // Fallback: try to extract individual objects
      try {
        const objects = text.match(/\{[^{}]+\}/g) || [];
        suggestions = objects.map(o => {
          try { return JSON.parse(o.replace(/'/g, '"')); } catch { return null; }
        }).filter(Boolean);
      } catch { suggestions = []; }
    }
    if (!Array.isArray(suggestions) || suggestions.length === 0) return { proposals: [], count: 0 };

    log.info('Heartbeat parsed suggestions', {
      userId: userId.slice(0, 8),
      count: suggestions.length,
      departments: suggestions.map(s => s.department)
    });

    const createdProposals = [];
    const skipped = [];
    for (const s of suggestions.slice(0, 3)) {
      if (!DEPARTMENT_NAMES.includes(s.department)) {
        skipped.push({ reason: 'unknown_department', department: s.department });
        continue;
      }
      if (!activeDepts.find(d => d.department === s.department)) {
        skipped.push({ reason: 'department_inactive', department: s.department });
        continue;
      }

      // toolName is required by proposeDepartmentAction; use 'suggest' for observation-only proposals
      const toolName = s.toolName || 'suggest';
      try {
        const result = await proposeDepartmentAction(userId, s.department, {
          toolName,
          params: s.params || {},
          context: s.description,
          priority: s.priority || 5,
        });
        if (result.actionId) {
          createdProposals.push({ ...result, department: s.department, description: s.description });
        } else {
          skipped.push({ reason: result.status || 'no_action_id', department: s.department });
        }
      } catch (err) {
        log.warn('Heartbeat proposal creation failed', { department: s.department, error: err.message });
        skipped.push({ reason: err.message, department: s.department });
      }
    }

    log.info('Heartbeat proposals processed', {
      userId: userId.slice(0, 8),
      created: createdProposals.length,
      skipped: skipped.length,
      skipReasons: skipped
    });

    // 8. Set cooldown (2 hours = 7200 seconds)
    await cacheSet(cooldownKey, Date.now(), 7200);

    // 9. Health correlation analysis (24h cooldown, non-fatal)
    const healthDept = activeDepts.find(d => d.department === 'health');
    if (healthDept) {
      const corrCooldownKey = `health_correlation:${userId}`;
      const lastCorr = await cacheGet(corrCooldownKey);
      if (!lastCorr) {
        try {
          const { analyzeHealthPatterns } = await import('./departmentExecutors/healthCorrelationAnalyzer.js');
          const { correlations } = await analyzeHealthPatterns(userId);
          if (correlations.length > 0) {
            const { emitSignal } = await import('./departmentSignalService.js');
            for (const corr of correlations) {
              if (corr.departments?.includes('scheduling')) {
                await emitSignal(userId, 'health', 'scheduling', 'health_pattern', {
                  pattern: corr.pattern,
                  recommendation: corr.recommendation,
                });
              }
            }
          }
          await cacheSet(corrCooldownKey, Date.now(), 86400); // 24h cooldown
        } catch (corrErr) {
          log.debug('Health correlation failed (non-fatal)', { error: corrErr.message });
        }
      }
    }

    log.info('Department heartbeat complete', { userId, proposalsCreated: createdProposals.length });
    return { proposals: createdProposals, count: createdProposals.length };
  } catch (err) {
    log.warn('Department heartbeat check failed', { userId, error: err.message });
    return { proposals: [], error: err.message };
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
