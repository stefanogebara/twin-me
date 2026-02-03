/**
 * Correlation Discovery Engine
 *
 * Layer 4 of the Pattern Learning System
 * Discovers statistical relationships between different metrics
 *
 * Key functions:
 * - discoverCorrelations(userId) - Find pairwise metric correlations
 * - computeCorrelation(userId, metricA, metricB) - Pearson correlation + p-value
 * - computeLaggedCorrelations(userId, metrics) - Check time-shifted relationships
 * - validateExistingCorrelations(userId) - Mark stale correlations as invalid
 */

import { supabaseAdmin } from './database.js';
import baselineEngine from './baselineEngine.js';

// Minimum sample size for meaningful correlation
const MIN_SAMPLE_SIZE = 10;

// P-value threshold for statistical significance
const P_VALUE_THRESHOLD = 0.05;

// Correlation strength thresholds
const CORRELATION_THRESHOLDS = {
  weak: 0.3,
  moderate: 0.6,
  strong: 1.0
};

// Time lags to check (in hours)
const TIME_LAGS = [0, -6, -12, -24, -48];

/**
 * Calculate Pearson correlation coefficient
 * @param {number[]} x - First array of values
 * @param {number[]} y - Second array of values
 * @returns {number} - Correlation coefficient (-1 to 1)
 */
function pearsonCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Calculate p-value for correlation using t-test
 * @param {number} r - Correlation coefficient
 * @param {number} n - Sample size
 * @returns {number} - P-value (two-tailed)
 */
