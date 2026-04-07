/**
 * Activity Metrics Service
 * ========================
 * Calculates activity_score, activity_level, activity_label, and content_volume
 * for platform_connections based on recent memory stream data.
 *
 * Called after successful observation ingestion to keep activity metrics fresh.
 */

import { createLogger } from './logger.js';

const log = createLogger('ActivityMetrics');

// Lazy-load to avoid circular dependency
let supabaseAdmin = null;
async function getSupabase() {
  if (!supabaseAdmin) {
    const mod = await import('./database.js');
    supabaseAdmin = mod.supabaseAdmin;
  }
  return supabaseAdmin;
}

/**
 * Score thresholds for activity levels.
 * Based on 7-day memory count per platform.
 */
const LEVEL_THRESHOLDS = {
  high:   { minMemories: 20, score: 80, label: 'Highly active' },
  medium: { minMemories: 5,  score: 50, label: 'Moderately active' },
  low:    { minMemories: 1,  score: 20, label: 'Lightly active' },
  none:   { minMemories: 0,  score: 0,  label: 'Connected but inactive' },
};

/**
 * Calculate activity metrics for a single platform connection.
 * Counts user_memories by platform in the last 7 days and derives score/level.
 *
 * @param {string} userId
 * @param {string} platform - platform key matching platform_connections.platform
 * @returns {Promise<{score: number, level: string, label: string, contentVolume: number} | null>}
 */
export async function calculateActivityMetrics(userId, platform) {
  const supabase = await getSupabase();
  if (!supabase) {
    log.warn('No Supabase client available');
    return null;
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Count memories for this platform in the last 7 days
    const { count, error: countErr } = await supabase
      .from('user_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', platform)
      .gte('created_at', sevenDaysAgo);

    if (countErr) {
      log.warn('Failed to count memories', { platform, userId, error: countErr.message });
      return null;
    }

    const memoryCount = count || 0;

    // Derive level and score
    let level, score, label;
    if (memoryCount >= LEVEL_THRESHOLDS.high.minMemories) {
      level = 'high';
      // Scale 80-100 based on how far above threshold
      score = Math.min(100, LEVEL_THRESHOLDS.high.score + Math.round((memoryCount - 20) * 1));
      label = LEVEL_THRESHOLDS.high.label;
    } else if (memoryCount >= LEVEL_THRESHOLDS.medium.minMemories) {
      level = 'medium';
      // Scale 50-79
      score = LEVEL_THRESHOLDS.medium.score + Math.round((memoryCount - 5) * 2);
      label = LEVEL_THRESHOLDS.medium.label;
    } else if (memoryCount >= LEVEL_THRESHOLDS.low.minMemories) {
      level = 'low';
      // Scale 20-49
      score = LEVEL_THRESHOLDS.low.score + Math.round((memoryCount - 1) * 7.5);
      label = LEVEL_THRESHOLDS.low.label;
    } else {
      level = 'none';
      score = 0;
      label = LEVEL_THRESHOLDS.none.label;
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Update platform_connections
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('platform_connections')
      .update({
        activity_score: score,
        activity_level: level,
        activity_label: label,
        content_volume: memoryCount,
        activity_calculated_at: now,
        activity_metrics: {
          memory_count_7d: memoryCount,
          calculated_at: now,
        },
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    if (updateErr) {
      log.warn('Failed to update activity metrics', { platform, userId, error: updateErr.message });
      return null;
    }

    log.info('Activity metrics updated', { platform, userId, score, level, memoryCount });
    return { score, level, label, contentVolume: memoryCount };
  } catch (err) {
    log.warn('Activity metrics calculation failed', { platform, userId, error: err.message });
    return null;
  }
}

/**
 * Calculate activity metrics for ALL connected platforms for a user.
 * Useful after bulk ingestion runs.
 *
 * @param {string} userId
 * @param {string[]} [platforms] - optional list of platforms to calculate for.
 *   If omitted, fetches all connected platforms from platform_connections.
 */
export async function calculateAllActivityMetrics(userId, platforms) {
  const supabase = await getSupabase();
  if (!supabase) return;

  try {
    let platformList = platforms;
    if (!platformList || platformList.length === 0) {
      const { data, error } = await supabase
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId)
        .in('status', ['connected', 'pending']);
      if (error) {
        log.warn('Failed to fetch platforms', { userId, error: error.message });
        return;
      }
      platformList = (data || []).map(d => d.platform);
    }

    // Run in parallel (non-blocking per platform)
    await Promise.all(
      platformList.map(p => calculateActivityMetrics(userId, p).catch(err => {
        log.warn('Activity calc failed for platform', { platform: p, userId, error: err.message });
      }))
    );
  } catch (err) {
    log.warn('calculateAllActivityMetrics failed', { userId, error: err.message });
  }
}

/**
 * Detect activity anomalies by comparing current 7-day count to EMA baseline.
 * Uses z-score: flag when |z| > 2.0 (Spotify Wrapped approach).
 * Requires 21+ days of history (stored in activity_metrics JSONB).
 *
 * @param {string} userId
 * @param {string} platform
 * @param {number} currentCount - current 7-day memory count
 * @returns {Promise<{anomaly: boolean, direction: string, zScore: number, message: string} | null>}
 */
export async function detectActivityAnomaly(userId, platform, currentCount) {
  const supabase = await getSupabase();
  if (!supabase) return null;

  try {
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('activity_metrics')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    const metrics = conn?.activity_metrics || {};
    const history = metrics.ema_history || [];

    // Update EMA history (append current count with timestamp)
    const today = new Date().toISOString().slice(0, 10);
    const updatedHistory = [
      ...history.filter(h => h.date !== today).slice(-30), // keep last 30 days, dedup today
      { date: today, count: currentCount },
    ];

    // Calculate EMA (lambda=0.1, adapts in ~10 days)
    const LAMBDA = 0.1;
    let ema = updatedHistory[0]?.count || 0;
    for (const h of updatedHistory) {
      ema = LAMBDA * h.count + (1 - LAMBDA) * ema;
    }

    // Calculate standard deviation
    const counts = updatedHistory.map(h => h.count);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
    const stdDev = Math.sqrt(variance) || 1; // prevent division by zero

    // Z-score
    const zScore = (currentCount - ema) / stdDev;

    // Persist updated history + EMA
    await supabase
      .from('platform_connections')
      .update({
        activity_metrics: {
          ...metrics,
          memory_count_7d: currentCount,
          ema_history: updatedHistory,
          ema_current: Math.round(ema * 10) / 10,
          std_dev: Math.round(stdDev * 10) / 10,
          calculated_at: new Date().toISOString(),
        },
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    // Need 21+ days of history before flagging anomalies
    if (updatedHistory.length < 21) return null;

    const THRESHOLD = 2.0;
    if (Math.abs(zScore) < THRESHOLD) return null;

    const direction = zScore > 0 ? 'spike' : 'drop';
    const platformName = platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const message = direction === 'spike'
      ? `Unusual spike in ${platformName} activity — ${currentCount} data points this week vs your usual ${Math.round(ema)}`
      : `${platformName} activity dropped significantly — ${currentCount} data points this week vs your usual ${Math.round(ema)}`;

    log.info('Activity anomaly detected', { userId, platform, zScore: Math.round(zScore * 100) / 100, direction, current: currentCount, ema: Math.round(ema) });

    return { anomaly: true, direction, zScore: Math.round(zScore * 100) / 100, message };
  } catch (err) {
    log.warn('Anomaly detection failed', { userId, platform, error: err.message });
    return null;
  }
}
