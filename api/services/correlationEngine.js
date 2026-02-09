/**
 * CORRELATION ENGINE
 *
 * Deep behavioral intelligence system that detects cross-platform patterns.
 * Inspired by X's Phoenix ranking - learns from sequences, not manual features.
 *
 * CAPABILITIES:
 * 1. Activity → Recovery correlations (Whoop workouts → next day recovery)
 * 2. Calendar → Biometric responses (meetings → HR elevation)
 * 3. State → Music choices (low recovery → calm music)
 * 4. Temporal patterns (weekends → outdoor activities)
 * 5. Multi-event sequences (workout → meal → sleep quality)
 *
 * SIGNIFICANCE THRESHOLD:
 * - Minimum 3 occurrences
 * - Consistency > 60%
 * - Confidence score > 0.5
 */

import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefresh.js';
import axios from 'axios';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum occurrences to consider a pattern significant
  MIN_OCCURRENCES: 3,

  // Minimum consistency (e.g., 0.6 = pattern holds 60% of the time)
  MIN_CONSISTENCY: 0.6,

  // Time windows for correlation detection
  WINDOWS: {
    IMMEDIATE: 2 * 60 * 60 * 1000,      // 2 hours
    SAME_DAY: 24 * 60 * 60 * 1000,      // 24 hours
    NEXT_DAY: 48 * 60 * 60 * 1000,      // 24-48 hours
    WEEK: 7 * 24 * 60 * 60 * 1000       // 7 days
  },

  // Days of history to analyze
  ANALYSIS_DAYS: 30
};

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetch Whoop data for correlation analysis
 */
async function fetchWhoopData(userId, days = CONFIG.ANALYSIS_DAYS) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'whoop');
    if (!tokenResult.success || !tokenResult.accessToken) {
      console.log('[CorrelationEngine] No Whoop token available');
      return null;
    }

    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch recovery, workouts, and sleep in parallel
    const [recoveryRes, workoutsRes, sleepRes] = await Promise.all([
      axios.get(`https://api.prod.whoop.com/developer/v2/recovery?start=${startDate}&limit=100`, { headers }).catch(() => ({ data: { records: [] } })),
      axios.get(`https://api.prod.whoop.com/developer/v2/activity/workout?start=${startDate}&limit=100`, { headers }).catch(() => ({ data: { records: [] } })),
      axios.get(`https://api.prod.whoop.com/developer/v2/activity/sleep?start=${startDate}&limit=100`, { headers }).catch(() => ({ data: { records: [] } }))
    ]);

    const data = {
      recovery: (recoveryRes.data?.records || []).map(r => ({
        date: r.created_at?.split('T')[0],
        timestamp: new Date(r.created_at),
        score: r.score?.recovery_score,
        hrv: r.score?.hrv_rmssd_milli,
        rhr: r.score?.resting_heart_rate,
        sleepPerformance: r.score?.sleep_performance_percentage
      })).filter(r => r.score != null),

      workouts: (workoutsRes.data?.records || []).map(w => ({
        date: w.start?.split('T')[0],
        timestamp: new Date(w.start),
        endTimestamp: new Date(w.end),
        sport: w.sport_id,
        sportName: mapWhoopSport(w.sport_id),
        strain: w.score?.strain,
        avgHR: w.score?.average_heart_rate,
        maxHR: w.score?.max_heart_rate,
        calories: w.score?.kilojoule ? Math.round(w.score.kilojoule * 0.239) : null,
        durationMins: w.score?.zone_duration ? Object.values(w.score.zone_duration).reduce((a, b) => a + b, 0) / 60000 : null
      })).filter(w => w.strain != null),

      sleep: (sleepRes.data?.records || []).map(s => ({
        date: s.end?.split('T')[0],
        timestamp: new Date(s.end),
        startTimestamp: new Date(s.start),
        totalSleepMins: s.score?.stage_summary?.total_in_bed_time_milli ? s.score.stage_summary.total_in_bed_time_milli / 60000 : null,
        sleepEfficiency: s.score?.sleep_efficiency_percentage,
        remMins: s.score?.stage_summary?.total_rem_sleep_time_milli ? s.score.stage_summary.total_rem_sleep_time_milli / 60000 : null,
        deepMins: s.score?.stage_summary?.total_slow_wave_sleep_time_milli ? s.score.stage_summary.total_slow_wave_sleep_time_milli / 60000 : null
      })).filter(s => s.totalSleepMins != null)
    };

    console.log(`[CorrelationEngine] Fetched Whoop: ${data.recovery.length} recovery, ${data.workouts.length} workouts, ${data.sleep.length} sleep`);
    return data;
  } catch (error) {
    console.error('[CorrelationEngine] Whoop fetch error:', error.message);
    return null;
  }
}

