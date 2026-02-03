/**
 * Deviation Detector Service
 *
 * Layer 3 of the Pattern Learning System
 * Detects significant deviations from personal baselines
 *
 * Key functions:
 * - processNewEvent(userId, event) - Check new events against baselines
 * - extractMetrics(event) - Pull numeric metrics from event data
 * - recordDeviation(userId, deviation) - Store significant deviations
 */

import { supabaseAdmin } from './database.js';
import baselineEngine from './baselineEngine.js';

// Minimum z-score threshold for recording deviations
const MIN_Z_SCORE_THRESHOLD = 1.0;

// Cooldown period to avoid duplicate deviations for same metric (in minutes)
const DEVIATION_COOLDOWN_MINUTES = 60;

/**
 * Metric extraction rules by platform and event type
 */
const METRIC_EXTRACTION_RULES = {
  whoop: {
    recovery_logged: {
      recovery: (event) => event.event_data?.recovery?.score,
      hrv: (event) => event.event_data?.recovery?.hrv,
      rhr: (event) => event.event_data?.recovery?.restingHeartRate
    },
    strain_logged: {
      strain: (event) => event.event_data?.strain?.score
    },
    sleep_logged: {
      sleep_hours: (event) => event.event_data?.sleep?.totalSleepHours,
      sleep_efficiency: (event) => event.event_data?.sleep?.efficiency
    },
    workout_logged: {
      workout_strain: (event) => event.event_data?.workout?.strain,
      workout_calories: (event) => event.event_data?.workout?.calories
    }
  },
  spotify: {
    track_played: {
      music_valence: (event) => event.event_data?.track?.valence,
      music_energy: (event) => event.event_data?.track?.energy,
      music_tempo: (event) => event.event_data?.track?.tempo,
      music_danceability: (event) => event.event_data?.track?.danceability,
      listening_duration_ms: (event) => event.event_data?.duration_ms
    }
  },
  calendar: {
    daily_summary: {
      meeting_count: (event) => event.event_data?.daily_meeting_count,
      meeting_hours: (event) => event.event_data?.daily_meeting_hours,
      focus_time_hours: (event) => event.event_data?.daily_focus_hours
    }
  },
  discord: {
    daily_summary: {
      messages_sent: (event) => event.event_data?.daily_messages,
      voice_minutes: (event) => event.event_data?.daily_voice_minutes
    }
  },
  github: {
    daily_summary: {
      commits: (event) => event.event_data?.daily_commits,
      code_additions: (event) => event.event_data?.daily_additions,
      code_deletions: (event) => event.event_data?.daily_deletions
    }
  }
};

/**
 * Extract all available metrics from an event
 * @param {Object} event - Raw behavioral event
 * @returns {Object[]} - Array of { metricName, value } pairs
 */
export function extractMetrics(event) {
  const metrics = [];
  const { platform, event_type } = event;

  const platformRules = METRIC_EXTRACTION_RULES[platform];
  if (!platformRules) return metrics;

  const typeRules = platformRules[event_type];
  if (!typeRules) return metrics;

  for (const [metricName, extractFn] of Object.entries(typeRules)) {
    try {
      const value = extractFn(event);
      if (value !== null && value !== undefined && typeof value === 'number' && !isNaN(value)) {
        metrics.push({ metricName, value });
      }
    } catch (err) {
      console.error(`Error extracting metric ${metricName}:`, err);
    }
  }

  return metrics;
}

/**
 * Check if a deviation was recently recorded for this metric
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @returns {boolean} - True if still in cooldown
 */
async function isInCooldown(userId, metricName) {
  const cooldownTime = new Date();
  cooldownTime.setMinutes(cooldownTime.getMinutes() - DEVIATION_COOLDOWN_MINUTES);

  const { data } = await supabaseAdmin
    .from('pl_behavioral_deviations')
    .select('id')
    .eq('user_id', userId)
    .eq('metric_name', metricName)
    .gte('detected_at', cooldownTime.toISOString())
    .limit(1);

  return data && data.length > 0;
}

/**
 * Record a deviation to the database
 * @param {string} userId - User ID
 * @param {Object} deviation - Deviation data
 * @returns {Object} - Inserted deviation record
 */
