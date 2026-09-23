/**
 * Agent Delegation Service
 * ========================
 * Maps task domains to specialist agents. When the agenticCore planner
 * identifies a step matching a specialist's domain, the step is delegated
 * to that specialist instead of generic tool execution.
 *
 * This gives richer, more contextual results because specialists have
 * domain knowledge (research papers, behavioral models) that generic
 * tool calls lack.
 */

import specialistOrchestrator from './specialists/SpecialistOrchestrator.js';
import { createLogger } from './logger.js';

const log = createLogger('AgentDelegation');

/**
 * Domain keyword map — matches step action text to specialist names.
 * Each entry: { keywords: string[], specialistKey: string, label: string }
 */
const DOMAIN_MAP = [
  {
    keywords: ['spotify', 'playlist', 'listening', 'song', 'music', 'artist', 'track', 'album', 'genre'],
    specialistKey: 'spotify',
    label: 'MusicPsychologistAgent'
  },
  {
    keywords: ['whoop', 'recovery', 'sleep', 'hrv', 'strain', 'energy', 'health', 'heart rate', 'biometrics'],
    specialistKey: 'whoop',
    label: 'BiometricsSpecialistAgent'
  },
  {
    keywords: ['calendar', 'schedule', 'meeting', 'event', 'busy', 'free', 'appointment', 'time management'],
    specialistKey: 'calendar',
    label: 'CalendarBehaviorAgent'
  },
  {
    keywords: ['email', 'gmail', 'draft', 'reply', 'inbox', 'compose', 'writing style', 'communication'],
    specialistKey: 'email',
    label: 'EmailSpecialistAgent'
  }
];

/**
 * Minimum keyword match confidence to recommend delegation.
 * At least one keyword must match, and the confidence score
 * (matched / total keywords checked) must exceed this threshold.
 */
const MIN_CONFIDENCE = 0.7;

/**
 * Check if a plan step can be delegated to a specialist agent.
 *
 * @param {object} step - Plan step with { action, tool, tool_params }
 * @returns {{ canDelegate: boolean, specialistKey: string|null, specialistName: string|null, confidence: number }}
 */
export function canDelegate(step) {
  if (!step?.action) {
    return { canDelegate: false, specialistKey: null, specialistName: null, confidence: 0 };
  }

  const actionLower = step.action.toLowerCase();
  const toolLower = (step.tool || '').toLowerCase();
  const combinedText = `${actionLower} ${toolLower}`;

  let bestMatch = null;
  let bestScore = 0;

  for (const domain of DOMAIN_MAP) {
    const matchedKeywords = domain.keywords.filter(kw => combinedText.includes(kw));
    if (matchedKeywords.length === 0) continue;

    // Score: number of matched keywords, weighted by specificity
    // More specific keywords (longer) get a slight boost
    const score = matchedKeywords.reduce((sum, kw) => sum + (kw.length > 5 ? 1.2 : 1.0), 0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = domain;
    }
  }

  if (!bestMatch || bestScore < 1.0) {
    return { canDelegate: false, specialistKey: null, specialistName: null, confidence: 0 };
  }

  // Confidence: proportion of domain keywords matched, capped at 1.0
  const confidence = Math.min(1.0, bestScore / 2.0);

  // Verify the specialist is actually available in the orchestrator
  const agent = specialistOrchestrator.agents[bestMatch.specialistKey];
  if (!agent) {
    log.debug('Specialist not registered in orchestrator', { key: bestMatch.specialistKey });
    return { canDelegate: false, specialistKey: null, specialistName: null, confidence: 0 };
  }

  return {
    canDelegate: confidence >= MIN_CONFIDENCE,
    specialistKey: bestMatch.specialistKey,
    specialistName: bestMatch.label,
    confidence
  };
}

/**
 * Delegate a task step to the appropriate specialist agent.
 *
 * The specialist receives the full task context and returns an enriched
 * result with domain-specific analysis, research citations, and
 * personality-aware interpretation.
 *
 * @param {string} userId - User ID
 * @param {string} specialistKey - Key in orchestrator.agents (e.g. 'spotify')
 * @param {object} taskContext - { action, tool, tool_params, taskDescription }
 * @returns {Promise<{ success: boolean, data: object, source: string, specialist: string }>}
 */
export async function delegateToSpecialist(userId, specialistKey, taskContext) {
  const agent = specialistOrchestrator.agents[specialistKey];

  if (!agent) {
    log.warn('Specialist not found for delegation', { specialistKey });
    return {
      success: false,
      error: `Specialist "${specialistKey}" not available`,
      source: 'delegation'
    };
  }

  const startTime = Date.now();
  log.info('Delegating to specialist', {
    userId,
    specialist: agent.name,
    action: taskContext.action?.slice(0, 80)
  });

  try {
    // Build platform data context from task params
    const platformData = taskContext.tool_params || {};

    // Run the specialist's analyze method
    const result = await agent.analyze(userId, platformData);

    const elapsed = Date.now() - startTime;
    log.info('Specialist delegation complete', {
      userId,
      specialist: agent.name,
      success: result.success,
      elapsedMs: elapsed
    });

    return {
      success: result.success !== false,
      data: result,
      source: 'specialist_delegation',
      specialist: agent.name,
      elapsedMs: elapsed
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    log.error('Specialist delegation failed', {
      userId,
      specialist: agent.name,
      error: err.message,
      elapsedMs: elapsed
    });

    return {
      success: false,
      error: err.message,
      source: 'specialist_delegation',
      specialist: agent.name,
      elapsedMs: elapsed
    };
  }
}

/**
 * Get list of all available specialists with their domains and keywords.
 *
 * @returns {Array<{ key: string, name: string, domain: string, keywords: string[], available: boolean }>}
 */
export function getAvailableSpecialists() {
  return DOMAIN_MAP.map(domain => {
    const agent = specialistOrchestrator.agents[domain.specialistKey];
    return {
      key: domain.specialistKey,
      name: domain.label,
      domain: agent?.domain || domain.specialistKey,
      domainLabel: agent?.domainLabel || domain.label,
      keywords: domain.keywords,
      available: !!agent
    };
  });
}
