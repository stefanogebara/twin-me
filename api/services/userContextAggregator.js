/**
 * User Context Aggregator Service
 *
 * Collects real-time data from all connected platforms to build
 * a comprehensive user context for intelligent recommendations.
 *
 * Data Sources:
 * - Whoop: recovery, sleep, strain, HRV
 * - Spotify: recent listening, mood profile
 * - Calendar: upcoming events, event types
 * - Personality: Big Five scores
 * - Patterns: learned behavioral patterns
 */

import { supabaseAdmin } from './database.js';
import { decryptToken } from './encryption.js';
import { ensureFreshToken } from './tokenRefreshService.js';
import { lifeEventInferenceService } from './lifeEventInferenceService.js';
import { whoop as nangoWhoop, getConnection as getNangoConnection } from './nangoService.js';
import axios from 'axios';
import { createLogger } from './logger.js';

const log = createLogger('UserContextAggregator');

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

class UserContextAggregator {
  constructor() {
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    this.contextCache = new Map();
  }

  /**
   * Get complete user context from all platforms
   */
  async aggregateUserContext(userId, options = {}) {
    log.info(`Building context for user ${userId}`);

    const { forceRefresh = false, platforms = ['whoop', 'spotify', 'calendar', 'youtube', 'twitch', 'web'] } = options;

    // Check cache first
    const cacheKey = `${userId}-${platforms.join('-')}`;
    if (!forceRefresh) {
      const cached = this.contextCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        log.info(`Using cached context`);
        return cached.context;
      }
    }

    // Aggregate data from all platforms in parallel (including life context and personality quiz)
    // Use Promise.allSettled to prevent one failure from crashing everything
    const safeCall = async (fn, name) => {
      try {
        return await fn();
      } catch (error) {
        log.error(`${name} failed:`, error.message);
        return null;
      }
    };

    const results = await Promise.allSettled([
      platforms.includes('whoop') ? safeCall(() => this.getWhoopContext(userId), 'Whoop') : Promise.resolve(null),
      platforms.includes('spotify') ? safeCall(() => this.getSpotifyContext(userId), 'Spotify') : Promise.resolve(null),
      platforms.includes('calendar') ? safeCall(() => this.getCalendarContext(userId), 'Calendar') : Promise.resolve(null),
      safeCall(() => this.getPersonalityProfile(userId), 'Personality'),
      safeCall(() => this.getPersonalityQuiz(userId), 'PersonalityQuiz'),
      safeCall(() => this.getLearnedPatterns(userId), 'Patterns'),
      safeCall(() => this.getLifeContext(userId), 'LifeContext'),
      platforms.includes('youtube') ? safeCall(() => this.getYouTubeContext(userId), 'YouTube') : Promise.resolve(null),
      platforms.includes('twitch') ? safeCall(() => this.getTwitchContext(userId), 'Twitch') : Promise.resolve(null),
      platforms.includes('web') ? safeCall(() => this.getWebBrowsingContext(userId), 'Web') : Promise.resolve(null)
    ]);

    // Extract values from settled results
    const [whoopContext, spotifyContext, calendarContext, personality, personalityQuiz, patterns, lifeContext, youtubeContext, twitchContext, webContext] =
      results.map(r => r.status === 'fulfilled' ? r.value : null);

    const context = {
      success: true,
      userId,
      timestamp: new Date().toISOString(),
      whoop: whoopContext,
      spotify: spotifyContext,
      calendar: calendarContext,
      youtube: youtubeContext,
      twitch: twitchContext,
      web: webContext,
      lifeContext, // Life context (vacation, conferences, etc.)
      personality, // Big Five from personality_scores table
      personalityQuiz, // Onboarding quiz preferences from users table
      patterns,
      summary: this.generateContextSummary(whoopContext, spotifyContext, calendarContext, lifeContext, youtubeContext, twitchContext, webContext)
    };

    // Cache the context
    this.contextCache.set(cacheKey, {
      timestamp: Date.now(),
      context
    });

