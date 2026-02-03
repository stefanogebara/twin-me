/**
 * Moltbot Extraction Agents
 *
 * Automated data extraction from connected platforms.
 * Each agent handles a specific platform with its own polling/webhook strategy.
 *
 * Agent Types:
 * - Polling: Regular interval (cron-based) data fetching
 * - Webhook: Event-driven from platform push notifications
 * - Batch: Daily aggregation and summary generation
 *
 * References:
 * - Terra API for unified wearables: https://tryterra.co/integrations
 * - WHOOP API v2: https://developer.whoop.com/api/
 * - Spotify Web API: https://developer.spotify.com/documentation/web-api
 */

import { getMemoryService } from './moltbotMemoryService.js';
import { getTriggerService } from './moltbotTriggerService.js';
import { getMoltbotClient } from './moltbotClient.js';
import config from '../../config/moltbotConfig.js';

// Pattern Learning System integration
import deviationDetector from '../deviationDetector.js';

/**
 * Base Extraction Agent class
 */
class BaseExtractionAgent {
  constructor(userId, platform) {
    this.userId = userId;
    this.platform = platform;
    this.memoryService = getMemoryService(userId);
    this.triggerService = getTriggerService(userId);
    this.client = getMoltbotClient(userId);
  }

  /**
   * Store extracted event and trigger processing
   * Also feeds data into the pattern learning system for baseline computation
   */
  async storeAndProcess(eventType, data) {
    // Store in episodic memory
    await this.memoryService.storeEvent({
      platform: this.platform,
      type: eventType,
      data
    });

    // Process through trigger system (rule-based)
    await this.triggerService.processEvent(this.platform, eventType, data);

    // Process through pattern learning system (statistical learning)
    // This stores raw events and checks for deviations from learned baselines
    try {
      await deviationDetector.processNewEvent(this.userId, {
        platform: this.platform,
        event_type: eventType,
        event_data: data,
        event_timestamp: data.timestamp || new Date().toISOString()
      });
    } catch (error) {
      // Don't fail the extraction if pattern learning fails
      console.warn(`[${this.platform} Agent] Pattern learning processing failed:`, error.message);
    }

    return { stored: true, processed: true };
  }

  /**
   * Get OAuth tokens for this user/platform
   * Uses the centralized token refresh service that handles encryption/decryption
   */
  async getTokens() {
    // Use the centralized token refresh service
    const { getValidAccessToken } = await import('../tokenRefresh.js');

    const result = await getValidAccessToken(this.userId, this.platform);

    if (!result.success || !result.accessToken) {
      throw new Error(result.error || `No ${this.platform} connection for user ${this.userId}`);
    }

    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      token_expires_at: result.expiresAt
    };
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(refreshToken) {
    // Override in subclass with platform-specific refresh logic
    throw new Error('refreshTokens not implemented for this agent');
  }

  /**
   * Extract data - must be implemented by subclass
   */
  async extract() {
    throw new Error('extract() must be implemented by subclass');
  }
}

/**
 * Spotify Extraction Agent
 * Polls for currently playing and recently played tracks
 */
class SpotifyExtractionAgent extends BaseExtractionAgent {
  constructor(userId) {
    super(userId, 'spotify');
    this.baseUrl = 'https://api.spotify.com/v1';
  }

  async extract() {
    const tokens = await this.getTokens();
    const results = {
      currentlyPlaying: null,
      recentlyPlayed: [],
      audioFeatures: []
    };

    // Get currently playing
    try {
      const current = await this.getCurrentlyPlaying(tokens.access_token);
      if (current) {
        results.currentlyPlaying = current;
        await this.storeAndProcess('track_playing', current);
      }
    } catch (error) {
      console.error('[Spotify Agent] Error getting currently playing:', error.message);
    }

    // Get recently played
    try {
      const recent = await this.getRecentlyPlayed(tokens.access_token);
      results.recentlyPlayed = recent;

      for (const track of recent) {
        await this.storeAndProcess('track_played', track);
      }

      // Get audio features for mood analysis
      if (recent.length > 0) {
        const trackIds = recent.map(t => t.track_id).filter(Boolean);
        if (trackIds.length > 0) {
          const features = await this.getAudioFeatures(tokens.access_token, trackIds);
          results.audioFeatures = features;

          // Store aggregated mood data
          const avgMood = this.calculateAverageMood(features);
          await this.memoryService.learnFact('current_mood', {
            key: 'recent_music_mood',
            ...avgMood,
            trackCount: features.length,
            timestamp: new Date().toISOString()
          }, 0.6);
        }
      }
    } catch (error) {
      console.error('[Spotify Agent] Error getting recently played:', error.message);
    }

    return results;
  }

