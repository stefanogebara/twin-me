/**
 * Whoop observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Store raw Whoop API data into user_platform_data for structured access.
 * Uses upsert keyed on (user_id, platform, data_type, source_url) where
 * source_url encodes the date to give one row per data type per day.
 */
async function storeWhoopPlatformData(userId, supabase, { recoveryData, recoveryHistory, sleepData, workoutData }) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rows = [];

  // Recovery — store latest
  if (recoveryData?.score) {
    rows.push({
      user_id: userId,
      platform: 'whoop',
      data_type: 'recovery',
      source_url: `whoop:recovery:${today}`,
      raw_data: {
        recovery_score: recoveryData.score.recovery_score,
        hrv_rmssd_milli: recoveryData.score.hrv_rmssd_milli,
        resting_heart_rate: recoveryData.score.resting_heart_rate,
        spo2_percentage: recoveryData.score.spo2_percentage,
        skin_temp_celsius: recoveryData.score.skin_temp_celsius,
        created_at: recoveryData.created_at,
        history: (recoveryHistory || []).slice(0, 3).map(r => ({
          recovery_score: r?.score?.recovery_score,
          hrv_rmssd_milli: r?.score?.hrv_rmssd_milli,
          created_at: r?.created_at,
        })),
      },
      processed: true,
    });
  }

  // Sleep — store latest
  if (sleepData.length > 0) {
    const s = sleepData[0];
    const stageSummary = s.score?.stage_summary || {};
    const totalSleepMs = s.score?.total_sleep_time_milli
      || (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0))
      || 0;
    rows.push({
      user_id: userId,
      platform: 'whoop',
      data_type: 'sleep',
      source_url: `whoop:sleep:${today}`,
      raw_data: {
        total_sleep_hours: +(totalSleepMs / (1000 * 60 * 60)).toFixed(2),
        sleep_performance_percentage: s.score?.sleep_performance_percentage,
        respiratory_rate: s.score?.respiratory_rate,
        disturbances: stageSummary.disturbance_count,
        rem_milli: stageSummary.total_rem_sleep_time_milli,
        deep_milli: stageSummary.total_slow_wave_sleep_time_milli,
        light_milli: stageSummary.total_light_sleep_time_milli,
        awake_milli: stageSummary.total_awake_time_milli,
        start: s.start,
        end: s.end,
      },
      processed: true,
    });
  }

  // Workout — store latest
  if (workoutData.length > 0) {
    const w = workoutData[0];
    rows.push({
      user_id: userId,
      platform: 'whoop',
      data_type: 'workout',
      source_url: `whoop:workout:${today}`,
      raw_data: {
        sport_id: w.sport_id,
        strain: w.score?.strain,
        average_heart_rate: w.score?.average_heart_rate,
        max_heart_rate: w.score?.max_heart_rate,
        kilojoule: w.score?.kilojoule,
        distance_meter: w.score?.distance_meter,
        zone_zero_milli: w.score?.zone_zero_milli,
        zone_one_milli: w.score?.zone_one_milli,
        zone_two_milli: w.score?.zone_two_milli,
        zone_three_milli: w.score?.zone_three_milli,
        zone_four_milli: w.score?.zone_four_milli,
        zone_five_milli: w.score?.zone_five_milli,
        start: w.start,
        end: w.end,
      },
      processed: true,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('user_platform_data')
    .upsert(rows, { onConflict: 'user_id,platform,data_type,source_url' });

  if (error) {
    log.warn('Whoop user_platform_data upsert error', { error });
  } else {
    log.info('Whoop: stored platform data rows', { count: rows.length, userId });
  }
}

/**
 * Fetch Whoop health data and return natural-language observations.
 * Supports both Nango-managed connections and direct OAuth tokens.
 */
async function fetchWhoopObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check if this is a Nango-managed Whoop connection
  const { data: whoopConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'whoop')
    .single();

  // Also check nango_connection_mappings for users whose Whoop is Nango-only
  const isNangoManaged = whoopConn?.access_token === 'NANGO_MANAGED' || (!whoopConn && await _hasNangoMapping(supabase, userId, 'whoop'));

  let recoveryData = null;
  let recoveryHistory = [];
  let sleepData = [];
  let workoutData = [];
  let directHeaders = null;

  if (isNangoManaged) {
    try {
      const nangoService = await import('../nangoService.js');
      const [recoveryResult, sleepResult] = await Promise.all([
        nangoService.whoop.getRecovery(userId, 3),
        nangoService.whoop.getSleep(userId, 3),
      ]);
      recoveryHistory = recoveryResult.success ? (recoveryResult.data?.records || []) : [];
      recoveryData = recoveryHistory[0] || null;
      sleepData = sleepResult.success ? (sleepResult.data?.records || []) : [];
    } catch (e) {
      log.warn('Whoop Nango fetch error', { error: e });
      return observations;
    }

    // ── Workout data (Nango) ────────────────────────────────────────────────
    try {
      const nangoService = await import('../nangoService.js');
      if (typeof nangoService.whoop?.getWorkout === 'function') {
        const workoutResult = await nangoService.whoop.getWorkout(userId, 5);
        workoutData = workoutResult.success ? (workoutResult.data?.records || []) : [];
      }
    } catch (e) {
      log.warn('Whoop workout fetch error', { error: e });
    }
  } else {
    const tokenResult = await getValidAccessToken(userId, 'whoop');
    if (!tokenResult.success || !tokenResult.accessToken) {
      log.warn('Whoop: no valid token', { userId });
      return observations;
    }
    directHeaders = { Authorization: `Bearer ${tokenResult.accessToken}` };
    try {
      const [recoveryRes, sleepRes] = await Promise.all([
        axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=3', { headers: directHeaders, timeout: 10000 }),
        axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=3', { headers: directHeaders, timeout: 10000 }),
      ]);
      recoveryHistory = recoveryRes.data?.records || [];
      recoveryData = recoveryHistory[0] || null;
      sleepData = sleepRes.data?.records || [];
    } catch (e) {
      log.warn('Whoop direct API error', { error: e });
      return observations;
    }

    // ── Workout data (direct) ───────────────────────────────────────────────
    try {
      const workoutRes = await axios.get(
        'https://api.prod.whoop.com/developer/v2/activity/workout?limit=5',
        { headers: directHeaders, timeout: 10000 }
      );
      workoutData = workoutRes.data?.records || [];
    } catch (e) {
      log.warn('Whoop workout direct API error', { error: e });
    }
  }

  // ── Store raw Whoop data in user_platform_data (fire-and-forget) ─────────
  try {
    storeWhoopPlatformData(userId, supabase, { recoveryData, recoveryHistory, sleepData, workoutData });
  } catch (e) {
    log.warn('Whoop platform data store error', { error: e });
  }

  // ── Recovery observation ──────────────────────────────────────────────────
  const recoveryScore = recoveryData?.score?.recovery_score ?? null;
  const hrv = recoveryData?.score?.hrv_rmssd_milli ? Math.round(recoveryData.score.hrv_rmssd_milli) : null;
  const restingHR = recoveryData?.score?.resting_heart_rate ? Math.round(recoveryData.score.resting_heart_rate) : null;

  const spo2 = recoveryData?.score?.spo2_percentage ?? null;
  const skinTemp = recoveryData?.score?.skin_temp_celsius != null
    ? Math.round(recoveryData.score.skin_temp_celsius * 10) / 10
    : null;

  if (recoveryScore !== null) {
    const recoveryLabel = recoveryScore >= 70 ? 'high' : recoveryScore >= 50 ? 'moderate' : 'low';
    const parts = [`Recovery score: ${recoveryScore}% (${recoveryLabel} recovery)`];
    if (hrv) parts.push(`HRV ${hrv}ms`);
    if (restingHR) parts.push(`resting heart rate ${restingHR}bpm`);
    if (spo2) parts.push(`SpO2 ${spo2}%`);
    if (skinTemp) parts.push(`skin temp ${skinTemp}°C`);
    observations.push({
      content: parts.join(', '),
      contentType: 'daily_summary',
    });

    // Actionable insight for extremes
    if (recoveryScore >= 85) {
      observations.push({ content: 'Excellent Whoop recovery today — body is primed and energized', contentType: 'daily_summary' });
    } else if (recoveryScore < 40) {
      observations.push({ content: `Low Whoop recovery (${recoveryScore}%) — likely needs rest or light activity`, contentType: 'daily_summary' });
    }
  }

  // ── 3-day low recovery streak ─────────────────────────────────────────────
  try {
    if (recoveryHistory.length >= 3) {
      const last3Scores = recoveryHistory.slice(0, 3)
        .map(r => r?.score?.recovery_score ?? null)
        .filter(s => s !== null);
      if (last3Scores.length === 3 && last3Scores.every(s => s < 50)) {
        observations.push({
          content: `3-day low recovery streak on Whoop (scores: ${last3Scores.join('%, ')}%) — likely overtraining or poor sleep`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Whoop recovery streak error', { error: e });
  }

  // ── Sleep observation ─────────────────────────────────────────────────────
  if (sleepData.length > 0) {
    const latestSleep = sleepData[0];
    const stageSummary = latestSleep.score?.stage_summary || {};
    const totalSleepMs = latestSleep.score?.total_sleep_time_milli
      || (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0))
      || stageSummary.total_in_bed_time_milli
      || 0;
    const sleepHours = totalSleepMs / (1000 * 60 * 60);
    const sleepPerf = latestSleep.score?.sleep_performance_percentage ?? null;

    if (sleepHours > 0.5) {
      const sleepLabel = sleepHours >= 7.5 ? 'well-rested' : sleepHours >= 6 ? 'moderate sleep' : 'under-slept';
      let obs = `Slept ${sleepHours.toFixed(1)} hours (${sleepLabel})`;
      if (sleepPerf !== null) obs += ` — sleep performance ${sleepPerf}%`;
      observations.push({ content: obs, contentType: 'daily_summary' });

      // Sleep detail: respiratory rate, disturbances, consistency, stage breakdown
      const respiratoryRate = latestSleep.score?.respiratory_rate ?? null;
      const disturbances = stageSummary.disturbance_count ?? null;
      const sleepConsistency = latestSleep.score?.sleep_consistency_percentage ?? null;
      const remMs = stageSummary.total_rem_sleep_time_milli ?? 0;
      const deepMs = stageSummary.total_slow_wave_sleep_time_milli ?? 0;

      const detailParts = [];
      if (respiratoryRate) detailParts.push(`respiratory rate ${Math.round(respiratoryRate)} breaths/min`);
      if (disturbances !== null) detailParts.push(`${disturbances} disturbance${disturbances !== 1 ? 's' : ''}`);
      if (sleepConsistency !== null) detailParts.push(`consistency ${sleepConsistency}%`);
      if (totalSleepMs > 0 && (remMs > 0 || deepMs > 0)) {
        const remPct = Math.round((remMs / totalSleepMs) * 100);
        const deepPct = Math.round((deepMs / totalSleepMs) * 100);
        detailParts.push(`${remPct}% REM, ${deepPct}% deep sleep`);
      }
      if (detailParts.length > 0) {
        observations.push({
          content: `Sleep details: ${detailParts.join(', ')}`,
          contentType: 'daily_summary',
        });
      }
    }
  }

  // ── Sleep consistency: compare last 3 bedtimes ────────────────────────────
  try {
    if (sleepData.length >= 3) {
      const startMinutes = sleepData.slice(0, 3).map(s => {
        if (!s.start) return null;
        const d = new Date(s.start);
        // Minutes past midnight; shift post-noon values negative so 11pm and 1am cluster
        let mins = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (mins > 12 * 60) mins -= 24 * 60;
        return mins;
      }).filter(m => m !== null);

      if (startMinutes.length >= 3) {
        const maxDiff = Math.max(...startMinutes) - Math.min(...startMinutes);
        if (maxDiff <= 30) {
          observations.push({
            content: 'Consistent sleep schedule — bedtime varies by less than 30 minutes over the last 3 nights',
            contentType: 'weekly_summary',
          });
        } else if (maxDiff > 120) {
          observations.push({
            content: `Irregular sleep timing — bedtime varies by over ${Math.round(maxDiff / 60)} hours across the last 3 nights`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Whoop sleep consistency error', { error: e });
  }

  // ── Workout data: type, strain, HR zone breakdown ─────────────────────────
  try {
    if (workoutData.length > 0) {
      const latestWorkout = workoutData[0];
      const sportId = latestWorkout.sport_id ?? null;
      const strain = latestWorkout.score?.strain ?? null;
      const avgHR = latestWorkout.score?.average_heart_rate ?? null;
      const maxHR = latestWorkout.score?.max_heart_rate ?? null;
      const calsBurned = latestWorkout.score?.kilojoule != null
        ? Math.round(latestWorkout.score.kilojoule * 0.239006)
        : null;

      const WHOOP_SPORTS = {
        0: 'Activity', 1: 'Running', 2: 'Cycling', 3: 'Baseball', 4: 'Basketball',
        5: 'Rowing', 6: 'Fencing', 7: 'Field Hockey', 8: 'Football', 9: 'Golf',
        10: 'Ice Hockey', 11: 'Lacrosse', 12: 'Rugby', 13: 'Skiing', 14: 'Soccer',
        15: 'Softball', 16: 'Squash', 17: 'Swimming', 18: 'Tennis', 19: 'Track',
        20: 'Volleyball', 21: 'Water Polo', 22: 'Wrestling', 23: 'Boxing',
        24: 'Dance', 25: 'Pilates', 26: 'Yoga', 27: 'Weightlifting', 28: 'CrossFit',
        29: 'Functional Fitness', 30: 'Duathlon', 31: 'Gymnastics', 32: 'Hiking',
        33: 'Horseback Riding', 34: 'Kayaking', 35: 'Martial Arts', 36: 'Mountain Biking',
        37: 'Powerlifting', 38: 'Rock Climbing', 39: 'Paddleboarding', 40: 'Triathlon',
        41: 'Walking', 42: 'Surfing', 43: 'Elliptical', 44: 'Stairmaster',
      };
      const sportName = sanitizeExternal(
        sportId !== null ? (WHOOP_SPORTS[sportId] || `Sport ${sportId}`) : 'workout',
        40
      );

      if (strain !== null) {
        const strainLabel = strain >= 18 ? 'all-out effort' : strain >= 14 ? 'hard day' : strain >= 10 ? 'moderate' : 'recovery day';
        const parts = [`Latest Whoop workout: ${sportName} — strain ${strain.toFixed(1)}/21 (${strainLabel})`];
        if (avgHR) parts.push(`avg HR ${avgHR}bpm`);
        if (maxHR) parts.push(`max HR ${maxHR}bpm`);
        if (calsBurned) parts.push(`~${calsBurned} kcal`);
        observations.push({ content: parts.join(', '), contentType: 'daily_summary' });
      }

      // HR zone breakdown across recent workouts
      const zoneKeys = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'];
      const zoneTotals = new Array(6).fill(0);
      let hasZoneData = false;
      for (const w of workoutData) {
        for (let i = 0; i < zoneKeys.length; i++) {
          const v = w.score?.[zoneKeys[i]] ?? 0;
          if (v > 0) { hasZoneData = true; zoneTotals[i] += v; }
        }
      }
      if (hasZoneData) {
        const totalMs = zoneTotals.reduce((a, b) => a + b, 0);
        if (totalMs > 0) {
          const easyPct = Math.round(((zoneTotals[0] + zoneTotals[1] + zoneTotals[2]) / totalMs) * 100);
          const moderatePct = Math.round((zoneTotals[3] / totalMs) * 100);
          const hardPct = Math.round(((zoneTotals[4] + zoneTotals[5]) / totalMs) * 100);
          if (easyPct + moderatePct + hardPct > 0) {
            observations.push({
              content: `Whoop HR zone breakdown (last ${workoutData.length} workout${workoutData.length !== 1 ? 's' : ''}): ${easyPct}% easy, ${moderatePct}% moderate, ${hardPct}% hard`,
              contentType: 'weekly_summary',
            });
          }
        }
      }
    }
  } catch (e) {
    log.warn('Whoop workout observation error', { error: e });
  }

  return observations;
}

export default fetchWhoopObservations;
export { fetchWhoopObservations, storeWhoopPlatformData };