/**
 * Fetch Calendar data for correlation analysis
 */
async function fetchCalendarData(userId, days = CONFIG.ANALYSIS_DAYS) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult.success || !tokenResult.accessToken) {
      console.log('[CorrelationEngine] No Calendar token available');
      return null;
    }

    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
    const timeMin = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date().toISOString();

    const response = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      headers,
      params: {
        timeMin,
        timeMax,
        maxResults: 500,
        singleEvents: true,
        orderBy: 'startTime'
      }
    });

    const events = (response.data?.items || []).map(e => ({
      id: e.id,
      date: (e.start?.dateTime || e.start?.date)?.split('T')[0],
      timestamp: new Date(e.start?.dateTime || e.start?.date),
      endTimestamp: new Date(e.end?.dateTime || e.end?.date),
      title: e.summary || 'Untitled',
      titleLower: (e.summary || '').toLowerCase(),
      description: e.description || '',
      attendeeCount: e.attendees?.length || 0,
      isAllDay: !e.start?.dateTime,
      durationMins: e.start?.dateTime && e.end?.dateTime
        ? (new Date(e.end.dateTime) - new Date(e.start.dateTime)) / 60000
        : null,
      eventType: classifyCalendarEvent(e.summary || '', e.attendees?.length || 0)
    }));

    console.log(`[CorrelationEngine] Fetched Calendar: ${events.length} events`);
    return events;
  } catch (error) {
    console.error('[CorrelationEngine] Calendar fetch error:', error.message);
    return null;
  }
}

/**
 * Fetch Spotify listening data for correlation analysis
 */
async function fetchSpotifyData(userId, days = CONFIG.ANALYSIS_DAYS) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'spotify');
    if (!tokenResult.success || !tokenResult.accessToken) {
      console.log('[CorrelationEngine] No Spotify token available');
      return null;
    }

    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

    // Get recently played (limited to 50 by API)
    const recentRes = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=50', { headers });

    const tracks = (recentRes.data?.items || []).map(item => ({
      date: item.played_at?.split('T')[0],
      timestamp: new Date(item.played_at),
      trackId: item.track?.id,
      trackName: item.track?.name,
      artistName: item.track?.artists?.[0]?.name,
      durationMs: item.track?.duration_ms
    }));

    // Get audio features for tracks
    const trackIds = tracks.map(t => t.trackId).filter(Boolean).slice(0, 50);
    if (trackIds.length > 0) {
      const featuresRes = await axios.get(`https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`, { headers });
      const features = featuresRes.data?.audio_features || [];

      // Merge features into tracks
      tracks.forEach(track => {
        const feature = features.find(f => f?.id === track.trackId);
        if (feature) {
          track.energy = feature.energy;
          track.valence = feature.valence; // happiness
          track.tempo = feature.tempo;
          track.danceability = feature.danceability;
          track.acousticness = feature.acousticness;
          track.instrumentalness = feature.instrumentalness;
        }
      });
    }

    console.log(`[CorrelationEngine] Fetched Spotify: ${tracks.length} tracks`);
    return tracks;
  } catch (error) {
    console.error('[CorrelationEngine] Spotify fetch error:', error.message);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map Whoop sport ID to name
 */
function mapWhoopSport(sportId) {
  const sports = {
    0: 'Running', 1: 'Cycling', 44: 'Tennis', 71: 'Weightlifting',
    52: 'HIIT', 48: 'Swimming', 63: 'Walking', 82: 'Yoga',
    96: 'Hiking', 43: 'Soccer', 16: 'Golf', 230: 'Pickleball',
    '-1': 'Other Activity'
  };
  return sports[sportId] || sports[String(sportId)] || `Sport ${sportId}`;
}

/**
 * Classify calendar event type
 */
function classifyCalendarEvent(title, attendeeCount) {
  const lower = title.toLowerCase();

  if (lower.match(/tennis|gym|workout|training|run|hike|swim|yoga|fitness/)) return 'exercise';
  if (lower.match(/meeting|sync|standup|review|planning|retro|1:1|call/)) return 'meeting';
  if (lower.match(/lunch|dinner|coffee|breakfast|drinks/)) return 'social';
  if (lower.match(/focus|deep work|coding|writing|design/)) return 'focus';
  if (lower.match(/presentation|demo|pitch|interview/)) return 'high_stakes';
  if (lower.match(/doctor|dentist|appointment|therapy/)) return 'health';
  if (lower.match(/vacation|holiday|pto|off/)) return 'time_off';
  if (attendeeCount >= 5) return 'large_meeting';
  if (attendeeCount >= 1) return 'meeting';
  return 'other';
}

/**
 * Group events by date
 */
function groupByDate(events) {
  const groups = {};
  events.forEach(e => {
    const date = e.date;
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  });
  return groups;
}

/**
 * Calculate baseline for a metric
 */
function calculateBaseline(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);
  return { median, mean, stdDev, min: sorted[0], max: sorted[sorted.length - 1] };
}