  async getCurrentlyPlaying(accessToken) {
    const response = await fetch(`${this.baseUrl}/me/player/currently-playing`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.status === 204) return null; // Nothing playing
    if (!response.ok) throw new Error(`Spotify API error: ${response.status}`);

    const data = await response.json();
    if (!data.item) return null;

    return {
      track_id: data.item.id,
      track_name: data.item.name,
      artist_name: data.item.artists[0]?.name,
      album_name: data.item.album?.name,
      is_playing: data.is_playing,
      progress_ms: data.progress_ms,
      duration_ms: data.item.duration_ms,
      timestamp: new Date().toISOString()
    };
  }

  async getRecentlyPlayed(accessToken, limit = 20) {
    const response = await fetch(`${this.baseUrl}/me/player/recently-played?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Spotify API error: ${response.status}`);

    const data = await response.json();
    return (data.items || []).map(item => ({
      track_id: item.track.id,
      track_name: item.track.name,
      artist_name: item.track.artists[0]?.name,
      album_name: item.track.album?.name,
      played_at: item.played_at,
      duration_ms: item.track.duration_ms
    }));
  }

  async getAudioFeatures(accessToken, trackIds) {
    const ids = trackIds.slice(0, 100).join(','); // Max 100 per request
    const response = await fetch(`${this.baseUrl}/audio-features?ids=${ids}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Spotify API error: ${response.status}`);

    const data = await response.json();
    return (data.audio_features || []).filter(Boolean).map(f => ({
      track_id: f.id,
      valence: f.valence,
      energy: f.energy,
      danceability: f.danceability,
      tempo: f.tempo,
      acousticness: f.acousticness,
      instrumentalness: f.instrumentalness
    }));
  }

  calculateAverageMood(features) {
    if (features.length === 0) return { valence: 0.5, energy: 0.5 };

    const sum = features.reduce((acc, f) => ({
      valence: acc.valence + (f.valence || 0),
      energy: acc.energy + (f.energy || 0),
      danceability: acc.danceability + (f.danceability || 0),
      tempo: acc.tempo + (f.tempo || 0)
    }), { valence: 0, energy: 0, danceability: 0, tempo: 0 });

    return {
      valence: sum.valence / features.length,
      energy: sum.energy / features.length,
      danceability: sum.danceability / features.length,
      tempo: sum.tempo / features.length
    };
  }

  async refreshTokens(refreshToken) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) throw new Error('Failed to refresh Spotify token');

    const data = await response.json();

    // Update tokens in database
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('platform_connections')
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
      })
      .eq('user_id', this.userId)
      .eq('platform', 'spotify');

    return {
      access_token: data.access_token,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
    };
  }
}

/**
 * Google Calendar Extraction Agent
 * Polls for upcoming and recent events
 */
class CalendarExtractionAgent extends BaseExtractionAgent {
  constructor(userId) {
    super(userId, 'calendar');
    this.baseUrl = 'https://www.googleapis.com/calendar/v3';
  }

  async extract() {
    const tokens = await this.getTokens();
    const results = {
      upcomingEvents: [],
      todayEvents: [],
      freeTimeSlots: []
    };

    try {
      // Get today's events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayEvents = await this.getEvents(
        tokens.access_token,
        today.toISOString(),
        tomorrow.toISOString()
      );
      results.todayEvents = todayEvents;

      // Get upcoming events (next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const upcomingEvents = await this.getEvents(
        tokens.access_token,
        new Date().toISOString(),
        nextWeek.toISOString()
      );
      results.upcomingEvents = upcomingEvents;

