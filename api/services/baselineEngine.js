/**
 * Baseline Engine Service
 *
 * Layer 2 of the Pattern Learning System
 * Computes personal rolling statistics for each metric
 *
 * Key functions:
 * - computeBaselines(userId) - Calculate rolling statistics (7/30/90 day windows)
 * - checkDeviation(userId, metric, value) - Return z-score and significance
 * - getBaseline(userId, metric) - Retrieve user's personal baseline
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('BaselineEngine');

// Default windows for baseline computation
const DEFAULT_WINDOWS = [7, 30, 90];

// Metric definitions for extraction from events
const METRIC_DEFINITIONS = {
  // Whoop metrics
  'recovery': { platform: 'whoop', path: 'recovery.score', type: 'numeric' },
  'hrv': { platform: 'whoop', path: 'recovery.hrv', type: 'numeric' },
  'rhr': { platform: 'whoop', path: 'recovery.restingHeartRate', type: 'numeric' },
  'strain': { platform: 'whoop', path: 'strain.score', type: 'numeric' },
  'sleep_hours': { platform: 'whoop', path: 'sleep.totalSleepHours', type: 'numeric' },
  'sleep_efficiency': { platform: 'whoop', path: 'sleep.efficiency', type: 'numeric' },

  // Spotify metrics (with audio features if available, fallback to duration)
  'music_valence': { platform: 'spotify', path: 'track.valence', type: 'numeric' },
  'music_energy': { platform: 'spotify', path: 'track.energy', type: 'numeric' },
  'music_tempo': { platform: 'spotify', path: 'track.tempo', type: 'numeric' },
  'music_danceability': { platform: 'spotify', path: 'track.danceability', type: 'numeric' },
  'track_duration_ms': { platform: 'spotify', path: 'track.durationMs', type: 'numeric' },

  // Calendar metrics - support both 'calendar' and 'google_calendar' platforms
  'meeting_count': { platform: 'google_calendar', path: 'daily_meeting_count', type: 'count' },
  'meeting_hours': { platform: 'google_calendar', path: 'daily_meeting_hours', type: 'numeric' },
  'focus_time_hours': { platform: 'google_calendar', path: 'daily_focus_hours', type: 'numeric' },
  'event_duration_minutes': { platform: 'google_calendar', path: 'event.durationMinutes', type: 'numeric' },
  'event_attendees': { platform: 'google_calendar', path: 'event.attendeeCount', type: 'count' },

  // Discord metrics
  'messages_sent': { platform: 'discord', path: 'daily_messages', type: 'count' },
  'voice_minutes': { platform: 'discord', path: 'daily_voice_minutes', type: 'numeric' },

  // GitHub metrics
  'commits': { platform: 'github', path: 'daily_commits', type: 'count' },
  'code_additions': { platform: 'github', path: 'daily_additions', type: 'count' },
  'code_deletions': { platform: 'github', path: 'daily_deletions', type: 'count' }
};

/**
 * Get value from nested path in object
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] * (upper - index) + sortedArr[upper] * (index - lower);
}

/**
 * Calculate standard deviation
 */
function stdDev(values, mean) {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Compute baselines for a specific metric and window
 */
async function computeMetricBaseline(userId, metricName, platform, windowDays) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - windowDays);

  // Query raw events for this metric
  const { data: events, error } = await supabaseAdmin
    .from('pl_raw_behavioral_events')
    .select('event_data, event_timestamp, context')
    .eq('user_id', userId)
    .eq('platform', platform)
    .gte('event_timestamp', startDate.toISOString())
    .order('event_timestamp', { ascending: true });

  if (error || !events || events.length === 0) {
    return null;
  }

  // Extract metric values
  const metricDef = METRIC_DEFINITIONS[metricName];
  const values = [];
  const dowValues = {}; // Day of week values
  const todValues = { morning: [], afternoon: [], evening: [], night: [] };

  for (const event of events) {
    const value = getNestedValue(event.event_data, metricDef.path);
    if (value !== null && typeof value === 'number' && !isNaN(value)) {
      values.push(value);

      // Track day of week
      const dow = new Date(event.event_timestamp).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      if (!dowValues[dow]) dowValues[dow] = [];
      dowValues[dow].push(value);

      // Track time of day
      const hour = new Date(event.event_timestamp).getHours();
      if (hour >= 5 && hour < 12) todValues.morning.push(value);
      else if (hour >= 12 && hour < 17) todValues.afternoon.push(value);
      else if (hour >= 17 && hour < 21) todValues.evening.push(value);
      else todValues.night.push(value);
    }
  }

  if (values.length < 3) {
    return null; // Not enough data for meaningful baseline
  }

  // Calculate statistics
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = percentile(sorted, 50);
  const std = stdDev(values, mean);

  // Calculate DOW means
  const dowMeans = {};
  for (const [day, dayValues] of Object.entries(dowValues)) {
    if (dayValues.length > 0) {
      dowMeans[day] = dayValues.reduce((a, b) => a + b, 0) / dayValues.length;
    }
  }

  // Calculate TOD means
  const todMeans = {};
  for (const [period, periodValues] of Object.entries(todValues)) {
    if (periodValues.length > 0) {
      todMeans[period] = periodValues.reduce((a, b) => a + b, 0) / periodValues.length;
    }
  }

  return {
    user_id: userId,
    metric_name: metricName,
    platform: platform,
    window_days: windowDays,
    mean,
    median,
    std_dev: std,
    min_value: sorted[0],
    max_value: sorted[sorted.length - 1],
    percentile_25: percentile(sorted, 25),
    percentile_75: percentile(sorted, 75),
    sample_count: values.length,
    dow_means: Object.keys(dowMeans).length > 0 ? dowMeans : null,
    tod_means: Object.keys(todMeans).length > 0 ? todMeans : null,
    last_computed_at: new Date().toISOString()
  };
}