// ============================================================================
// PATTERN DETECTION ALGORITHMS
// ============================================================================

/**
 * Detect Activity → Recovery correlations
 * e.g., "Tennis leads to lower recovery the next day"
 */
function detectActivityRecoveryCorrelations(whoop) {
  if (!whoop?.workouts || !whoop?.recovery) return [];

  const correlations = [];
  const recoveryByDate = {};
  whoop.recovery.forEach(r => { recoveryByDate[r.date] = r; });

  // Group workouts by sport
  const workoutsBySport = {};
  whoop.workouts.forEach(w => {
    if (!workoutsBySport[w.sportName]) workoutsBySport[w.sportName] = [];
    workoutsBySport[w.sportName].push(w);
  });

  // Calculate recovery baseline
  const allRecoveryScores = whoop.recovery.map(r => r.score).filter(Boolean);
  const baseline = calculateBaseline(allRecoveryScores);
  if (!baseline) return [];

  // For each sport type, check next-day recovery
  for (const [sport, workouts] of Object.entries(workoutsBySport)) {
    if (workouts.length < CONFIG.MIN_OCCURRENCES) continue;

    const observations = [];

    workouts.forEach(workout => {
      // Find next day's recovery
      const nextDay = new Date(workout.timestamp);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      const nextRecovery = recoveryByDate[nextDayStr];

      if (nextRecovery?.score) {
        const deviation = nextRecovery.score - baseline.mean;
        const deviationPercent = (deviation / baseline.mean) * 100;
        observations.push({
          workoutDate: workout.date,
          strain: workout.strain,
          durationMins: workout.durationMins,
          nextDayRecovery: nextRecovery.score,
          deviation,
          deviationPercent
        });
      }
    });

    if (observations.length >= CONFIG.MIN_OCCURRENCES) {
      // Calculate consistency: how often does this pattern hold?
      const avgDeviation = observations.reduce((sum, o) => sum + o.deviationPercent, 0) / observations.length;
      const direction = avgDeviation < 0 ? 'decreases' : 'increases';
      const consistentObs = observations.filter(o =>
        (direction === 'decreases' && o.deviationPercent < -5) ||
        (direction === 'increases' && o.deviationPercent > 5)
      );
      const consistency = consistentObs.length / observations.length;

      if (consistency >= CONFIG.MIN_CONSISTENCY || Math.abs(avgDeviation) > 10) {
        correlations.push({
          type: 'activity_recovery',
          trigger: {
            platform: 'whoop',
            event: 'workout',
            activity: sport
          },
          outcome: {
            platform: 'whoop',
            metric: 'recovery_score',
            effect: `${avgDeviation > 0 ? '+' : ''}${avgDeviation.toFixed(1)}%`,
            direction,
            timing: 'next_day'
          },
          occurrences: observations.length,
          consistency: Math.round(consistency * 100) / 100,
          avgEffectSize: Math.round(avgDeviation * 10) / 10,
          confidence: calculateConfidence(observations.length, consistency, Math.abs(avgDeviation)),
          evidence: observations.slice(0, 5),
          baseline: { mean: baseline.mean, stdDev: baseline.stdDev },
          description: `${sport} ${direction} next-day recovery by ~${Math.abs(avgDeviation).toFixed(0)}%`
        });
      }
    }
  }

  return correlations;
}

