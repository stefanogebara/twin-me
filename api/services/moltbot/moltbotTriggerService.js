/**
 * Moltbot Proactive Trigger Service
 *
 * Implements event-driven proactive automation:
 *
 * Event Flow:
 * Platform Event → Event Detector → Pattern Matcher → Action Dispatcher
 *      ↓                ↓                 ↓                  ↓
 *   Spotify play   "Past bedtime?"   "Night owl"      "Log social event"
 *   Whoop HR spike "Elevated HR?"    "Not exercising" "Suggest cooldown"
 *   Calendar gap   "Free time?"      "Recharge pref"  "Recommend music"
 *
 * Research basis:
 * - MIT Technology Review: "Enabling real-time responsiveness with EDA" (Oct 2025)
 * - Event-driven architecture for proactive bots (Medium)
 * - Apache Kafka + Flink patterns for agentic AI
 */

import { getMoltbotClient } from './moltbotClient.js';
import { getMemoryService } from './moltbotMemoryService.js';
import config from '../../config/moltbotConfig.js';
import { createClient } from '@supabase/supabase-js';

// Supabase client for database operations
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Condition evaluator functions
 */
const conditionEvaluators = {
  /**
   * Time-based conditions
   */
  time: async (condition, context) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = currentHour * 60 + now.getMinutes();

    switch (condition.operator) {
      case 'after': {
        const targetTime = await resolveTimeValue(condition.value, context);
        return currentMinutes > targetTime;
      }
      case 'before': {
        const targetTime = await resolveTimeValue(condition.value, context);
        return currentMinutes < targetTime;
      }
      case 'between': {
        const [startTime, endTime] = await Promise.all([
          resolveTimeValue(condition.value[0], context),
          resolveTimeValue(condition.value[1], context)
        ]);
        return currentMinutes >= startTime && currentMinutes <= endTime;
      }
      default:
        return false;
    }
  },

  /**
   * Metric-based conditions (e.g., heart rate > 85)
   */
  metric: async (condition, context) => {
    const { platform, field, operator, value } = condition;

    // Get current metric from context or fetch from memory
    let currentValue = context.metrics?.[platform]?.[field];

    if (currentValue === undefined && context.memoryService) {
      // Try to get from recent events
      const recentEvents = await context.memoryService.getRecentEvents({
        platform,
        limit: 1
      });
      currentValue = recentEvents?.[0]?.data?.[field];
    }

    if (currentValue === undefined) {
      return false;
    }

    const targetValue = await resolveMetricValue(value, context);
    return evaluateOperator(currentValue, operator, targetValue);
  },

  /**
   * Pattern-based conditions (e.g., "not_exercising")
   */
  pattern: async (condition, context) => {
    const { check } = condition;

    switch (check) {
      case 'not_exercising':
        return !context.currentActivity?.includes('workout');
      case 'not_in_workout':
        return !context.currentActivity?.includes('workout');
      case 'is_working':
        return context.currentActivity?.includes('work') || isWorkingHours();
      case 'is_relaxing':
        return context.currentActivity?.includes('relax') || !isWorkingHours();
      case 'low_recovery':
        return (context.metrics?.whoop?.recovery || 100) < 40;
      case 'high_recovery':
        return (context.metrics?.whoop?.recovery || 0) > 70;
      default:
        // Check procedural memory for pattern
        if (context.memoryService) {
          const pattern = await context.memoryService.getProcedure(check);
          return pattern !== null;
        }
        return false;
    }
  },

  /**
   * Event-based conditions (e.g., "spotify track_played")
   */
  event: async (condition, context) => {
    const { platform, event: eventType } = condition;
    return context.platform === platform && context.eventType === eventType;
  },

  /**
   * Context-based conditions
   */
  context: async (condition, context) => {
    const { check, field, operator, value } = condition;

    if (check) {
      // Named context checks
      return conditionEvaluators.pattern(condition, context);
    }

    if (field) {
      // Field comparison
      const contextValue = getNestedValue(context, field);
      return evaluateOperator(contextValue, operator, value);
    }

    return false;
  }
};

/**
 * Action executors
 */