function calculatePValue(r, n) {
  if (n < 3 || Math.abs(r) >= 1) return 1;

  // t-statistic
  const t = r * Math.sqrt((n - 2) / (1 - r * r));

  // Approximate p-value using normal distribution for large n
  // For small n, this is an approximation
  const df = n - 2;

  // Beta function approximation for t-distribution CDF
  // Using simple approximation: p ≈ 2 * (1 - normalCDF(|t|))
  const z = Math.abs(t) / Math.sqrt(df / (df - 2));
  const p = 2 * (1 - normalCDF(z));

  return Math.max(0, Math.min(1, p));
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Classify correlation strength
 */
function classifyStrength(r) {
  const absR = Math.abs(r);
  if (absR >= CORRELATION_THRESHOLDS.moderate) return 'strong';
  if (absR >= CORRELATION_THRESHOLDS.weak) return 'moderate';
  return 'weak';
}

/**
 * Get time series data for a metric
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @param {number} days - Number of days of data
 * @returns {Object[]} - Array of {timestamp, value}
 */
async function getMetricTimeSeries(userId, metricName, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const metricDef = baselineEngine.METRIC_DEFINITIONS[metricName];
  if (!metricDef) return [];

  const { data: events, error } = await supabaseAdmin
    .from('pl_raw_behavioral_events')
    .select('event_data, event_timestamp')
    .eq('user_id', userId)
    .eq('platform', metricDef.platform)
    .gte('event_timestamp', startDate.toISOString())
    .order('event_timestamp', { ascending: true });

  if (error || !events) return [];

  const series = [];
  for (const event of events) {
    const value = getNestedValue(event.event_data, metricDef.path);
    if (value !== null && typeof value === 'number' && !isNaN(value)) {
      series.push({
        timestamp: new Date(event.event_timestamp).getTime(),
        value
      });
    }
  }

  return series;
}

/**
 * Get nested value from object
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((curr, key) =>
    curr && curr[key] !== undefined ? curr[key] : null, obj);
}

/**
 * Align two time series by day
 * @param {Object[]} seriesA - First time series
 * @param {Object[]} seriesB - Second time series
 * @param {number} lagHours - Lag to apply to series B (positive = B later)
 * @returns {Object} - {x: [], y: []} aligned values
 */
function alignTimeSeriesByDay(seriesA, seriesB, lagHours = 0) {
  // Group by day
  const dayA = {};
  const dayB = {};

  for (const point of seriesA) {
    const day = new Date(point.timestamp).toISOString().split('T')[0];
    if (!dayA[day]) dayA[day] = [];
    dayA[day].push(point.value);
  }

  // Apply lag to series B
  const lagMs = lagHours * 60 * 60 * 1000;
  for (const point of seriesB) {
    const adjustedTime = point.timestamp + lagMs;
    const day = new Date(adjustedTime).toISOString().split('T')[0];
    if (!dayB[day]) dayB[day] = [];
    dayB[day].push(point.value);
  }

  // Find common days and compute daily averages
  const x = [];
  const y = [];

  for (const day of Object.keys(dayA)) {
    if (dayB[day]) {
      // Use daily mean
      const avgA = dayA[day].reduce((a, b) => a + b, 0) / dayA[day].length;
      const avgB = dayB[day].reduce((a, b) => a + b, 0) / dayB[day].length;
      x.push(avgA);
      y.push(avgB);
    }
  }

  return { x, y };
}

/**
 * Compute correlation between two metrics
 * @param {string} userId - User ID
 * @param {string} metricA - First metric name
 * @param {string} metricB - Second metric name
 * @param {number} lagHours - Time lag (optional)
 * @returns {Object} - Correlation result
 */
export async function computeCorrelation(userId, metricA, metricB, lagHours = 0) {
  // Get time series for both metrics
  const seriesA = await getMetricTimeSeries(userId, metricA);
  const seriesB = await getMetricTimeSeries(userId, metricB);

  if (seriesA.length < MIN_SAMPLE_SIZE || seriesB.length < MIN_SAMPLE_SIZE) {
    return {
      success: false,
      reason: 'insufficient_data',
      sampleSizeA: seriesA.length,
      sampleSizeB: seriesB.length
    };
  }

  // Align by day
  const { x, y } = alignTimeSeriesByDay(seriesA, seriesB, lagHours);

  if (x.length < MIN_SAMPLE_SIZE) {
    return {
      success: false,
      reason: 'insufficient_overlap',
      overlappingDays: x.length
    };
  }

  // Calculate correlation
  const r = pearsonCorrelation(x, y);
  const pValue = calculatePValue(r, x.length);
  const strength = classifyStrength(r);
  const direction = r >= 0 ? 'positive' : 'negative';

  return {
    success: true,
    metricA,
    metricB,
    correlationCoefficient: r,
    pValue,
    sampleSize: x.length,
    timeLagHours: lagHours,
    direction,
    strength,
    isSignificant: pValue < P_VALUE_THRESHOLD && Math.abs(r) >= CORRELATION_THRESHOLDS.weak
  };
}

/**
 * Discover all correlations for a user
 * @param {string} userId - User ID
 * @param {boolean} includeLagged - Include lagged correlations (default: true)
 * @returns {Object} - Discovery results
 */
export async function discoverCorrelations(userId, includeLagged = true) {
  const results = {
    discovered: 0,
    updated: 0,
    correlations: []
  };

  // Get all metrics with baselines
  const baselines = await baselineEngine.getAllBaselines(userId, 30);
  const metrics = [...new Set(baselines.map(b => b.metric_name))];

  if (metrics.length < 2) {
    return { ...results, reason: 'insufficient_metrics', metricCount: metrics.length };
  }

  // Generate all pairs
  const pairs = [];
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      pairs.push([metrics[i], metrics[j]]);
    }
  }

  // Compute correlations for each pair
  for (const [metricA, metricB] of pairs) {
    const lags = includeLagged ? TIME_LAGS : [0];

    for (const lag of lags) {
      try {
        const result = await computeCorrelation(userId, metricA, metricB, lag);

        if (result.success && result.isSignificant) {
          // Get platforms for the metrics
          const defA = baselineEngine.METRIC_DEFINITIONS[metricA];
          const defB = baselineEngine.METRIC_DEFINITIONS[metricB];

          // Upsert to database
          const { data, error } = await supabaseAdmin
            .from('pl_discovered_correlations')
            .upsert({
              user_id: userId,
              metric_a: metricA,
              platform_a: defA?.platform || null,
              metric_b: metricB,
              platform_b: defB?.platform || null,
              correlation_coefficient: result.correlationCoefficient,
              p_value: result.pValue,
              sample_size: result.sampleSize,
              time_lag_hours: lag,
              direction: result.direction,
              strength: result.strength,
              still_valid: true,
              last_validated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,metric_a,platform_a,metric_b,platform_b,time_lag_hours'
            })
            .select();

          if (!error && data) {
            results.discovered++;
            results.correlations.push({
              metricA,
              metricB,
              lag,
              r: result.correlationCoefficient,
              strength: result.strength
            });
          }
        }
      } catch (err) {
        console.error(`Error computing correlation ${metricA}/${metricB}:`, err);
      }
    }
  }

  return results;
}

/**
 * Validate existing correlations with new data
 * @param {string} userId - User ID
 * @returns {Object} - Validation results
 */
export async function validateExistingCorrelations(userId) {
  const results = {
    validated: 0,
    invalidated: 0,
    unchanged: 0
  };

  // Get existing correlations
  const { data: correlations, error } = await supabaseAdmin
    .from('pl_discovered_correlations')
    .select('*')
    .eq('user_id', userId)
    .eq('still_valid', true);

  if (error || !correlations) return results;

  for (const corr of correlations) {
    try {
      const newResult = await computeCorrelation(
        userId,
        corr.metric_a,
        corr.metric_b,
        corr.time_lag_hours
      );

      if (!newResult.success) {
        results.unchanged++;
        continue;
      }

      // Check if correlation still holds
      const stillValid = newResult.isSignificant &&
        newResult.direction === corr.direction;

      // Update validation
      await supabaseAdmin
        .from('pl_discovered_correlations')
        .update({
          correlation_coefficient: newResult.correlationCoefficient,
          p_value: newResult.pValue,
          sample_size: newResult.sampleSize,
          strength: newResult.strength,
          still_valid: stillValid,
          last_validated_at: new Date().toISOString(),
          validation_count: (corr.validation_count || 1) + 1
        })
        .eq('id', corr.id);

      if (stillValid) {
        results.validated++;
      } else {
        results.invalidated++;
      }
    } catch (err) {
      console.error(`Error validating correlation ${corr.id}:`, err);
      results.unchanged++;
    }
  }

  return results;
}