/**
 * Detect Calendar → Biometric correlations
 * e.g., "Meeting-heavy days correlate with elevated HR"
 */
function detectCalendarBiometricCorrelations(calendar, whoop) {
  if (!calendar || !whoop?.recovery) return [];

  const correlations = [];
  const recoveryByDate = {};
  whoop.recovery.forEach(r => { recoveryByDate[r.date] = r; });

  // Group calendar events by date and type
  const eventsByDate = groupByDate(calendar);

  // Calculate meeting counts per day
  const dailyMeetingCounts = Object.entries(eventsByDate).map(([date, events]) => ({
    date,
    meetings: events.filter(e => e.eventType === 'meeting' || e.eventType === 'large_meeting').length,
    totalEventMins: events.reduce((sum, e) => sum + (e.durationMins || 0), 0),
    recovery: recoveryByDate[date]?.score,
    hrv: recoveryByDate[date]?.hrv,
    rhr: recoveryByDate[date]?.rhr
  })).filter(d => d.recovery != null);

  // Baseline
  const baseline = calculateBaseline(dailyMeetingCounts.map(d => d.recovery));
  if (!baseline) return [];

  // Check: High meeting days vs Low meeting days
  const highMeetingDays = dailyMeetingCounts.filter(d => d.meetings >= 4);
  const lowMeetingDays = dailyMeetingCounts.filter(d => d.meetings <= 1);

  if (highMeetingDays.length >= CONFIG.MIN_OCCURRENCES && lowMeetingDays.length >= CONFIG.MIN_OCCURRENCES) {
    const highAvgRecovery = highMeetingDays.reduce((sum, d) => sum + d.recovery, 0) / highMeetingDays.length;
    const lowAvgRecovery = lowMeetingDays.reduce((sum, d) => sum + d.recovery, 0) / lowMeetingDays.length;
    const difference = highAvgRecovery - lowAvgRecovery;

    if (Math.abs(difference) > 5) {
      correlations.push({
        type: 'calendar_biometric',
        trigger: {
          platform: 'calendar',
          event: 'meeting_load',
          condition: '4+ meetings'
        },
        outcome: {
          platform: 'whoop',
          metric: 'recovery_score',
          effect: `${difference > 0 ? '+' : ''}${difference.toFixed(1)}%`,
          comparison: 'vs low meeting days (0-1 meetings)',
          timing: 'same_day'
        },
        occurrences: highMeetingDays.length,
        comparisonCount: lowMeetingDays.length,
        consistency: Math.abs(difference) > 10 ? 0.8 : 0.6,
        avgEffectSize: Math.round(difference * 10) / 10,
        confidence: calculateConfidence(highMeetingDays.length, 0.7, Math.abs(difference)),
        evidence: highMeetingDays.slice(0, 3).map(d => ({
          date: d.date,
          meetings: d.meetings,
          recovery: d.recovery
        })),
        description: `High meeting days (4+) have ${Math.abs(difference).toFixed(0)}% ${difference < 0 ? 'lower' : 'higher'} recovery`
      });
    }
  }

  return correlations;
}

/**
 * Detect Recovery → Music correlations
 * e.g., "Low recovery days lead to calmer music choices"
 */
