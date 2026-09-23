/**
 * Scheduling Department Executor
 * Analyzes calendar patterns and suggests optimal scheduling.
 */

import { complete, TIER_EXTRACTION } from '../llmGateway.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('SchedulingExecutor');

/**
 * Analyze the user's schedule and suggest ONE specific optimization.
 *
 * @param {string} userId
 * @param {{ currentEvents?: Array, whoopRecovery?: string }} params
 * @returns {Promise<{ suggestion: string|null, action?: string, params?: object, reasoning?: string }>}
 */
export async function suggestScheduleOptimization(userId, { currentEvents, whoopRecovery } = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  // 1. Get today's calendar events (if not passed in)
  let events = currentEvents;
  if (!events) {
    const { data } = await supabaseAdmin
      .from('user_memories')
      .select('content, metadata')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .ilike('content', '%calendar%')
      .order('created_at', { ascending: false })
      .limit(10);
    events = data || [];
  }

  // 2. Get Whoop recovery if available
  let recovery = whoopRecovery;
  if (!recovery) {
    const { data } = await supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .ilike('content', '%recovery%')
      .order('created_at', { ascending: false })
      .limit(1);
    recovery = data?.[0]?.content || null;
  }

  const eventText = events.map(e => e.content || JSON.stringify(e)).join('\n');

  const prompt = `Analyze this user's schedule and suggest ONE specific optimization.

TODAY'S EVENTS:
${eventText || 'No events found'}

RECOVERY DATA:
${recovery || 'No Whoop data available'}

Suggest ONE of these:
- Block focus time if calendar is fragmented
- Move a meeting if recovery is low
- Suggest a break between back-to-back meetings
- Cancel a low-priority recurring meeting

Return JSON:
{
  "suggestion": "Brief description of the optimization",
  "action": "calendar_create|calendar_modify_event|null",
  "params": { "summary": "...", "start": "...", "end": "..." },
  "reasoning": "Why this helps"
}

If no good optimization exists, return: { "suggestion": null }`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_EXTRACTION,
      maxTokens: 300,
      temperature: 0.3,
      userId,
      serviceName: 'scheduling-dept-optimize',
    });

    const text = response?.content || response?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) : { suggestion: null };

    log.info('Schedule optimization generated', {
      userId,
      hasSuggestion: result.suggestion != null,
      action: result.action || 'none',
    });

    return result;
  } catch (err) {
    log.error('suggestScheduleOptimization failed', { userId, error: err.message });
    return { suggestion: null };
  }
}
