/**
 * Agentic Core — Planner / Executor / Reviewer Loop
 * ====================================================
 * Lightweight agent orchestration for task execution. When the twin
 * detects a task intent, the AgenticCore plans steps, executes them
 * with tool calls, and reviews the result.
 *
 * Personality is injected at every stage — the twin doesn't just
 * execute tasks, it executes them the way YOU would.
 *
 * Architecture:
 *   Manus Planner/Executor/Reviewer (manus.im/blog)
 *   OpenHands Action-Execution-Observation (arXiv:2511.03690)
 *   Personality filter from existing OCEAN + neurotransmitter system
 */

import { complete, TIER_ANALYSIS, TIER_CHAT } from './llmGateway.js';
import { getAvailableTools, executeTool, getToolSchemas } from './toolRegistry.js';
import { getBlocks } from './coreMemoryService.js';
import { canAct, logAgentAction, getAutonomyBySkillName } from './autonomyService.js';
import { checkPolicy } from './policyEngine.js';
import { buildProcedureBlock, predictOutcome } from './proceduralMemoryService.js';
import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { reportProgress } from './taskProgressService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { buildToolPreferenceBlock, recordToolOutcome } from './toolPreferenceService.js';

const log = createLogger('AgenticCore');

const MAX_STEPS = 8;

// In-memory fallback for error history when Redis is unavailable
const errorHistoryCache = new Map();
const ERROR_HISTORY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Build a running task checklist (Manus todo.md attention trick).
 * Keeps the model aware of what's done, what failed, and what's next.
 */
function buildTaskContext(plan, stepResults, currentStepIndex) {
  const lines = [`TASK: ${plan.summary}`, '', 'PROGRESS:'];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const result = stepResults[i];
    const status = result
      ? (result.result?.success ? '[DONE]' : '[FAILED]')
      : (i === currentStepIndex ? '[CURRENT]' : '[ ]');
    lines.push(`${status} Step ${i + 1}: ${step.action}`);
    if (result?.result?.error) {
      lines.push(`  Error: ${result.result.error}`);
    }
  }
  return lines.join('\n');
}

/**
 * Get past error history for a user (from Redis or in-memory fallback).
 */
async function getErrorHistory(userId) {
  try {
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      const data = await redis.get(`agent_errors:${userId}`);
      return data ? JSON.parse(data) : [];
    }
  } catch (err) {
    log.warn('Failed to read error history from Redis', { error: err.message });
  }
  // In-memory fallback
  const cached = errorHistoryCache.get(userId);
  if (cached && Date.now() - cached.timestamp < ERROR_HISTORY_TTL_MS) {
    return cached.errors;
  }
  return [];
}

/**
 * Save error history for a user (Redis with in-memory fallback).
 */
async function saveErrorHistory(userId, errors) {
  const trimmed = errors.slice(-10); // Keep last 10 errors max
  try {
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      await redis.set(`agent_errors:${userId}`, JSON.stringify(trimmed), 'EX', 3600);
      return;
    }
  } catch (err) {
    log.warn('Failed to save error history to Redis', { error: err.message });
  }
  errorHistoryCache.set(userId, { errors: trimmed, timestamp: Date.now() });
}

/**
 * Plan a task: break it into executable steps.
 * Uses DeepSeek (cheap) for planning.
 */
