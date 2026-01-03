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
import axios from 'axios';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';
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
    console.log(`🧠 [Context Aggregator] Building context for user ${userId}`);

    const { forceRefresh = false, platforms = ['whoop', 'spotify', 'calendar'] } = options;

    // Check cache first
    const cacheKey = `${userId}-${platforms.join('-')}`;
    if (!forceRefresh) {
      const cached = this.contextCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        console.log(`📦 [Context Aggregator] Using cached context`);
        return cached.context;
      }
    }

    // Aggregate data from all platforms in parallel (including life context and personality quiz)
    const [whoopContext, spotifyContext, calendarContext, personality, personalityQuiz, patterns, lifeContext] = await Promise.all([
      platforms.includes('whoop') ? this.getWhoopContext(userId) : null,
      platforms.includes('spotify') ? this.getSpotifyContext(userId) : null,
      platforms.includes('calendar') ? this.getCalendarContext(userId) : null,
      this.getPersonalityProfile(userId),
      this.getPersonalityQuiz(userId),
      this.getLearnedPatterns(userId),
      this.getLifeContext(userId)
    ]);

    const context = {
      success: true,
      userId,
      timestamp: new Date().toISOString(),
      whoop: whoopContext,
      spotify: spotifyContext,
      calendar: calendarContext,
      lifeContext, // Life context (vacation, conferences, etc.)
      personality, // Big Five from personality_scores table
      personalityQuiz, // Onboarding quiz preferences from users table
      patterns,
      summary: this.generateContextSummary(whoopContext, spotifyContext, calendarContext, lifeContext)
    };

    // Cache the context
    this.contextCache.set(cacheKey, {
      timestamp: Date.now(),
      context
    });

    console.log(`✅ [Context Aggregator] Context built successfully`);
    return context;
  }

  /**
   * Get current Whoop health context
   * Returns: recovery score, sleep data, strain level, HRV
   */
  async getWhoopContext(userId) {
    console.log(`💪 [Context Aggregator] Fetching Whoop context...`);

    try {
      // Get Whoop connection
      const { data: connection, error } = await supabaseAdmin
        .from('platform_connections')
        .select('access_token, refresh_token, token_expires_at')
        .eq('user_id', userId)
        .eq('platform', 'whoop')
        .single();

      if (error || !connection) {
        console.log(`⚠️ [Context Aggregator] Whoop not connected`);
        return null;
      }

      // Use automatic token refresh instead of just returning needsReauth
      let accessToken;
      try {
        accessToken = await ensureFreshToken(userId, 'whoop');
        console.log(`✅ [Context Aggregator] Got fresh Whoop token`);
      } catch (refreshError) {
        console.log(`⚠️ [Context Aggregator] Whoop token refresh failed: ${refreshError.message}`);
        return { connected: false, needsReauth: true };
      }

      const headers = { 'Authorization': `Bearer ${accessToken}` };

      // Fetch both cycle and recovery data in parallel for comprehensive health context
      const [cycleRes, recoveryRes] = await Promise.all([
        axios.get(`${WHOOP_API_BASE}/cycle`, { headers, params: { limit: 1 } })
          .catch(err => {
            console.log(`⚠️ [Context Aggregator] Cycle API error: ${err.message}`);
            return { data: { records: [] } };
          }),
        axios.get(`${WHOOP_API_BASE}/recovery`, { headers, params: { limit: 7 } })
          .catch(err => {
            console.log(`⚠️ [Context Aggregator] Recovery API error: ${err.message}`);
            return { data: { records: [] } };
          })
      ]);

      // Log raw API responses for debugging
      console.log(`📊 [Context Aggregator] Cycle response:`, JSON.stringify(cycleRes.data).substring(0, 500));
      console.log(`📊 [Context Aggregator] Recovery response:`, JSON.stringify(recoveryRes.data).substring(0, 500));

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

      // Try recovery endpoint first (most accurate)
      if (latestRecovery) {
        console.log(`📊 [Context Aggregator] latestRecovery object:`, JSON.stringify(latestRecovery).substring(0, 300));
        recovery = latestRecovery.score?.recovery_score ?? latestRecovery.recovery_score ?? null;
        hrv = latestRecovery.score?.hrv_rmssd_milli ?? latestRecovery.hrv_rmssd_milli ?? null;
        rhr = latestRecovery.score?.resting_heart_rate ?? latestRecovery.resting_heart_rate ?? null;
        console.log(`📊 [Context Aggregator] Extracted: recovery=${recovery}, hrv=${hrv}, rhr=${rhr}`);
      } else {
        console.log(`⚠️ [Context Aggregator] No latestRecovery found, recoveries array length: ${recoveries.length}`);
      }

      // Fall back to cycle data if recovery endpoint didn't have the data
      if (recovery === null && latestCycle) {
        recovery = latestCycle.score?.recovery_score ?? latestCycle.recovery?.score ?? null;
        hrv = hrv ?? latestCycle.score?.hrv_rmssd_milli ?? latestCycle.recovery?.hrv_rmssd_milli ?? null;
        rhr = rhr ?? latestCycle.score?.resting_heart_rate ?? latestCycle.recovery?.resting_heart_rate ?? null;
        console.log(`📊 [Context Aggregator] Recovery from /cycle endpoint: ${recovery}%`);
      }

      // Get strain from cycle data
      const strain = latestCycle?.score?.strain ?? latestCycle?.strain?.score ?? 0;
      console.log(`📊 [Context Aggregator] Strain: ${strain}, Recovery: ${recovery}%`);

      // Calculate HRV trend from recent data
      const hrvValues = recoveries
        .map(r => r.score?.hrv_rmssd_milli)
        .filter(v => v != null);
      const hrvTrend = this.calculateTrend(hrvValues);

      // Calculate recovery label
      const recoveryLabel = this.getRecoveryLabel(recovery);
      const strainLabel = this.getStrainLabel(strain);

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
        sleep: await this.getSleepContext(headers),
        lastUpdated: latestCycle.end || latestCycle.created_at,
        recommendations: this.generateWhoopRecommendations(recovery, strain)
      };

    } catch (error) {
      console.error(`❌ [Context Aggregator] Whoop error:`, error.message);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Get sleep data from Whoop
   */
  async getSleepContext(headers) {
    try {
      const sleepRes = await axios.get(`${WHOOP_API_BASE}/activity/sleep`, {
        headers,
        params: { limit: 1 }
      });

      const latestSleep = sleepRes.data?.records?.[0] || sleepRes.data?.[0];

      if (!latestSleep) return null;

      const totalSleepMs = latestSleep.score?.total_sleep_duration || 0;
      const totalSleepHours = totalSleepMs / (1000 * 60 * 60);

      const hoursRounded = Math.round(totalSleepHours * 10) / 10;
      return {
        hours: hoursRounded,
        totalHours: hoursRounded, // Alias for intelligent-twin.js compatibility
        performance: latestSleep.score?.sleep_performance_percentage || null,
        efficiency: latestSleep.score?.sleep_efficiency || null,
        stages: {
          rem: latestSleep.score?.rem_sleep_duration,
          deep: latestSleep.score?.slow_wave_sleep_duration,
          light: latestSleep.score?.light_sleep_duration
        },
        quality: this.getSleepQualityLabel(latestSleep.score?.sleep_performance_percentage)
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
    console.log(`🎵 [Context Aggregator] Fetching Spotify context...`);

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
        console.log(`✅ [Context Aggregator] Got fresh Spotify token`);
      } catch (refreshError) {
        console.log(`⚠️ [Context Aggregator] Spotify token refresh failed: ${refreshError.message}`);
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
      console.error(`❌ [Context Aggregator] Spotify error:`, error.message);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Get upcoming calendar events
   */
  async getCalendarContext(userId) {
    console.log(`📅 [Context Aggregator] Fetching calendar context...`);

    try {
      // First check for Google Calendar connection
      const { data: connection } = await supabaseAdmin
        .from('platform_connections')
        .select('access_token, refresh_token, token_expires_at')
        .eq('user_id', userId)
        .eq('platform', 'google_calendar')
        .single();

      if (!connection) {
        console.log(`⚠️ [Context Aggregator] Google Calendar not connected`);
        return null;
      }

      // Get fresh token using automatic refresh
      let accessToken;
      try {
        accessToken = await ensureFreshToken(userId, 'google_calendar');
        console.log(`✅ [Context Aggregator] Got fresh Calendar token`);
      } catch (refreshError) {
        console.log(`⚠️ [Context Aggregator] Calendar token refresh failed: ${refreshError.message}`);
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
      console.log(`📅 [Context Aggregator] Found ${calendars.length} calendars`);

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
          console.log(`⚠️ [Context Aggregator] Skipping calendar ${calendar.summary}: ${err.message}`);
        }
      }

      // Sort by start time
      allEvents.sort((a, b) => {
        const aTime = new Date(a.start?.dateTime || a.start?.date).getTime();
        const bTime = new Date(b.start?.dateTime || b.start?.date).getTime();
        return aTime - bTime;
      });

      const items = allEvents.slice(0, 15); // Limit to 15 events
      console.log(`📅 [Context Aggregator] Found ${items.length} calendar events from all calendars`);

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
      console.error(`❌ [Context Aggregator] Calendar error:`, error.message);
      // Fall back to database if API fails
      try {
        const { data: events } = await supabaseAdmin
          .from('calendar_events')
          .select('*')
          .eq('user_id', userId)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(5);

        if (events && events.length > 0) {
          return this.formatCalendarEvents(events);
        }
      } catch {
        // Ignore fallback error
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
      const { data: estimates } = await supabaseAdmin
        .from('personality_estimates')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (estimates && estimates.total_questions_answered > 0) {
        console.log(`🧠 [Context Aggregator] Found personality assessment: ${estimates.archetype_code} (${estimates.total_questions_answered} questions)`);
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
      const { data: scores } = await supabaseAdmin
        .from('personality_scores')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!scores) return null;

      console.log(`🧠 [Context Aggregator] Using behavioral personality scores`);
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
      console.error(`❌ [Context Aggregator] Error fetching personality:`, error);
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
    console.log(`🧩 [Context Aggregator] Fetching personality quiz for user ${userId}`);

    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('personality_quiz, onboarding_completed_at')
        .eq('id', userId)
        .single();

      if (error || !user?.personality_quiz || user.personality_quiz.skipped) {
        console.log(`⚠️ [Context Aggregator] No personality quiz data`);
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
      console.error(`❌ [Context Aggregator] Personality quiz error:`, error.message);
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
  generateContextSummary(whoop, spotify, calendar, lifeContext = null) {
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
    if (/workout|gym|exercise|run|yoga/i.test(lower)) return 'workout';
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
    console.log(`🌴 [Context Aggregator] Fetching life context for user ${userId}`);

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
      console.error(`❌ [Context Aggregator] Life context error: ${error.message}`);
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