export async function recordDeviation(userId, deviation) {
  const { data, error } = await supabaseAdmin
    .from('pl_behavioral_deviations')
    .insert({
      user_id: userId,
      metric_name: deviation.metricName,
      platform: deviation.platform,
      observed_value: deviation.value,
      baseline_mean: deviation.baseline.mean,
      baseline_std_dev: deviation.baseline.std_dev,
      z_score: deviation.zScore,
      direction: deviation.direction,
      significance: deviation.significance,
      raw_event_id: deviation.rawEventId || null,
      context: deviation.context || null
    })
    .select()
    .single();

  if (error) {
    console.error('Error recording deviation:', error);
    return null;
  }

  return data;
}

/**
 * Process a new event and check for deviations
 * @param {string} userId - User ID
 * @param {Object} event - Raw behavioral event
 * @returns {Object} - Processing results with detected deviations
 */
export async function processNewEvent(userId, event) {
  const result = {
    processed: true,
    metricsChecked: 0,
    deviationsDetected: [],
    errors: []
  };

  // First, store the raw event if not already stored
  let rawEventId = event.id;
  if (!rawEventId) {
    const { data: storedEvent, error } = await supabaseAdmin
      .from('pl_raw_behavioral_events')
      .insert({
        user_id: userId,
        platform: event.platform,
        event_type: event.event_type,
        event_data: event.event_data,
        event_timestamp: event.event_timestamp || new Date().toISOString(),
        context: event.context || buildContext(event)
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error storing raw event:', error);
      result.errors.push({ type: 'store_event', error: error.message });
    } else {
      rawEventId = storedEvent.id;
    }
  }

  // Extract metrics from event
  const metrics = extractMetrics(event);
  result.metricsChecked = metrics.length;

  // Check each metric against baseline
  for (const { metricName, value } of metrics) {
    try {
      // Check cooldown
      if (await isInCooldown(userId, metricName)) {
        continue;
      }

      // Check for deviation
      const deviationCheck = await baselineEngine.checkDeviation(
        userId,
        metricName,
        value
      );

      if (deviationCheck.hasDeviation) {
        // Record the deviation
        const deviation = await recordDeviation(userId, {
          metricName,
          platform: event.platform,
          value,
          zScore: deviationCheck.zScore,
          direction: deviationCheck.direction,
          significance: deviationCheck.significance,
          baseline: deviationCheck.baseline,
          rawEventId,
          context: event.context || buildContext(event)
        });

        if (deviation) {
          result.deviationsDetected.push({
            id: deviation.id,
            metric: metricName,
            value,
            zScore: deviationCheck.zScore,
            significance: deviationCheck.significance,
            direction: deviationCheck.direction
          });
        }
      }
    } catch (err) {
      console.error(`Error checking deviation for ${metricName}:`, err);
      result.errors.push({ type: 'check_deviation', metric: metricName, error: err.message });
    }
  }

  return result;
}

/**
 * Build context object from event
 * @param {Object} event - Raw behavioral event
 * @returns {Object} - Context object
 */
function buildContext(event) {
  const timestamp = new Date(event.event_timestamp || Date.now());
  const hour = timestamp.getHours();

  let timeOfDay = 'night';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';

  return {
    day_of_week: timestamp.toLocaleDateString('en-US', { weekday: 'lowercase' }),
    time_of_day: timeOfDay,
    hour,
    timestamp: timestamp.toISOString()
  };
}

/**
 * Get recent deviations for a user
 * @param {string} userId - User ID
 * @param {number} limit - Max number to return (default: 20)
 * @param {string} significance - Filter by significance level (optional)
 * @returns {Object[]} - Array of deviations
 */
export async function getRecentDeviations(userId, limit = 20, significance = null) {
  let query = supabaseAdmin
    .from('pl_behavioral_deviations')
    .select('*')
    .eq('user_id', userId)
    .order('detected_at', { ascending: false })
    .limit(limit);

  if (significance) {
    query = query.eq('significance', significance);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching deviations:', error);
    return [];
  }

  return data || [];
}

/**
 * Get deviation statistics for a user
 * @param {string} userId - User ID
 * @param {number} days - Number of days to analyze (default: 30)
 * @returns {Object} - Deviation statistics
 */
export async function getDeviationStats(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabaseAdmin
    .from('pl_behavioral_deviations')
    .select('metric_name, significance, direction')
    .eq('user_id', userId)
    .gte('detected_at', startDate.toISOString());

  if (error || !data) {
    return { totalDeviations: 0, byMetric: {}, bySignificance: {}, byDirection: {} };
  }

  const stats = {
    totalDeviations: data.length,
    byMetric: {},
    bySignificance: { notable: 0, significant: 0, extreme: 0 },
    byDirection: { above: 0, below: 0 }
  };

  for (const deviation of data) {
    // By metric
    if (!stats.byMetric[deviation.metric_name]) {
      stats.byMetric[deviation.metric_name] = 0;
    }
    stats.byMetric[deviation.metric_name]++;

    // By significance
    if (stats.bySignificance[deviation.significance] !== undefined) {
      stats.bySignificance[deviation.significance]++;
    }

    // By direction
    if (stats.byDirection[deviation.direction] !== undefined) {
      stats.byDirection[deviation.direction]++;
    }
  }

  return stats;
}

/**
 * Find co-occurring deviations (deviations that happen together)
 * @param {string} userId - User ID
 * @param {number} windowMinutes - Time window to consider "together" (default: 120)
 * @returns {Object[]} - Array of co-occurrence patterns
 */
export async function findCoOccurringDeviations(userId, windowMinutes = 120) {
  const { data: deviations, error } = await supabaseAdmin
    .from('pl_behavioral_deviations')
    .select('*')
    .eq('user_id', userId)
    .order('detected_at', { ascending: true });

  if (error || !deviations || deviations.length < 2) {
    return [];
  }

  const coOccurrences = {};
  const windowMs = windowMinutes * 60 * 1000;

  // Find pairs of deviations within the time window
  for (let i = 0; i < deviations.length; i++) {
    const d1 = deviations[i];
    const t1 = new Date(d1.detected_at).getTime();

    for (let j = i + 1; j < deviations.length; j++) {
      const d2 = deviations[j];
      const t2 = new Date(d2.detected_at).getTime();

      // Stop if outside window
      if (t2 - t1 > windowMs) break;

      // Skip same metric
      if (d1.metric_name === d2.metric_name) continue;

      // Create pair key (sorted alphabetically)
      const pair = [d1.metric_name, d2.metric_name].sort().join('|');

      if (!coOccurrences[pair]) {
        coOccurrences[pair] = {
          metric_a: pair.split('|')[0],
          metric_b: pair.split('|')[1],
          count: 0,
          examples: []
        };
      }

      coOccurrences[pair].count++;
      if (coOccurrences[pair].examples.length < 3) {
        coOccurrences[pair].examples.push({
          time: d1.detected_at,
          deviation_a: { value: d1.observed_value, zScore: d1.z_score },
          deviation_b: { value: d2.observed_value, zScore: d2.z_score }
        });
      }
    }
  }

  // Convert to array and filter by minimum occurrences
  return Object.values(coOccurrences)
    .filter(co => co.count >= 3)
    .sort((a, b) => b.count - a.count);
}

/**
 * Process batch of events (for bulk import)
 * @param {string} userId - User ID
 * @param {Object[]} events - Array of events
 * @returns {Object} - Batch processing results
 */
export async function processBatchEvents(userId, events) {
  const results = {
    processed: 0,
    deviationsFound: 0,
    errors: 0
  };

  for (const event of events) {
    try {
      const result = await processNewEvent(userId, event);
      results.processed++;
      results.deviationsFound += result.deviationsDetected.length;
    } catch (err) {
      console.error('Error processing event:', err);
      results.errors++;
    }
  }

  return results;
}

export default {
  extractMetrics,
  processNewEvent,
  recordDeviation,
  getRecentDeviations,
  getDeviationStats,
  findCoOccurringDeviations,
  processBatchEvents,
  METRIC_EXTRACTION_RULES
};