export async function planTask(userId, taskDescription, context = {}) {
  const coreBlocks = await getBlocks(userId);
  const availableTools = await getAvailableTools(userId);
  const toolNames = availableTools.map(t => `${t.name}: ${t.description}`).join('\n');

  // Fetch past errors so the agent avoids repeating mistakes
  let errorBlock = '';
  try {
    const pastErrors = await getErrorHistory(userId);
    if (pastErrors.length > 0) {
      errorBlock = `\nPAST ERRORS (avoid these approaches):\n${pastErrors.map(e => `- Tool "${e.tool}": ${e.error}`).join('\n')}\n`;
    }
  } catch (err) {
    log.warn('Failed to fetch error history', { userId, error: err.message });
  }

  // Fetch procedural memories — Hebbian-weighted learned action patterns
  let procedureBlock = '';
  try {
    const skillForProcs = context.skillName || null;
    procedureBlock = await buildProcedureBlock(userId, skillForProcs);
  } catch (err) {
    log.warn('Failed to fetch procedures', { userId, error: err.message });
  }

  // Outcome prediction — Reflexion-style pre-check (warn if low success rate)
  let predictionBlock = '';
  try {
    const skillForPred = context.skillName || null;
    if (skillForPred) {
      const prediction = await predictOutcome(userId, skillForPred);
      if (prediction.warning) {
        predictionBlock = `\nWARNING: ${prediction.warning}\nConsider a different approach or ask the user before proceeding.\n`;
      }
    }
  } catch (err) {
    log.warn('Failed to predict outcome', { userId, error: err.message });
  }

  // Fetch tool preferences — learned per-user per-skill tool success rates
  let toolPreferenceBlock = '';
  try {
    const skillForPrefs = context.skillName || 'general_task';
    toolPreferenceBlock = await buildToolPreferenceBlock(userId, skillForPrefs);
  } catch (err) {
    log.warn('Failed to fetch tool preferences', { userId, error: err.message });
  }

  const prompt = `You are a task planner for a personal digital twin. Break this task into concrete steps.

USER'S PERSONALITY:
${coreBlocks.soul_signature?.content || 'Unknown'}

USER'S CONTEXT:
${coreBlocks.human?.content || 'Unknown'}
${coreBlocks.goals?.content || ''}
${procedureBlock}${toolPreferenceBlock}${predictionBlock}${errorBlock}
AVAILABLE TOOLS:
${toolNames}

TASK: "${taskDescription}"

Respond with VALID JSON only (no markdown):
{
  "steps": [
    {
      "step_number": 1,
      "action": "description of what to do",
      "tool": "tool_name_to_use or null if no tool needed",
      "tool_params": {},
      "reasoning": "why this step"
    }
  ],
  "estimated_autonomy_needed": 1,
  "summary": "one-line summary of the plan"
}

Rules:
- Maximum ${MAX_STEPS} steps
- Only use tools from the AVAILABLE TOOLS list
- If the task can't be done with available tools, say so in the summary
- Consider the user's personality when planning (a direct person wants concise plans)`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS,
      maxTokens: 800,
      temperature: 0.3,
      userId,
      serviceName: 'agentic-task-planning',
    });

    const text = response?.content || response?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Planner returned non-JSON', { userId, text: text.slice(0, 200) });
      return null;
    }

    const plan = JSON.parse(jsonMatch[0]);
    log.info('Task planned', {
      userId,
      task: taskDescription.slice(0, 60),
      steps: plan.steps?.length,
      summary: plan.summary
    });

    return plan;
  } catch (err) {
    log.error('Task planning failed', { userId, error: err.message });
    return null;
  }
}

/**
 * Execute a single step from a plan.
 * Calls the specified tool and returns the observation.
 * @param {string} userId
 * @param {object} step - Plan step with tool, tool_params, action
 * @param {string} taskContext - Running task checklist for agent attention
 */
export async function executeStep(userId, step, taskContext = '') {
  if (!step.tool) {
    // No tool needed — this is a reasoning/output step
    return { success: true, data: step.action, source: 'reasoning' };
  }

  try {
    const result = await executeTool(userId, step.tool, step.tool_params || {});
    return result;
  } catch (err) {
    log.error('Step execution failed', {
      userId,
      step: step.step_number,
      tool: step.tool,
      error: err.message
    });
    return { success: false, error: err.message };
  }
}

/**
 * Review the results of task execution.
 * Validates quality and decides if the task is complete.
 */
export async function reviewResult(userId, taskDescription, stepResults) {
  const resultSummary = stepResults.map((r, i) =>
    `Step ${i + 1}: ${r.success ? 'OK' : 'FAILED'} — ${JSON.stringify(r.data || r.error).slice(0, 200)}`
  ).join('\n');

  const prompt = `Review these task execution results:

TASK: "${taskDescription}"

RESULTS:
${resultSummary}

Respond with VALID JSON:
{
  "complete": true/false,
  "quality": "good/acceptable/poor",
  "summary": "what was accomplished",
  "issues": ["any problems found"]
}`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS,
      maxTokens: 300,
      temperature: 0.2,
      userId,
      serviceName: 'agentic-task-review',
    });

    const text = response?.content || response?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { complete: true, quality: 'unknown', summary: text.slice(0, 200) };
  } catch (err) {
    log.error('Review failed', { userId, error: err.message });
    return { complete: true, quality: 'unknown', summary: 'Review unavailable' };
  }
}

/**
 * Run the full agent loop: Plan → Execute → Review.
 * Returns the final result with all step outcomes.
 */
