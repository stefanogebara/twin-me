/**
 * Strava observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Strava athlete and activity data as natural-language observations.
 * Supports both Nango-managed connections and direct OAuth tokens.
 *
 * Signals emitted:
 *  1. Athlete sport type and follower/following counts
 *  2. Activity type breakdown from last 10 activities
 *  3. Weekly distance and elevation from last 7 days
 *  4. Heart rate zone distribution if available
 */
async function fetchStravaObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check for Nango-managed connection first
  const { data: stravaConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'strava')
    .single();

  const isNangoManaged = stravaConn?.access_token === 'NANGO_MANAGED'
    || (!stravaConn && await _hasNangoMapping(supabase, userId, 'strava'));

  let athleteData = null;
  let activities = [];
  let zonesData = null;
  let directHeaders = null;

  if (isNangoManaged) {
    // ── Nango path ──────────────────────────────────────────────────────────
    let nangoService;
    try {
      nangoService = await import('../nangoService.js');
    } catch (e) {
      log.warn('Strava: nangoService import failed', { error: e });
      return observations;
    }

    try {
      const athleteResult = await nangoService.strava.getAthlete(userId);
      if (athleteResult.success && athleteResult.data) {
        athleteData = athleteResult.data;
      }
    } catch (e) {
      log.warn('Strava athlete profile error (Nango)', { error: e });
    }

    try {
      const activitiesResult = await nangoService.strava.getActivities(userId, 1);
      if (activitiesResult.success && Array.isArray(activitiesResult.data)) {
        activities = activitiesResult.data;
      }
    } catch (e) {
      log.warn('Strava activities error (Nango)', { error: e });
    }

    try {
      const zonesResult = await nangoService.strava.getZones(userId);
      if (zonesResult.success && zonesResult.data) {
        zonesData = zonesResult.data;
      }
    } catch (e) {
      log.warn('Strava zones error (Nango)', { error: e });
    }
  } else {
    // ── Direct OAuth path ───────────────────────────────────────────────────
    const tokenResult = await getValidAccessToken(userId, 'strava');
    if (!tokenResult.success || !tokenResult.accessToken) {
      log.warn('Strava: no valid token', { userId });
      return observations;
    }
    directHeaders = { Authorization: `Bearer ${tokenResult.accessToken}` };

    try {
      const [athleteRes, activitiesRes] = await Promise.all([
        axios.get('https://www.strava.com/api/v3/athlete', { headers: directHeaders, timeout: 10000 }),
        axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: directHeaders,
          params: { per_page: 50 },
          timeout: 10000,
        }),
      ]);
      athleteData = athleteRes.data || null;
      activities = Array.isArray(activitiesRes.data) ? activitiesRes.data : [];
    } catch (e) {
      log.warn('Strava direct API error', { error: e?.response?.data || e.message });
      return observations;
    }

    try {
      const zonesRes = await axios.get('https://www.strava.com/api/v3/athlete/zones', {
        headers: directHeaders,
        timeout: 10000,
      });
      zonesData = zonesRes.data || null;
    } catch (e) {
      log.warn('Strava zones direct API error', { error: e?.response?.data || e.message });
    }
  }

  // ── Store raw Strava data in user_platform_data (fire-and-forget) ─────────
  try {
    supabase.from('user_platform_data').insert({
      user_id: userId,
      platform: 'strava',
      data_type: 'activities',
      raw_data: { athlete: athleteData, activities: activities.slice(0, 30) },
      extracted_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});
  } catch (_e) { /* non-blocking */ }

  // ── 1. Athlete profile ────────────────────────────────────────────────────
  if (athleteData) {
    const country = sanitizeExternal(athleteData.country || '', 50);
    const followers = athleteData.follower_count ?? null;
    const following = athleteData.friend_count ?? null;

    const parts = [];
    if (country) parts.push(`based in ${country}`);
    if (followers !== null) parts.push(`${followers} follower${followers !== 1 ? 's' : ''}`);
    if (following !== null) parts.push(`following ${following} athlete${following !== 1 ? 's' : ''}`);

    if (parts.length > 0) {
      observations.push({
        content: `Strava athlete: ${parts.join(', ')}`,
        contentType: 'weekly_summary',
      });
    }
  }

  if (activities.length > 0) {
    // Activity type breakdown from last 10
    const last10 = activities.slice(0, 10);
    const typeCounts = {};
    for (const act of last10) {
      const type = sanitizeExternal(act.type || act.sport_type || 'Unknown', 30);
      if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    if (typeEntries.length > 0) {
      const typeStr = typeEntries.map(([t, c]) => `${c} ${t.toLowerCase()}${c !== 1 ? 's' : ''}`).join(', ');
      observations.push({
        content: `Recent Strava activities: ${typeStr} (last ${last10.length} activities)`,
        contentType: 'weekly_summary',
      });
    }

    // Weekly distance and elevation (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekActivities = activities.filter(a => {
      const ts = a.start_date ? new Date(a.start_date).getTime() : 0;
      return ts > sevenDaysAgo;
    });

    if (weekActivities.length > 0) {
      const totalDistanceM = weekActivities.reduce((sum, a) => sum + (a.distance || 0), 0);
      const totalElevationM = weekActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
      const totalDistanceKm = totalDistanceM / 1000;
      const parts = [`${weekActivities.length} workout${weekActivities.length !== 1 ? 's' : ''}`];
      if (totalDistanceKm >= 0.1) parts.push(`${totalDistanceKm.toFixed(1)} km total`);
      if (totalElevationM >= 10) parts.push(`${Math.round(totalElevationM)}m elevation gain`);
      observations.push({
        content: `Strava this week: ${parts.join(', ')}`,
        contentType: 'daily_summary',
      });
    }

    // ── Training load: average distance per activity type (last 10) ──────────
    try {
      const last10 = activities.slice(0, 10);
      const distByType = {};
      const countByType = {};
      for (const act of last10) {
        const type = sanitizeExternal(act.type || act.sport_type || 'Unknown', 30);
        if (!type) continue;
        const distKm = (act.distance || 0) / 1000;
        if (distKm > 0) {
          distByType[type] = (distByType[type] || 0) + distKm;
          countByType[type] = (countByType[type] || 0) + 1;
        }
      }
      const avgParts = Object.entries(distByType)
        .filter(([, total]) => total > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([type, total]) => {
          const count = countByType[type] || 1;
          return `averages ${(total / count).toFixed(1)}km per ${type.toLowerCase()}`;
        });
      if (avgParts.length > 0) {
        observations.push({
          content: `Strava training load: ${avgParts.join('; ')} (based on last ${last10.length} activities)`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      log.warn('Strava training load error', { error: e });
    }

    // ── Activity streak: ≥5 active days in last 7 ───────────────────────────
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentDates = new Set(
        activities
          .filter(a => a.start_date && new Date(a.start_date).getTime() > sevenDaysAgo)
          .map(a => new Date(a.start_date).toISOString().slice(0, 10))
      );
      if (recentDates.size >= 5) {
        observations.push({
          content: `Strava active streak: ${recentDates.size} out of the last 7 days had a recorded workout`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      log.warn('Strava streak error', { error: e });
    }

    // ── Intensity distribution from average heart rate ────────────────────
    try {
      const last10 = activities.slice(0, 10);
      const activitiesWithHR = last10.filter(a => a.average_heartrate && a.average_heartrate > 0);
      if (activitiesWithHR.length >= 3) {
        let easy = 0, moderate = 0, hard = 0;
        for (const act of activitiesWithHR) {
          const hr = act.average_heartrate;
          if (hr < 140) easy++;
          else if (hr < 165) moderate++;
          else hard++;
        }
        const total = activitiesWithHR.length;
        const easyPct = Math.round((easy / total) * 100);
        const modPct = Math.round((moderate / total) * 100);
        const hardPct = Math.round((hard / total) * 100);
        observations.push({
          content: `Strava recent training intensity: ${easyPct}% easy, ${modPct}% moderate, ${hardPct}% hard (based on avg HR across ${total} activities)`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      log.warn('Strava intensity distribution error', { error: e });
    }

    // ── Personal records ──────────────────────────────────────────────────
    try {
      const recentPRActivities = activities
        .slice(0, 10)
        .filter(a => (a.pr_count ?? 0) > 0);
      if (recentPRActivities.length > 0) {
        const prTypes = [...new Set(
          recentPRActivities.map(a => sanitizeExternal(a.type || a.sport_type || 'activity', 30))
        )].filter(Boolean);
        const typeStr = prTypes.slice(0, 3).join(', ');
        const totalPRs = recentPRActivities.reduce((sum, a) => sum + (a.pr_count || 0), 0);
        observations.push({
          content: `Set ${totalPRs} personal record${totalPRs !== 1 ? 's' : ''} in recent Strava ${typeStr} activities`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      log.warn('Strava personal records error', { error: e });
    }

    // ── Gear insight: dominant gear per activity type ──────────────────────
    try {
      const last10 = activities.slice(0, 10);
      const gearByType = {};
      for (const act of last10) {
        const type = sanitizeExternal(act.type || act.sport_type || 'Unknown', 30);
        const gearId = act.gear_id || null;
        if (!type || !gearId) continue;
        if (!gearByType[type]) gearByType[type] = {};
        gearByType[type][gearId] = (gearByType[type][gearId] || 0) + 1;
      }
      const gearInsights = [];
      for (const [type, gearCounts] of Object.entries(gearByType)) {
        const entries = Object.entries(gearCounts).sort((a, b) => b[1] - a[1]);
        const [topGearId, topCount] = entries[0];
        const totalForType = Object.values(gearCounts).reduce((a, b) => a + b, 0);
        if (topCount >= 3 && topCount === totalForType) {
          gearInsights.push(`${type.toLowerCase()} (always same gear)`);
        } else if (totalForType >= 4 && topCount / totalForType >= 0.75) {
          gearInsights.push(`${type.toLowerCase()} (primarily one piece of gear)`);
        }
      }
      if (gearInsights.length > 0) {
        observations.push({
          content: `Strava gear: primarily uses one piece of gear for ${gearInsights.join(' and ')}`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      log.warn('Strava gear insight error', { error: e });
    }
  }

  // ── 3. Heart rate zones if available ────────────────────────────────────
  try {
    if (zonesData?.heart_rate?.zones) {
      const zones = zonesData.heart_rate.zones;
      // Find the zone with the most time spent
      const topZone = zones.reduce((best, z) => (z.time > (best?.time || 0) ? z : best), null);
      if (topZone && topZone.time > 0 && topZone.max !== -1) {
        const zoneName = sanitizeExternal(topZone.name || `Zone ${zones.indexOf(topZone) + 1}`, 30);
        const minutes = Math.round(topZone.time / 60);
        if (minutes > 0) {
          observations.push({
            content: `Spends most Strava training time in ${zoneName} heart rate zone (${minutes} min)`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Strava zones error', { error: e });
  }

  return observations;
}

export default fetchStravaObservations;
export { fetchStravaObservations };