/**
 * Compute all baselines for a user
 * @param {string} userId - User ID
 * @param {number[]} windows - Array of window sizes in days (default: [7, 30, 90])
 * @returns {Object} - Summary of computed baselines
 */
export async function computeBaselines(userId, windows = DEFAULT_WINDOWS) {
  const results = {
    computed: 0,
    failed: 0,
    metrics: []
  };

  // Get unique platforms from user's raw events
  const { data: platforms } = await supabaseAdmin
    .from('pl_raw_behavioral_events')
    .select('platform')
    .eq('user_id', userId)
    .limit(1000);

  const uniquePlatforms = [...new Set((platforms || []).map(p => p.platform))];

  // For each metric definition that matches user's platforms
  for (const [metricName, metricDef] of Object.entries(METRIC_DEFINITIONS)) {
    if (!uniquePlatforms.includes(metricDef.platform)) continue;

    // Compute baseline for each window
    for (const windowDays of windows) {
      try {
        const baseline = await computeMetricBaseline(
          userId,
          metricName,
          metricDef.platform,
          windowDays
        );

        if (baseline) {
          // Upsert baseline
          const { error } = await supabaseAdmin
            .from('pl_user_baselines')
            .upsert(baseline, {
              onConflict: 'user_id,metric_name,platform,window_days'
            });

          if (error) {
            log.error(`Failed to upsert baseline for ${metricName}:`, error);
            results.failed++;
          } else {
            results.computed++;
            if (!results.metrics.includes(metricName)) {
              results.metrics.push(metricName);
            }
          }
        }
      } catch (err) {
        log.error(`Error computing baseline for ${metricName}:`, err);
        results.failed++;
      }
    }
  }

  return results;
}

/**
 * Get baseline for a specific metric
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @param {number} windowDays - Window size (default: 30)
 * @returns {Object|null} - Baseline data or null
 */
