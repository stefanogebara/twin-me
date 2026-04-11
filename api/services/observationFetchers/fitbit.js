/**
 * Fitbit observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import { createLogger } from '../logger.js';
import { getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Fitbit daily health data as natural-language observations.
 *
 * Signals emitted:
 *  1. Today's activity summary: steps, calories, distance, active minutes
 *  2. Sleep: duration and efficiency score
 *  3. Resting heart rate
 */
async function fetchFitbitObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'fitbit');
  if (!isNangoManaged) {
    log.warn('Fitbit: no Nango connection', { userId });
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('../nangoService.js');
  } catch (e) {
    log.warn('Fitbit: nangoService import failed', { error: e });
    return observations;
  }

  // ── 1. Today's activity summary ───────────────────────────────────────────
  try {
    const activityResult = await nangoService.fitbit.getActivities(userId, 'today');
    if (activityResult.success && activityResult.data?.summary) {
      const summary = activityResult.data.summary;
      const steps = summary.steps ?? null;
      const calories = summary.caloriesOut ?? null;
      const distanceKm = summary.distances?.find(d => d.activity === 'total')?.distance ?? null;
      const activeMins = (summary.fairlyActiveMinutes ?? 0) + (summary.veryActiveMinutes ?? 0);

      const parts = [];
      if (steps !== null && steps > 0) parts.push(`${steps.toLocaleString()} steps`);
      if (calories !== null && calories > 0) parts.push(`${calories} calories burned`);
      if (distanceKm !== null && distanceKm > 0) parts.push(`${distanceKm.toFixed(2)} km`);
      if (activeMins > 0) parts.push(`${activeMins} active minutes`);

      if (parts.length > 0) {
        observations.push({
          content: `Fitbit today: ${parts.join(', ')}`,
          contentType: 'daily_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Fitbit activity error', { error: e });
  }

  // ── 2. Sleep ──────────────────────────────────────────────────────────────
  try {
    const sleepResult = await nangoService.fitbit.getSleep(userId, 'today');
    if (sleepResult.success && sleepResult.data?.summary) {
      const summary = sleepResult.data.summary;
      const totalMinutes = summary.totalMinutesAsleep ?? null;
      const efficiency = sleepResult.data?.sleep?.[0]?.efficiency ?? null;

      if (totalMinutes !== null && totalMinutes > 0) {
        const hours = totalMinutes / 60;
        const sleepLabel = hours >= 7.5 ? 'well-rested' : hours >= 6 ? 'moderate sleep' : 'under-slept';
        let obs = `Fitbit sleep: ${hours.toFixed(1)} hours (${sleepLabel})`;
        if (efficiency !== null && efficiency > 0) obs += ` — efficiency ${efficiency}%`;
        observations.push({ content: obs, contentType: 'daily_summary' });
      }
    }
  } catch (e) {
    log.warn('Fitbit sleep error', { error: e });
  }

  // ── 3. Resting heart rate ─────────────────────────────────────────────────
  try {
    const hrResult = await nangoService.fitbit.getHeartRate(userId, 'today');
    if (hrResult.success && hrResult.data) {
      // Fitbit heart rate response: activities-heart[0].value.restingHeartRate
      const hrData = hrResult.data['activities-heart'];
      const restingHR = Array.isArray(hrData)
        ? hrData[0]?.value?.restingHeartRate ?? null
        : null;

      if (restingHR !== null && restingHR > 0) {
        const hrLabel = restingHR < 60 ? 'athlete-level' : restingHR < 70 ? 'excellent' : restingHR < 80 ? 'good' : restingHR < 90 ? 'average' : 'elevated';
        observations.push({
          content: `Fitbit resting heart rate: ${restingHR} bpm (${hrLabel})`,
          contentType: 'daily_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Fitbit heart rate error', { error: e });
  }

  return observations;
}

export default fetchFitbitObservations;
export { fetchFitbitObservations };