/**
 * Get active correlations for a user
 * @param {string} userId - User ID
 * @param {string} minStrength - Minimum strength filter (optional)
 * @returns {Object[]} - Array of correlations
 */
export async function getActiveCorrelations(userId, minStrength = null) {
  let query = supabaseAdmin
    .from('pl_discovered_correlations')
    .select('*')
    .eq('user_id', userId)
    .eq('still_valid', true)
    .order('correlation_coefficient', { ascending: false });

  if (minStrength) {
    query = query.eq('strength', minStrength);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching correlations:', error);
    return [];
  }

  return data || [];
}

/**
 * Get correlations for a specific metric
 * @param {string} userId - User ID
 * @param {string} metricName - Metric to find correlations for
 * @returns {Object[]} - Array of correlations involving this metric
 */
export async function getCorrelationsForMetric(userId, metricName) {
  const { data, error } = await supabaseAdmin
    .from('pl_discovered_correlations')
    .select('*')
    .eq('user_id', userId)
    .eq('still_valid', true)
    .or(`metric_a.eq.${metricName},metric_b.eq.${metricName}`)
    .order('correlation_coefficient', { ascending: false });

  if (error) {
    console.error('Error fetching correlations:', error);
    return [];
  }

  return data || [];
}

/**
 * Get correlation summary for display
 * @param {string} userId - User ID
 * @returns {Object} - Summary statistics
 */
export async function getCorrelationSummary(userId) {
  const correlations = await getActiveCorrelations(userId);

  const summary = {
    total: correlations.length,
    byStrength: { weak: 0, moderate: 0, strong: 0 },
    byDirection: { positive: 0, negative: 0 },
    crossPlatform: 0,
    samePlatform: 0,
    topCorrelations: []
  };

  for (const corr of correlations) {
    // By strength
    if (summary.byStrength[corr.strength] !== undefined) {
      summary.byStrength[corr.strength]++;
    }

    // By direction
    if (summary.byDirection[corr.direction] !== undefined) {
      summary.byDirection[corr.direction]++;
    }

    // Cross vs same platform
    if (corr.platform_a !== corr.platform_b) {
      summary.crossPlatform++;
    } else {
      summary.samePlatform++;
    }
  }

  // Top correlations (strongest)
  summary.topCorrelations = correlations
    .sort((a, b) => Math.abs(b.correlation_coefficient) - Math.abs(a.correlation_coefficient))
    .slice(0, 5)
    .map(c => ({
      metrics: `${c.metric_a} ↔ ${c.metric_b}`,
      r: Math.round(c.correlation_coefficient * 100) / 100,
      strength: c.strength,
      direction: c.direction,
      lag: c.time_lag_hours
    }));

  return summary;
}

/**
 * Find predictive correlations (lagged relationships)
 * @param {string} userId - User ID
 * @returns {Object[]} - Correlations where one metric predicts another
 */
export async function findPredictiveCorrelations(userId) {
  const { data, error } = await supabaseAdmin
    .from('pl_discovered_correlations')
    .select('*')
    .eq('user_id', userId)
    .eq('still_valid', true)
    .neq('time_lag_hours', 0)
    .in('strength', ['moderate', 'strong'])
    .order('time_lag_hours', { ascending: true });

  if (error) {
    console.error('Error fetching predictive correlations:', error);
    return [];
  }

  // Format for easier understanding
  return (data || []).map(c => ({
    predictor: c.metric_a,
    outcome: c.metric_b,
    lagHours: c.time_lag_hours,
    correlation: c.correlation_coefficient,
    direction: c.direction,
    interpretation: generatePredictiveInterpretation(c)
  }));
}

/**
 * Generate interpretation of a predictive correlation
 */
function generatePredictiveInterpretation(correlation) {
  const { metric_a, metric_b, time_lag_hours, direction, strength } = correlation;
  const lagText = Math.abs(time_lag_hours) === 24
    ? 'the next day'
    : `${Math.abs(time_lag_hours)} hours later`;

  const relationWord = direction === 'positive' ? 'higher' : 'lower';

  return `Higher ${metric_a} is ${strength}ly associated with ${relationWord} ${metric_b} ${lagText}`;
}

export default {
  computeCorrelation,
  discoverCorrelations,
  validateExistingCorrelations,
  getActiveCorrelations,
  getCorrelationsForMetric,
  getCorrelationSummary,
  findPredictiveCorrelations,
  MIN_SAMPLE_SIZE,
  P_VALUE_THRESHOLD
};