      // Store events and detect patterns
      for (const event of todayEvents) {
        await this.storeAndProcess('calendar_event', event);

        // Check for meeting soon
        const eventStart = new Date(event.start_time);
        const now = new Date();
        const minutesUntil = (eventStart - now) / (1000 * 60);

        if (minutesUntil > 0 && minutesUntil <= 30) {
          await this.storeAndProcess('meeting_soon', {
            ...event,
            minutes_until: Math.round(minutesUntil)
          });
        }
      }

      // Calculate free time slots
      results.freeTimeSlots = this.calculateFreeSlots(todayEvents);

      // Learn schedule patterns
      await this.learnSchedulePatterns(upcomingEvents);

    } catch (error) {
      console.error('[Calendar Agent] Error extracting events:', error.message);
    }

    return results;
  }

  async getEvents(accessToken, timeMin, timeMax) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50'
    });

    const response = await fetch(
      `${this.baseUrl}/calendars/primary/events?${params}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);

    const data = await response.json();
    return (data.items || []).map(event => ({
      event_id: event.id,
      title: event.summary || 'Untitled',
      description: event.description,
      start_time: event.start?.dateTime || event.start?.date,
      end_time: event.end?.dateTime || event.end?.date,
      is_all_day: !event.start?.dateTime,
      location: event.location,
      attendees_count: event.attendees?.length || 0,
      organizer: event.organizer?.email,
      event_type: this.inferEventType(event)
    }));
  }

  inferEventType(event) {
    const title = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    const combined = title + ' ' + description;

    if (combined.match(/meeting|sync|standup|1:1|one on one/)) return 'meeting';
    if (combined.match(/workout|gym|run|exercise|training/)) return 'workout';
    if (combined.match(/focus|deep work|coding|writing/)) return 'focus_time';
    if (combined.match(/lunch|dinner|breakfast|coffee/)) return 'social';
    if (combined.match(/call|phone|interview/)) return 'call';
    if (combined.match(/birthday|anniversary|celebration/)) return 'personal';
    if (combined.match(/deadline|due|review/)) return 'deadline';

    return 'general';
  }

  calculateFreeSlots(events) {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const slots = [];
    let lastEnd = now;

    const sortedEvents = events
      .filter(e => new Date(e.start_time) > now)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    for (const event of sortedEvents) {
      const eventStart = new Date(event.start_time);
      const gapMinutes = (eventStart - lastEnd) / (1000 * 60);

      if (gapMinutes >= 30) {
        slots.push({
          start: lastEnd.toISOString(),
          end: eventStart.toISOString(),
          duration_minutes: Math.round(gapMinutes)
        });
      }

      lastEnd = new Date(event.end_time);
    }

    // Check for free time after last event
    const remainingMinutes = (endOfDay - lastEnd) / (1000 * 60);
    if (remainingMinutes >= 30) {
      slots.push({
        start: lastEnd.toISOString(),
        end: endOfDay.toISOString(),
        duration_minutes: Math.round(remainingMinutes)
      });
    }

    return slots;
  }

  async learnSchedulePatterns(events) {
    // Count event types by day of week
    const patterns = {};

    for (const event of events) {
      const day = new Date(event.start_time).getDay();
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day];

      if (!patterns[dayName]) patterns[dayName] = {};
      patterns[dayName][event.event_type] = (patterns[dayName][event.event_type] || 0) + 1;
    }

    // Store as procedural memory
    await this.memoryService.updateProcedure('weekly_schedule_pattern', {
      pattern_data: patterns,
      total_events: events.length,
      analyzed_at: new Date().toISOString()
    });
  }

  async refreshTokens(refreshToken) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) throw new Error('Failed to refresh Google token');

    const data = await response.json();

    // Update tokens in database
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('platform_connections')
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
      })
      .eq('user_id', this.userId)
      .eq('platform', 'calendar');

    return {
      access_token: data.access_token,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
    };
  }
}

/**
 * Whoop Extraction Agent
 * Polls for recovery, sleep, and workout data
 * Also handles webhooks for real-time updates
 */
class WhoopExtractionAgent extends BaseExtractionAgent {
  constructor(userId) {
    super(userId, 'whoop');
    this.baseUrl = 'https://api.prod.whoop.com/developer/v1';
  }

  async extract() {
    const tokens = await this.getTokens();
    const results = {
      recovery: null,
      sleep: null,
      workouts: [],
      cycles: []
    };

    try {
      // Get latest recovery
      const recovery = await this.getLatestRecovery(tokens.access_token);
      if (recovery) {
        results.recovery = recovery;
        await this.storeAndProcess('recovery_updated', recovery);

        // Update baseline metrics
        await this.memoryService.learnFact('baseline_metrics', {
          key: 'resting_hr',
          value: recovery.resting_heart_rate,
          source: 'whoop',
          timestamp: new Date().toISOString()
        }, 0.8);
      }

      // Get latest sleep
      const sleep = await this.getLatestSleep(tokens.access_token);
      if (sleep) {
        results.sleep = sleep;
        await this.storeAndProcess('sleep_completed', sleep);

        // Learn sleep patterns
        await this.learnSleepPatterns(sleep);
      }

      // Get recent workouts
      const workouts = await this.getRecentWorkouts(tokens.access_token);
      results.workouts = workouts;

      for (const workout of workouts) {
        await this.storeAndProcess('workout_completed', workout);
      }

      // Get physiological cycles
      const cycles = await this.getRecentCycles(tokens.access_token);
      results.cycles = cycles;

    } catch (error) {
      console.error('[Whoop Agent] Error extracting data:', error.message);
    }

    return results;
  }

  async getLatestRecovery(accessToken) {
    const response = await fetch(`${this.baseUrl}/recovery?limit=1`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Whoop API error: ${response.status}`);

    const data = await response.json();
    const recovery = data.records?.[0];

    if (!recovery) return null;

    return {
      recovery_score: recovery.score?.recovery_score,
      resting_heart_rate: recovery.score?.resting_heart_rate,
      hrv_rmssd: recovery.score?.hrv_rmssd_milli,
      skin_temp_celsius: recovery.score?.skin_temp_celsius,
      spo2_percentage: recovery.score?.spo2_percentage,
      cycle_id: recovery.cycle_id,
      created_at: recovery.created_at
    };
  }

  async getLatestSleep(accessToken) {
    const response = await fetch(`${this.baseUrl}/activity/sleep?limit=1`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Whoop API error: ${response.status}`);

    const data = await response.json();
    const sleep = data.records?.[0];

    if (!sleep) return null;

    return {
      sleep_id: sleep.id,
      start_time: sleep.start,
      end_time: sleep.end,
      total_in_bed_minutes: sleep.score?.stage_summary?.total_in_bed_time_milli / 60000,
      total_awake_minutes: sleep.score?.stage_summary?.total_awake_time_milli / 60000,
      total_light_minutes: sleep.score?.stage_summary?.total_light_sleep_time_milli / 60000,
      total_slow_wave_minutes: sleep.score?.stage_summary?.total_slow_wave_sleep_time_milli / 60000,
      total_rem_minutes: sleep.score?.stage_summary?.total_rem_sleep_time_milli / 60000,
      sleep_efficiency: sleep.score?.sleep_efficiency_percentage,
      respiratory_rate: sleep.score?.respiratory_rate
    };
  }

  async getRecentWorkouts(accessToken, limit = 5) {
    const response = await fetch(`${this.baseUrl}/activity/workout?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Whoop API error: ${response.status}`);

    const data = await response.json();
    return (data.records || []).map(workout => ({
      workout_id: workout.id,
      sport_id: workout.sport_id,
      start_time: workout.start,
      end_time: workout.end,
      strain: workout.score?.strain,
      average_heart_rate: workout.score?.average_heart_rate,
      max_heart_rate: workout.score?.max_heart_rate,
      kilojoule: workout.score?.kilojoule,
      distance_meter: workout.score?.distance_meter,
      zone_duration: workout.score?.zone_duration
    }));
  }

  async getRecentCycles(accessToken, limit = 7) {
    const response = await fetch(`${this.baseUrl}/cycle?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Whoop API error: ${response.status}`);

    const data = await response.json();
    return (data.records || []).map(cycle => ({
      cycle_id: cycle.id,
      start_time: cycle.start,
      end_time: cycle.end,
      strain: cycle.score?.strain,
      kilojoule: cycle.score?.kilojoule,
      average_heart_rate: cycle.score?.average_heart_rate,
      max_heart_rate: cycle.score?.max_heart_rate
    }));
  }

  async learnSleepPatterns(sleep) {
    const bedtime = new Date(sleep.start_time);
    const wakeTime = new Date(sleep.end_time);

    await this.memoryService.learnFact('baseline_metrics', {
      key: 'typical_bedtime',
      value: `${bedtime.getHours().toString().padStart(2, '0')}:${bedtime.getMinutes().toString().padStart(2, '0')}`,
      source: 'whoop',
      timestamp: new Date().toISOString()
    }, 0.5); // Lower confidence as it updates daily

    await this.memoryService.learnFact('baseline_metrics', {
      key: 'typical_wake_time',
      value: `${wakeTime.getHours().toString().padStart(2, '0')}:${wakeTime.getMinutes().toString().padStart(2, '0')}`,
      source: 'whoop',
      timestamp: new Date().toISOString()
    }, 0.5);
  }

  /**
   * Handle incoming webhook from Whoop
   */
  async handleWebhook(eventType, webhookData) {
    console.log(`[Whoop Agent] Webhook received: ${eventType}`);

    switch (eventType) {
      case 'recovery.updated':
        return this.storeAndProcess('recovery_updated', this.parseRecoveryWebhook(webhookData));

      case 'workout.completed':
        return this.storeAndProcess('workout_completed', this.parseWorkoutWebhook(webhookData));

      case 'sleep.completed':
        return this.storeAndProcess('sleep_completed', this.parseSleepWebhook(webhookData));

      default:
        console.log(`[Whoop Agent] Unknown webhook event: ${eventType}`);
    }
  }

  parseRecoveryWebhook(data) {
    return {
      recovery_score: data.recovery_score,
      resting_heart_rate: data.resting_heart_rate,
      hrv_rmssd: data.hrv_rmssd,
      created_at: data.created_at
    };
  }

  parseWorkoutWebhook(data) {
    return {
      workout_id: data.id,
      sport_id: data.sport_id,
      strain: data.strain,
      start_time: data.start,
      end_time: data.end
    };
  }

  parseSleepWebhook(data) {
    return {
      sleep_id: data.id,
      start_time: data.start,
      end_time: data.end,
      sleep_efficiency: data.sleep_efficiency
    };
  }

  async refreshTokens(refreshToken) {
    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET
      })
    });

    if (!response.ok) throw new Error('Failed to refresh Whoop token');

    const data = await response.json();

    // Update tokens in database
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('platform_connections')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
      })
      .eq('user_id', this.userId)
      .eq('platform', 'whoop');

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
    };
  }
}

/**
 * Agent configuration with schedules
 */
export const extractionAgentConfigs = {
  spotify: {
    type: 'polling',
    AgentClass: SpotifyExtractionAgent,
    schedule: config.extractionAgents?.spotify?.schedule || '*/5 * * * *', // Every 5 minutes
    endpoints: ['currently_playing', 'recently_played'],
    description: 'Polls Spotify for current and recent tracks'
  },

  calendar: {
    type: 'polling',
    AgentClass: CalendarExtractionAgent,
    schedule: config.extractionAgents?.calendar?.schedule || '0 * * * *', // Every hour
    endpoints: ['events'],
    description: 'Polls Google Calendar for events'
  },

  whoop: {
    type: 'webhook', // Primary: webhook, with polling fallback
    AgentClass: WhoopExtractionAgent,
    schedule: config.extractionAgents?.whoop?.schedule || '0 */6 * * *', // Every 6 hours as fallback
    webhookEvents: ['recovery.updated', 'workout.completed', 'sleep.completed'],
    endpoints: ['recovery', 'sleep', 'workout', 'cycle'],
    description: 'Receives Whoop webhooks and polls as fallback'
  }
};

/**
 * Factory function to get an extraction agent
 */
export function getExtractionAgent(userId, platform) {
  const agentConfig = extractionAgentConfigs[platform];
  if (!agentConfig) {
    throw new Error(`No extraction agent configured for platform: ${platform}`);
  }
  return new agentConfig.AgentClass(userId);
}

/**
 * Run extraction for a specific platform and user
 */
export async function runExtraction(userId, platform) {
  const agent = getExtractionAgent(userId, platform);
  return agent.extract();
}

export {
  BaseExtractionAgent,
  SpotifyExtractionAgent,
  CalendarExtractionAgent,
  WhoopExtractionAgent
};