    log.info(`Context built successfully`);
    return context;
  }

  /**
   * Get current Whoop health context
   * Returns: recovery score, sleep data, strain level, HRV
   * Uses Nango for authentication when available, falls back to legacy platform_connections
   */
  async getWhoopContext(userId) {
    log.info(`Fetching Whoop context...`);

    try {
      // Check Nango connection status first
      const connectionStatus = await getNangoConnection(userId, 'whoop');
      if (!connectionStatus.connected) {
        log.info(`Whoop not connected via Nango (reason: ${connectionStatus.error || 'not found'}), trying Nango proxy directly...`);

        // Even if getConnection fails, the Nango proxy might still work
        // (e.g. when connection exists but status check had a transient error)
        // Try Nango proxy before falling to legacy
        try {
          const [testCycle] = await Promise.all([
            nangoWhoop.getCycles(userId, 1).catch(() => ({ success: false }))
          ]);
          if (testCycle.success) {
            log.info(`Nango proxy works despite connection check failure, continuing...`);
            // Fall through to the normal Nango proxy path below
          } else {
            // Nango proxy also failed, try legacy
            const legacyResult = await this.getLegacyWhoopContext(userId);
            if (legacyResult) {
              return legacyResult;
            }
            return null;
          }
        } catch (proxyErr) {
          log.info(`Nango proxy also failed: ${proxyErr.message}`);
          const legacyResult = await this.getLegacyWhoopContext(userId);
          if (legacyResult) {
            return legacyResult;
          }
          return null;
        }
      }

      // Fetch both cycle and recovery data in parallel using Nango proxy
      // Nango handles token refresh automatically
      const [cycleResult, recoveryResult] = await Promise.all([
        nangoWhoop.getCycles(userId, 1).catch(err => {
          log.info(`Cycle API error: ${err.message}`);
          return { success: false, data: { records: [] } };
        }),
        nangoWhoop.getRecovery(userId, 7).catch(err => {
          log.info(`Recovery API error: ${err.message}`);
          return { success: false, data: { records: [] } };
        })
      ]);

      // Handle auth errors from Nango
      if (!cycleResult.success && cycleResult.status === 401) {
        log.info(`Whoop auth expired`);
        return { connected: false, needsReauth: true };
      }

      // Extract data from Nango response format
      const cycleRes = { data: cycleResult.success ? cycleResult.data : { records: [] } };
      const recoveryRes = { data: recoveryResult.success ? recoveryResult.data : { records: [] } };

      // Log raw API responses for debugging
      log.info(`Cycle response:`, JSON.stringify(cycleRes.data).substring(0, 500));
      log.info(`Recovery response:`, JSON.stringify(recoveryRes.data).substring(0, 500));

      const latestCycle = cycleRes.data?.records?.[0] || cycleRes.data?.[0];
      const recoveries = recoveryRes.data?.records || recoveryRes.data || [];
      const latestRecovery = Array.isArray(recoveries) ? recoveries[0] : null;

      if (!latestCycle && !latestRecovery) {
        return { connected: true, noData: true };
      }

      // Extract recovery score - prioritize dedicated recovery endpoint
      let recovery = null;
      let hrv = null;
      let rhr = null;
      let spo2 = null;
      let skinTemp = null;

      // Try recovery endpoint first (most accurate)
      if (latestRecovery) {
        log.info(`latestRecovery object:`, JSON.stringify(latestRecovery).substring(0, 300));
        recovery = latestRecovery.score?.recovery_score ?? latestRecovery.recovery_score ?? null;
        hrv = latestRecovery.score?.hrv_rmssd_milli ?? latestRecovery.hrv_rmssd_milli ?? null;
        rhr = latestRecovery.score?.resting_heart_rate ?? latestRecovery.resting_heart_rate ?? null;
        // New metrics from Whoop V2 API
        spo2 = latestRecovery.score?.spo2_percentage ?? null;
        skinTemp = latestRecovery.score?.skin_temp_celsius ?? null;
        log.info(`Extracted: recovery=${recovery}, hrv=${hrv}, rhr=${rhr}, spo2=${spo2}, skinTemp=${skinTemp}`);
      } else {
        log.info(`No latestRecovery found, recoveries array length: ${recoveries.length}`);
      }

      // Fall back to cycle data if recovery endpoint didn't have the data
      if (recovery === null && latestCycle) {
        recovery = latestCycle.score?.recovery_score ?? latestCycle.recovery?.score ?? null;
        hrv = hrv ?? latestCycle.score?.hrv_rmssd_milli ?? latestCycle.recovery?.hrv_rmssd_milli ?? null;
        rhr = rhr ?? latestCycle.score?.resting_heart_rate ?? latestCycle.recovery?.resting_heart_rate ?? null;
        log.info(`Recovery from /cycle endpoint: ${recovery}%`);
      }

      // Get strain from cycle data
      const strain = latestCycle?.score?.strain ?? latestCycle?.strain?.score ?? 0;
      log.info(`Strain: ${strain}, Recovery: ${recovery}%`);

      // Calculate HRV trend from recent data
      const hrvValues = recoveries
        .map(r => r.score?.hrv_rmssd_milli)
        .filter(v => v != null);
      const hrvTrend = this.calculateTrend(hrvValues);

      // Calculate recovery label
      const recoveryLabel = this.getRecoveryLabel(recovery);
      const strainLabel = this.getStrainLabel(strain);

      // Build 7-day history for visualization charts
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const history7Day = recoveries.slice(0, 7).map((r, index) => {
        const date = r.created_at ? new Date(r.created_at) : new Date();
        const recoveryScore = r.score?.recovery_score ?? r.recovery_score ?? 0;
        const hrvValue = r.score?.hrv_rmssd_milli ?? r.hrv_rmssd_milli ?? 0;
        return {
          dayName: dayNames[date.getDay()],
          recovery: Math.round(recoveryScore),
          hrv: Math.round(hrvValue)
        };
      }).reverse(); // Oldest first for chart display

      return {
        connected: true,
        recovery: {
          score: recovery,
          label: recoveryLabel,
          color: this.getRecoveryColor(recovery)
        },
        strain: {
          score: Math.round(strain * 10) / 10,
          max: 21,
          label: strainLabel,
          percentage: Math.round((strain / 21) * 100)
        },
        hrv: {
          current: hrv ? Math.round(hrv) : null,
          trend: hrvTrend,
          unit: 'ms'
        },
        rhr: {
          current: rhr ? Math.round(rhr) : null,
          unit: 'bpm'
        },
        // New vitals from Whoop V2 API
        vitals: {
          spo2: spo2 ? Math.round(spo2) : null,
          skinTemp: skinTemp ? Math.round(skinTemp * 10) / 10 : null
        },
        sleep: await this.getSleepContext(userId),
        history7Day: history7Day,
        lastUpdated: latestCycle?.end || latestCycle?.created_at || latestRecovery?.created_at,
        recommendations: this.generateWhoopRecommendations(recovery, strain)
      };

    } catch (error) {
      log.error(`Whoop error:`, error.message);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Legacy Whoop context fetcher using platform_connections table
   * Used as fallback when Nango connection is not available
   */
  async getLegacyWhoopContext(userId) {
    log.info(`Trying legacy Whoop connection...`);

    try {
      // Check platform_connections table
      const { data: connection, error } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'whoop')
        .eq('status', 'connected')
        .single();

      if (error || !connection) {
        log.info(`No legacy Whoop connection found`);
        return null;
      }

      // Access token is stored encrypted in the database
      let accessToken = decryptToken(connection.access_token);
      const tokenExpired = new Date(connection.token_expires_at) < new Date();

      if (tokenExpired && connection.refresh_token) {
        log.info(`Legacy Whoop token expired, refreshing...`);
        const refreshedToken = await ensureFreshToken(userId, 'whoop');
        if (!refreshedToken) {
          log.info(`Failed to refresh legacy Whoop token`);
          return { connected: false, needsReauth: true };
        }
        accessToken = refreshedToken;
      } else if (!accessToken) {
        log.info(`No access token for Whoop`);
        return null;
      }

      // Fetch data using direct API calls
      const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';

      const [cycleRes, recoveryRes, sleepRes] = await Promise.all([
        fetch(`${WHOOP_API_BASE}/cycle?limit=1`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.ok ? r.json() : { records: [] }).catch(() => ({ records: [] })),
        fetch(`${WHOOP_API_BASE}/recovery?limit=7`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.ok ? r.json() : { records: [] }).catch(() => ({ records: [] })),
        fetch(`${WHOOP_API_BASE}/activity/sleep?limit=5`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.ok ? r.json() : { records: [] }).catch(() => ({ records: [] }))
      ]);

      const latestCycle = cycleRes.records?.[0];
      const recoveries = recoveryRes.records || [];
      const latestRecovery = recoveries[0];

      if (!latestCycle && !latestRecovery) {
        return { connected: true, noData: true };
      }

      // Extract recovery metrics
      let recovery = null;
      let hrv = null;
      let rhr = null;

      if (latestRecovery) {
        recovery = latestRecovery.score?.recovery_score ?? null;
        hrv = latestRecovery.score?.hrv_rmssd_milli ?? null;
        rhr = latestRecovery.score?.resting_heart_rate ?? null;
      }

      if (recovery === null && latestCycle) {
        recovery = latestCycle.score?.recovery_score ?? null;
        hrv = hrv ?? latestCycle.score?.hrv_rmssd_milli ?? null;
        rhr = rhr ?? latestCycle.score?.resting_heart_rate ?? null;
      }

      const strain = latestCycle?.score?.strain ?? 0;

      // Calculate trends and labels
      const hrvValues = recoveries.map(r => r.score?.hrv_rmssd_milli).filter(v => v != null);
      const hrvTrend = this.calculateTrend(hrvValues);
      const recoveryLabel = this.getRecoveryLabel(recovery);
      const strainLabel = this.getStrainLabel(strain);

      // Build 7-day history
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const history7Day = recoveries.slice(0, 7).map((r) => {
        const date = r.created_at ? new Date(r.created_at) : new Date();
        return {
          dayName: dayNames[date.getDay()],
          recovery: Math.round(r.score?.recovery_score ?? 0),
          hrv: Math.round(r.score?.hrv_rmssd_milli ?? 0)
        };
      }).reverse();

      // Process sleep data
      const sleepData = await this.processLegacySleepData(sleepRes.records || []);

      log.info(`Legacy Whoop data retrieved: recovery=${recovery}%, strain=${strain}`);

      return {
        connected: true,
        recovery: {
          score: recovery,
          label: recoveryLabel,
          color: this.getRecoveryColor(recovery)
        },
        strain: {
          score: Math.round(strain * 10) / 10,
          max: 21,
          label: strainLabel,
          percentage: Math.round((strain / 21) * 100)
        },
        hrv: {
          current: hrv ? Math.round(hrv) : null,
          trend: hrvTrend,
          unit: 'ms'
        },
        rhr: {
          current: rhr ? Math.round(rhr) : null,
          unit: 'bpm'
        },
        vitals: { spo2: null, skinTemp: null },
        sleep: sleepData,
        history7Day: history7Day,
        lastUpdated: latestCycle?.end || latestCycle?.created_at,
        recommendations: this.generateWhoopRecommendations(recovery, strain)
      };

    } catch (error) {
      log.error(`Legacy Whoop error:`, error.message);
      return null;
    }
  }

  /**
   * Process legacy sleep data from direct API response
   */
  processLegacySleepData(sleeps) {
    if (!sleeps || sleeps.length === 0) return null;

    const latestSleep = sleeps[0];
    const stageSummary = latestSleep.score?.stage_summary || {};

    const totalSleepMs = stageSummary.total_sleep_time_milli ||
      ((stageSummary.total_in_bed_time_milli || 0) - (stageSummary.total_awake_time_milli || 0));
    const sleepHours = totalSleepMs / 3600000;

    return {
      hours: Math.round(sleepHours * 10) / 10,
      performance: latestSleep.score?.sleep_performance_percentage,
      efficiency: latestSleep.score?.sleep_efficiency_percentage,
      stages: {
        deep: stageSummary.total_slow_wave_sleep_time_milli || 0,
        rem: stageSummary.total_rem_sleep_time_milli || 0,
        light: stageSummary.total_light_sleep_time_milli || 0
      },
      respiratoryRate: latestSleep.score?.respiratory_rate,
      disturbances: stageSummary.disturbance_count
    };
  }

  /**
   * Get sleep data from Whoop
   * Now uses Nango for authentication - automatic token refresh handled by Nango proxy
   */
  async getSleepContext(userId) {
    try {
      // Fetch last 5 sleep records to capture main sleep + naps via Nango
      const sleepResult = await nangoWhoop.getSleep(userId, 5);

      if (!sleepResult.success) {
        log.info(`Sleep API error: ${sleepResult.error}`);
        return null;
      }

      const allSleeps = sleepResult.data?.records || sleepResult.data || [];
      const latestSleep = allSleeps[0];

      if (!latestSleep) return null;

      // Aggregate all sleep from last 24 hours (includes main sleep + naps)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const todaysSleeps = allSleeps.filter(sleep => {
        if (!sleep?.end) return false;
        const sleepEnd = new Date(sleep.end);
        return sleepEnd >= yesterday;
      });

      // Sum up all sleep - prefer total_sleep_time_milli, fallback to in_bed minus awake
      let totalSleepMs = 0;
      let mainSleepMs = 0;
      let napMs = 0;

      todaysSleeps.forEach((sleep, index) => {
        const stageSummary = sleep.score?.stage_summary || {};
        const sleepMs = sleep.score?.total_sleep_time_milli ||
                        (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0)) ||
                        stageSummary.total_in_bed_time_milli || 0;

        totalSleepMs += sleepMs;

        // Last record in list is usually main sleep (oldest), rest are naps
        if (index === todaysSleeps.length - 1) {
          mainSleepMs = sleepMs;
        } else {
          napMs += sleepMs;
        }
      });

      const totalSleepHours = totalSleepMs / (1000 * 60 * 60);
      const hoursRounded = Math.round(totalSleepHours * 10) / 10;

      // Use main sleep for stage breakdown
      const stageSummary = latestSleep.score?.stage_summary || {};
      const respiratoryRate = latestSleep.score?.respiratory_rate || null;
      const disturbances = latestSleep.score?.disturbance_count || stageSummary.disturbance_count || null;

      log.info(`Total sleep: ${hoursRounded}h from ${todaysSleeps.length} records (main: ${(mainSleepMs / 3600000).toFixed(1)}h, naps: ${(napMs / 3600000).toFixed(1)}h)`);

      return {
        hours: hoursRounded,
        totalHours: hoursRounded, // Alias for intelligent-twin.js compatibility
        mainSleepHours: Math.round((mainSleepMs / 3600000) * 10) / 10,
        napHours: napMs > 0 ? Math.round((napMs / 3600000) * 10) / 10 : null,
        sleepCount: todaysSleeps.length,
        performance: latestSleep.score?.sleep_performance_percentage || null,
        efficiency: latestSleep.score?.sleep_efficiency_percentage || null,
        stages: {
          rem: stageSummary.total_rem_sleep_time_milli || 0,
          deep: stageSummary.total_slow_wave_sleep_time_milli || 0,
          light: stageSummary.total_light_sleep_time_milli || 0,
          awake: stageSummary.total_awake_time_milli || 0
        },
        quality: this.getSleepQualityLabel(latestSleep.score?.sleep_performance_percentage),
        // New vitals
        respiratoryRate: respiratoryRate ? Math.round(respiratoryRate * 10) / 10 : null,
        disturbances: disturbances
      };

    } catch {
      return null;
    }
  }

  /**
   * Get Spotify listening context
   * Returns: recent tracks, current mood, audio features
   */
  async getSpotifyContext(userId) {
    log.info(`Fetching Spotify context...`);

    try {
      const { data: connection, error } = await supabaseAdmin
        .from('platform_connections')
        .select('access_token, refresh_token, token_expires_at')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .single();

      if (error || !connection) {
        return null;
      }

      // Use automatic token refresh instead of just returning needsReauth
      let accessToken;
      try {
        accessToken = await ensureFreshToken(userId, 'spotify');
        log.info(`Got fresh Spotify token`);
      } catch (refreshError) {
        log.info(`Spotify token refresh failed: ${refreshError.message}`);
        return { connected: false, needsReauth: true };
      }

      const headers = { 'Authorization': `Bearer ${accessToken}` };

      // Fetch recently played tracks
      const recentRes = await axios.get(`${SPOTIFY_API_BASE}/me/player/recently-played`, {
        headers,
        params: { limit: 10 }
      });

      const recentTracks = recentRes.data?.items || [];

      if (recentTracks.length === 0) {
        return { connected: true, noData: true };
      }

      // Get track IDs for audio features
      const trackIds = recentTracks.map(t => t.track.id).filter(Boolean);

      // Fetch audio features for recent tracks
      let audioFeatures = [];
      if (trackIds.length > 0) {
        try {
          const featuresRes = await axios.get(`${SPOTIFY_API_BASE}/audio-features`, {
            headers,
            params: { ids: trackIds.join(',') }
          });
          audioFeatures = featuresRes.data?.audio_features || [];
        } catch {
          // Audio features endpoint may fail, continue without it
        }
      }

      // Calculate average mood from audio features
      const avgFeatures = this.calculateAverageAudioFeatures(audioFeatures);
      const currentMood = this.deriveMoodFromFeatures(avgFeatures);

      return {
        connected: true,
        recentTracks: recentTracks.slice(0, 5).map(t => ({
          name: t.track.name,
          artist: t.track.artists?.[0]?.name,
          playedAt: t.played_at
        })),
        currentMood: {
          label: currentMood.label,
          energy: avgFeatures.energy,
          valence: avgFeatures.valence,
          tempo: avgFeatures.tempo,
          description: currentMood.description
        },
        audioProfile: avgFeatures,
        lastPlayed: recentTracks[0]?.played_at
      };

    } catch (error) {
      log.error(`Spotify error:`, error.message);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Get upcoming calendar events
   */
  async getCalendarContext(userId) {
    log.info(`Fetching calendar context...`);

    try {
      // First check for Google Calendar connection
      const { data: connection, error: connErr } = await supabaseAdmin
        .from('platform_connections')
        .select('access_token, refresh_token, token_expires_at')
        .eq('user_id', userId)
        .eq('platform', 'google_calendar')
        .single();
      if (connErr && connErr.code !== 'PGRST116') log.warn('Calendar connection fetch error:', connErr.message);

      if (!connection) {
        log.info(`Google Calendar not connected`);
        return null;
      }

      // Get fresh token using automatic refresh
      let accessToken;
      try {
        accessToken = await ensureFreshToken(userId, 'google_calendar');
        log.info(`Got fresh Calendar token`);
      } catch (refreshError) {
        log.info(`Calendar token refresh failed: ${refreshError.message}`);
        return { connected: false, needsReauth: true };
      }

      // Fetch live from Google Calendar API
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Next 7 days

      // First get all calendars the user has access to
      const calendarListRes = await axios.get(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      const calendars = calendarListRes.data?.items || [];
      log.info(`Found ${calendars.length} calendars`);

      // Fetch events from all calendars
      let allEvents = [];
      for (const calendar of calendars) {
        try {
          const calendarResponse = await axios.get(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
              params: {
                timeMin,
                timeMax,
                maxResults: 20,
                singleEvents: true,
                orderBy: 'startTime'
              }
            }
          );
          const calItems = calendarResponse.data?.items || [];
          allEvents = allEvents.concat(calItems);
        } catch (err) {
          log.info(`Skipping calendar ${calendar.summary}: ${err.message}`);
        }
      }

      // Sort by start time
      allEvents.sort((a, b) => {
        const aTime = new Date(a.start?.dateTime || a.start?.date).getTime();
        const bTime = new Date(b.start?.dateTime || b.start?.date).getTime();
        return aTime - bTime;
      });

      const items = allEvents.slice(0, 15); // Limit to 15 events
      log.info(`Found ${items.length} calendar events from all calendars`);

      // Format events for context
      const events = items.map(event => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        start_time: event.start?.dateTime || event.start?.date,
        end_time: event.end?.dateTime || event.end?.date,
        event_type: this.classifyEventType(event.summary),
        is_important: this.estimateImportance({ title: event.summary, attendee_count: event.attendees?.length || 0 }) === 'high',
        attendee_count: event.attendees?.length || 0
      }));

      return this.formatCalendarEvents(events);

    } catch (error) {
      log.error(`Calendar error:`, error.message);
      // Fall back to database if API fails
      const { data: events, error: eventsErr } = await supabaseAdmin
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(5);
      if (eventsErr) log.warn('Calendar fallback fetch error:', eventsErr.message);

      if (events && events.length > 0) {
        return this.formatCalendarEvents(events);
      }
      return null;
    }
  }

  /**
   * Format calendar events for context
   */
  formatCalendarEvents(events) {
    const now = new Date();

    const formattedEvents = events.map(event => {
      const eventStartTime = new Date(event.start_time);
      const minutesUntil = Math.round((eventStartTime - now) / (1000 * 60));
      const hoursUntil = Math.round(minutesUntil / 60 * 10) / 10;

      return {
        id: event.id,
        title: event.title || event.summary,
        startTime: event.start_time, // Use startTime for intelligent-twin.js compatibility
        endTime: event.end_time,
        start: event.start_time,
        end: event.end_time,
        minutesUntil,
        hoursUntil,
        type: event.event_type || this.classifyEventType(event.title),
        importance: event.is_important ? 'high' : this.estimateImportance(event),
        attendeeCount: event.attendee_count || 0
      };
    });

    // Find the next important event
    const nextImportant = formattedEvents.find(e =>
      e.importance === 'high' && e.minutesUntil > 0 && e.minutesUntil < 240
    );

    return {
      connected: true,
      events: formattedEvents,
      upcomingEvents: formattedEvents, // Add upcomingEvents alias for intelligent-twin.js
      nextEvent: formattedEvents[0] || null,
      nextImportantEvent: nextImportant || null,
      hasUpcoming: formattedEvents.length > 0
    };
  }

  /**
   * Get user's personality profile from personality_estimates table (60-question assessment)
   * Falls back to personality_scores table (behavioral learning) if no assessment data
   */
  async getPersonalityProfile(userId) {
    try {
      // First, check personality_estimates (60-question Big Five assessment)
      const { data: estimates, error: estErr } = await supabaseAdmin
        .from('personality_estimates')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (estErr && estErr.code !== 'PGRST116') log.warn('personality_estimates fetch error:', estErr.message);

      if (estimates && estimates.total_questions_answered > 0) {
        log.info(`Found personality assessment: ${estimates.archetype_code} (${estimates.total_questions_answered} questions)`);
        return {
          source: 'assessment',
          archetype: estimates.archetype_code,
          openness: parseFloat(estimates.openness),
          conscientiousness: parseFloat(estimates.conscientiousness),
          extraversion: parseFloat(estimates.extraversion),
          agreeableness: parseFloat(estimates.agreeableness),
          neuroticism: parseFloat(estimates.neuroticism),
          questionsAnswered: estimates.total_questions_answered,
          dominantTraits: this.getDominantTraits(estimates),
          confidence: this.getAssessmentConfidence(estimates)
        };
      }

      // Fall back to personality_scores (behavioral learning)
      const { data: scores, error: scoresErr } = await supabaseAdmin
        .from('personality_scores')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (scoresErr && scoresErr.code !== 'PGRST116') log.warn('personality_scores fetch error:', scoresErr.message);

      if (!scores) return null;

      log.info(`Using behavioral personality scores`);
      return {
        source: 'behavioral',
        openness: scores.openness,
        conscientiousness: scores.conscientiousness,
        extraversion: scores.extraversion,
        agreeableness: scores.agreeableness,
        neuroticism: scores.neuroticism,
        dominantTraits: this.getDominantTraits(scores),
        confidence: this.getAverageConfidence(scores)
      };

    } catch (error) {
      log.error(`Error fetching personality:`, error);
      return null;
    }
  }

  /**
   * Get confidence level based on assessment completion
   */
  getAssessmentConfidence(estimates) {
    const questionsAnswered = estimates.total_questions_answered || 0;
    if (questionsAnswered >= 60) return 'high';
    if (questionsAnswered >= 12) return 'medium';
    return 'low';
  }

  /**
   * Get user's personality quiz from onboarding (16personalities-style)
   * This is stored in users.personality_quiz and contains preferences like
   * morning_person, stress_coping, music_emotional_strategy, etc.
   */
  async getPersonalityQuiz(userId) {
    log.info(`Fetching personality quiz for user ${userId}`);

    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('personality_quiz, onboarding_completed_at')
        .eq('id', userId)
        .single();

      if (error || !user?.personality_quiz || user.personality_quiz.skipped) {
        log.info(`No personality quiz data`);
        return null;
      }

      const quiz = user.personality_quiz;
      const prefs = quiz.preferences || {};

      // Return a summary that's useful for reflections
      return {
        completed: true,
        completedAt: user.onboarding_completed_at || quiz.completedAt,

        // Core personality traits
        morningPerson: prefs.morning_person,
        peakHours: prefs.peak_hours,
        energyPattern: prefs.energy_pattern,
        introversion: prefs.introversion,

        // Emotional processing
        musicEmotionalStrategy: prefs.music_emotional_strategy,
        stressCoping: prefs.stress_coping,

        // Music preferences
        noveltySeeking: prefs.novelty_seeking,
        prefersFamiliar: prefs.prefers_familiar,
        focusInstrumentalness: prefs.focus_instrumentalness,

        // Event preparation style
        preEventStrategy: prefs.pre_event_strategy,

        // Focus style
        distractionResistance: prefs.distraction_resistance,
        needsStimulation: prefs.needs_stimulation,

        // Generate human-readable summary for prompts
        summary: this.generatePersonalitySummary(prefs)
      };

    } catch (error) {
      log.error(`Personality quiz error:`, error.message);
      return null;
    }
  }

  /**
   * Generate a human-readable summary of personality preferences
   */
  generatePersonalitySummary(prefs) {
    const parts = [];

    // Morning/evening person
    if (prefs.morning_person === true) {
      parts.push('morning person who peaks early');
    } else if (prefs.morning_person === false) {
      parts.push('not a morning person');
    }

    // Peak productivity
    if (prefs.peak_hours) {
      const labels = {
        'morning': 'most productive in early morning',
        'late_morning': 'peaks in late morning',
        'afternoon': 'hits stride in the afternoon',
        'evening': 'comes alive in the evening'
      };
      parts.push(labels[prefs.peak_hours] || '');
    }

    // Introversion
    if (prefs.introversion > 0.7) {
      parts.push('needs solitude to recharge after social interaction');
    } else if (prefs.introversion < 0.3) {
      parts.push('energized by social interaction');
    }

    // Music emotional strategy
    if (prefs.music_emotional_strategy === 'match') {
      parts.push('uses music to match and validate current emotions');
    } else if (prefs.music_emotional_strategy === 'change') {
      parts.push('uses music to shift and lift mood');
    }

    // Stress coping
    const copingLabels = {
      'calm': 'seeks calm when stressed',
      'active': 'works through stress with physical activity',
      'distract': 'copes with stress through distraction',
      'social': 'turns to others when stressed'
    };
    if (copingLabels[prefs.stress_coping]) {
      parts.push(copingLabels[prefs.stress_coping]);
    }

    // Novelty seeking
    if (prefs.novelty_seeking > 0.7) {
      parts.push('loves discovering new music');
    } else if (prefs.novelty_seeking < 0.3) {
      parts.push('prefers familiar, comfort music');
    }

    // Pre-event strategy
    const eventLabels = {
      'energize': 'pumps up before important events',
      'calm': 'centers themselves with calm before events',
      'prepare': 'focuses on preparation before events',
      'distract': 'distracts themselves before stressful events'
    };
    if (eventLabels[prefs.pre_event_strategy]) {
      parts.push(eventLabels[prefs.pre_event_strategy]);
    }

    return parts.filter(Boolean).join(', ');
  }

  /**
   * Get YouTube context from stored platform data
   * Returns: subscriptions, liked videos, content categories
   */
  async getYouTubeContext(userId) {
    log.info(`Fetching YouTube context...`);

    try {
      const { data: youtubeData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .order('extracted_at', { ascending: false });

      if (error || !youtubeData || youtubeData.length === 0) {
        return null;
      }

      // Extract subscription data (API-sourced)
      const subsRow = youtubeData.find(d => d.data_type === 'subscriptions');
      const subscriptions = subsRow?.raw_data?.items || [];
      const topChannels = subscriptions
        .slice(0, 10)
        .map(s => s.snippet?.title)
        .filter(Boolean);

      // Extract liked videos data (API-sourced)
      const likedRow = youtubeData.find(d => d.data_type === 'likedVideos');
      const likedVideos = likedRow?.raw_data?.items || [];

      // Extract channel info
      const channelRow = youtubeData.find(d => d.data_type === 'channels');
      const channelStats = channelRow?.raw_data?.items?.[0]?.statistics || {};

      // Extension-sourced data: watch history, searches, recommendations
      const extensionWatches = youtubeData
        .filter(d => d.data_type === 'extension_video_watch')
        .map(d => d.raw_data)
        .filter(d => d.action === 'end' || d.action === 'start');

      const extensionSearches = youtubeData
        .filter(d => d.data_type === 'extension_search')
        .map(d => d.raw_data);

      // Recent watch history from extension (last 20)
      const recentWatchHistory = extensionWatches
        .filter(d => d.action === 'end' && d.videoId)
        .slice(0, 20)
        .map(d => ({
          videoId: d.videoId,
          title: d.title || null,
          channel: d.channel || null,
          watchDuration: d.watchDurationSeconds || 0,
          watchPercentage: d.watchPercentage || 0,
          completed: d.completed || false,
          timestamp: d.timestamp
        }));

      // Recent search queries (last 10)
      const searchQueries = extensionSearches
        .slice(0, 10)
        .map(d => ({ query: d.query, timestamp: d.timestamp }));

      // Watch pattern stats from extension data
      const watchDurations = extensionWatches
        .filter(d => d.action === 'end' && d.watchDurationSeconds > 0)
        .map(d => d.watchDurationSeconds);
      const avgWatchDuration = watchDurations.length > 0
        ? Math.round(watchDurations.reduce((a, b) => a + b, 0) / watchDurations.length)
        : null;
      const completionCount = extensionWatches.filter(d => d.completed).length;
      const completionRate = watchDurations.length > 0
        ? Math.round((completionCount / watchDurations.length) * 100)
        : null;

      // Derive content categories from liked video titles
      const categories = new Set();
      likedVideos.forEach(v => {
        const title = (v.snippet?.title || '').toLowerCase();
        if (/tutorial|learn|course|how to/i.test(title)) categories.add('Education');
        if (/game|gaming|play/i.test(title)) categories.add('Gaming');
        if (/music|song|album|concert/i.test(title)) categories.add('Music');
        if (/tech|code|programming|dev/i.test(title)) categories.add('Technology');
        if (/fitness|workout|health/i.test(title)) categories.add('Fitness');
        if (/cook|recipe|food/i.test(title)) categories.add('Food');
        if (/vlog|daily|life/i.test(title)) categories.add('Lifestyle');
      });

      const lastUpdated = youtubeData[0]?.extracted_at;

      return {
        connected: true,
        subscriptionCount: subscriptions.length || parseInt(channelStats.subscriberCount) || 0,
        likedVideoCount: likedVideos.length,
        topChannels,
        contentCategories: Array.from(categories),
        contentProfile: categories.size > 0
          ? `Interests: ${Array.from(categories).slice(0, 4).join(', ')}`
          : 'Content explorer',
        // Extension-sourced data
        recentWatchHistory,
        searchQueries,
        watchPatterns: avgWatchDuration != null ? {
          avgWatchDuration,
          completionRate,
          totalWatched: watchDurations.length
        } : null,
        hasExtensionData: extensionWatches.length > 0 || extensionSearches.length > 0,
        lastUpdated
      };
    } catch (error) {
      log.error(`YouTube error:`, error.message);
      return null;
    }
  }

  /**
   * Get Twitch context from stored platform data
   * Returns: followed channels, gaming preferences
   */
  async getTwitchContext(userId) {
    log.info(`Fetching Twitch context...`);

    try {
      const { data: twitchData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'twitch')
        .order('extracted_at', { ascending: false });

      if (error || !twitchData || twitchData.length === 0) {
        return null;
      }

      // Extract followed channels (API-sourced)
      const followedRow = twitchData.find(d => d.data_type === 'followedChannels');
      const followedChannels = followedRow?.raw_data?.data || [];
      const topChannels = followedChannels
        .slice(0, 10)
        .map(c => c.broadcaster_name || c.broadcaster_login)
        .filter(Boolean);

      // Extract user data
      const userRow = twitchData.find(d => d.data_type === 'user');
      const twitchUser = userRow?.raw_data?.data?.[0] || {};

      // Extension-sourced data: stream watches, browse history
      const extensionStreamWatches = twitchData
        .filter(d => d.data_type === 'extension_stream_watch')
        .map(d => d.raw_data)
        .filter(d => d.action === 'end' && d.watchDurationSeconds > 5);

      const extensionBrowses = twitchData
        .filter(d => d.data_type === 'extension_browse')
        .map(d => d.raw_data);

      // Recent stream watches (last 20)
      const recentStreamWatches = extensionStreamWatches
        .slice(0, 20)
        .map(d => ({
          channelName: d.channelName,
          gameName: d.gameName || null,
          watchDuration: d.watchDurationSeconds || 0,
          timestamp: d.timestamp
        }));

      // Browse history (categories)
      const browseHistory = extensionBrowses
        .slice(0, 10)
        .map(d => ({ category: d.category, timestamp: d.timestamp }));

      // Stream watch pattern stats
      const streamDurations = extensionStreamWatches
        .map(d => d.watchDurationSeconds)
        .filter(d => d > 0);
      const avgStreamDuration = streamDurations.length > 0
        ? Math.round(streamDurations.reduce((a, b) => a + b, 0) / streamDurations.length)
        : null;

      // Favorite games from extension watch data
      const gameCounts = {};
      extensionStreamWatches.forEach(d => {
        if (d.gameName) gameCounts[d.gameName] = (gameCounts[d.gameName] || 0) + 1;
      });
      const favoriteGames = Object.entries(gameCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([game]) => game);

      // Derive gaming categories from followed channel game names
      const gameCategories = new Set();
      followedChannels.forEach(c => {
        if (c.game_name) gameCategories.add(c.game_name);
      });
      // Also add games from extension watches
      favoriteGames.forEach(g => gameCategories.add(g));

      const lastUpdated = twitchData[0]?.extracted_at;

      return {
        connected: true,
        followedChannelCount: followedChannels.length,
        topChannels,
        gamingPreferences: Array.from(gameCategories).slice(0, 10),
        displayName: twitchUser.display_name || null,
        // Extension-sourced data
        recentStreamWatches,
        browseHistory,
        watchPatterns: avgStreamDuration != null ? {
          avgStreamDuration,
          favoriteGames,
          totalWatched: streamDurations.length
        } : null,
        hasExtensionData: extensionStreamWatches.length > 0 || extensionBrowses.length > 0,
        lastUpdated
      };
    } catch (error) {
      log.error(`Twitch error:`, error.message);
      return null;
    }
  }

  /**
   * Get web browsing context from extension-captured data
   * Returns: top categories, recent searches, reading profile, top domains, top topics
   */
  async getWebBrowsingContext(userId) {
    log.info(`Fetching Web browsing context...`);

    try {
      const { data: webData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'web')
        .order('extracted_at', { ascending: false })
        .limit(200);

      if (error || !webData || webData.length === 0) {
        return null;
      }

      // Page visits
      const pageVisits = webData.filter(d =>
        ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(d.data_type)
      );

      // Search queries
      const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');
      const recentSearches = searchEvents
        .slice(0, 15)
        .map(d => ({ query: d.raw_data?.searchQuery, timestamp: d.raw_data?.timestamp }))
        .filter(s => s.query);

      // Top categories by visit count
      const categoryCounts = {};
      pageVisits.forEach(d => {
        const cat = d.raw_data?.category || 'Other';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([category, count]) => ({ category, count }));

      // Top domains
      const domainCounts = {};
      pageVisits.forEach(d => {
        const domain = d.raw_data?.domain;
        if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      });
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([domain, count]) => ({ domain, count }));

      // Top topics (aggregate from all page visit topics)
      const topicCounts = {};
      pageVisits.forEach(d => {
        const topics = d.raw_data?.metadata?.topics || [];
        topics.forEach(t => {
          topicCounts[t] = (topicCounts[t] || 0) + 1;
        });
      });
      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([topic, count]) => ({ topic, count }));

      // Reading profile
      const articleReads = webData.filter(d => d.data_type === 'extension_article_read');
      const engagementScores = pageVisits
        .map(d => d.raw_data?.engagement?.engagementScore)
        .filter(s => s != null);
      const avgEngagement = engagementScores.length > 0
        ? Math.round(engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length)
        : null;

      const readingBehaviors = {};
      pageVisits.forEach(d => {
        const behavior = d.raw_data?.engagement?.readingBehavior;
        if (behavior) readingBehaviors[behavior] = (readingBehaviors[behavior] || 0) + 1;
      });

      const timeOnPages = pageVisits
        .map(d => d.raw_data?.engagement?.timeOnPage)
        .filter(t => t != null && t > 0);
      const avgTimeOnPage = timeOnPages.length > 0
        ? Math.round(timeOnPages.reduce((a, b) => a + b, 0) / timeOnPages.length)
        : null;

      // Content type distribution
      const contentTypeCounts = {};
      pageVisits.forEach(d => {
        const ct = d.raw_data?.metadata?.contentType || 'other';
        contentTypeCounts[ct] = (contentTypeCounts[ct] || 0) + 1;
      });

      const lastUpdated = webData[0]?.extracted_at;

      return {
        connected: true,
        totalPageVisits: pageVisits.length,
        totalSearches: searchEvents.length,
        totalArticleReads: articleReads.length,
        topCategories,
        topDomains,
        topTopics,
        recentSearches,
        readingProfile: {
          avgEngagement,
          avgTimeOnPage,
          readingBehaviors,
          contentTypeDistribution: contentTypeCounts
        },
        hasExtensionData: true,
        lastUpdated
      };
    } catch (error) {
      log.error(`Web browsing error:`, error.message);
      return null;
    }
  }

  /**
   * Get learned behavioral patterns
   */
  async getLearnedPatterns(userId) {
    try {
      const { data: patterns } = await supabaseAdmin
        .from('unique_patterns')
        .select('*')
        .eq('user_id', userId)
        .eq('is_defining', true)
        .order('confidence_score', { ascending: false })
        .limit(5);

      if (!patterns || patterns.length === 0) return [];

      return patterns.map(p => ({
        name: p.pattern_name,
        description: p.description,
        confidence: p.confidence_score,
        type: p.pattern_type
      }));

    } catch {
      return [];
    }
  }

  /**
   * Generate context summary for LLM
   */
  generateContextSummary(whoop, spotify, calendar, lifeContext = null, youtube = null, twitch = null, web = null) {
    const parts = [];

    // Life context takes priority (vacation, conference, etc.)
    if (lifeContext?.currentStatus && lifeContext.currentStatus !== 'normal' && lifeContext.currentStatus !== 'unknown') {
      const statusLabels = {
        vacation: '🌴 On Vacation',
        conference: '🎤 At Conference',
        training: '🏃 Training Period',
        holiday: '🎄 Holiday'
      };
      parts.push(statusLabels[lifeContext.currentStatus] || lifeContext.currentStatus);

      if (lifeContext.activeEvents?.[0]?.daysRemaining) {
        parts.push(`(${lifeContext.activeEvents[0].daysRemaining} days left)`);
      }
    }

    if (whoop?.connected && whoop.recovery?.score) {
      parts.push(`Recovery: ${whoop.recovery.score}% (${whoop.recovery.label})`);
      if (whoop.strain?.score) {
        parts.push(`Strain: ${whoop.strain.score}/21`);
      }
      if (whoop.sleep?.hours) {
        parts.push(`Sleep: ${whoop.sleep.hours}h`);
      }
    }

    if (spotify?.connected && spotify.currentMood) {
      parts.push(`Mood: ${spotify.currentMood.label}`);
    }

    if (calendar?.nextImportantEvent) {
      const event = calendar.nextImportantEvent;
      parts.push(`Next: "${event.title}" in ${event.minutesUntil}min`);
    }

    if (youtube?.connected) {
      parts.push(`YouTube: ${youtube.subscriptionCount} subs`);
    }

    if (twitch?.connected) {
      parts.push(`Twitch: ${twitch.followedChannelCount} channels`);
    }

    if (web?.connected) {
      parts.push(`Web: ${web.totalPageVisits} pages tracked`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'No context available';
  }

  // ============= Helper Methods =============

  getRecoveryLabel(score) {
    if (score == null) return 'Unknown';
    if (score >= 67) return 'Green';
    if (score >= 34) return 'Yellow';
    return 'Red';
  }

  getRecoveryColor(score) {
    if (score == null) return '#888';
    if (score >= 67) return '#22c55e';
    if (score >= 34) return '#eab308';
    return '#ef4444';
  }

  getStrainLabel(strain) {
    if (strain >= 18) return 'All Out';
    if (strain >= 14) return 'Overreaching';
    if (strain >= 10) return 'Strenuous';
    if (strain >= 6) return 'Moderate';
    return 'Light';
  }

  getSleepQualityLabel(performance) {
    if (performance == null) return 'Unknown';
    if (performance >= 85) return 'Excellent';
    if (performance >= 70) return 'Good';
    if (performance >= 50) return 'Fair';
    return 'Poor';
  }

  calculateTrend(values) {
    if (!values || values.length < 3) return 'stable';

    const recent = values.slice(0, 3);
    const older = values.slice(3);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 10) return 'improving';
    if (change < -10) return 'declining';
    return 'stable';
  }

  calculateAverageAudioFeatures(features) {
    const validFeatures = features.filter(f => f != null);
    if (validFeatures.length === 0) {
      return { energy: 0.5, valence: 0.5, tempo: 100, danceability: 0.5 };
    }

    const sum = validFeatures.reduce((acc, f) => ({
      energy: acc.energy + (f.energy || 0),
      valence: acc.valence + (f.valence || 0),
      tempo: acc.tempo + (f.tempo || 0),
      danceability: acc.danceability + (f.danceability || 0)
    }), { energy: 0, valence: 0, tempo: 0, danceability: 0 });

    const count = validFeatures.length;
    return {
      energy: Math.round((sum.energy / count) * 100) / 100,
      valence: Math.round((sum.valence / count) * 100) / 100,
      tempo: Math.round(sum.tempo / count),
      danceability: Math.round((sum.danceability / count) * 100) / 100
    };
  }

  deriveMoodFromFeatures(features) {
    const { energy, valence } = features;

    if (energy > 0.7 && valence > 0.6) {
      return { label: 'Energized', description: 'High energy, positive mood' };
    }
    if (energy > 0.7 && valence < 0.4) {
      return { label: 'Intense', description: 'High energy, focused intensity' };
    }
    if (energy < 0.4 && valence > 0.6) {
      return { label: 'Relaxed', description: 'Calm and content' };
    }
    if (energy < 0.4 && valence < 0.4) {
      return { label: 'Calm', description: 'Low energy, introspective' };
    }
    return { label: 'Balanced', description: 'Moderate energy and mood' };
  }

  classifyEventType(title) {
    if (!title) return 'general';
    const lower = title.toLowerCase();

    if (/meeting|standup|sync|1:1|one-on-one/i.test(lower)) return 'meeting';
    if (/presentation|demo|pitch|keynote/i.test(lower)) return 'presentation';
    if (/interview/i.test(lower)) return 'interview';

    // Learning/education - check BEFORE workout to avoid "class exercises" misclassification
    const isAcademicContext = /class|lecture|course|chapter|lesson|module|unit|homework|assignment|exam|quiz|test|study|seminar|tutorial|session|ses\./i.test(lower);
    if (isAcademicContext) return 'learning';

    // Workout - only match when NOT in academic context
    // Removed standalone "exercise" to avoid "class exercises chapter 2" misclassification
    if (/workout|gym|\brun\b|running|yoga|fitness|hiit|cardio|weights|crossfit|spin class|cycling|swimming|pilates|morning\s+exercise|daily\s+exercise|physical\s+exercise/i.test(lower)) return 'workout';

    if (/lunch|dinner|breakfast|coffee/i.test(lower)) return 'meal';
    if (/deadline|due|submit/i.test(lower)) return 'deadline';

    return 'general';
  }

  estimateImportance(event) {
    const title = (event.title || '').toLowerCase();
    const attendees = event.attendee_count || 0;

    if (/important|critical|urgent|ceo|investor|board/i.test(title)) return 'high';
    if (attendees > 5) return 'high';
    if (/presentation|demo|interview|pitch/i.test(title)) return 'high';

    return 'normal';
  }

  getDominantTraits(scores) {
    const traits = [
      { name: 'openness', score: scores.openness },
      { name: 'conscientiousness', score: scores.conscientiousness },
      { name: 'extraversion', score: scores.extraversion },
      { name: 'agreeableness', score: scores.agreeableness },
      { name: 'neuroticism', score: scores.neuroticism }
    ];

    return traits
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(t => t.name);
  }

  getAverageConfidence(scores) {
    const confidences = [
      scores.openness_confidence,
      scores.conscientiousness_confidence,
      scores.extraversion_confidence,
      scores.agreeableness_confidence,
      scores.neuroticism_confidence
    ].filter(c => c != null);

    if (confidences.length === 0) return null;
    return Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  }

  generateWhoopRecommendations(recovery, strain) {
    const recommendations = [];

    if (recovery < 34) {
      recommendations.push({
        type: 'rest',
        message: 'Low recovery - consider rest or light activity today',
        activityCapacity: 'low'
      });
    } else if (recovery >= 67) {
      recommendations.push({
        type: 'activity',
        message: 'High recovery - good day for intense activity',
        activityCapacity: 'high'
      });
    }

    if (strain > 14 && recovery < 50) {
      recommendations.push({
        type: 'warning',
        message: 'High strain with low recovery - prioritize rest'
      });
    }

    return recommendations;
  }

  /**
   * Get life context (vacation, conferences, etc.) for a user
   * Uses the LifeEventInferenceService to get current and upcoming life events
   */
  async getLifeContext(userId) {
    log.info(`Fetching life context for user ${userId}`);

    try {
      const lifeContextSummary = await lifeEventInferenceService.buildLifeContextSummary(userId);

      return {
        connected: true,
        isOnVacation: lifeContextSummary.isOnVacation,
        isAtConference: lifeContextSummary.isAtConference,
        isInTraining: lifeContextSummary.isInTraining,
        isHoliday: lifeContextSummary.isHoliday,
        activeEvents: lifeContextSummary.activeEvents,
        upcomingEvents: lifeContextSummary.upcomingEvents,
        promptSummary: lifeContextSummary.promptSummary,
        // Provide a simple status for quick checks
        currentStatus: lifeContextSummary.isOnVacation ? 'vacation' :
                       lifeContextSummary.isAtConference ? 'conference' :
                       lifeContextSummary.isInTraining ? 'training' :
                       lifeContextSummary.isHoliday ? 'holiday' : 'normal'
      };
    } catch (error) {
      log.error(`Life context error: ${error.message}`);
      return {
        connected: false,
        isOnVacation: false,
        isAtConference: false,
        isInTraining: false,
        isHoliday: false,
        activeEvents: [],
        upcomingEvents: [],
        promptSummary: 'Unable to determine life context.',
        currentStatus: 'unknown'
      };
    }
  }

  /**
   * Clear cache for a user
   */
  clearCache(userId) {
    for (const key of this.contextCache.keys()) {
      if (key.startsWith(userId)) {
        this.contextCache.delete(key);
      }
    }
  }
}

// Export singleton
const userContextAggregator = new UserContextAggregator();
export default userContextAggregator;
