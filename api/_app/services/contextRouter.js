/**
 * Context Router — Pre-Execution Context Filtering
 * ==================================================
 * Inspired by Dimension.dev's three-parallel-analysis pattern.
 * Runs BEFORE the agenticCore planner to filter which tools,
 * memories, and procedures are relevant to the current request.
 *
 * Without filtering, 37+ tools flood the LLM context and degrade
 * planning quality. This router reduces tools to the 5-8 most
 * relevant ones per request.
 *
 * Three parallel analyses:
 * 1. Tool routing — which platform tools match the request?
 * 2. Memory routing — which memory types/domains are relevant?
 * 3. Skill routing — which procedures/skills apply?
 *
 * All three run in parallel via Promise.all() for minimum latency.
 */

import { getAvailableTools } from './toolRegistry.js';
import { scoreAndRankTools } from './toolScorer.js';
import { getProcedures } from './proceduralMemoryService.js';
import { getAvailableSpecialists } from './agentDelegationService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ContextRouter');

const MAX_TOOLS = 8;
const MAX_PROCEDURES = 3;

// Memory domain keywords — map task intent to memory type weights
const MEMORY_DOMAIN_PATTERNS = [
  {
    pattern: /who (am i|is this|are you)|personality|identity|what kind of person|traits|values|character/i,
    weights: { facts: 1.0, reflections: 1.0, conversations: 0.3, platform_data: 0.2 },
    label: 'identity',
  },
  {
    pattern: /today|right now|this morning|this afternoon|currently|what('s| is) happening|what did i do/i,
    weights: { facts: 0.3, reflections: 0.3, conversations: 0.5, platform_data: 1.0 },
    label: 'recent_activity',
  },
  {
    pattern: /schedule|calendar|meeting|event|busy|free|appointment|when/i,
    weights: { facts: 0.2, reflections: 0.2, conversations: 0.3, platform_data: 1.0 },
    label: 'schedule',
  },
  {
    pattern: /email|gmail|inbox|send|reply|draft|message|mail|compose/i,
    weights: { facts: 0.3, reflections: 0.2, conversations: 0.4, platform_data: 0.8 },
    label: 'communication',
  },
  {
    pattern: /music|song|playlist|listen|spotify|playing|track|artist/i,
    weights: { facts: 0.4, reflections: 0.5, conversations: 0.2, platform_data: 1.0 },
    label: 'music',
  },
  {
    pattern: /health|sleep|recovery|exercise|energy|workout|hrv|whoop|strain/i,
    weights: { facts: 0.4, reflections: 0.6, conversations: 0.2, platform_data: 1.0 },
    label: 'health',
  },
  {
    pattern: /remember|recall|forgot|what did|when did|last time|history/i,
    weights: { facts: 0.8, reflections: 0.6, conversations: 0.8, platform_data: 0.5 },
    label: 'recall',
  },
  {
    pattern: /goal|progress|target|achieve|track|habit|improve/i,
    weights: { facts: 0.6, reflections: 0.8, conversations: 0.4, platform_data: 0.5 },
    label: 'goals',
  },
  {
    pattern: /code|github|repo|programming|commit|pull request|branch/i,
    weights: { facts: 0.3, reflections: 0.3, conversations: 0.2, platform_data: 1.0 },
    label: 'coding',
  },
  {
    pattern: /social|discord|reddit|community|friends|people|chat/i,
    weights: { facts: 0.4, reflections: 0.5, conversations: 0.7, platform_data: 0.8 },
    label: 'social',
  },
];

// Default memory weights when no pattern matches
const DEFAULT_MEMORY_WEIGHTS = {
  facts: 0.6,
  reflections: 0.6,
  conversations: 0.5,
  platform_data: 0.5,
};

/**
 * Route memory domains — determine which memory types to prioritize.
 * Returns weighted preferences for each memory type (0.0-1.0).
 *
 * @param {string} taskDescription - The user's task description
 * @returns {{ weights: object, domain: string }}
 */
function routeMemoryDomains(taskDescription) {
  if (!taskDescription) {
    return { weights: { ...DEFAULT_MEMORY_WEIGHTS }, domain: 'general' };
  }

  // Check all patterns; accumulate if multiple match
  const matchedPatterns = MEMORY_DOMAIN_PATTERNS.filter(p =>
    p.pattern.test(taskDescription)
  );

  if (matchedPatterns.length === 0) {
    return { weights: { ...DEFAULT_MEMORY_WEIGHTS }, domain: 'general' };
  }

  // If multiple patterns match, blend their weights (max of each)
  if (matchedPatterns.length > 1) {
    const blended = { facts: 0, reflections: 0, conversations: 0, platform_data: 0 };
    for (const p of matchedPatterns) {
      for (const key of Object.keys(blended)) {
        blended[key] = Math.max(blended[key], p.weights[key]);
      }
    }
    const domains = matchedPatterns.map(p => p.label).join('+');
    return { weights: blended, domain: domains };
  }

  const matched = matchedPatterns[0];
  return { weights: { ...matched.weights }, domain: matched.label };
}

/**
 * Route tools — score and filter available tools by relevance.
 *
 * @param {string} userId - User ID
 * @param {string} taskDescription - The task to match against
 * @returns {Promise<{ tools: object[], confidence: number }>}
 */
async function routeTools(userId, taskDescription) {
  const allTools = await getAvailableTools(userId);
  const ranked = scoreAndRankTools(allTools, taskDescription, MAX_TOOLS);

  // Confidence: based on how strong the top tool's relevance is
  const topScore = ranked.length > 0 ? ranked[0].relevanceScore : 0;
  const confidence = Math.min(1.0, topScore + 0.3); // Baseline 0.3 confidence

  log.info('Tools routed', {
    userId,
    totalAvailable: allTools.length,
    selected: ranked.length,
    topTool: ranked[0]?.name,
    topScore: topScore.toFixed(2),
    confidence: confidence.toFixed(2),
  });

  return { tools: ranked, confidence };
}

/**
 * Route skills — find matching procedures from procedural memory.
 *
 * @param {string} userId - User ID
 * @param {string} taskDescription - The task to match against
 * @param {string|null} skillName - Optional explicit skill name
 * @returns {Promise<object[]>}
 */
async function routeSkills(userId, taskDescription, skillName = null) {
  // If explicit skill name provided, fetch procedures for that skill
  const procedures = await getProcedures(userId, skillName, MAX_PROCEDURES * 2);

  if (procedures.length === 0 || !taskDescription) {
    return procedures.slice(0, MAX_PROCEDURES);
  }

  // Score procedures by keyword overlap with task description
  const taskLower = taskDescription.toLowerCase();
  const taskTokens = new Set(
    taskLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
  );

  const scored = procedures.map(proc => {
    const contentLower = (proc.content || '').toLowerCase();
    const skillLower = (proc.metadata?.skill || '').toLowerCase();
    let overlap = 0;

    for (const token of taskTokens) {
      if (contentLower.includes(token) || skillLower.includes(token)) {
        overlap += 1;
      }
    }

    return { ...proc, _matchScore: overlap };
  });

  scored.sort((a, b) => b._matchScore - a._matchScore);
  return scored.slice(0, MAX_PROCEDURES).map(({ _matchScore, ...rest }) => rest);
}

/**
 * Route specialists — check which specialist agents can help.
 *
 * @param {string} taskDescription - The task description
 * @returns {object[]} Available specialists with relevance info
 */
function routeSpecialists(taskDescription) {
  const allSpecialists = getAvailableSpecialists();
  if (!taskDescription) return allSpecialists.filter(s => s.available);

  const taskLower = taskDescription.toLowerCase();

  // Score each specialist by keyword overlap
  const scored = allSpecialists
    .filter(s => s.available)
    .map(specialist => {
      const matchedKws = specialist.keywords.filter(kw => taskLower.includes(kw));
      return {
        ...specialist,
        matchedKeywords: matchedKws,
        relevance: matchedKws.length > 0 ? Math.min(1.0, matchedKws.length / 2) : 0,
      };
    })
    .filter(s => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);

  return scored;
}

/**
 * Boost tool scores using historical tool usage for similar tasks.
 * Queries agent_events for past tool usage patterns.
 *
 * @param {string} userId - User ID
 * @param {object[]} tools - Already-scored tools
 * @param {string} taskDescription - Current task
 * @returns {Promise<object[]>} Tools with history-boosted scores
 */
async function applyHistoryBoost(userId, tools, taskDescription) {
  if (tools.length === 0) return tools;

  try {
    // Fetch recent successful agent events to learn tool usage patterns
    const { data: recentEvents } = await supabaseAdmin
      .from('agent_events')
      .select('event_data')
      .eq('user_id', userId)
      .eq('event_type', 'agent_loop_completed')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!recentEvents || recentEvents.length === 0) return tools;

    // Count tool usage frequency from past events
    const toolUsageCounts = {};
    for (const event of recentEvents) {
      const steps = event.event_data?.review?.steps || event.event_data?.stepsExecuted;
      // Extract tool names from event data if available
      const eventTask = event.event_data?.task || '';
      if (eventTask && typeof eventTask === 'string') {
        // Simple similarity: if past task shares words with current task
        const pastTokens = new Set(eventTask.toLowerCase().split(/\s+/).filter(t => t.length >= 4));
        const currentTokens = taskDescription.toLowerCase().split(/\s+/).filter(t => t.length >= 4);
        const overlap = currentTokens.filter(t => pastTokens.has(t)).length;

        if (overlap >= 2) {
          // This past task is similar — boost tools that were used
          const toolNames = Object.keys(event.event_data || {});
          for (const key of toolNames) {
            if (typeof event.event_data[key] === 'string') {
              toolUsageCounts[event.event_data[key]] = (toolUsageCounts[event.event_data[key]] || 0) + 1;
            }
          }
        }
      }
    }

    // Apply a small boost (max +0.1) to tools that were used in similar past tasks
    return tools.map(tool => {
      const usageCount = toolUsageCounts[tool.name] || 0;
      const historyBoost = Math.min(0.1, usageCount * 0.03);
      return {
        ...tool,
        relevanceScore: Math.min(1.0, (tool.relevanceScore || 0) + historyBoost),
      };
    });
  } catch (err) {
    log.warn('History boost failed (non-fatal)', { error: err.message });
    return tools;
  }
}

