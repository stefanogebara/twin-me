/**
 * Task Intent Classifier — Route Messages to Agent vs Conversation
 * =================================================================
 * Pure heuristic classifier (no LLM call, <1ms) that detects when
 * the user is asking the twin to DO something vs TALK about something.
 *
 * When a task intent is detected with high confidence, the message
 * routes to the AgenticCore for planning + execution instead of
 * the normal conversation flow.
 *
 * Classification categories:
 *   remind    — "remind me to...", "don't let me forget..."
 *   schedule  — "schedule...", "block time for...", "add to calendar..."
 *   draft     — "draft...", "write...", "compose..."
 *   search    — "find me...", "look up...", "search for..."
 *   analyze   — "analyze...", "what pattern...", "compare my..."
 *   suggest   — "what should I...", "recommend...", "suggest..."
 *   control   — "play...", "queue...", "pause..." (platform control)
 */

import { createLogger } from './logger.js';

const log = createLogger('TaskIntent');

// Pattern definitions: [regex, taskType, baseConfidence]
const TASK_PATTERNS = [
  // Remind / Remember
  [/\b(remind me|don'?t let me forget|remember to|make sure i|remind yourself)\b/i, 'remind', 0.9],
  [/\b(follow up|check back|circle back)\b.*\b(on|about|with|later|tomorrow|next week)\b/i, 'remind', 0.8],

  // Schedule / Calendar
  [/\b(schedule|book|block time|add to (my )?calendar|set up a meeting|arrange)\b/i, 'schedule', 0.85],
  [/\b(reschedule|move|cancel|postpone)\b.*\b(meeting|event|appointment|call)\b/i, 'schedule', 0.85],

  // Draft / Write
  [/\b(draft|write|compose|type up|put together)\b.*\b(email|message|reply|response|note|text)\b/i, 'draft', 0.85],
  [/\b(reply to|respond to|answer)\b.*\b(email|message)\b/i, 'draft', 0.8],

  // Search / Find
  [/\b(find me|look up|search for|can you find|look for|hunt down)\b/i, 'search', 0.8],
  [/\b(what('?s| is) the)\b.*\b(best|nearest|cheapest|fastest)\b/i, 'search', 0.7],

  // Analyze / Pattern
  [/\b(analyze|what pattern|compare my|how (does|do) my|trend in my|correlat)\b/i, 'analyze', 0.75],
  [/\b(break down|deep dive|show me (the )?data|what does my .* look like)\b/i, 'analyze', 0.7],

  // Suggest / Recommend
  [/\b(what should i|should i|recommend|suggest|advise me|help me (decide|choose|pick))\b/i, 'suggest', 0.7],
  [/\b(give me (a |some )?ideas|brainstorm|help me plan)\b/i, 'suggest', 0.7],

  // Platform Control
  [/\b(play|queue|add to playlist|skip|pause|start playing)\b/i, 'control', 0.8],
  [/\b(set .* alarm|turn (on|off)|start (a )?timer)\b/i, 'control', 0.8],

  // Generic task markers
  [/\b(can you|could you|would you|please)\b.*\b(do|make|create|set|get|send|check)\b/i, 'general_task', 0.6],
  [/\b(i need you to|i want you to|go ahead and)\b/i, 'general_task', 0.75],
];

// Anti-patterns — these indicate conversation, not tasks (reduce confidence)
const CONVERSATION_PATTERNS = [
  /\b(how are you|what do you think|tell me about|what's your opinion|do you think)\b/i,
  /\b(i feel|i'm feeling|i've been|lately i|today was|yesterday)\b/i,
  /\b(what does .* mean|why do (i|you)|how come|what if)\b/i,
  /\b(thanks|thank you|cool|nice|interesting|wow|haha|lol)\b/i,
];

/**
 * Classify whether a message contains a task intent.
 *
 * @param {string} message - User's message
 * @returns {Object} { isTask, taskType, confidence, matchedPattern }
 */
export function classifyTaskIntent(message) {
  if (!message || message.trim().length < 5) {
    return { isTask: false, taskType: null, confidence: 0, matchedPattern: null };
  }

  const normalized = message.trim().toLowerCase();

  // Check for task patterns
  let bestMatch = null;
  let highestConfidence = 0;

  for (const [pattern, taskType, baseConfidence] of TASK_PATTERNS) {
    if (pattern.test(normalized)) {
      if (baseConfidence > highestConfidence) {
        highestConfidence = baseConfidence;
        bestMatch = { taskType, pattern: pattern.source };
      }
    }
  }

  if (!bestMatch) {
    return { isTask: false, taskType: null, confidence: 0, matchedPattern: null };
  }

  // Check for conversation anti-patterns (reduce confidence)
  let confidenceReduction = 0;
  for (const antiPattern of CONVERSATION_PATTERNS) {
    if (antiPattern.test(normalized)) {
      confidenceReduction += 0.15;
    }
  }

  // Short messages are less likely to be tasks
  if (normalized.length < 20) {
    confidenceReduction += 0.1;
  }

  // Question marks without action verbs suggest conversation
  if (normalized.endsWith('?') && highestConfidence < 0.8) {
    confidenceReduction += 0.1;
  }

  const finalConfidence = Math.max(0, highestConfidence - confidenceReduction);

  const result = {
    isTask: finalConfidence >= 0.65,
    taskType: bestMatch.taskType,
    confidence: Math.round(finalConfidence * 100) / 100,
    matchedPattern: bestMatch.pattern
  };

  if (result.isTask) {
    log.debug('Task intent detected', { message: normalized.slice(0, 80), ...result });
  }

  return result;
}