const actionExecutors = {
  /**
   * Log an event/inference
   */
  log_event: async (action, context, trigger) => {
    const { category, inference, event: eventName } = action;

    await context.memoryService.storeEvent({
      platform: 'inference',
      type: eventName || inference,
      data: {
        category,
        inference,
        triggeredBy: trigger.name,
        confidence: trigger.correlation_strength || 0.5,
        timestamp: new Date().toISOString()
      }
    });

    return { success: true, action: 'log_event', inference };
  },

  /**
   * Log an inference (alias for log_event)
   */
  log_inference: async (action, context, trigger) => {
    return actionExecutors.log_event(action, context, trigger);
  },

  /**
   * Update a behavioral pattern
   */
  update_pattern: async (action, context, trigger) => {
    const { layer, pattern } = action;

    await getSupabaseClient()
      .rpc('upsert_moltbot_pattern', {
        p_user_id: context.userId,
        p_layer: layer,
        p_category: action.category || 'general',
        p_name: pattern,
        p_pattern_type: action.pattern_type || 'trigger',
        p_description: action.description || `Detected by trigger: ${trigger.name}`,
        p_pattern_data: { source: 'trigger', trigger_id: trigger.id },
        p_evidence: [{ event_id: context.eventId, timestamp: new Date().toISOString() }],
        p_confidence: trigger.correlation_strength || 0.5
      });

    return { success: true, action: 'update_pattern', pattern };
  },

  /**
   * Update a personality trait
   */
  update_trait: async (action, context, trigger) => {
    const { trait, direction, weight } = action;

    // Get current cluster personality
    const cluster = config.clusters[context.cluster] ? context.cluster : 'personal';

    const { data: existing } = await getSupabaseClient()
      .from('cluster_personalities')
      .select('*')
      .eq('user_id', context.userId)
      .eq('cluster', cluster)
      .single();

    const currentValue = existing?.[trait] || 50;
    const adjustment = direction === '+' ? weight * 100 : -weight * 100;
    const newValue = Math.max(0, Math.min(100, currentValue + adjustment));

    await getSupabaseClient()
      .from('cluster_personalities')
      .upsert({
        user_id: context.userId,
        cluster,
        [trait]: newValue,
        data_points_count: (existing?.data_points_count || 0) + 1,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,cluster' });

    return { success: true, action: 'update_trait', trait, oldValue: currentValue, newValue };
  },

  /**
   * Send a notification
   */
  notify: async (action, context, trigger) => {
    const { message, type = 'info' } = action;

    // Store notification in memory for retrieval
    await context.memoryService.storeEvent({
      platform: 'system',
      type: 'notification',
      data: {
        message,
        type,
        triggeredBy: trigger.name,
        timestamp: new Date().toISOString()
      }
    });

    // TODO: Implement actual notification delivery (push, email, etc.)

    return { success: true, action: 'notify', message };
  },

  /**
   * Create a suggestion
   */
  suggest: async (action, context, trigger) => {
    const { message, suggestion_type = 'general' } = action;

    await context.memoryService.storeEvent({
      platform: 'system',
      type: 'suggestion',
      data: {
        message,
        suggestion_type,
        triggeredBy: trigger.name,
        actionable: true,
        timestamp: new Date().toISOString()
      }
    });

    return { success: true, action: 'suggest', message };
  },

  /**
   * Analyze track audio features
   */
  analyze_track: async (action, context, trigger) => {
    const { extract } = action;
    const trackData = context.eventData;

    if (!trackData) {
      return { success: false, action: 'analyze_track', error: 'No track data' };
    }

    const extracted = {};
    for (const feature of extract) {
      extracted[feature] = trackData[feature] || trackData.audio_features?.[feature];
    }

    // Store as semantic fact
    await context.memoryService.learnFact('music_analysis', {
      key: `track_${trackData.track_id || Date.now()}`,
      ...extracted,
      timestamp: new Date().toISOString()
    }, 0.6);

    return { success: true, action: 'analyze_track', extracted };
  },

  /**
   * Log mood from music
   */
  log_mood: async (action, context, trigger) => {
    const { source } = action;
    const trackData = context.eventData;

    const mood = inferMoodFromTrack(trackData);

    await context.memoryService.learnFact('mood_tracking', {
      key: `mood_${source}_${new Date().toISOString().split('T')[0]}`,
      mood,
      source,
      confidence: 0.5,
      timestamp: new Date().toISOString()
    }, 0.5);

    return { success: true, action: 'log_mood', mood };
  }
};

class MoltbotTriggerService {
  constructor(userId) {
    if (!userId) {
      throw new Error('userId is required for MoltbotTriggerService');
    }
    this.userId = userId;
    this.client = getMoltbotClient(userId);
    this.memoryService = getMemoryService(userId);
    this.triggerCache = new Map();
    this.cooldowns = new Map();
  }

  /**
   * Process an incoming platform event
   * Main entry point for trigger evaluation
   */
  async processEvent(platform, eventType, eventData) {
    const startTime = Date.now();
    console.log(`[Trigger] Processing event: ${platform}/${eventType} for user ${this.userId}`);

    try {
      // 1. Store the event in database
      const eventId = await this.storeRealtimeEvent(platform, eventType, eventData);

      // 2. Get user's active triggers
      const triggers = await this.getUserTriggers();

      // 3. Build evaluation context
      const context = await this.buildContext(platform, eventType, eventData, eventId);

      // 4. Evaluate each trigger
      const results = {
        eventId,
        matchedTriggers: [],
        actionsExecuted: [],
        skippedTriggers: []
      };

      for (const trigger of triggers) {
        // Check cooldown
        if (this.isInCooldown(trigger)) {
          results.skippedTriggers.push({ id: trigger.id, reason: 'cooldown' });
          continue;
        }

        // Evaluate conditions
        const conditionsMet = await this.evaluateConditions(trigger.conditions, context);

        if (conditionsMet) {
          results.matchedTriggers.push(trigger.id);

          // Execute actions
          const actionResults = await this.executeActions(trigger.actions, context, trigger);
          results.actionsExecuted.push(...actionResults);

          // Update trigger state
          await this.markTriggered(trigger);

          // Log execution
          await this.logExecution(trigger, eventId, true, actionResults);
        }
      }

      // 5. Update event with results
      const processingDuration = Date.now() - startTime;
      await this.updateRealtimeEvent(eventId, results.matchedTriggers, results.actionsExecuted, processingDuration);

      console.log(`[Trigger] Processed event in ${processingDuration}ms. Matched: ${results.matchedTriggers.length}`);
      return results;

    } catch (error) {
      console.error(`[Trigger] Error processing event:`, error);
      throw error;
    }
  }

  /**
   * Store event in realtime_events table
   */
  async storeRealtimeEvent(platform, eventType, eventData) {
    const { data, error } = await getSupabaseClient()
      .from('realtime_events')
      .insert({
        user_id: this.userId,
        platform,
        event_type: eventType,
        event_data: eventData,
        context: this.buildEventContext(),
        occurred_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  /**
   * Update event after processing
   */
  async updateRealtimeEvent(eventId, matchedTriggers, actionsTaken, durationMs) {
    await getSupabaseClient()
      .from('realtime_events')
      .update({
        matched_triggers: matchedTriggers,
        actions_taken: actionsTaken,
        processed_at: new Date().toISOString(),
        processing_duration_ms: durationMs
      })
      .eq('id', eventId);
  }

  /**
   * Get user's active triggers
   */
  async getUserTriggers() {
    // Check cache
    const cacheKey = `triggers_${this.userId}`;
    if (this.triggerCache.has(cacheKey)) {
      const cached = this.triggerCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
        return cached.triggers;
      }
    }

    const { data: triggers, error } = await getSupabaseClient()
      .from('proactive_triggers')
      .select('*')
      .eq('user_id', this.userId)
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (error) throw error;

    // Update cache
    this.triggerCache.set(cacheKey, {
      triggers: triggers || [],
      timestamp: Date.now()
    });

    return triggers || [];
  }

  /**
   * Build evaluation context
   */
  async buildContext(platform, eventType, eventData, eventId) {
    // Get user baselines from memory
    const baselines = await this.memoryService.queryFacts('baseline_metrics')
      .catch(() => []);

    // Get current metrics (recent events)
    const recentWhoop = await this.memoryService.getRecentEvents({
      platform: 'whoop',
      limit: 1
    }).catch(() => []);

    const metrics = {
      whoop: recentWhoop?.[0]?.data || {}
    };

    // Determine cluster
    const cluster = config.clusters[this.getPlatformCluster(platform)] || 'personal';

    return {
      userId: this.userId,
      eventId,
      platform,
      eventType,
      eventData,
      metrics,
      baselines: this.baselinesToObject(baselines),
      cluster,
      currentActivity: this.inferCurrentActivity(eventType, eventData),
      memoryService: this.memoryService,
      timestamp: new Date()
    };
  }

  /**
   * Evaluate all conditions for a trigger
   */
  async evaluateConditions(conditions, context) {
    if (!conditions || conditions.length === 0) {
      return false; // No conditions = never fires
    }

    for (const condition of conditions) {
      const evaluator = conditionEvaluators[condition.type];
      if (!evaluator) {
        console.warn(`[Trigger] Unknown condition type: ${condition.type}`);
        return false;
      }

      const result = await evaluator(condition, context);
      if (!result) {
        return false; // All conditions must be true
      }
    }

    return true;
  }

  /**
   * Execute all actions for a matched trigger
   */
  async executeActions(actions, context, trigger) {
    const results = [];

    for (const action of actions) {
      const executor = actionExecutors[action.type];
      if (!executor) {
        console.warn(`[Trigger] Unknown action type: ${action.type}`);
        results.push({ type: action.type, success: false, error: 'Unknown action type' });
        continue;
      }

      try {
        const result = await executor(action, context, trigger);
        results.push({ type: action.type, ...result });
      } catch (error) {
        console.error(`[Trigger] Action execution error:`, error);
        results.push({ type: action.type, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Check if trigger is in cooldown
   */
  isInCooldown(trigger) {
    const key = `${this.userId}_${trigger.id}`;
    const lastTriggered = this.cooldowns.get(key) || trigger.last_triggered_at;

    if (!lastTriggered) return false;

    const cooldownMs = (trigger.cooldown_minutes || 60) * 60 * 1000;
    const elapsed = Date.now() - new Date(lastTriggered).getTime();

    return elapsed < cooldownMs;
  }

  /**
   * Mark trigger as triggered (update cooldown)
   */
  async markTriggered(trigger) {
    const key = `${this.userId}_${trigger.id}`;
    const now = new Date().toISOString();

    this.cooldowns.set(key, now);

    await getSupabaseClient()
      .from('proactive_triggers')
      .update({
        last_triggered_at: now,
        trigger_count: (trigger.trigger_count || 0) + 1
      })
      .eq('id', trigger.id);
  }

  /**
   * Log trigger execution
   */
  async logExecution(trigger, eventId, success, actionResults) {
    await getSupabaseClient()
      .from('trigger_executions')
      .insert({
        user_id: this.userId,
        trigger_id: trigger.id,
        event_id: eventId,
        actions_executed: actionResults,
        execution_status: success ? 'success' : 'failed',
        executed_at: new Date().toISOString()
      });
  }

  /**
   * Create a new trigger for the user
   */
  async createTrigger(triggerConfig) {
    const { data, error } = await getSupabaseClient()
      .from('proactive_triggers')
      .insert({
        user_id: this.userId,
        ...triggerConfig
      })
      .select()
      .single();

    if (error) throw error;

    // Invalidate cache
    this.triggerCache.delete(`triggers_${this.userId}`);

    return data;
  }

  /**
   * Update a trigger
   */
  async updateTrigger(triggerId, updates) {
    const { data, error } = await getSupabaseClient()
      .from('proactive_triggers')
      .update(updates)
      .eq('id', triggerId)
      .eq('user_id', this.userId)
      .select()
      .single();

    if (error) throw error;

    // Invalidate cache
    this.triggerCache.delete(`triggers_${this.userId}`);

    return data;
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(triggerId) {
    const { error } = await getSupabaseClient()
      .from('proactive_triggers')
      .delete()
      .eq('id', triggerId)
      .eq('user_id', this.userId);

    if (error) throw error;

    // Invalidate cache
    this.triggerCache.delete(`triggers_${this.userId}`);

    return { success: true };
  }

  /**
   * Install default trigger templates for a user
   */
  async installDefaultTriggers() {
    const templates = getDefaultTriggerTemplates();

    for (const template of templates) {
      await this.createTrigger({
        ...template,
        is_system: true
      }).catch(err => {
        // Ignore duplicate errors
        if (!err.message.includes('duplicate')) {
          throw err;
        }
      });
    }

    return { installed: templates.length };
  }

  // Helper methods
  getPlatformCluster(platform) {
    for (const [clusterId, cluster] of Object.entries(config.clusters)) {
      if (cluster.platforms.includes(platform.toLowerCase())) {
        return clusterId;
      }
    }
    return 'personal';
  }

  buildEventContext() {
    const now = new Date();
    return {
      time_of_day: getTimeOfDay(now.getHours()),
      day_of_week: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()],
      is_weekend: now.getDay() === 0 || now.getDay() === 6
    };
  }

  baselinesToObject(baselines) {
    const obj = {};
    for (const b of baselines || []) {
      if (b.fact?.key) {
        obj[b.fact.key] = b.fact;
      }
    }
    return obj;
  }

  inferCurrentActivity(eventType, eventData) {
    if (eventType.includes('workout')) return 'workout';
    if (eventType.includes('sleep')) return 'sleep';
    if (eventType.includes('meeting')) return 'work';
    if (eventType.includes('track_played')) return 'music';
    return 'unknown';
  }
}

// ============================================
// Helper Functions
// ============================================

async function resolveTimeValue(value, context) {
  if (typeof value === 'number') return value;

  // Handle "user.typical_bedtime" style references
  if (typeof value === 'string') {
    if (value.startsWith('user.')) {
      const key = value.replace('user.', '');
      const baseline = context.baselines?.[key];
      if (baseline) {
        return timeStringToMinutes(baseline.value || baseline);
      }
    }
    // Parse time string "22:00"
    return timeStringToMinutes(value);
  }

  return 0;
}

async function resolveMetricValue(value, context) {
  if (typeof value === 'number') return value;

  if (typeof value === 'string') {
    // Handle expressions like "user.resting_hr * 1.3"
    if (value.includes('user.')) {
      const match = value.match(/user\.(\w+)\s*\*?\s*([\d.]*)/);
      if (match) {
        const [, key, multiplier] = match;
        const baseline = context.baselines?.[key]?.value || context.baselines?.[key] || 0;
        return baseline * (parseFloat(multiplier) || 1);
      }
    }
    return parseFloat(value) || 0;
  }

  return value;
}

function evaluateOperator(left, operator, right) {
  switch (operator) {
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '==':
    case '=': return left === right;
    case '!=': return left !== right;
    default: return false;
  }
}

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function isWorkingHours() {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function inferMoodFromTrack(trackData) {
  if (!trackData) return 'neutral';

  const valence = trackData.valence || trackData.audio_features?.valence || 0.5;
  const energy = trackData.energy || trackData.audio_features?.energy || 0.5;

  if (valence > 0.6 && energy > 0.6) return 'energetic_happy';
  if (valence > 0.6 && energy <= 0.6) return 'calm_happy';
  if (valence <= 0.4 && energy > 0.6) return 'tense';
  if (valence <= 0.4 && energy <= 0.4) return 'melancholic';
  return 'neutral';
}

/**
 * Default trigger templates
 */
function getDefaultTriggerTemplates() {
  return [
    {
      name: 'late_night_elevated_hr',
      description: 'Detects when user is up late with elevated heart rate (social activity)',
      conditions: [
        { type: 'time', operator: 'after', value: 'user.typical_bedtime' },
        { type: 'metric', platform: 'whoop', field: 'heart_rate', operator: '>', value: 85 },
        { type: 'pattern', check: 'not_in_workout' }
      ],
      actions: [
        { type: 'log_inference', category: 'social', event: 'late_night_activity' },
        { type: 'update_trait', trait: 'extraversion', direction: '+', weight: 0.1 }
      ],
      research_basis: 'Elevated HR + late hours correlates with social engagement (r=0.42)',
      correlation_strength: 0.42,
      cooldown_minutes: 120,
      priority: 60
    },
    {
      name: 'morning_music_mood',
      description: 'Infer morning mood from first songs played',
      conditions: [
        { type: 'time', operator: 'between', value: ['06:00', '10:00'] },
        { type: 'event', platform: 'spotify', event: 'track_played' }
      ],
      actions: [
        { type: 'analyze_track', extract: ['valence', 'energy', 'tempo'] },
        { type: 'log_mood', source: 'morning_music' }
      ],
      research_basis: 'Morning music valence predicts daily affect (r=0.38)',
      correlation_strength: 0.38,
      cooldown_minutes: 30,
      priority: 50
    },
    {
      name: 'recovery_mismatch',
      description: 'Detect when user ignores low recovery',
      conditions: [
        { type: 'metric', platform: 'whoop', field: 'recovery', operator: '<', value: 40 },
        { type: 'pattern', check: 'is_working' }
      ],
      actions: [
        { type: 'suggest', message: 'Your recovery is low today. Consider taking it easy.' },
        { type: 'update_pattern', layer: 'daily', pattern: 'recovery_ignorer', category: 'health' }
      ],
      cooldown_minutes: 240,
      priority: 70
    }
  ];
}

/**
 * Factory function
 */
export function getTriggerService(userId) {
  return new MoltbotTriggerService(userId);
}

export { MoltbotTriggerService, getDefaultTriggerTemplates };
export default MoltbotTriggerService;