/**
 * Main entry point — route context for a task.
 * Runs tool routing, memory routing, and skill routing in parallel.
 *
 * @param {string} userId - User ID
 * @param {string} taskDescription - The user's task description
 * @param {object} [options] - { skillName }
 * @returns {Promise<RoutedContext>}
 *
 * @typedef {object} RoutedContext
 * @property {object[]} tools - 5-8 most relevant tools
 * @property {{ weights: object, domain: string }} memoryDomains - Memory type weights
 * @property {object[]} procedures - Matching procedures (max 3)
 * @property {object[]} specialists - Matching specialist agents
 * @property {number} confidence - Overall routing confidence (0-1)
 * @property {object} meta - Routing metadata for logging
 */
export async function routeContext(userId, taskDescription, options = {}) {
  const startTime = Date.now();
  const { skillName = null } = options;

  // Run all three routing analyses in parallel
  const [toolResult, procedures, memoryDomains, specialists] = await Promise.all([
    routeTools(userId, taskDescription).catch(err => {
      log.error('Tool routing failed', { userId, error: err.message });
      return { tools: [], confidence: 0 };
    }),

    routeSkills(userId, taskDescription, skillName).catch(err => {
      log.warn('Skill routing failed', { userId, error: err.message });
      return [];
    }),

    // Memory routing is synchronous (pure keyword matching) — wrap in resolved promise
    Promise.resolve(routeMemoryDomains(taskDescription)),

    // Specialist routing is also synchronous
    Promise.resolve(routeSpecialists(taskDescription)),
  ]);

  // Apply history boost to tools (quick DB lookup)
  const boostedTools = await applyHistoryBoost(userId, toolResult.tools, taskDescription);

  // Overall confidence: weighted average of tool routing confidence and
  // whether we found relevant memory domains and procedures
  const memoryConfidence = memoryDomains.domain !== 'general' ? 0.9 : 0.5;
  const procedureConfidence = procedures.length > 0 ? 0.8 : 0.4;
  const specialistConfidence = specialists.length > 0 ? 0.9 : 0.5;

  const confidence = (
    toolResult.confidence * 0.4 +
    memoryConfidence * 0.3 +
    procedureConfidence * 0.15 +
    specialistConfidence * 0.15
  );

  const elapsed = Date.now() - startTime;

  log.info('Context routing complete', {
    userId,
    task: taskDescription?.slice(0, 60),
    tools: boostedTools.length,
    domain: memoryDomains.domain,
    procedures: procedures.length,
    specialists: specialists.length,
    confidence: confidence.toFixed(2),
    elapsedMs: elapsed,
  });

  return {
    tools: boostedTools,
    memoryDomains,
    procedures,
    specialists,
    confidence: Math.min(1.0, confidence),
    meta: {
      totalToolsAvailable: toolResult.tools.length,
      routingTimeMs: elapsed,
      domain: memoryDomains.domain,
    },
  };
}

