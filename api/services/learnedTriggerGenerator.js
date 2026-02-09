/**
 * Learned Trigger Generator
 *
 * Converts Pattern Learning discoveries into proactive triggers.
 * This replaces hardcoded trigger templates with dynamically learned patterns.
 *
 * Flow:
 * 1. Fetch discovered correlations from pl_discovered_correlations
 * 2. Fetch hypotheses from pl_pattern_hypotheses
 * 3. Generate trigger conditions based on statistical relationships
 * 4. Create actionable triggers that Moltbot can execute
 */

import { supabaseAdmin } from './database.js';
import correlationEngine from './correlationDiscoveryEngine.js';
import hypothesisEngine from './patternHypothesisEngine.js';
import baselineEngine from './baselineEngine.js';

/**
 * Generate triggers from learned correlations
 * @param {string} userId - User ID
 * @returns {Object[]} - Array of learned trigger templates
 */
export async function generateLearnedTriggers(userId) {
  const triggers = [];

  try {
    // 1. Get active correlations with moderate+ strength
    const correlations = await correlationEngine.getActiveCorrelations(userId);
    const strongCorrelations = correlations.filter(
      c => c.strength === 'strong' || c.strength === 'moderate'
    );

    // 2. Get active hypotheses
    const hypotheses = await hypothesisEngine.getActiveHypotheses(userId);

    // 3. Get user baselines for personalized thresholds
    const baselines = await baselineEngine.getAllBaselines(userId, 30);
    const baselineMap = {};
    for (const b of baselines) {
      baselineMap[b.metric_name] = b;
    }

    // 4. Generate triggers from correlations
    for (const correlation of strongCorrelations) {
      const trigger = await correlationToTrigger(correlation, baselineMap, userId);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    // 5. Generate triggers from hypotheses (if not already covered by correlations)
    for (const hypothesis of hypotheses) {
      // Skip if we already have a trigger for this correlation
      const existingTrigger = triggers.find(
        t => t.correlation_id === hypothesis.correlation_id
      );
      if (!existingTrigger && hypothesis.confidence_score >= 0.6) {
        const trigger = await hypothesisToTrigger(hypothesis, baselineMap, userId);
        if (trigger) {
          triggers.push(trigger);
        }
      }
    }

    console.log(`[LearnedTriggerGenerator] Generated ${triggers.length} triggers for user ${userId}`);
    return triggers;

  } catch (error) {
    console.error('[LearnedTriggerGenerator] Error:', error);
    return [];
  }
}

/**
 * Convert a correlation to a trigger template
 */
async function correlationToTrigger(correlation, baselineMap, userId) {
  const {
    metric_a,
    metric_b,
    platform_a,
    platform_b,
    correlation_coefficient,
    direction,
    strength,
    time_lag_hours,
    p_value
  } = correlation;

  // Get baselines for personalized thresholds
  const baselineA = baselineMap[metric_a];
  const baselineB = baselineMap[metric_b];

  if (!baselineA) return null;

  // Determine the trigger condition based on correlation direction
  const isPositive = direction === 'positive';
  const r = correlation_coefficient;

  // Create trigger name
  const triggerName = `learned_${metric_a}_${metric_b}_${direction}`.toLowerCase().replace(/\s+/g, '_');

  // Calculate personalized threshold (1 std dev from mean for notable deviation)
  const thresholdLow = baselineA.mean - baselineA.std_dev;
  const thresholdHigh = baselineA.mean + baselineA.std_dev;

  // Build conditions
  const conditions = [];

  // Primary metric condition (when metric_a deviates)
  conditions.push({
    type: 'metric',
    platform: platform_a,
    field: metric_a,
    operator: isPositive ? '>' : '<',
    value: isPositive ? thresholdHigh : thresholdLow,
    description: `When ${metric_a} is ${isPositive ? 'above' : 'below'} your personal baseline`
  });

  // Add time lag context if present
  if (time_lag_hours && Math.abs(time_lag_hours) >= 6) {
    conditions.push({
      type: 'context',
      check: 'time_since_last_check',
      operator: '>=',
      value: Math.abs(time_lag_hours) * 60, // Convert to minutes
      description: `After ${Math.abs(time_lag_hours)} hours`
    });
  }

  // Build actions
  const actions = [];

  // Predictive insight action
  actions.push({
    type: 'insight',
    message: generateInsightMessage(correlation, baselineA, baselineB),
    confidence: Math.abs(r)
  });

  // If metric_b is something actionable, suggest it
  if (isActionableMetric(metric_b)) {
    actions.push({
      type: 'suggest',
      message: generateSuggestion(correlation, baselineB),
      source: 'pattern_learning'
    });
  }

  // Log the pattern observation
  actions.push({
    type: 'log_pattern',
    category: getCategoryForMetric(metric_a),
    pattern: triggerName
  });

  return {
    id: `learned_${correlation.id}`,
    name: triggerName,
    description: generateDescription(correlation),
    conditions,
    actions,
    source: 'pattern_learning',
    correlation_id: correlation.id,
    research_basis: `Discovered from your personal data: ${metric_a} ${isPositive ? 'positively' : 'negatively'} correlates with ${metric_b} (r=${Math.round(r * 100) / 100}, p=${p_value?.toFixed(3)})`,
    correlation_strength: Math.abs(r),
    confidence: calculateConfidence(correlation),
    cooldown_minutes: time_lag_hours ? Math.abs(time_lag_hours) * 60 : 120,
    priority: Math.round(Math.abs(r) * 100),
    learned_at: correlation.discovered_at,
    is_learned: true
  };
}

/**
 * Convert a hypothesis to a trigger template
 */
async function hypothesisToTrigger(hypothesis, baselineMap, userId) {
  const {
    id,
    hypothesis_text,
    confidence_score,
    category,
    correlation_id
  } = hypothesis;

  // Get the underlying correlation if available
  let correlation = null;
  if (correlation_id) {
    const { data } = await supabaseAdmin
      .from('pl_discovered_correlations')
      .select('*')
      .eq('id', correlation_id)
      .single();
    correlation = data;
  }

  const triggerName = `hypothesis_${id.slice(0, 8)}`;

  // Build basic conditions from hypothesis category
  const conditions = buildConditionsFromCategory(category, baselineMap);

  // Build actions
  const actions = [
    {
      type: 'insight',
      message: hypothesis_text,
      confidence: confidence_score,
      source: 'hypothesis'
    },
    {
      type: 'request_feedback',
      hypothesis_id: id,
      question: 'Does this pattern ring true for you?'
    }
  ];

  return {
    id: `hypothesis_${id}`,
    name: triggerName,
    description: `Hypothesis: ${hypothesis_text.slice(0, 100)}...`,
    conditions,
    actions,
    source: 'pattern_learning',
    hypothesis_id: id,
    correlation_id,
    research_basis: `AI-generated hypothesis based on your behavioral patterns`,
    correlation_strength: correlation?.correlation_coefficient || 0.5,
    confidence: confidence_score,
    cooldown_minutes: 240, // 4 hours
    priority: Math.round(confidence_score * 70), // Lower priority than direct correlations
    learned_at: hypothesis.created_at,
    is_learned: true,
    is_hypothesis: true
  };
}

/**
 * Generate human-readable insight message
 */
function generateInsightMessage(correlation, baselineA, baselineB) {
  const { metric_a, metric_b, direction, strength, time_lag_hours } = correlation;

  const relationWord = direction === 'positive' ? 'higher' : 'lower';
  const strengthWord = strength === 'strong' ? 'strongly' : 'moderately';

  if (time_lag_hours && Math.abs(time_lag_hours) >= 6) {
    const lagText = Math.abs(time_lag_hours) >= 24
      ? `${Math.round(Math.abs(time_lag_hours) / 24)} day(s) later`
      : `${Math.abs(time_lag_hours)} hours later`;
    return `I've noticed that when your ${formatMetricName(metric_a)} is ${relationWord}, your ${formatMetricName(metric_b)} tends to be ${direction === 'positive' ? 'higher' : 'lower'} ${lagText}. This pattern is ${strengthWord} correlated in your data.`;
  }

  return `I've noticed your ${formatMetricName(metric_a)} and ${formatMetricName(metric_b)} tend to move ${direction === 'positive' ? 'together' : 'opposite to each other'}. This is a ${strengthWord} pattern in your data.`;
}

/**
 * Generate actionable suggestion
 */
function generateSuggestion(correlation, baselineB) {
  const { metric_b, direction } = correlation;

  const suggestions = {
    music_valence: direction === 'positive'
      ? 'Consider listening to upbeat music to boost your mood'
      : 'Some calming music might help balance things out',
    music_energy: direction === 'positive'
      ? 'High-energy music might match your current state'
      : 'Perhaps some relaxing tracks would help',
    recovery: direction === 'positive'
      ? 'Your body seems ready for activity'
      : 'Consider taking it easy today',
    hrv: direction === 'positive'
      ? 'Your stress levels seem manageable'
      : 'Try some relaxation techniques',
    sleep_hours: direction === 'positive'
      ? 'Good sleep foundation today'
      : 'Consider prioritizing rest tonight'
  };

  return suggestions[metric_b] || `Pay attention to your ${formatMetricName(metric_b)} today`;
}

/**
 * Generate description from correlation
 */
function generateDescription(correlation) {
  const { metric_a, metric_b, platform_a, platform_b, direction, strength } = correlation;

  const crossPlatform = platform_a !== platform_b;
  const platformNote = crossPlatform
    ? ` (connecting ${platform_a} and ${platform_b})`
    : '';

  return `Learned pattern: ${formatMetricName(metric_a)} ${direction === 'positive' ? '↑↑' : '↑↓'} ${formatMetricName(metric_b)}${platformNote}. Strength: ${strength}.`;
}

/**
 * Format metric name for display
 */
function formatMetricName(metric) {
  const nameMap = {
    recovery: 'recovery score',
    hrv: 'heart rate variability',
    rhr: 'resting heart rate',
    music_valence: 'music mood (valence)',
    music_energy: 'music energy',
    music_tempo: 'music tempo',
    sleep_hours: 'sleep duration',
    sleep_efficiency: 'sleep efficiency',
    strain: 'daily strain'
  };
  return nameMap[metric] || metric.replace(/_/g, ' ');
}

/**
 * Check if a metric is actionable (can suggest something)
 */
function isActionableMetric(metric) {
  const actionableMetrics = [
    'music_valence', 'music_energy', 'recovery', 'hrv', 'sleep_hours', 'strain'
  ];
  return actionableMetrics.includes(metric);
}

/**
 * Get category for a metric
 */
function getCategoryForMetric(metric) {
  const categoryMap = {
    recovery: 'health',
    hrv: 'health',
    rhr: 'health',
    strain: 'health',
    sleep_hours: 'health',
    sleep_efficiency: 'health',
    music_valence: 'mood',
    music_energy: 'energy',
    music_tempo: 'energy'
  };
  return categoryMap[metric] || 'general';
}

/**
 * Calculate confidence score for a trigger
 */
function calculateConfidence(correlation) {
  const { correlation_coefficient, p_value, sample_size, validation_count } = correlation;

  let confidence = Math.abs(correlation_coefficient);

  // Boost for statistical significance
  if (p_value && p_value < 0.01) confidence += 0.1;
  else if (p_value && p_value < 0.05) confidence += 0.05;

  // Boost for larger sample size
  if (sample_size >= 30) confidence += 0.05;
  if (sample_size >= 60) confidence += 0.05;

  // Boost for validated correlations
  if (validation_count >= 2) confidence += 0.05;
  if (validation_count >= 5) confidence += 0.1;

  return Math.min(1, confidence);
}

/**
 * Build conditions from category
 */
function buildConditionsFromCategory(category, baselineMap) {
  const categoryConditions = {
    health: [
      { type: 'metric', platform: 'whoop', field: 'recovery', operator: 'exists' }
    ],
    mood: [
      { type: 'event', platform: 'spotify', event: 'track_played' }
    ],
    energy: [
      { type: 'time', operator: 'between', value: ['08:00', '20:00'] }
    ],
    productivity: [
      { type: 'event', platform: 'calendar', event: 'event_started' }
    ]
  };

  return categoryConditions[category] || [
    { type: 'time', operator: 'between', value: ['06:00', '23:00'] }
  ];
}

/**
 * Sync platform data to Pattern Learning raw events table
 * This bridges existing platform data to the pattern learning system
 */
export async function syncPlatformDataToPatternLearning(userId, platform, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Get recent platform data
    const { data: platformData, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .gte('extracted_at', startDate.toISOString())
      .order('extracted_at', { ascending: true });

    if (error || !platformData) {
      console.error(`[LearnedTriggerGenerator] Error fetching ${platform} data:`, error);
      return { synced: 0 };
    }

    let synced = 0;

    for (const record of platformData) {
      // Transform to raw behavioral event format
      const eventType = mapDataTypeToEventType(record.data_type, platform);
      if (!eventType) continue;

      const { error: insertError } = await supabaseAdmin
        .from('pl_raw_behavioral_events')
        .upsert({
          user_id: userId,
          platform,
          event_type: eventType,
          event_data: record.raw_data,
          event_timestamp: record.extracted_at,
          context: buildEventContext(record)
        }, {
          onConflict: 'user_id,platform,event_type,event_timestamp'
        });

      if (!insertError) synced++;
    }

    console.log(`[LearnedTriggerGenerator] Synced ${synced} ${platform} events for user ${userId}`);
    return { synced };

  } catch (error) {
    console.error('[LearnedTriggerGenerator] Sync error:', error);
    return { synced: 0, error: error.message };
  }
}

/**
 * Map data_type to pattern learning event_type
 */
function mapDataTypeToEventType(dataType, platform) {
  const mapping = {
    // Spotify
    recently_played: 'track_played',
    top_tracks: 'track_played',
    current_playing: 'track_played',

    // Whoop
    recovery_webhook: 'recovery_logged',
    recovery: 'recovery_logged',
    sleep: 'sleep_logged',
    workout: 'workout_logged',
    strain: 'strain_logged',

    // Calendar
    events: 'event_scheduled',
    recent_event: 'event_ended',
    upcoming_event: 'event_scheduled'
  };

  return mapping[dataType] || null;
}

/**
 * Build context for event
 */
function buildEventContext(record) {
  const timestamp = new Date(record.extracted_at);
  const hour = timestamp.getHours();

  let timeOfDay = 'night';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';

  return {
    day_of_week: timestamp.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
    time_of_day: timeOfDay,
    hour,
    data_type: record.data_type
  };
}

/**
 * Run full pattern learning pipeline for a user
 */
export async function runPatternLearningPipeline(userId) {
  console.log(`[PatternLearning] Running full pipeline for user ${userId}`);

  const results = {
    dataSync: {},
    baselines: {},
    correlations: {},
    hypotheses: {},
    triggers: []
  };

  try {
    // 1. Sync platform data to raw events
    for (const platform of ['spotify', 'whoop', 'google_calendar']) {
      results.dataSync[platform] = await syncPlatformDataToPatternLearning(userId, platform, 90);
    }

    // 2. Compute baselines
    results.baselines = await baselineEngine.computeBaselines(userId);

    // 3. Discover correlations
    results.correlations = await correlationEngine.discoverCorrelations(userId, true);

    // 4. Generate hypotheses (if we have correlations)
    if (results.correlations.discovered > 0) {
      results.hypotheses = await hypothesisEngine.generateHypotheses(userId, false);
    }

    // 5. Generate learned triggers
    results.triggers = await generateLearnedTriggers(userId);

    console.log(`[PatternLearning] Pipeline complete:`, {
      dataSynced: Object.values(results.dataSync).reduce((sum, r) => sum + (r.synced || 0), 0),
      baselines: results.baselines.computed || 0,
      correlations: results.correlations.discovered || 0,
      hypotheses: results.hypotheses.generated || 0,
      triggers: results.triggers.length
    });

    return results;

  } catch (error) {
    console.error('[PatternLearning] Pipeline error:', error);
    return { ...results, error: error.message };
  }
}

/**
 * Generate insights directly from baseline temporal patterns
 * These don't require correlations - just patterns in your own data
 */
export async function generateBaselineInsights(userId) {
  const insights = [];

  try {
    const baselines = await baselineEngine.getAllBaselines(userId, 30);

    for (const baseline of baselines) {
      const { metric_name, platform, mean, std_dev, dow_means, tod_means } = baseline;

      // Analyze day-of-week patterns
      if (dow_means && Object.keys(dow_means).length >= 2) {
        const dowValues = Object.entries(dow_means)
          .filter(([_, v]) => v !== null && v !== undefined)
          .sort((a, b) => b[1] - a[1]);

        if (dowValues.length >= 2) {
          const highest = dowValues[0];
          const lowest = dowValues[dowValues.length - 1];

          // Only report if there's meaningful variation (>15% difference)
          const variance = Math.abs(highest[1] - lowest[1]) / (mean || 1);
          if (variance > 0.15 && mean > 0) {
            insights.push({
              type: 'temporal_pattern',
              subtype: 'day_of_week',
              metric: metric_name,
              platform,
              message: generateDowInsight(metric_name, highest, lowest, variance),
              confidence: Math.min(0.9, variance * 2),
              data: { highest_day: highest[0], lowest_day: lowest[0], variance_percent: Math.round(variance * 100) }
            });
          }
        }
      }

      // Analyze time-of-day patterns
      if (tod_means && Object.keys(tod_means).length >= 2) {
        const todValues = Object.entries(tod_means)
          .filter(([_, v]) => v !== null && v !== undefined)
          .sort((a, b) => b[1] - a[1]);

        if (todValues.length >= 2) {
          const highest = todValues[0];
          const lowest = todValues[todValues.length - 1];

          const variance = Math.abs(highest[1] - lowest[1]) / (mean || 1);
          if (variance > 0.1 && mean > 0) {
            insights.push({
              type: 'temporal_pattern',
              subtype: 'time_of_day',
              metric: metric_name,
              platform,
              message: generateTodInsight(metric_name, highest, lowest, variance),
              confidence: Math.min(0.85, variance * 2),
              data: { peak_time: highest[0], low_time: lowest[0], variance_percent: Math.round(variance * 100) }
            });
          }
        }
      }
    }

    console.log(`[LearnedTriggerGenerator] Generated ${insights.length} baseline insights for user ${userId}`);
    return insights;

  } catch (error) {
    console.error('[LearnedTriggerGenerator] Error generating baseline insights:', error);
    return [];
  }
}

/**
 * Generate day-of-week insight message
 */
function generateDowInsight(metric, highest, lowest, variance) {
  const metricName = formatMetricName(metric);
  const highDay = highest[0].charAt(0).toUpperCase() + highest[0].slice(1);
  const lowDay = lowest[0].charAt(0).toUpperCase() + lowest[0].slice(1);
  const percentDiff = Math.round(variance * 100);

  if (metric.includes('duration') || metric.includes('time')) {
    return `Your ${metricName} is ${percentDiff}% longer on ${highDay}s compared to ${lowDay}s.`;
  }

  return `Your ${metricName} tends to be highest on ${highDay}s and lowest on ${lowDay}s (${percentDiff}% variation).`;
}

/**
 * Generate time-of-day insight message
 */
function generateTodInsight(metric, highest, lowest, variance) {
  const metricName = formatMetricName(metric);
  const highTime = highest[0];
  const lowTime = lowest[0];
  const percentDiff = Math.round(variance * 100);

  if (metric.includes('duration') || metric.includes('time')) {
    return `You tend to have ${percentDiff}% longer ${metricName} in the ${highTime} vs ${lowTime}.`;
  }

  return `Your ${metricName} peaks in the ${highTime} and is lowest in the ${lowTime} (${percentDiff}% variation).`;
}

export default {
  generateLearnedTriggers,
  generateBaselineInsights,
  syncPlatformDataToPatternLearning,
  runPatternLearningPipeline
};