export async function getBaseline(userId, metricName, windowDays = 30) {
  const { data, error } = await supabaseAdmin
    .from('pl_user_baselines')
    .select('*')
    .eq('user_id', userId)
    .eq('metric_name', metricName)
    .eq('window_days', windowDays)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get all baselines for a user
 * @param {string} userId - User ID
 * @param {number} windowDays - Window size (optional, returns all if not specified)
 * @returns {Object[]} - Array of baselines
 */
export async function getAllBaselines(userId, windowDays = null) {
  let query = supabaseAdmin
    .from('pl_user_baselines')
    .select('*')
    .eq('user_id', userId);

  if (windowDays) {
    query = query.eq('window_days', windowDays);
  }

  const { data, error } = await query.order('metric_name');

  if (error) {
    log.error('Error fetching baselines:', error);
    return [];
  }

  return data || [];
}

/**
 * Check deviation from baseline
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @param {number} value - Observed value
 * @param {number} windowDays - Window to use for baseline (default: 30)
 * @returns {Object} - Deviation info including z-score and significance
 */
export async function checkDeviation(userId, metricName, value, windowDays = 30) {
  const baseline = await getBaseline(userId, metricName, windowDays);

  if (!baseline || baseline.std_dev === 0 || baseline.sample_count < 5) {
    return {
      hasDeviation: false,
      reason: 'insufficient_baseline',
      value,
      baseline: null
    };
  }

  // Calculate z-score
  const zScore = (value - baseline.mean) / baseline.std_dev;
  const absZ = Math.abs(zScore);

  // Determine significance
  let significance = 'normal';
  if (absZ >= 3) significance = 'extreme';
  else if (absZ >= 2) significance = 'significant';
  else if (absZ >= 1) significance = 'notable';

  const direction = zScore > 0 ? 'above' : 'below';

  return {
    hasDeviation: absZ >= 1,
    zScore,
    significance,
    direction,
    value,
    baseline: {
      mean: baseline.mean,
      std_dev: baseline.std_dev,
      sample_count: baseline.sample_count,
      window_days: baseline.window_days
    },
    percentilePosition: calculatePercentilePosition(value, baseline)
  };
}

/**
 * Calculate where a value falls in the baseline distribution
 */
function calculatePercentilePosition(value, baseline) {
  if (value <= baseline.min_value) return 0;
  if (value >= baseline.max_value) return 100;
  if (value <= baseline.percentile_25) {
    return 25 * (value - baseline.min_value) / (baseline.percentile_25 - baseline.min_value);
  }
  if (value <= baseline.median) {
    return 25 + 25 * (value - baseline.percentile_25) / (baseline.median - baseline.percentile_25);
  }
  if (value <= baseline.percentile_75) {
    return 50 + 25 * (value - baseline.median) / (baseline.percentile_75 - baseline.median);
  }
  return 75 + 25 * (value - baseline.percentile_75) / (baseline.max_value - baseline.percentile_75);
}

/**
 * Get contextual baseline (day-of-week or time-of-day adjusted)
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @param {Date} timestamp - Timestamp for context
 * @returns {Object} - Contextual baseline with DOW/TOD adjustments
 */
export async function getContextualBaseline(userId, metricName, timestamp = new Date()) {
  const baseline = await getBaseline(userId, metricName, 30);

  if (!baseline) return null;

  const dow = timestamp.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const hour = timestamp.getHours();

  let tod = 'night';
  if (hour >= 5 && hour < 12) tod = 'morning';
  else if (hour >= 12 && hour < 17) tod = 'afternoon';
  else if (hour >= 17 && hour < 21) tod = 'evening';

  // Get contextual means if available
  const dowMean = baseline.dow_means?.[dow] || baseline.mean;
  const todMean = baseline.tod_means?.[tod] || baseline.mean;

  // Average the contextual adjustments
  const contextualMean = (dowMean + todMean) / 2;

  return {
    ...baseline,
    contextual_mean: contextualMean,
    day_of_week: dow,
    time_of_day: tod,
    dow_adjustment: dowMean - baseline.mean,
    tod_adjustment: todMean - baseline.mean
  };
}

/**
 * Check if baselines need recomputation
 * @param {string} userId - User ID
 * @param {number} maxAgeHours - Max age before recomputation (default: 24)
 * @returns {boolean} - True if baselines are stale
 */
export async function areBaselinesStale(userId, maxAgeHours = 24) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - maxAgeHours);

  const { data } = await supabaseAdmin
    .from('pl_user_baselines')
    .select('last_computed_at')
    .eq('user_id', userId)
    .order('last_computed_at', { ascending: true })
    .limit(1);

  if (!data || data.length === 0) return true;

  return new Date(data[0].last_computed_at) < cutoff;
}

/**
 * Get baseline summary for display
 * @param {string} userId - User ID
 * @returns {Object} - Summary of baselines by category
 */
export async function getBaselineSummary(userId) {
  const baselines = await getAllBaselines(userId, 30);

  const summary = {
    health: [],
    music: [],
    productivity: [],
    social: [],
    total_metrics: baselines.length,
    last_updated: null
  };

  for (const b of baselines) {
    const entry = {
      metric: b.metric_name,
      mean: Math.round(b.mean * 100) / 100,
      range: `${Math.round(b.min_value * 100) / 100} - ${Math.round(b.max_value * 100) / 100}`,
      samples: b.sample_count
    };

    // Categorize
    if (['recovery', 'hrv', 'rhr', 'strain', 'sleep_hours', 'sleep_efficiency'].includes(b.metric_name)) {
      summary.health.push(entry);
    } else if (b.metric_name.startsWith('music_') || b.metric_name === 'listening_duration_ms') {
      summary.music.push(entry);
    } else if (['meeting_count', 'meeting_hours', 'focus_time_hours', 'commits', 'code_additions', 'code_deletions'].includes(b.metric_name)) {
      summary.productivity.push(entry);
    } else if (['messages_sent', 'voice_minutes'].includes(b.metric_name)) {
      summary.social.push(entry);
    }

    // Track most recent update
    if (!summary.last_updated || new Date(b.last_computed_at) > new Date(summary.last_updated)) {
      summary.last_updated = b.last_computed_at;
    }
  }

  return summary;
}

export default {
  computeBaselines,
  getBaseline,
  getAllBaselines,
  checkDeviation,
  getContextualBaseline,
  areBaselinesStale,
  getBaselineSummary,
  METRIC_DEFINITIONS
};
