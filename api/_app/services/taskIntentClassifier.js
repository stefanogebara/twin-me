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

import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { createProspective } from './prospectiveMemoryService.js';
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

  // User Rules — explicit memory instructions
  [/\b(remember that|always remember|never mention|don'?t (ever )?mention|don'?t bring up|keep in mind|from now on)\b/i, 'user_rule', 0.9],
  [/\b(i('?m| am) (vegan|vegetarian|allergic|celiac|gluten|lactose|diabetic))\b/i, 'user_rule', 0.85],

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

/**
 * Parse a reminder message and create a prospective memory.
 * Uses TIER_EXTRACTION (Mistral Small, ~$0.001) to extract what + when.
 * Designed to run async (fire-and-forget) — errors are logged, not thrown.
 *
 * @param {string} userId
 * @param {string} message - The user's original message
 */
export async function parseAndCreateReminder(userId, message) {
  // Fetch the user's timezone from the database for correct local-time parsing
  let userTimezone = 'UTC';
  try {
    const { supabaseAdmin } = await import('./database.js');
    const { data } = await supabaseAdmin
      .from('users')
      .select('timezone')
      .eq('id', userId)
      .single();
    if (data?.timezone) userTimezone = data.timezone;
  } catch { /* non-fatal — fall back to UTC */ }

  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD in user's TZ
  const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long' });
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, hour: 'numeric', hour12: false }).format(now),
    10
  );

  const prompt = `Extract the reminder details from this message. Today is ${dayOfWeek}, ${today}. The user's timezone is ${userTimezone} (current local hour: ${localHour}).

Message: "${message}"

Respond with VALID JSON only (no markdown):
{
  "what": "the thing to remember/do",
  "when_description": "human-readable time (e.g., 'Monday morning', 'in 2 hours', 'tomorrow at 9am')",
  "trigger_type": "time" or "condition",
  "iso_datetime": "ISO 8601 datetime in the user's LOCAL time (no Z suffix, e.g., 2026-04-18T09:00:00), or null if condition-based",
  "condition_keywords": ["keyword1", "keyword2"] if condition-based (e.g., "when I mention X"), or null
}

Rules:
- If the user says "Monday" with no time, default to 09:00 in their local timezone (${userTimezone})
- "tomorrow" means the next calendar day in their timezone
- "next week" means next Monday in their timezone
- "in X hours/minutes" → compute from now in their timezone
- Output datetime in LOCAL time WITHOUT a Z suffix (the system will apply ${userTimezone} automatically)
- If the trigger is "when I mention X" or "next time X comes up", use trigger_type "condition" with keywords`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_EXTRACTION,
      maxTokens: 200,
      temperature: 0.1,
      userId,
      serviceName: 'task-intent-reminder',
    });

    const text = response?.content || response?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Reminder parse returned non-JSON', { userId, text: text.slice(0, 200) });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build trigger spec based on type
    const triggerType = parsed.trigger_type === 'condition' ? 'condition' : 'time';
    let triggerSpec;

    if (triggerType === 'time' && parsed.iso_datetime) {
      triggerSpec = { at: parsed.iso_datetime };
    } else if (triggerType === 'condition' && parsed.condition_keywords?.length > 0) {
      triggerSpec = {
        keywords: parsed.condition_keywords,
        description: parsed.when_description
      };
    } else {
      // Fallback: create a time trigger for tomorrow 9am UTC-3 (12:00 UTC)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(12, 0, 0, 0);
      triggerSpec = { at: tomorrow.toISOString() };
      log.info('Reminder fallback to tomorrow 9am', { userId, parsed });
    }

    const memory = await createProspective(
      userId,
      triggerType,
      triggerSpec,
      parsed.what || message.slice(0, 200),
      `User asked: "${message.slice(0, 150)}" — parsed as: ${parsed.when_description || 'unknown time'}`,
      { source: 'chat_intent', priority: 'medium' }
    );

    log.info('Reminder created from chat intent', {
      userId,
      memoryId: memory.id,
      triggerType,
      what: parsed.what?.slice(0, 60),
      when: parsed.when_description
    });

    return { ...parsed, memoryId: memory.id };
  } catch (err) {
    log.error('Failed to parse/create reminder', { userId, error: err.message });
    return null;
  }
}