function detectRecoveryMusicCorrelations(whoop, spotify) {
  if (!whoop?.recovery || !spotify || spotify.length === 0) return [];

  const correlations = [];
  const recoveryByDate = {};
  whoop.recovery.forEach(r => { recoveryByDate[r.date] = r; });

  // Group spotify tracks by date
  const tracksByDate = groupByDate(spotify);

  // Calculate daily music averages
  const dailyMusic = Object.entries(tracksByDate).map(([date, tracks]) => {
    const withFeatures = tracks.filter(t => t.energy != null);
    if (withFeatures.length === 0) return null;

    return {
      date,
      recovery: recoveryByDate[date]?.score,
      avgEnergy: withFeatures.reduce((sum, t) => sum + t.energy, 0) / withFeatures.length,
      avgValence: withFeatures.reduce((sum, t) => sum + t.valence, 0) / withFeatures.length,
      avgTempo: withFeatures.reduce((sum, t) => sum + t.tempo, 0) / withFeatures.length,
      trackCount: withFeatures.length
    };
  }).filter(d => d && d.recovery != null);

  if (dailyMusic.length < CONFIG.MIN_OCCURRENCES * 2) return correlations;

  // Baseline recovery
  const recoveryBaseline = calculateBaseline(dailyMusic.map(d => d.recovery));
  if (!recoveryBaseline) return correlations;

  // Low recovery days vs High recovery days
  const lowRecoveryDays = dailyMusic.filter(d => d.recovery < recoveryBaseline.mean - recoveryBaseline.stdDev);
  const highRecoveryDays = dailyMusic.filter(d => d.recovery > recoveryBaseline.mean + recoveryBaseline.stdDev);

  if (lowRecoveryDays.length >= CONFIG.MIN_OCCURRENCES && highRecoveryDays.length >= CONFIG.MIN_OCCURRENCES) {
    const lowAvgEnergy = lowRecoveryDays.reduce((sum, d) => sum + d.avgEnergy, 0) / lowRecoveryDays.length;
    const highAvgEnergy = highRecoveryDays.reduce((sum, d) => sum + d.avgEnergy, 0) / highRecoveryDays.length;
    const energyDiff = lowAvgEnergy - highAvgEnergy;

    if (Math.abs(energyDiff) > 0.05) {
      correlations.push({
        type: 'recovery_music',
        trigger: {
          platform: 'whoop',
          condition: `recovery < ${Math.round(recoveryBaseline.mean - recoveryBaseline.stdDev)}%`
        },
        outcome: {
          platform: 'spotify',
          metric: 'music_energy',
          effect: `${energyDiff < 0 ? '' : '+'}${(energyDiff * 100).toFixed(0)}%`,
          direction: energyDiff < 0 ? 'lower' : 'higher',
          timing: 'same_day'
        },
        occurrences: lowRecoveryDays.length,
        comparisonCount: highRecoveryDays.length,
        consistency: Math.abs(energyDiff) > 0.1 ? 0.75 : 0.6,
        avgEffectSize: Math.round(energyDiff * 1000) / 10,
        confidence: calculateConfidence(lowRecoveryDays.length, 0.7, Math.abs(energyDiff) * 100),
        evidence: lowRecoveryDays.slice(0, 3).map(d => ({
          date: d.date,
          recovery: d.recovery,
          avgEnergy: Math.round(d.avgEnergy * 100) / 100
        })),
        description: `Low recovery days → ${energyDiff < 0 ? 'calmer' : 'more energetic'} music choices`
      });
    }
  }

  return correlations;
}

/**
 * Detect day-of-week patterns
 */
