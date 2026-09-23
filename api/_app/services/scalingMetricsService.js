/**
 * Scaling Metrics Service
 * =======================
 * Measures the relationship between connected platforms, memory count,
 * and twin quality. Fits a log-linear model to historical data points
 * to predict how twin quality scales with more data.
 *
 * Usage:
 *   import { measureScalingPoint, getScalingHistory } from './scalingMetricsService.js';
 *   const result = await measureScalingPoint(userId);
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { fitLogLinear } from './statsUtils.js';

const log = createLogger('ScalingMetrics');

/**
 * Get all connected platforms for a user from both platform_connections
 * and nango_connection_mappings tables.
 * @param {string} userId
 * @returns {Promise<string[]>} unique platform names
 */
async function getConnectedPlatforms(userId) {
  const [connectionsResult, nangoResult] = await Promise.all([
    supabaseAdmin
      .from('platform_connections')
      .select('provider')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('nango_connection_mappings')
      .select('provider_config_key')
      .eq('user_id', userId),
  ]);

  const { data: connections, error: connError } = connectionsResult;
  const { data: nangoConns, error: nangoError } = nangoResult;

  if (connError) {
    log.warn('Failed to fetch platform_connections', { userId, error: connError.message });
  }
  if (nangoError) {
    log.warn('Failed to fetch nango_connection_mappings', { userId, error: nangoError.message });
  }

  const platforms = new Set();

  if (connections) {
    for (const conn of connections) {
      platforms.add(conn.provider);
    }
  }
  if (nangoConns) {
    for (const nango of nangoConns) {
      platforms.add(nango.provider_config_key);
    }
  }

  return [...platforms];
}

/**
 * Count memories by type for a user.
 * @param {string} userId
 * @returns {Promise<{ total: number, byType: Record<string, number> }>}
 */
async function getMemoryCounts(userId) {
  const { data: memoryCounts, error } = await supabaseAdmin
    .from('user_memories')
    .select('memory_type')
    .eq('user_id', userId);

  if (error) {
    log.error('Failed to fetch memory counts', { userId, error: error.message });
    return { total: 0, byType: {} };
  }

  const byType = {};
  for (const row of memoryCounts) {
    const type = row.memory_type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  }

  const total = memoryCounts.length;
  return { total, byType };
}

/**
 * Compute a simple twin readiness score based on memory count.
 * @param {number} memoryCount
 * @returns {number} readiness score (0-100)
 */
function computeReadinessScore(memoryCount) {
  if (memoryCount > 100) {
    return Math.min(100, Math.round(memoryCount / 50));
  }
  return memoryCount;
}

/**
 * Measure a single scaling data point for a user.
 * Queries connected platforms, counts memories, computes readiness,
 * fits log-linear model to history, and stores the data point.
 *
 * @param {string} userId
 * @returns {Promise<{ dataPoint: object, fit: object, history: object[] }>}
 */
export async function measureScalingPoint(userId) {
  log.info('Measuring scaling point', { userId });

  const [platforms, memoryCounts] = await Promise.all([
    getConnectedPlatforms(userId),
    getMemoryCounts(userId),
  ]);

  const readinessScore = computeReadinessScore(memoryCounts.total);

  const dataPoint = {
    user_id: userId,
    platform_count: platforms.length,
    memory_count: memoryCounts.total,
    memory_types: memoryCounts.byType,
    connected_platforms: platforms,
    twin_quality_score: readinessScore,
    readiness_score: readinessScore,
    measured_at: new Date().toISOString(),
  };

  // Store the data point
  const { error: insertError } = await supabaseAdmin
    .from('twin_scaling_metrics')
    .insert(dataPoint);

  if (insertError) {
    log.error('Failed to insert scaling data point', { userId, error: insertError.message });
    throw new Error(`Failed to store scaling metric: ${insertError.message}`);
  }

  // Fetch history for log-linear fit
  const { data: history, error: histError } = await supabaseAdmin
    .from('twin_scaling_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: true })
    .limit(50);

  if (histError) {
    log.warn('Failed to fetch scaling history for fit', { userId, error: histError.message });
    return { dataPoint, fit: null, history: [] };
  }

  // Fit log-linear model: quality = a * log10(memories) + b
  let fit = null;
  if (history.length >= 2) {
    const xValues = history.map(h => h.memory_count);
    const yValues = history.map(h => h.twin_quality_score || 0);
    fit = fitLogLinear(xValues, yValues);

    // Update the latest data point with fit parameters
    const { error: updateError } = await supabaseAdmin
      .from('twin_scaling_metrics')
      .update({
        fit_a: fit.a,
        fit_b: fit.b,
        fit_r2: fit.r2,
      })
      .eq('user_id', userId)
      .eq('measured_at', dataPoint.measured_at);

    if (updateError) {
      log.warn('Failed to update fit parameters', { userId, error: updateError.message });
    }
  }

  log.info('Scaling point measured', {
    userId,
    platforms: platforms.length,
    memories: memoryCounts.total,
    readiness: readinessScore,
    fitR2: fit?.r2,
  });

  return { dataPoint, fit, history };
}

/**
 * Get historical scaling data points for a user.
 * @param {string} userId
 * @param {number} [limit=50]
 * @returns {Promise<object[]>} data points ordered by measured_at ASC
 */
export async function getScalingHistory(userId, limit = 50) {
  const { data, error } = await supabaseAdmin
    .from('twin_scaling_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: true })
    .limit(limit);

  if (error) {
    log.error('Failed to fetch scaling history', { userId, error: error.message });
    throw new Error(`Failed to fetch scaling history: ${error.message}`);
  }

  return data || [];
}
