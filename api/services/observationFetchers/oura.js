/**
 * Oura observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Build Oura tag observations from enhanced tag data.
 */
function _buildOuraTagObservations(observations, tags) {
  if (!tags || tags.length === 0) return;
  const tagNames = tags
    .map(t => sanitizeExternal(t.tag_type_code || t.custom_name || '', 40))
    .filter(Boolean);
  const counts = tagNames.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
  const topTags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  if (topTags.length > 0) {
    observations.push({
      content: `Oura self-tagged events recently: ${topTags.join(', ')} — reflects intentional lifestyle tracking`,
      contentType: 'weekly_summary',
    });
  }
}

/**
 * Store raw Oura API data into user_platform_data for structured access.
 */
async function _storeOuraPlatformData(userId, supabase, { sleepData, readinessData, activityData }) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];

  if (sleepData && sleepData.length > 0) {
    const s = sleepData[0];
    rows.push({
      user_id: userId,
      platform: 'oura',
      data_type: 'sleep',
      source_url: `oura:sleep:${today}`,
      raw_data: {
        score: s.score,
        contributors: s.contributors || {},
        day: s.day,
      },
      processed: true,
    });
  }

  if (readinessData && readinessData.length > 0) {
    const r = readinessData[0];
    rows.push({
      user_id: userId,
      platform: 'oura',
      data_type: 'readiness',
      source_url: `oura:readiness:${today}`,
      raw_data: {
        score: r.score,
        contributors: r.contributors || {},
        temperature_deviation: r.contributors?.body_temperature,
        day: r.day,
      },
      processed: true,
    });
  }

  if (activityData && activityData.length > 0) {
    const a = activityData[0];
    rows.push({
      user_id: userId,
      platform: 'oura',
      data_type: 'activity',
      source_url: `oura:activity:${today}`,
      raw_data: {
        score: a.score,
        steps: a.steps,
        total_calories: a.total_calories,
        active_calories: a.active_calories,
        day: a.day,
      },
      processed: true,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('user_platform_data')
    .upsert(rows, { onConflict: 'user_id,platform,data_type,source_url' });

  if (error) {
    log.warn('Oura user_platform_data upsert error', { error });
  } else {
    log.info('Oura: stored platform data rows', { count: rows.length, userId });
  }
}

async function fetchOuraObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Date range: last 7 days
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const queryParams = `start_date=${startDate}&end_date=${endDate}`;

  // Check for direct OAuth connection first
  const { data: ouraConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'oura')
    .single();

  const isNangoManaged = ouraConn?.access_token === 'NANGO_MANAGED'
    || (!ouraConn && await _hasNangoMapping(supabase, userId, 'oura'));

  if (isNangoManaged) {
    // ── Nango path (legacy) ───────────────────────────────────────────────
    let nangoService;
    try {
      nangoService = await import('../nangoService.js');
    } catch (e) {
      log.warn('Oura: failed to load nangoService', { error: e });
      return observations;
    }

  // ── 1. Daily readiness → readiness score trend ───────────────────────────
  try {
    const readinessResult = await nangoService.oura.getDailyReadiness(userId, startDate, endDate);
    const entries = readinessResult.success ? (readinessResult.data?.data || []) : [];
    if (entries.length >= 3) {
      const scores = entries.map(e => e.score).filter(s => typeof s === 'number');
      if (scores.length > 0) {
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const trend = scores.length >= 5
          ? (scores.slice(-3).reduce((a, b) => a + b, 0) / 3 > scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3 ? 'improving' : 'declining')
          : 'stable';
        observations.push({
          content: `Oura readiness score averages ${avg}/100 over the past 2 weeks (${trend} trend)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Oura readiness error', { error: e });
  }

  // ── 2. Daily stress → stress pattern / chronotype signals ────────────────
  try {
    const stressResult = await nangoService.oura.getDailyStress(userId, startDate, endDate);
    const entries = stressResult.success ? (stressResult.data?.data || []) : [];
    if (entries.length >= 3) {
      const labels = entries.map(e => e.stress_high).filter(s => typeof s === 'string');
      const counts = labels.reduce((acc, l) => { acc[l] = (acc[l] || 0) + 1; return acc; }, {});
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (dominant) {
        const labelMap = { restored: 'low-stress / well-recovered', normal: 'moderate-stress', stressful: 'high-stress' };
        observations.push({
          content: `Oura stress pattern shows mostly ${labelMap[dominant[0]] || dominant[0]} days recently`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Oura stress error', { error: e });
  }

  // ── 3. Daily resilience → long-term trend ────────────────────────────────
  try {
    const resilResult = await nangoService.oura.getDailyResilience(userId, startDate, endDate);
    const entries = resilResult.success ? (resilResult.data?.data || []) : [];
    if (entries.length >= 3) {
      const levels = entries.map(e => e.level).filter(Boolean);
      const levelOrder = { exceptional: 5, strong: 4, adequate: 3, limited: 2, poor: 1 };
      const avgLevel = levels.reduce((a, l) => a + (levelOrder[l] || 3), 0) / levels.length;
      const label = avgLevel >= 4.5 ? 'exceptional' : avgLevel >= 3.5 ? 'strong' : avgLevel >= 2.5 ? 'adequate' : 'limited';
      observations.push({
        content: `Oura resilience level is ${label} — reflects ability to recover from physical and mental stress`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    log.warn('Oura resilience error', { error: e });
  }

  // ── 4. Sleep time → chronotype (bedtime/wake midpoint) ───────────────────
  try {
    const sleepTimeResult = await nangoService.oura.getSleepTime(userId, startDate, endDate);
    const entries = sleepTimeResult.success ? (sleepTimeResult.data?.data || []) : [];
    if (entries.length >= 3) {
      // sleep_time has optimal_bedtime: { start, end } in seconds past midnight
      const bedtimes = entries
        .map(e => e.optimal_bedtime?.start)
        .filter(s => typeof s === 'number');
      if (bedtimes.length > 0) {
        const avgSecs = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
        // Seconds can be negative (before midnight) - normalize to 0-86400
        const normalizedSecs = ((avgSecs % 86400) + 86400) % 86400;
        const hour = Math.floor(normalizedSecs / 3600);
        const chronotype = hour >= 22 || hour < 1 ? 'evening type (10pm–1am)' : hour >= 19 ? 'moderate evening type (7–10pm)' : hour < 5 ? 'night owl (after 1am)' : 'morning type';
        observations.push({
          content: `Oura chronotype: ${chronotype} — natural sleep window centers around ${hour}:00`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Oura sleep time error', { error: e });
  }

  // ── 5. Workouts → type + time-of-day preference ──────────────────────────
  try {
    const workoutResult = await nangoService.oura.getWorkouts(userId, startDate, endDate);
    const workouts = workoutResult.success ? (workoutResult.data?.data || []) : [];
    if (workouts.length > 0) {
      // Count workout types
      const typeCounts = workouts.reduce((acc, w) => {
        const t = sanitizeExternal(w.activity || 'unknown', 40);
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

      // Time-of-day from workout start time
      const hours = workouts
        .map(w => w.start_datetime ? new Date(w.start_datetime).getUTCHours() : null)
        .filter(h => h !== null);
      const amCount = hours.filter(h => h >= 5 && h < 12).length;
      const pmCount = hours.filter(h => h >= 12 && h < 20).length;
      const timeLabel = amCount > pmCount ? 'morning' : pmCount > amCount ? 'afternoon/evening' : 'mixed timing';

      observations.push({
        content: `Oura tracked ${workouts.length} workout(s) in the past 2 weeks: ${topTypes.join(', ')} — mostly ${timeLabel}`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    log.warn('Oura workouts error', { error: e });
  }

  // ── 6. Enhanced tags → user self-annotations ─────────────────────────────
  try {
    const tagsResult = await nangoService.oura.getEnhancedTags(userId, startDate, endDate);
    const tags = tagsResult.success ? (tagsResult.data?.data || []) : [];
    _buildOuraTagObservations(observations, tags);
  } catch (e) {
    log.warn('Oura enhanced tags error', { error: e });
  }

    return observations;
  }

  // ── Direct OAuth path ───────────────────────────────────────────────────
  const tokenResult = await getValidAccessToken(userId, 'oura');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Oura: no valid token', { userId });
    return observations;
  }

  const ouraHeaders = { Authorization: `Bearer ${tokenResult.accessToken}` };
  const OURA_API = 'https://api.ouraring.com/v2/usercollection';

  let sleepData = [];
  let readinessData = [];
  let activityData = [];

  // ── 1. Daily Sleep ────────────────────────────────────────────────────────
  try {
    const sleepRes = await axios.get(
      `${OURA_API}/daily_sleep?${queryParams}`,
      { headers: ouraHeaders, timeout: 10000 }
    );
    sleepData = sleepRes.data?.data || [];

    if (sleepData.length > 0) {
      const latest = sleepData[0];
      const score = latest.score;
      const totalSeconds = latest.contributors?.total_sleep || 0;
      const deepSeconds = latest.contributors?.deep_sleep || 0;
      const remSeconds = latest.contributors?.rem_sleep || 0;

      const parts = [];
      if (score) parts.push(`Sleep score ${score}/100 last night`);
      if (totalSeconds > 0) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.round((totalSeconds % 3600) / 60);
        parts.push(`${h}h ${m}m total`);
      }
      if (deepSeconds > 0) {
        const h = Math.floor(deepSeconds / 3600);
        const m = Math.round((deepSeconds % 3600) / 60);
        parts.push(`${h}h ${m}m deep sleep`);
      }
      if (remSeconds > 0) {
        const h = Math.floor(remSeconds / 3600);
        const m = Math.round((remSeconds % 3600) / 60);
        parts.push(`${h}h ${m}m REM`);
      }

      if (parts.length > 0) {
        observations.push({ content: parts.join(' — '), contentType: 'daily_summary' });
      }

      // Sleep consistency across the week
      if (sleepData.length >= 3) {
        const scores = sleepData.map(s => s.score).filter(s => typeof s === 'number');
        if (scores.length >= 3) {
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const stdDev = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length);
          const consistency = stdDev < 5 ? 'very consistent' : stdDev < 10 ? 'moderately consistent' : 'variable';
          observations.push({
            content: `Oura sleep score averages ${avg}/100 over the past week (${consistency})`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Oura daily_sleep error', { error: e?.response?.status || e.message });
  }

  // ── 2. Daily Readiness ────────────────────────────────────────────────────
  try {
    const readinessRes = await axios.get(
      `${OURA_API}/daily_readiness?${queryParams}`,
      { headers: ouraHeaders, timeout: 10000 }
    );
    readinessData = readinessRes.data?.data || [];

    if (readinessData.length > 0) {
      const latest = readinessData[0];
      const score = latest.score;
      const tempDev = latest.contributors?.body_temperature;
      const hrvBalance = latest.contributors?.hrv_balance;

      if (score) {
        const parts = [`Readiness score ${score}`];
        if (hrvBalance) parts.push(`HRV balance ${hrvBalance}`);
        if (typeof tempDev === 'number') parts.push(`temp deviation ${tempDev > 0 ? '+' : ''}${tempDev.toFixed(1)}`);
        observations.push({ content: parts.join(' — '), contentType: 'daily_summary' });
      }

      // Weekly readiness trend
      if (readinessData.length >= 3) {
        const scores = readinessData.map(r => r.score).filter(s => typeof s === 'number');
        if (scores.length >= 3) {
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const trend = scores.length >= 5
            ? (scores.slice(-3).reduce((a, b) => a + b, 0) / 3 > scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3 ? 'improving' : 'declining')
            : 'stable';
          observations.push({
            content: `Oura readiness score averages ${avg}/100 over the past week (${trend} trend)`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Oura daily_readiness error', { error: e?.response?.status || e.message });
  }

  // ── 3. Daily Activity ─────────────────────────────────────────────────────
  try {
    const activityRes = await axios.get(
      `${OURA_API}/daily_activity?${queryParams}`,
      { headers: ouraHeaders, timeout: 10000 }
    );
    activityData = activityRes.data?.data || [];

    if (activityData.length > 0) {
      const latest = activityData[0];
      const steps = latest.steps;
      const calories = latest.total_calories;
      const activityScore = latest.score;

      const parts = [];
      if (steps) parts.push(`${steps.toLocaleString()} steps`);
      if (calories) parts.push(`${calories.toLocaleString()} cal burned`);
      if (activityScore) parts.push(`activity score ${activityScore}`);

      if (parts.length > 0) {
        observations.push({ content: `Active day: ${parts.join(', ')}`, contentType: 'daily_summary' });
      }

      // Weekly activity trend
      if (activityData.length >= 3) {
        const allSteps = activityData.map(a => a.steps).filter(s => typeof s === 'number');
        if (allSteps.length >= 3) {
          const avgSteps = Math.round(allSteps.reduce((a, b) => a + b, 0) / allSteps.length);
          const activeLevel = avgSteps >= 10000 ? 'highly active' : avgSteps >= 7000 ? 'moderately active' : avgSteps >= 4000 ? 'lightly active' : 'sedentary';
          observations.push({
            content: `Oura weekly step average: ${avgSteps.toLocaleString()} (${activeLevel})`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Oura daily_activity error', { error: e?.response?.status || e.message });
  }

  // ── 4. Heart Rate ─────────────────────────────────────────────────────────
  try {
    const hrRes = await axios.get(
      `${OURA_API}/heartrate?${queryParams}`,
      { headers: ouraHeaders, timeout: 10000 }
    );
    const heartrateData = hrRes.data?.data || [];

    if (heartrateData.length > 0) {
      const bpmValues = heartrateData
        .filter(h => h.source === 'rest' || h.source === 'sleep')
        .map(h => h.bpm)
        .filter(b => typeof b === 'number');

      if (bpmValues.length > 0) {
        const restingHR = Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length);
        const hrLabel = restingHR < 60 ? 'excellent cardiovascular fitness' : restingHR < 70 ? 'good resting HR' : 'elevated resting HR';
        observations.push({
          content: `Resting heart rate ${restingHR}bpm (${hrLabel})`,
          contentType: 'daily_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Oura heartrate error', { error: e?.response?.status || e.message });
  }

  // ── Store raw Oura data in user_platform_data (fire-and-forget) ─────────
  try {
    _storeOuraPlatformData(userId, supabase, { sleepData, readinessData, activityData });
  } catch (e) {
    log.warn('Oura platform data store error', { error: e });
  }

  return observations;
}

export default fetchOuraObservations;
export { fetchOuraObservations };