export async function runAgentLoop(userId, taskDescription, options = {}) {
  const { skillName = null, maxSteps = MAX_STEPS } = options;

  log.info('Agent loop starting', { userId, task: taskDescription.slice(0, 80), skillName });

  // Check autonomy level (always — defaults to SUGGEST if no skill specified)
  const effectiveSkillName = skillName || 'general_task';
  const autonomyLevel = await getAutonomyBySkillName(userId, effectiveSkillName);
  // Default to SUGGEST (level 1) for unknown skills — safe default
  const effectiveAutonomy = autonomyLevel >= 0 ? autonomyLevel : 1;
  const permission = canAct(effectiveAutonomy, 'execute');
  if (!permission.allowed) {
    log.info('Agent action blocked by autonomy level', {
      userId, skillName: effectiveSkillName,
      level: permission.level,
      required: permission.requiredLevel
    });
    return {
      success: false,
      blocked: true,
      reason: `Autonomy level ${permission.label} does not allow execution. Minimum required: Level ${permission.requiredLevel}.`,
      autonomyLevel: permission.level,
    };
  }

  // Policy engine check (action allowlist + rate limits + blocked actions)
  const policy = await checkPolicy(userId, effectiveAutonomy, 'execute', effectiveSkillName);
  if (!policy.allowed) {
    log.info('Agent action blocked by policy', { userId, skillName: effectiveSkillName, reason: policy.reason });
    return { success: false, blocked: true, reason: policy.reason };
  }

  // Phase 1: Plan
  const plan = await planTask(userId, taskDescription, { skillName: effectiveSkillName });
  if (!plan?.steps?.length) {
    return { success: false, reason: 'planning_failed' };
  }

  // Phase 2: Execute steps with running task checklist (Manus todo.md trick)
  const stepResults = [];
  const newErrors = [];
  for (let i = 0; i < Math.min(plan.steps.length, maxSteps); i++) {
    const step = plan.steps[i];

    // Build running task context so model sees progress
    const taskContext = buildTaskContext(plan, stepResults, i);
    const result = await executeStep(userId, step, taskContext);
    stepResults.push({ ...step, result });

    // Report progress (fire-and-forget — don't block the loop)
    reportProgress(userId, `task_${Date.now()}`, {
      step: i + 1,
      total: Math.min(plan.steps.length, maxSteps),
      status: result.success ? 'done' : 'failed',
      detail: step.action?.slice(0, 80),
      summary: plan.summary,
    }).catch(() => {});

    // Record tool outcome for preference learning (fire-and-forget)
    if (step.tool) {
      recordToolOutcome(
        userId,
        effectiveSkillName,
        step.tool,
        !!result.success,
        result.elapsedMs || 0
      ).catch(() => {});
    }

    // Track errors for future avoidance
    if (!result.success && step.tool) {
      newErrors.push({ tool: step.tool, error: (result.error || 'unknown').slice(0, 200), timestamp: Date.now() });
      log.warn('Step failed, stopping execution', {
        userId, step: step.step_number, tool: step.tool, error: result.error
      });
      break;
    }
  }

  // Persist new errors for future agent loops
  if (newErrors.length > 0) {
    const pastErrors = await getErrorHistory(userId);
    await saveErrorHistory(userId, [...pastErrors, ...newErrors]);
  }

  // Phase 3: Review
  const review = await reviewResult(userId, taskDescription, stepResults.map(s => s.result));

  // Log the agent action
  const action = await logAgentAction(userId, {
    skillName: skillName,
    actionType: 'execution',
    content: `Task: ${taskDescription}\nResult: ${review.summary}`,
    autonomyLevel: plan.estimated_autonomy_needed || 1,
    platformSources: [...new Set(stepResults.filter(s => s.tool).map(s => {
      // Map tool names to platform names (e.g., 'spotify_now_playing' → 'spotify')
      const toolName = s.tool;
      const platformMatch = toolName.match(/^(spotify|calendar|whoop|youtube|gmail|discord|linkedin|github|reddit|twitch)/);
      return platformMatch ? platformMatch[1] : toolName;
    }))],
  });

  // Log agent event
  await supabaseAdmin
    .from('agent_events')
    .insert({
      user_id: userId,
      event_type: 'agent_loop_completed',
      event_data: {
        task: taskDescription,
        stepsPlanned: plan.steps.length,
        stepsExecuted: stepResults.length,
        errors: newErrors.length > 0 ? newErrors : undefined,
        review,
        actionId: action?.id,
      },
      source: 'agentic_core',
    })
    .catch(err => log.warn('Failed to log agent event', { error: err.message }));

  log.info('Agent loop complete', {
    userId,
    task: taskDescription.slice(0, 60),
    steps: stepResults.length,
    quality: review.quality,
    complete: review.complete,
  });

  return {
    success: true,
    plan: plan.summary,
    steps: stepResults.length,
    review,
    actionId: action?.id,
  };
}
