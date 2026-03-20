/**
 * Prospective Memory Service — "Remember to Do X When Y Happens"
 * ===============================================================
 * Bridges the gap between passive twin and proactive agent.
 * Stores time-triggered, event-triggered, and condition-triggered
 * future actions that the twin should execute or surface.
 *
 * Checked every 5 minutes by cron for time triggers.
 * Checked on each webhook/observation for condition triggers.
 *
 * Research:
 *   - Kumiho Prospective Memory (arXiv:2603.17244) — 93.3% accuracy
 *   - RMM Prospective Reflection (arXiv:2503.08026)
 *   - CoALA Cognitive Architecture (arXiv:2309.02427)
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ProspectiveMemory');

/**
 * Create a new prospective memory.
 *
 * @param {string} userId
 * @param {string} triggerType - 'time' | 'event' | 'condition'
 * @param {Object} triggerSpec - Trigger specification
 *   time:      { at: '2026-03-24T09:00:00Z' }
 *   event:     { on: 'whoop_recovery_available', platform: 'whoop' }
 *   condition: { description: 'user mentions job search', keywords: ['job', 'career'] }
 * @param {string} action - What to do when triggered
 * @param {string} context - Why this was created
 * @param {Object} options - { priority, expiresAt, source }
 */
export async function createProspective(userId, triggerType, triggerSpec, action, context = '', options = {}) {
  const { priority = 'medium', expiresAt = null, source = 'conversation' } = options;

  const { data, error } = await supabaseAdmin
    .from('prospective_memories')
    .insert({
      user_id: userId,
      trigger_type: triggerType,
      trigger_spec: triggerSpec,
      action,
      context,
      source,
      priority,
      status: 'pending',
      expires_at: expiresAt
    })
    .select()
    .single();

  if (error) {
    log.error('Failed to create prospective memory', { userId, triggerType, error });
    throw error;
  }

  log.info('Prospective memory created', {
    userId,
    id: data.id,
    triggerType,
    action: action.slice(0, 80),
    priority
  });

  return data;
}

/**
 * Check for due time-triggered memories.
 * Called every 5 minutes by cron.
 *
 * @returns {Array} Triggered memories
 */
export async function checkTimeTriggered() {
  const now = new Date().toISOString();

  // Find pending time triggers that are due
  const { data: dueMemories, error } = await supabaseAdmin
    .from('prospective_memories')
    .select('*')
    .eq('trigger_type', 'time')
    .eq('status', 'pending')
    .lte('trigger_spec->>at', now)
    .limit(100);

  if (error) {
    log.error('Failed to check time triggers', { error });
    return [];
  }

  if (!dueMemories || dueMemories.length === 0) {
    return [];
  }

  // Also expire any past-due memories without trigger
  const { data: expired } = await supabaseAdmin
    .from('prospective_memories')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .not('expires_at', 'is', null)
    .lte('expires_at', now)
    .select('id');

  if (expired?.length > 0) {
    log.info('Expired prospective memories', { count: expired.length });
  }

  // Trigger each due memory
  const triggered = [];
  for (const memory of dueMemories) {
    const result = await triggerMemory(memory);
    if (result) triggered.push(result);
  }

  if (triggered.length > 0) {
    log.info('Time-triggered memories fired', { count: triggered.length });
  }

  return triggered;
}

/**
 * Check condition-triggered memories against new data.
 * Called when new platform data arrives or after observations.
 *
 * @param {string} userId
 * @param {Object} eventData - New data to check conditions against
 *   { platform: 'whoop', data: { recovery: 45 }, keywords: ['tired', 'exhausted'] }
 */
export async function checkConditionTriggered(userId, eventData) {
  const { data: pendingConditions, error } = await supabaseAdmin
    .from('prospective_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('trigger_type', 'condition')
    .eq('status', 'pending');

  if (error || !pendingConditions?.length) return [];

  const triggered = [];

  for (const memory of pendingConditions) {
    const spec = memory.trigger_spec;

    // Keyword matching
    if (spec.keywords && eventData.keywords) {
      const matchedKeywords = spec.keywords.filter(kw =>
        eventData.keywords.some(ek =>
          ek.toLowerCase().includes(kw.toLowerCase())
        )
      );
      if (matchedKeywords.length > 0) {
        const result = await triggerMemory(memory);
        if (result) triggered.push(result);
        continue;
      }
    }

    // Platform event matching
    if (spec.on && eventData.platform) {
      if (spec.on === `${eventData.platform}_data_available` ||
          spec.platform === eventData.platform) {
        const result = await triggerMemory(memory);
        if (result) triggered.push(result);
        continue;
      }
    }

    // Numeric condition matching (e.g., "whoop_recovery < 50")
    if (spec.metric && spec.operator && spec.threshold && eventData.data) {
      const value = eventData.data[spec.metric];
      if (value != null) {
        let conditionMet = false;
        switch (spec.operator) {
          case '<': conditionMet = value < spec.threshold; break;
          case '>': conditionMet = value > spec.threshold; break;
          case '<=': conditionMet = value <= spec.threshold; break;
          case '>=': conditionMet = value >= spec.threshold; break;
          case '==': conditionMet = value === spec.threshold; break;
        }
        if (conditionMet) {
          const result = await triggerMemory(memory);
          if (result) triggered.push(result);
        }
      }
    }
  }

  if (triggered.length > 0) {
    log.info('Condition-triggered memories fired', { userId, count: triggered.length });
  }

  return triggered;
}

/**
 * Trigger a prospective memory — mark as triggered and inject as proactive insight.
 */
export async function triggerMemory(memory) {
  try {
    // Update status
    await supabaseAdmin
      .from('prospective_memories')
      .update({
        status: 'triggered',
        triggered_at: new Date().toISOString()
      })
      .eq('id', memory.id);

    // Inject as a high-priority proactive insight
    await supabaseAdmin
      .from('proactive_insights')
      .insert({
        user_id: memory.user_id,
        insight: memory.action,
        urgency: memory.priority === 'high' ? 'high' : 'medium',
        category: 'reminder',
        source_type: 'prospective_memory',
        delivered: false
      });

    // Log agent event
    await supabaseAdmin
      .from('agent_events')
      .insert({
        user_id: memory.user_id,
        event_type: 'prospective_memory_triggered',
        event_data: {
          memory_id: memory.id,
          trigger_type: memory.trigger_type,
          action: memory.action,
          context: memory.context
        },
        source: 'prospective_memory'
      });

    log.info('Prospective memory triggered', {
      userId: memory.user_id,
      memoryId: memory.id,
      action: memory.action.slice(0, 80)
    });

    return memory;
  } catch (err) {
    log.error('Failed to trigger prospective memory', {
      memoryId: memory.id,
      error: err.message
    });
    return null;
  }
}

/**
 * Get pending prospective memories for a user.
 */
export async function getPendingMemories(userId) {
  const { data, error } = await supabaseAdmin
    .from('prospective_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to fetch pending memories', { userId, error });
    return [];
  }

  return data || [];
}

/**
 * Mark a triggered memory as completed (user acknowledged/acted on it).
 */
export async function completeMemory(memoryId) {
  const { error } = await supabaseAdmin
    .from('prospective_memories')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', memoryId);

  if (error) {
    log.error('Failed to complete prospective memory', { memoryId, error });
  }
}

/**
 * Cancel a pending prospective memory.
 */
export async function cancelMemory(memoryId) {
  const { error } = await supabaseAdmin
    .from('prospective_memories')
    .update({ status: 'cancelled' })
    .eq('id', memoryId);

  if (error) {
    log.error('Failed to cancel prospective memory', { memoryId, error });
  }
}