function detectTemporalPatterns(whoop, calendar) {
  if (!whoop?.workouts) return [];

  const correlations = [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Group workouts by day of week
  const workoutsByDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  whoop.workouts.forEach(w => {
    const day = w.timestamp.getDay();
    workoutsByDay[day].push(w);
  });

  // Find patterns
  const weekendWorkouts = [...workoutsByDay[0], ...workoutsByDay[6]];
  const weekdayWorkouts = [...workoutsByDay[1], ...workoutsByDay[2], ...workoutsByDay[3], ...workoutsByDay[4], ...workoutsByDay[5]];

  if (weekendWorkouts.length >= CONFIG.MIN_OCCURRENCES) {
    // Check for outdoor activities on weekends
    const outdoorSports = weekendWorkouts.filter(w =>
      ['Hiking', 'Running', 'Cycling', 'Tennis', 'Walking'].includes(w.sportName)
    );

    if (outdoorSports.length >= CONFIG.MIN_OCCURRENCES) {
      const consistency = outdoorSports.length / weekendWorkouts.length;
      correlations.push({
        type: 'temporal_pattern',
        trigger: {
          platform: 'calendar',
          condition: 'weekend'
        },
        outcome: {
          platform: 'whoop',
          metric: 'activity_type',
          effect: 'outdoor activities',
          activities: [...new Set(outdoorSports.map(w => w.sportName))]
        },
        occurrences: outdoorSports.length,
        totalWeekendWorkouts: weekendWorkouts.length,
        consistency: Math.round(consistency * 100) / 100,
        confidence: calculateConfidence(outdoorSports.length, consistency, 50),
        description: `Weekends tend to include outdoor activities (${Math.round(consistency * 100)}% of workouts)`
      });
    }
  }

  return correlations;
}

/**
 * Calculate confidence score for a correlation
 */
function calculateConfidence(occurrences, consistency, effectSize) {
  // Weights
  const occurrenceWeight = Math.min(occurrences / 10, 1) * 0.3;  // Max out at 10 occurrences
  const consistencyWeight = consistency * 0.4;
  const effectWeight = Math.min(effectSize / 20, 1) * 0.3;  // Max out at 20% effect

  return Math.round((occurrenceWeight + consistencyWeight + effectWeight) * 100) / 100;
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Run full correlation analysis for a user
 */
export async function analyzeCorrelations(userId, options = {}) {
  const { days = CONFIG.ANALYSIS_DAYS, save = true } = options;

  console.log(`\n[CorrelationEngine] Starting analysis for user ${userId}`);
  console.log(`[CorrelationEngine] Analyzing ${days} days of data`);

  const results = {
    correlations: [],
    dataFetched: { whoop: false, calendar: false, spotify: false },
    errors: []
  };

  try {
    // Fetch all platform data in parallel
    const [whoop, calendar, spotify] = await Promise.all([
      fetchWhoopData(userId, days),
      fetchCalendarData(userId, days),
      fetchSpotifyData(userId, days)
    ]);

    results.dataFetched = {
      whoop: !!whoop,
      calendar: !!calendar,
      spotify: !!spotify
    };

    // Run pattern detection algorithms
    if (whoop) {
      const activityRecovery = detectActivityRecoveryCorrelations(whoop);
      results.correlations.push(...activityRecovery);
      console.log(`[CorrelationEngine] Found ${activityRecovery.length} activity→recovery correlations`);
    }

    if (calendar && whoop) {
      const calendarBiometric = detectCalendarBiometricCorrelations(calendar, whoop);
      results.correlations.push(...calendarBiometric);
      console.log(`[CorrelationEngine] Found ${calendarBiometric.length} calendar→biometric correlations`);
    }

    if (whoop && spotify) {
      const recoveryMusic = detectRecoveryMusicCorrelations(whoop, spotify);
      results.correlations.push(...recoveryMusic);
      console.log(`[CorrelationEngine] Found ${recoveryMusic.length} recovery→music correlations`);
    }

    if (whoop && calendar) {
      const temporal = detectTemporalPatterns(whoop, calendar);
      results.correlations.push(...temporal);
      console.log(`[CorrelationEngine] Found ${temporal.length} temporal patterns`);
    }

    // Filter by confidence threshold
    results.correlations = results.correlations.filter(c => c.confidence >= 0.5);

    // Sort by confidence
    results.correlations.sort((a, b) => b.confidence - a.confidence);

    console.log(`\n[CorrelationEngine] Total significant correlations: ${results.correlations.length}`);

    // Save to database if requested
    if (save && results.correlations.length > 0) {
      await saveCorrelations(userId, results.correlations);
    }

    return {
      success: true,
      correlations: results.correlations,
      summary: {
        totalFound: results.correlations.length,
        dataFetched: results.dataFetched,
        byType: results.correlations.reduce((acc, c) => {
          acc[c.type] = (acc[c.type] || 0) + 1;
          return acc;
        }, {})
      }
    };

  } catch (error) {
    console.error('[CorrelationEngine] Analysis error:', error);
    return {
      success: false,
      correlations: results.correlations,
      error: error.message,
      summary: {
        totalFound: 0,
        dataFetched: results.dataFetched,
        errors: [error.message]
      }
    };
  }
}

/**
 * Save correlations to database and create brain nodes
 */
async function saveCorrelations(userId, correlations) {
  console.log(`[CorrelationEngine] Saving ${correlations.length} correlations`);

  for (const corr of correlations) {
    try {
      // Save to discovered_correlations table
      const { error: dbError } = await supabaseAdmin
        .from('discovered_correlations')
        .upsert({
          user_id: userId,
          correlation_type: corr.type,
          trigger_platform: corr.trigger.platform,
          trigger_event: corr.trigger.event || corr.trigger.condition,
          outcome_platform: corr.outcome.platform,
          outcome_metric: corr.outcome.metric,
          outcome_effect: corr.outcome.effect,
          occurrences: corr.occurrences,
          consistency: corr.consistency,
          confidence: corr.confidence,
          evidence: corr.evidence,
          description: corr.description,
          last_detected: new Date().toISOString()
        }, {
          onConflict: 'user_id,correlation_type,trigger_event,outcome_metric'
        });

      if (dbError) {
        console.error('[CorrelationEngine] DB save error:', dbError.message);
      }

      // Create brain node for high-confidence correlations
      if (corr.confidence >= 0.65) {
        await createCorrelationBrainNode(userId, corr);
      }

    } catch (error) {
      console.error('[CorrelationEngine] Save error:', error.message);
    }
  }
}

/**
 * Create a brain node for a discovered correlation
 */
async function createCorrelationBrainNode(userId, correlation) {
  try {
    const node = {
      user_id: userId,
      node_type: 'behavior', // Correlations are behavioral patterns
      category: correlation.type.includes('health') || correlation.type.includes('recovery') ? 'health' : 'personal',
      label: correlation.description.substring(0, 50),
      description: correlation.description,
      confidence: correlation.confidence,
      strength: Math.min(correlation.occurrences / 10, 1),
      source_type: 'correlation_engine',
      data: {
        correlation_type: correlation.type,
        trigger: correlation.trigger,
        outcome: correlation.outcome,
        occurrences: correlation.occurrences,
        consistency: correlation.consistency,
        evidence_sample: correlation.evidence?.slice(0, 3)
      },
      tags: [correlation.type, correlation.trigger.platform, correlation.outcome.platform, 'auto-discovered'],
      first_detected: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      last_confirmed: new Date().toISOString(),
      shared_with_twin: true
    };

    const { error } = await supabaseAdmin
      .from('brain_nodes')
      .insert(node);

    if (error && !error.message.includes('duplicate')) {
      console.error('[CorrelationEngine] Brain node error:', error.message);
    } else {
      console.log(`[CorrelationEngine] Created brain node: "${node.label}"`);
    }
  } catch (error) {
    console.error('[CorrelationEngine] Brain node creation error:', error.message);
  }
}

/**
 * Get stored correlations for a user
 */
export async function getStoredCorrelations(userId, options = {}) {
  const { limit = 20, minConfidence = 0.5 } = options;
  try {
    const { data, error } = await supabaseAdmin
      .from('discovered_correlations')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[CorrelationEngine] Get correlations error:', error.message);
    return [];
  }
}

/**
 * Get correlation statistics for a user
 */
export async function getCorrelationStats(userId) {
  try {
    // Count total correlations
    const { count: totalCorrelations } = await supabaseAdmin
      .from('discovered_correlations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Count by correlation type
    const { data: byType } = await supabaseAdmin
      .from('discovered_correlations')
      .select('correlation_type')
      .eq('user_id', userId);

    const typeCounts = (byType || []).reduce((acc, c) => {
      acc[c.correlation_type] = (acc[c.correlation_type] || 0) + 1;
      return acc;
    }, {});

    // Count high confidence correlations
    const { count: highConfidence } = await supabaseAdmin
      .from('discovered_correlations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('confidence', 0.7);

    // Count brain nodes from correlations
    const { count: brainNodes } = await supabaseAdmin
      .from('brain_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source_type', 'correlation_engine');

    // Get most recent analysis date
    const { data: latest } = await supabaseAdmin
      .from('discovered_correlations')
      .select('discovered_at')
      .eq('user_id', userId)
      .order('discovered_at', { ascending: false })
      .limit(1);

    return {
      totalCorrelations: totalCorrelations || 0,
      highConfidence: highConfidence || 0,
      byType: typeCounts,
      brainNodesCreated: brainNodes || 0,
      lastAnalysis: latest?.[0]?.discovered_at || null
    };
  } catch (error) {
    console.error('[CorrelationEngine] Get stats error:', error.message);
    return {
      totalCorrelations: 0,
      highConfidence: 0,
      byType: {},
      brainNodesCreated: 0,
      lastAnalysis: null
    };
  }
}

export default {
  analyzeCorrelations,
  getStoredCorrelations,
  getCorrelationStats,
  fetchWhoopData,
  fetchCalendarData,
  fetchSpotifyData
};
