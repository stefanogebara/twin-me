/**
 * Garmin observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 *
 * Uses garminDirectService (reverse-engineered web SSO) because the official
 * Garmin Connect Developer Program requires business approval.
 */

import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase } from '../observationUtils.js';

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

  let garmin;
  try {
    garmin = await import('../garminDirectService.js');
  } catch (e) {
    log.warn('Garmin: garminDirectService import failed', { error: e.message });
    return observations;
  }

  const connected = await garmin.hasCredentials(userId);
  if (!connected) {
    log.warn('Garmin: no credentials stored', { userId });
    return observations;
  }

  // ── 1. Daily summary ──────────────────────────────────────────────────────
  try {
    const summaryResult = await garmin.getDailySummary(userId);
    if (summaryResult.success && summaryResult.data) {
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
          const label =
            stressScore < 26 ? 'low stress' :
            stressScore < 51 ? 'moderate stress' :
            stressScore < 76 ? 'high stress' : 'very high stress';
          parts.push(`stress level ${stressScore} (${label})`);
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
    log.warn('Garmin daily summary error', { error: e.message });
  }

  // ── 2. Sleep data ─────────────────────────────────────────────────────────
  try {
    const sleepResult = await garmin.getSleepData(userId);
    if (sleepResult.success && sleepResult.data) {
      const sleepRecord = Array.isArray(sleepResult.data)
        ? sleepResult.data[0]
        : sleepResult.data;

      if (sleepRecord) {
        const durationSec =
          sleepRecord.sleepTimeSeconds ??
          sleepRecord.durationInSeconds ??
          sleepRecord.dailySleepDTO?.sleepTimeSeconds ??
          null;
        const sleepScore =
          sleepRecord.overallSleepScore ??
          sleepRecord.sleepScore ??
          sleepRecord.dailySleepDTO?.sleepScores?.overall?.value ??
          null;

        if (durationSec !== null && durationSec > 0) {
          const hours = durationSec / 3600;
          const label =
            hours >= 7.5 ? 'well-rested' :
            hours >= 6 ? 'moderate sleep' : 'under-slept';
          let obs = `Garmin sleep: ${hours.toFixed(1)} hours (${label})`;
          if (sleepScore !== null && sleepScore > 0) obs += ` — sleep score ${sleepScore}`;
          observations.push({ content: obs, contentType: 'daily_summary' });
        }
      }
    }
  } catch (e) {
    log.warn('Garmin sleep error', { error: e.message });
  }

  // ── 3. Recent activities ──────────────────────────────────────────────────
  try {
    const activitiesResult = await garmin.getActivities(userId);
    if (activitiesResult.success) {
      const activities = Array.isArray(activitiesResult.data)
        ? activitiesResult.data
        : (activitiesResult.data?.activityList || []);

      if (activities.length > 0) {
        const typeCounts = {};
        for (const act of activities.slice(0, 10)) {
          const type = sanitizeExternal(
            act.activityType?.typeKey || act.activityTypePK || act.activityType || 'unknown',
            30
          );
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
    log.warn('Garmin activities error', { error: e.message });
  }

  return observations;
}

export default fetchGarminObservations;
export { fetchGarminObservations };
