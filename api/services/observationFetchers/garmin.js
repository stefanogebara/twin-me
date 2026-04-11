/**
 * Garmin observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Garmin Connect daily health data as natural-language observations.
 *
 * Signals emitted:
 *  1. Daily summary: steps, active calories, stress score
 *  2. Sleep: duration and sleep score
 *  3. Recent activities: types and count
 */
async function fetchGarminObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'garmin');
  if (!isNangoManaged) {
    log.warn('Garmin: no Nango connection', { userId });
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('../nangoService.js');
  } catch (e) {
    log.warn('Garmin: nangoService import failed', { error: e });
    return observations;
  }

  // ── 1. Daily summary ──────────────────────────────────────────────────────
  try {
    const summaryResult = await nangoService.garmin.getDailySummary(userId);
    if (summaryResult.success && summaryResult.data) {
      // Garmin Wellness API may return an array or a single object
      const summary = Array.isArray(summaryResult.data)
        ? summaryResult.data[0]
        : summaryResult.data;

      if (summary) {
        const steps = summary.steps ?? summary.totalSteps ?? null;
        const activeCalories = summary.activeKilocalories ?? summary.activeCalories ?? null;
        const stressScore = summary.averageStressLevel ?? summary.stressLevel ?? null;

        const parts = [];
        if (steps !== null && steps > 0) parts.push(`${steps.toLocaleString()} steps`);
        if (activeCalories !== null && activeCalories > 0) parts.push(`${activeCalories} active calories`);
        if (stressScore !== null && stressScore > 0) {
          const stressLabel = stressScore < 26 ? 'low stress' : stressScore < 51 ? 'moderate stress' : stressScore < 76 ? 'high stress' : 'very high stress';
          parts.push(`stress level ${stressScore} (${stressLabel})`);
        }

        if (parts.length > 0) {
          observations.push({
            content: `Garmin daily summary: ${parts.join(', ')}`,
            contentType: 'daily_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Garmin daily summary error', { error: e });
  }

  // ── 2. Sleep data ─────────────────────────────────────────────────────────
  try {
    const sleepResult = await nangoService.garmin.getSleepData(userId);
    if (sleepResult.success && sleepResult.data) {
      const sleepRecord = Array.isArray(sleepResult.data)
        ? sleepResult.data[0]
        : sleepResult.data;

      if (sleepRecord) {
        // Duration in seconds is common in Garmin responses
        const durationSec = sleepRecord.sleepTimeSeconds ?? sleepRecord.durationInSeconds ?? null;
        const sleepScore = sleepRecord.overallSleepScore ?? sleepRecord.sleepScore ?? null;

        if (durationSec !== null && durationSec > 0) {
          const hours = durationSec / 3600;
          const sleepLabel = hours >= 7.5 ? 'well-rested' : hours >= 6 ? 'moderate sleep' : 'under-slept';
          let obs = `Garmin sleep: ${hours.toFixed(1)} hours (${sleepLabel})`;
          if (sleepScore !== null && sleepScore > 0) obs += ` — sleep score ${sleepScore}`;
          observations.push({ content: obs, contentType: 'daily_summary' });
        }
      }
    }
  } catch (e) {
    log.warn('Garmin sleep error', { error: e });
  }

  // ── 3. Recent activities ──────────────────────────────────────────────────
  try {
    const activitiesResult = await nangoService.garmin.getActivities(userId);
    if (activitiesResult.success) {
      const activities = Array.isArray(activitiesResult.data)
        ? activitiesResult.data
        : (activitiesResult.data?.activityList || []);

      if (activities.length > 0) {
        const typeCounts = {};
        for (const act of activities.slice(0, 10)) {
          const type = sanitizeExternal(act.activityType?.typeKey || act.activityTypePK || act.activityType || 'unknown', 30);
          const normalType = type.replace(/_/g, ' ').toLowerCase();
          if (normalType) typeCounts[normalType] = (typeCounts[normalType] || 0) + 1;
        }
        const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
        if (typeEntries.length > 0) {
          const typeStr = typeEntries.map(([t, c]) => `${c}x ${t}`).join(', ');
          observations.push({
            content: `Recent Garmin activities: ${typeStr}`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Garmin activities error', { error: e });
  }

  return observations;
}

export default fetchGarminObservations;
export { fetchGarminObservations };