/**
 * Convert memory domain weights to budget overrides for retrieveDiverseMemories.
 * Maps 0-1 weights to actual count limits.
 *
 * @param {{ weights: object }} memoryDomains - From routeContext
 * @returns {{ reflections: number, facts: number, platformData: number, conversations: number }}
 */
export function memoryWeightsToBudgets(memoryDomains) {
  const { weights } = memoryDomains;

  // Base budgets (from existing MEMORY_CONTEXT_BUDGETS defaults)
  const baseBudgets = {
    reflections: 15,
    facts: 6,
    platformData: 4,
    conversations: 4,
  };

  // Scale budgets by weights: weight 1.0 = full budget, weight 0.2 = 20% of budget (min 1)
  return {
    reflections: Math.max(1, Math.round(baseBudgets.reflections * (weights.reflections || 0.6))),
    facts: Math.max(1, Math.round(baseBudgets.facts * (weights.facts || 0.6))),
    platformData: Math.max(1, Math.round(baseBudgets.platformData * (weights.platform_data || 0.5))),
    conversations: Math.max(1, Math.round(baseBudgets.conversations * (weights.conversations || 0.5))),
  };
}

// Export internals for testing
export { routeMemoryDomains, routeTools, routeSkills, routeSpecialists, MEMORY_DOMAIN_PATTERNS, DEFAULT_MEMORY_WEIGHTS };
