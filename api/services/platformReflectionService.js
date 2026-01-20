/**
 * Platform Reflection Service
 *
 * Generates conversational, introspective reflections from the digital twin
 * about each platform's data. Instead of showing stats ("847 tracks analyzed"),
 * the twin shares observations about patterns it has noticed.
 *
 * Core Philosophy:
 * - NO numbers, percentages, or statistics
 * - Speak directly to the user ("You", "Your")
 * - Observe patterns, don't list data
 * - Sound like a thoughtful friend, not a fitness app
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import userContextAggregator from './userContextAggregator.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-5-20250929';
const CACHE_TTL_HOURS = 6;

class PlatformReflectionService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get reflections for a specific platform
   * @param {string} userId - User ID
   * @param {string} platform - 'spotify' | 'whoop' | 'calendar'
   * @returns {Promise<Object>} Reflection data
   */
  async getReflections(userId, platform) {
    console.log(`🪞 [Reflection] Getting ${platform} reflections for user ${userId}`);

    try {
      // 1. Check for valid cached reflection
      const cached = await this.getCachedReflection(userId, platform);
      if (cached && !this.isExpired(cached)) {
        console.log(`🪞 [Reflection] Using cached ${platform} reflection`);
        const fullContext = await userContextAggregator.aggregateUserContext(userId);
        const lifeContext = fullContext?.lifeContext || null;
        // Also fetch fresh platform data for visual display (pass context to avoid duplicate calls)
        const platformData = await this.getPlatformData(userId, platform, fullContext);
        const visualData = platformData.success ? platformData.data : null;
        return this.formatResponse(cached, await this.getHistory(userId, platform), lifeContext, visualData);
      }

      // 2. Get full context first (to avoid parallel token refreshes), then platform-specific data
      const fullContext = await userContextAggregator.aggregateUserContext(userId);
      const platformData = await this.getPlatformData(userId, platform, fullContext);

      if (!platformData.success) {
        return {
          success: false,
          error: platformData.error || `No ${platform} data available`
        };
      }

      // 3. Get life context and personality quiz for the prompt
      const lifeContext = fullContext?.lifeContext || null;
      const personalityQuiz = fullContext?.personalityQuiz || null;

      // 4. Generate new reflection using Claude (with life context and personality)
      const reflection = await this.generateReflection(
        platform,
        platformData.data,
        lifeContext,
        personalityQuiz,
        platformData.data // Pass raw data for storage
      );

      // 5. Store the reflection
      await this.storeReflection(userId, platform, reflection);

      // 6. Get history
      const history = await this.getHistory(userId, platform);

      return this.formatResponse(reflection, history, lifeContext, platformData.data);
    } catch (error) {
      console.error(`❌ [Reflection] Error for ${platform}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Force refresh a reflection (ignore cache)
   */
  async refreshReflection(userId, platform) {
    console.log(`🪞 [Reflection] Force refreshing ${platform} reflection`);

    // Get both platform data and full context
    const [platformData, fullContext] = await Promise.all([
      this.getPlatformData(userId, platform),
      userContextAggregator.aggregateUserContext(userId)
    ]);

    if (!platformData.success) {
      return { success: false, error: platformData.error };
    }

    const lifeContext = fullContext?.lifeContext || null;
    const personalityQuiz = fullContext?.personalityQuiz || null;

    const reflection = await this.generateReflection(
      platform,
      platformData.data,
      lifeContext,
      personalityQuiz,
      platformData.data
    );
    await this.storeReflection(userId, platform, reflection);
    const history = await this.getHistory(userId, platform);

    return this.formatResponse(reflection, history, lifeContext, platformData.data);
  }

  /**
   * Get platform-specific data for reflection generation
   * @param {string} userId - User ID
   * @param {string} platform - Platform name
   * @param {Object} existingContext - Optional pre-fetched context to avoid duplicate calls
   */
  async getPlatformData(userId, platform, existingContext = null) {
    const context = existingContext || await userContextAggregator.aggregateUserContext(userId);

    if (!context.success) {
      return { success: false, error: 'Failed to get user context' };
    }

    switch (platform) {
      case 'spotify':
        return this.getSpotifyData(userId, context);
      case 'whoop':
        return this.getWhoopData(context);
      case 'calendar':
        return this.getCalendarData(context);
      default:
        return { success: false, error: 'Unknown platform' };
    }
  }

  /**
   * Get Spotify data for reflection
   *
   * Data can be stored in two formats:
   * 1. Individual rows (old format): each row = 1 track with flat structure
   * 2. API response (new format): each row = full Spotify API response with items[] array
   */
  async getSpotifyData(userId, context) {
    try {
      // Get top tracks - try both 'top_tracks' (new) and 'top_track' (old) formats
      const { data: topTracksNew } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_tracks')
        .order('extracted_at', { ascending: false })
        .limit(1);

      const { data: topTracksOld } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_track')
        .order('extracted_at', { ascending: false })
        .limit(20);

      // Get recent plays - fetch multiple records to aggregate listening hours across days
      // Spotify API only returns 50 most recent tracks per call, so we need historical records
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPlays } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'recently_played')
        .gte('extracted_at', sevenDaysAgo)
        .order('extracted_at', { ascending: false })
        .limit(50); // Get up to 50 sync records for comprehensive listening hour data

      // Get audio features if available
      const { data: audioFeatures } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'audio_features')
        .order('extracted_at', { ascending: false })
        .limit(1);

      // Get top artists (has genre info from Spotify API)
      const { data: topArtistsData } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_artists')
        .order('extracted_at', { ascending: false })
        .limit(1);

      // Extract tracks from new format (API response with items array)
      let allTopTracks = [];
      let allRecentTracks = [];

      // Handle new format: raw_data.items is an array
      if (topTracksNew?.[0]?.raw_data?.items) {
        allTopTracks = topTracksNew[0].raw_data.items.map(item => ({
          name: item.name,
          artist: item.artists?.[0]?.name,
          genres: item.artists?.[0]?.genres || []
        }));
      }
      // Handle old format: each row is a track
      if (topTracksOld?.length) {
        const oldTracks = topTracksOld.map(t => ({
          name: t.raw_data?.track_name || t.raw_data?.name,
          artist: t.raw_data?.artist_name || t.raw_data?.artists?.[0]?.name,
          genres: t.raw_data?.genres || []
        })).filter(t => t.name);
        allTopTracks = [...allTopTracks, ...oldTracks];
      }

      // Handle recent plays - aggregate from multiple sync records for accurate listening hour data
      // Each sync record contains tracks from that point in time, so we aggregate and deduplicate
      if (recentPlays?.length > 0) {
        const seenTracks = new Set(); // Track unique plays by played_at timestamp
        recentPlays.forEach(record => {
          if (record.raw_data?.items) {
            record.raw_data.items.forEach(item => {
              const playedAt = item.played_at;
              // Use played_at as unique key to avoid duplicates across sync records
              if (playedAt && !seenTracks.has(playedAt)) {
                seenTracks.add(playedAt);
                allRecentTracks.push({
                  name: item.track?.name,
                  artist: item.track?.artists?.[0]?.name,
                  playedAt: playedAt,
                  genres: item.track?.artists?.[0]?.genres || []
                });
              }
            });
          }
        });
        // Sort by played_at descending (most recent first)
        allRecentTracks = allRecentTracks
          .filter(t => t.name)
          .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
      }

      // Extract unique artists
      const topArtists = [...new Set(
        allTopTracks.map(t => t.artist).filter(Boolean)
      )].slice(0, 10);

      // Format track names
      const topTrackNames = allTopTracks
        .map(t => `${t.name} by ${t.artist}`)
        .filter(Boolean)
        .slice(0, 10);

      const recentTrackNames = allRecentTracks
        .map(t => t.name)
        .filter(Boolean)
        .slice(0, 10);

      // Calculate average audio features
      const features = audioFeatures?.[0]?.raw_data || {};

      // ========== VISUALIZATION DATA ==========

      // 1. Top Artists with Play Counts (combine from tracks and recent plays)
      const artistPlayCounts = {};
      [...allTopTracks, ...allRecentTracks].forEach(track => {
        if (track.artist) {
          artistPlayCounts[track.artist] = (artistPlayCounts[track.artist] || 0) + 1;
        }
      });
      const topArtistsWithPlays = Object.entries(artistPlayCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, plays]) => ({ name, plays }));

      // 2. Genre Distribution (from top artists API data or inferred from tracks)
      let genreCounts = {};

      // First try top_artists data which has accurate genre info
      if (topArtistsData?.[0]?.raw_data?.items) {
        topArtistsData[0].raw_data.items.forEach(artist => {
          const genres = artist.genres || [];
          genres.forEach(genre => {
            // Normalize genre names (capitalize first letter)
            const normalizedGenre = genre.split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            genreCounts[normalizedGenre] = (genreCounts[normalizedGenre] || 0) + 1;
          });
        });
      }

      // Fallback: try to extract from tracks if available
      if (Object.keys(genreCounts).length === 0) {
        [...allTopTracks, ...allRecentTracks].forEach(track => {
          if (track.genres && Array.isArray(track.genres)) {
            track.genres.forEach(genre => {
              const normalizedGenre = genre.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
              genreCounts[normalizedGenre] = (genreCounts[normalizedGenre] || 0) + 1;
            });
          }
        });
      }

      const totalGenreOccurrences = Object.values(genreCounts).reduce((sum, count) => sum + count, 0);
      const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({
          genre,
          percentage: Math.round((count / totalGenreOccurrences) * 100)
        }));

      // 3. Listening Hours Distribution (from recent plays with timestamps)
      const hourCounts = {};
      for (let h = 0; h < 24; h++) hourCounts[h] = 0;

      allRecentTracks.forEach(track => {
        if (track.playedAt) {
          try {
            const hour = new Date(track.playedAt).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          } catch (e) {
            // Skip invalid dates
          }
        }
      });

      const listeningHours = Object.entries(hourCounts)
        .map(([hour, plays]) => ({ hour: parseInt(hour), plays }))
        .sort((a, b) => a.hour - b.hour);

      console.log(`🎵 [Reflection] Found ${allTopTracks.length} top tracks, ${allRecentTracks.length} recent tracks for user ${userId}`);
      console.log(`📊 [Reflection] Visualization data: ${topArtistsWithPlays.length} artists, ${topGenres.length} genres, ${listeningHours.filter(h => h.plays > 0).length} active hours`);

      return {
        success: allTopTracks.length > 0 || allRecentTracks.length > 0,
        data: {
          topArtists,
          topTrackNames,
          recentTrackNames,
          // Also include structured data for visual display
          recentTracksStructured: allRecentTracks.slice(0, 5),
          averageEnergy: features.energy || context.spotify?.averageEnergy,
          averageValence: features.valence,
          listeningContext: context.spotify?.recentMood,
          // NEW: Visualization data for charts
          topArtistsWithPlays,
          topGenres,
          listeningHours
        }
      };
    } catch (error) {
      console.error('❌ [Reflection] Spotify data error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Whoop data for reflection
   * Uses rich structure from userContextAggregator
   */
  getWhoopData(context) {
    // Check for null/undefined OR explicit disconnected state
    if (!context.whoop) {
      return { success: false, error: 'Whoop not connected' };
    }

    // Handle case where token refresh failed (needsReauth) or connection marked as false
    if (context.whoop.connected === false || context.whoop.needsReauth) {
      return {
        success: false,
        error: context.whoop.needsReauth
          ? 'Whoop connection expired. Please reconnect to see your body stories.'
          : 'Whoop not connected'
      };
    }

    const whoop = context.whoop;

    // Handle both old flat structure and new nested structure from userContextAggregator
    const recoveryScore = whoop.recovery?.score ?? whoop.recovery ?? null;
    const recoveryLabel = whoop.recovery?.label ?? whoop.recoveryLabel ?? 'unknown';
    const strainScore = whoop.strain?.score ?? whoop.strain ?? 0;
    const strainLabel = whoop.strain?.label ?? (strainScore > 15 ? 'high' : strainScore < 8 ? 'low' : 'moderate');
    const hrvCurrent = whoop.hrv?.current ?? whoop.hrv ?? null;
    const hrvTrend = whoop.hrv?.trend ?? whoop.hrvTrend ?? 'stable';
    const rhrCurrent = whoop.rhr?.current ?? null;
    const sleepHours = whoop.sleep?.hours ?? whoop.sleepHours ?? 0;
    const sleepPerformance = whoop.sleep?.performance ?? null;
    const sleepEfficiency = whoop.sleep?.efficiency ?? null;
    const sleepStages = whoop.sleep?.stages ?? null;

    // New vitals from Whoop V2 API
    const spo2 = whoop.vitals?.spo2 ?? null;
    const skinTemp = whoop.vitals?.skinTemp ?? null;
    const respiratoryRate = whoop.sleep?.respiratoryRate ?? null;
    const sleepDisturbances = whoop.sleep?.disturbances ?? null;

    // Calculate stress level based on recovery
    const getStressLevel = (score) => {
      if (score === null || score === undefined) return null;
      if (score >= 67) return 'Low';
      if (score >= 50) return 'Moderate';
      if (score >= 34) return 'High';
      return 'Very High';
    };
    const stressLevel = getStressLevel(recoveryScore);

    // Calculate sleep quality
    const sleepQuality = sleepHours > 7 ? 'good' : sleepHours < 6 ? 'poor' : 'moderate';

    // Calculate recovery trending
    const recoveryTrending = recoveryScore > 66 ? 'up' : recoveryScore < 33 ? 'down' : 'stable';

    // Calculate sleep breakdown (in hours from milliseconds if available)
    const msToHours = (ms) => ms ? Math.round((ms / 3600000) * 10) / 10 : 0;
    const sleepBreakdown = sleepStages ? {
      deepSleep: msToHours(sleepStages.deep),
      remSleep: msToHours(sleepStages.rem),
      lightSleep: msToHours(sleepStages.light),
      totalHours: Math.round(sleepHours * 10) / 10,
      efficiency: sleepEfficiency || 0
    } : null;

    // Current metrics for visualization
    const currentMetrics = {
      recovery: recoveryScore,
      strain: Math.round(strainScore * 10) / 10,
      sleepPerformance: sleepPerformance,
      hrv: hrvCurrent,
      restingHR: rhrCurrent,
      // New vitals from Whoop V2 API
      spo2: spo2,
      skinTemp: skinTemp,
      respiratoryRate: respiratoryRate,
      sleepDisturbances: sleepDisturbances,
      stressLevel: stressLevel
    };

    // Recent trends for display
    const recentTrends = [
      `${recoveryLabel} recovery zone`,
      `${strainLabel} daily strain`,
      `${sleepQuality} sleep quality`,
      `HRV ${hrvTrend}`
    ].filter(t => !t.includes('null') && !t.includes('undefined'));

    // Get 7-day history from context if available
    const history7Day = whoop.history7Day || [];

    // Calculate historical averages and comparisons for AI context
    const historicalContext = this.calculateHistoricalContext(
      recoveryScore, hrvCurrent, sleepHours, history7Day
    );

    return {
      success: true,
      data: {
        // For reflection prompt
        recoveryLevel: recoveryLabel,
        recoveryTrending: recoveryTrending,
        sleepQuality: sleepQuality,
        strainLevel: strainLabel,
        hrvTrend: hrvTrend,
        sleepHoursCategory: sleepHours > 8 ? 'long' : sleepHours < 6 ? 'short' : 'normal',
        // Historical context for richer AI insights
        historicalContext,
        // For visualization
        currentMetrics,
        sleepBreakdown,
        recentTrends,
        history7Day
      }
    };
  }

  /**
   * Get Calendar data for reflection
   * Includes visualization data for charts
   */
  getCalendarData(context) {
    // Check for null/undefined OR explicit disconnected state
    if (!context.calendar) {
      return { success: false, error: 'Calendar not connected' };
    }

    // Handle case where token refresh failed (needsReauth) or connection marked as false
    if (context.calendar.connected === false || context.calendar.needsReauth) {
      return {
        success: false,
        error: context.calendar.needsReauth
          ? 'Calendar connection expired. Please reconnect to see your time patterns.'
          : 'Calendar not connected'
      };
    }

    const events = context.calendar.upcomingEvents || context.calendar.events || [];
    const nextEvent = context.calendar.nextEvent;

    // Analyze patterns without counting
    const hasManyMeetings = events.length > 5;
    const hasUpcomingSoon = nextEvent && nextEvent.minutesUntil < 60;
    const meetingTypes = [...new Set(events.map(e => e.type).filter(Boolean))];

    // Helper to format time as HH:mm
    const formatTime = (dateStr) => {
      if (!dateStr) return '09:00';
      try {
        const date = new Date(dateStr);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      } catch (e) {
        return '09:00';
      }
    };

    // Get today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Filter and format today's events for timeline
    const todayEvents = events
      .filter(e => {
        const eventDate = new Date(e.startTime || e.start);
        return eventDate >= today && eventDate < tomorrow;
      })
      .map((e, index) => ({
        id: e.id || `event-${index}`,
        title: e.title || 'Untitled',
        startTime: formatTime(e.startTime || e.start),
        endTime: formatTime(e.endTime || e.end),
        type: e.type || 'meeting',
        attendees: e.attendeeCount || 0
      }));

    // Format upcoming events for list display with day grouping info
    const upcomingEvents = events.slice(0, 10).map((e, index) => {
      const eventDate = new Date(e.startTime || e.start);
      const eventDateStr = eventDate.toDateString();
      const todayStr = today.toDateString();
      const tomorrowStr = tomorrow.toDateString();

      // Calculate day label
      let dayLabel;
      if (eventDateStr === todayStr) {
        dayLabel = 'Today';
      } else if (eventDateStr === tomorrowStr) {
        dayLabel = 'Tomorrow';
      } else {
        // Format as "Wednesday, Jan 15"
        dayLabel = eventDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        });
      }

      return {
        id: e.id || `upcoming-${index}`,
        title: e.title || 'Untitled',
        time: `${formatTime(e.startTime || e.start)} - ${formatTime(e.endTime || e.end)}`,
        type: e.type || 'meeting',
        attendees: e.attendeeCount || 0,
        date: eventDateStr,
        dayLabel
      };
    });

    // Calculate event type distribution with colors
    const typeCounts = {};
    events.forEach(e => {
      const type = (e.type || 'General').charAt(0).toUpperCase() + (e.type || 'General').slice(1);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const totalEvents = events.length || 1;
    const typeColors = {
      'Meeting': '#4285F4',
      'Focus': '#34A853',
      'Presentation': '#FBBC05',
      'Workout': '#EA4335',
      'Interview': '#9334E9',
      'Personal': '#FF6D01',
      'General': '#5F6368',
      'Other': '#9E9E9E'
    };
    const eventTypeDistribution = Object.entries(typeCounts)
      .map(([type, count]) => ({
        type,
        percentage: Math.round((count / totalEvents) * 100),
        color: typeColors[type] || typeColors['Other']
      }))
      .sort((a, b) => b.percentage - a.percentage);

    // Calculate weekly heatmap with time slots
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const timeSlots = ['8-10', '10-12', '12-2', '2-4', '4-6'];
    const slotRanges = [
      { start: 8, end: 10 },
      { start: 10, end: 12 },
      { start: 12, end: 14 },
      { start: 14, end: 16 },
      { start: 16, end: 18 }
    ];

    const weeklyHeatmap = weekDays.map(day => {
      const dayEvents = events.filter(e => {
        const eventDate = new Date(e.startTime || e.start);
        const eventDay = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
        return eventDay === day;
      });

      // Calculate intensity for each time slot
      const slots = timeSlots.map((slot, slotIndex) => {
        const range = slotRanges[slotIndex];
        const slotEvents = dayEvents.filter(e => {
          const eventDate = new Date(e.startTime || e.start);
          const eventHour = eventDate.getHours();
          return eventHour >= range.start && eventHour < range.end;
        });
        // Intensity: 0=free, 1=light, 2=moderate, 3=busy
        const intensity = slotEvents.length === 0 ? 0 : slotEvents.length === 1 ? 1 : slotEvents.length === 2 ? 2 : 3;
        return { slot, intensity };
      });

      return {
        day,
        slots,
        events: dayEvents.length,
        intensity: dayEvents.length > 4 ? 'high' : dayEvents.length > 1 ? 'medium' : 'low'
      };
    });

    // Find busiest day
    const busiestDay = weeklyHeatmap.reduce((busiest, current) =>
      current.events > (busiest?.events || 0) ? current : busiest
    , { day: 'Monday', events: 0 });

    // Calculate schedule stats
    const meetingEvents = events.filter(e => ['meeting', 'presentation', 'interview'].includes(e.type));
    const focusEvents = events.filter(e => e.type === 'focus');
    const avgMeetingDuration = 1; // Default 1 hour
    const scheduleStats = {
      meetingHours: Math.round(meetingEvents.length * avgMeetingDuration),
      focusBlocks: focusEvents.length,
      busiestDay: busiestDay.day,
      preferredMeetingTime: todayEvents.length > 0 && parseInt(todayEvents[0].startTime) < 12 ? 'Morning (9-12pm)' : 'Afternoon (1-5pm)'
    };

    return {
      success: true,
      data: {
        // For reflection prompt
        dayDensity: hasManyMeetings ? 'busy' : events.length > 2 ? 'moderate' : 'light',
        upcomingEventTitle: nextEvent?.title,
        upcomingEventSoon: hasUpcomingSoon,
        eventTypes: meetingTypes,
        hasOpenTime: events.length < 3,
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        // For visualization
        todayEvents,
        upcomingEvents,
        eventTypeDistribution,
        weeklyHeatmap,
        scheduleStats
      }
    };
  }

  /**
   * Generate a reflection using Claude
   */
  async generateReflection(platform, data, lifeContext = null, personalityQuiz = null, rawPlatformData = null) {
    const prompt = this.getPromptForPlatform(platform, data, lifeContext, personalityQuiz);

    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let responseText = message.content[0].text.trim();

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '');
      }

      const result = JSON.parse(responseText);

      return {
        text: result.reflection,
        themes: result.themes || [],
        confidence: result.confidence || 'medium',
        evidence: result.evidence || [],
        patterns: result.patterns || [],
        // Store the context used to generate this reflection
        contextSnapshot: {
          lifeContext: lifeContext ? {
            currentStatus: lifeContext.currentStatus,
            activeEvents: lifeContext.activeEvents,
            promptSummary: lifeContext.promptSummary
          } : null,
          personalityQuiz: personalityQuiz ? {
            summary: personalityQuiz.summary,
            morningPerson: personalityQuiz.morningPerson,
            introversion: personalityQuiz.introversion,
            musicEmotionalStrategy: personalityQuiz.musicEmotionalStrategy,
            stressCoping: personalityQuiz.stressCoping,
            noveltySeeking: personalityQuiz.noveltySeeking
          } : null,
          rawDataUsed: rawPlatformData
        }
      };
    } catch (error) {
      console.error('❌ [Reflection] Claude error:', error);
      return this.getFallbackReflection(platform);
    }
  }

  /**
   * Get platform-specific prompt
   */
  getPromptForPlatform(platform, data, lifeContext = null, personalityQuiz = null) {
    // Build life context prompt section
    let lifeContextSection = '';
    if (lifeContext && lifeContext.promptSummary && lifeContext.currentStatus !== 'normal') {
      lifeContextSection = `
IMPORTANT LIFE CONTEXT:
${lifeContext.promptSummary}

This life context should inform your observation - consider how it affects their patterns.
`;
    }

    // Build personality quiz section
    let personalitySection = '';
    if (personalityQuiz && personalityQuiz.summary) {
      personalitySection = `
WHO THIS PERSON IS (from their personality quiz):
${personalityQuiz.summary}

Key traits to incorporate:
- Morning/evening person: ${personalityQuiz.morningPerson === true ? 'Morning person' : personalityQuiz.morningPerson === false ? 'Not a morning person' : 'Unknown'}
- Peak productivity: ${personalityQuiz.peakHours || 'Unknown'}
- Introversion level: ${personalityQuiz.introversion !== undefined ? (personalityQuiz.introversion > 0.6 ? 'Introverted' : personalityQuiz.introversion < 0.4 ? 'Extroverted' : 'Balanced') : 'Unknown'}
- Music strategy: ${personalityQuiz.musicEmotionalStrategy || 'Unknown'} (match moods vs change moods)
- Stress coping: ${personalityQuiz.stressCoping || 'Unknown'}
- Novelty seeking: ${personalityQuiz.noveltySeeking !== undefined ? (personalityQuiz.noveltySeeking > 0.6 ? 'High - loves new discoveries' : personalityQuiz.noveltySeeking < 0.4 ? 'Low - prefers familiar' : 'Moderate') : 'Unknown'}
- Pre-event strategy: ${personalityQuiz.preEventStrategy || 'Unknown'}

Use this personality context to make your observations more personal and insightful. Connect platform behaviors to their personality traits.
`;
    }

    const baseInstructions = `You are someone's digital twin who has deeply observed their patterns.
You speak DIRECTLY to them in second person ("You", "Your").

CRITICAL RULES:
- NEVER use numbers, percentages, or counts ("You listened to 847 tracks" is WRONG)
- NEVER list items ("Your top artists are X, Y, Z" is WRONG)
- NEVER sound clinical or like an app notification
- DO notice emotional/behavioral patterns
- DO connect patterns to life context AND personality traits
- DO sound like a thoughtful friend who knows them well
- DO reference their personality when it explains a pattern (e.g., "As someone who uses music to shift moods...")
${lifeContextSection}${personalitySection}
Respond in JSON format with:
{
  "reflection": "Your 2-4 sentence conversational observation",
  "themes": ["theme1", "theme2"], // Abstract themes like "processing", "seeking-energy"
  "confidence": "high" | "medium" | "low",
  "evidence": [
    {
      "observation": "A specific claim from your reflection",
      "dataPoints": [
        "Specific data that supports this claim",
        "Another supporting data point"
      ],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "patterns": [
    {
      "text": "Another pattern observation (1-2 sentences)",
      "occurrences": "often" | "sometimes" | "noticed"
    }
  ]
}

IMPORTANT: The "evidence" array should show HOW you reached your conclusions. Each observation in the reflection should have supporting evidence.`;

    switch (platform) {
      case 'spotify':
        // Calculate peak listening times from listeningHours data
        const peakHours = data.listeningHours
          ?.filter(h => h.plays > 0)
          ?.sort((a, b) => b.plays - a.plays)
          ?.slice(0, 3)
          ?.map(h => {
            if (h.hour >= 5 && h.hour < 12) return 'morning';
            if (h.hour >= 12 && h.hour < 17) return 'afternoon';
            if (h.hour >= 17 && h.hour < 21) return 'evening';
            return 'late night';
          }) || [];
        const uniquePeakPeriods = [...new Set(peakHours)];
        const listeningTimePattern = uniquePeakPeriods.length > 0
          ? `Peak listening times: ${uniquePeakPeriods.join(', ')}`
          : '';

        // Genre diversity
        const genreCount = data.topGenres?.length || 0;
        const genreDiversity = genreCount > 4 ? 'very diverse musical taste' :
          genreCount > 2 ? 'focused but varied taste' : 'concentrated on specific genres';

        return `${baseInstructions}

You are observing their MUSIC patterns.

What you know about them (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Artists they gravitate toward: ${data.topArtists?.join(', ') || 'various'}
- Recent listening includes: ${data.recentTrackNames?.slice(0, 5).join(', ') || 'various tracks'}
- Their music tends toward: ${data.averageEnergy > 0.6 ? 'higher energy' : data.averageEnergy < 0.4 ? 'calmer sounds' : 'balanced energy'}
- Emotional tone: ${data.averageValence > 0.6 ? 'more upbeat' : data.averageValence < 0.4 ? 'more melancholic' : 'varied'}
${listeningTimePattern ? `- ${listeningTimePattern}` : ''}
- Genre breadth: ${genreDiversity}

Write an observation about what their music choices reveal about them. Focus on:
- When/why they might reach for certain sounds
- What their patterns say about how they process emotions
- Connections between music and their inner life
- Time-of-day listening patterns if notable

Example good reflection: "I notice you reach for melancholic indie when you're processing something - not when you're sad, but when you're thinking deeply. ${uniquePeakPeriods.includes('late night') ? 'Those late night listening sessions seem intentional.' : 'Sunday evenings especially seem to be your reflection time.'}"`;


      case 'whoop':
        // Build historical context section if available
        const historicalSection = data.historicalContext?.summary
          ? `\nHISTORICAL PATTERNS (use this to make observations more insightful):
${data.historicalContext.summary}
- Recovery consistency: ${data.historicalContext.recoveryConsistency || 'unknown'}
${data.historicalContext.bestDay ? `- Best recovery days tend to be: ${data.historicalContext.bestDay}s` : ''}
`
          : '';

        return `${baseInstructions}

You are observing their BODY's patterns through health data.

What you know about them (USE THIS TO INFORM YOUR OBSERVATION, don't state it):
- Recovery trending: ${data.recoveryTrending}
- Current recovery level: ${data.recoveryLevel}
- Sleep lately: ${data.sleepQuality}
- Physical strain: ${data.strainLevel}
- HRV trend: ${data.hrvTrend}
${historicalSection}
Write an observation about what their body is telling them. Focus on:
- The stories their physiology tells that their calendar doesn't
- Patterns between their body state and life events
- How today compares to their typical patterns
- Wisdom their body shows about what they need

Example good reflection: "Your body tells stories your calendar doesn't. Today you're running ${data.historicalContext?.recoveryVsAvg || 'at your average'} - ${data.historicalContext?.bestDay ? `and I've noticed ${data.historicalContext.bestDay}s tend to be your strongest days` : 'your patterns are still emerging'}. The rhythm of your week is starting to show itself."`;

      case 'calendar':
        // Build weekly pattern insights
        const weeklyPatternSection = data.scheduleStats ? `
WEEKLY PATTERNS:
- Busiest day: ${data.scheduleStats.busiestDay || 'varies'}
- Protected focus blocks: ${data.scheduleStats.focusBlocks > 0 ? `${data.scheduleStats.focusBlocks} scheduled` : 'none visible'}
- Meeting preference: ${data.scheduleStats.preferredMeetingTime || 'varies'}
` : '';

        return `${baseInstructions}

You are observing their relationship with TIME through calendar patterns.

What you know about them (USE THIS TO INFORM YOUR OBSERVATION, don't state it):
- Today's density: ${data.dayDensity}
- Day of week: ${data.dayOfWeek}
- Types of events: ${data.eventTypes?.join(', ') || 'various'}
- Has protected open time: ${data.hasOpenTime ? 'yes' : 'limited'}
${data.upcomingEventTitle ? `- Coming up soon: "${data.upcomingEventTitle}"` : ''}
${weeklyPatternSection}
Write an observation about how they structure their time. Focus on:
- What their calendar reveals about their values
- Patterns in how they protect (or don't protect) certain times
- The rhythm of their weeks and which days serve what purpose

Example good reflection: "The way you protect ${data.dayOfWeek === data.scheduleStats?.busiestDay ? 'today despite it being your busiest day' : `${data.scheduleStats?.busiestDay || 'certain days'}s`} tells me something - that's when you do your best thinking, isn't it? I notice you rarely let meetings creep into that space, even when your afternoons are packed."`;

      default:
        return baseInstructions;
    }
  }

  /**
   * Fallback reflection if Claude fails
   */
  getFallbackReflection(platform) {
    const fallbacks = {
      spotify: {
        text: "Your music tells a story I'm still learning to read. The patterns are there - the way certain sounds find you at certain times. Let me observe a bit more.",
        themes: ['discovery'],
        confidence: 'low',
        patterns: []
      },
      whoop: {
        text: "Your body has wisdom that takes time to understand. I'm watching the rhythms, noticing the connections between how you feel and how you move through your days.",
        themes: ['learning'],
        confidence: 'low',
        patterns: []
      },
      calendar: {
        text: "Time reveals priorities. I'm learning the rhythm of your weeks - which hours you protect, which ones you give away, and what that says about what matters to you.",
        themes: ['observation'],
        confidence: 'low',
        patterns: []
      }
    };

    return fallbacks[platform] || fallbacks.spotify;
  }

  /**
   * Store reflection in database
   */
  async storeReflection(userId, platform, reflection) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    try {
      await supabaseAdmin
        .from('reflection_history')
        .insert({
          user_id: userId,
          platform,
          reflection_text: reflection.text,
          themes: reflection.themes,
          confidence: reflection.confidence,
          reflection_type: 'observation',
          expires_at: expiresAt.toISOString(),
          data_snapshot: {
            patterns: reflection.patterns,
            evidence: reflection.evidence || [],
            contextSnapshot: reflection.contextSnapshot || null
          }
        });
    } catch (error) {
      console.error('❌ [Reflection] Failed to store reflection:', error);
    }
  }

  /**
   * Get cached reflection
   */
  async getCachedReflection(userId, platform) {
    try {
      const { data } = await supabaseAdmin
        .from('reflection_history')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .is('dismissed_at', null)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate historical context for richer AI insights
   * Compares current values to 7-day averages
   */
  calculateHistoricalContext(currentRecovery, currentHrv, currentSleepHours, history7Day) {
    if (!history7Day || history7Day.length === 0) {
      return null;
    }

    // Calculate averages from history
    const validRecoveries = history7Day.filter(d => d.recovery != null);
    const validHrvs = history7Day.filter(d => d.hrv != null);

    const avgRecovery = validRecoveries.length > 0
      ? Math.round(validRecoveries.reduce((sum, d) => sum + d.recovery, 0) / validRecoveries.length)
      : null;

    const avgHrv = validHrvs.length > 0
      ? Math.round(validHrvs.reduce((sum, d) => sum + d.hrv, 0) / validHrvs.length)
      : null;

    // Calculate how current compares to average
    const getComparison = (current, avg) => {
      if (current == null || avg == null) return null;
      const diff = current - avg;
      const percentDiff = Math.round((diff / avg) * 100);

      if (Math.abs(percentDiff) <= 5) return 'at your average';
      if (percentDiff > 20) return 'significantly above your average';
      if (percentDiff > 0) return 'above your average';
      if (percentDiff < -20) return 'significantly below your average';
      return 'below your average';
    };

    // Find best and worst days in history
    const bestRecoveryDay = validRecoveries.length > 0
      ? validRecoveries.reduce((best, d) => d.recovery > best.recovery ? d : best)
      : null;
    const worstRecoveryDay = validRecoveries.length > 0
      ? validRecoveries.reduce((worst, d) => d.recovery < worst.recovery ? d : worst)
      : null;

    // Calculate consistency (standard deviation)
    const calculateConsistency = (values) => {
      if (values.length < 3) return 'insufficient data';
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const coeffVar = (stdDev / avg) * 100;

      if (coeffVar < 10) return 'very consistent';
      if (coeffVar < 20) return 'fairly consistent';
      if (coeffVar < 35) return 'variable';
      return 'highly variable';
    };

    return {
      // Averages
      avgRecovery,
      avgHrv,
      // Comparisons
      recoveryVsAvg: getComparison(currentRecovery, avgRecovery),
      hrvVsAvg: getComparison(currentHrv, avgHrv),
      // Best/worst
      bestDay: bestRecoveryDay?.dayName || null,
      worstDay: worstRecoveryDay?.dayName || null,
      // Consistency
      recoveryConsistency: calculateConsistency(validRecoveries.map(d => d.recovery)),
      // Summary for prompt
      summary: this.buildHistoricalSummary(
        currentRecovery, avgRecovery,
        currentHrv, avgHrv,
        bestRecoveryDay, worstRecoveryDay
      )
    };
  }

  /**
   * Build a natural language summary of historical patterns
   */
  buildHistoricalSummary(currentRecovery, avgRecovery, currentHrv, avgHrv, bestDay, worstDay) {
    const parts = [];

    // Recovery comparison
    if (currentRecovery != null && avgRecovery != null) {
      const recoveryDiff = currentRecovery - avgRecovery;
      if (Math.abs(recoveryDiff) > 10) {
        parts.push(`Today's recovery (${currentRecovery}%) is ${recoveryDiff > 0 ? 'above' : 'below'} your 7-day average of ${avgRecovery}%`);
      } else {
        parts.push(`Today's recovery is close to your 7-day average of ${avgRecovery}%`);
      }
    }

    // HRV comparison
    if (currentHrv != null && avgHrv != null) {
      const hrvDiff = currentHrv - avgHrv;
      if (Math.abs(hrvDiff) > 5) {
        parts.push(`HRV is ${hrvDiff > 0 ? 'elevated' : 'lower'} compared to your average of ${avgHrv}ms`);
      }
    }

    // Best/worst pattern
    if (bestDay && worstDay && bestDay.dayName !== worstDay.dayName) {
      parts.push(`${bestDay.dayName}s tend to be your best recovery days, while ${worstDay.dayName}s are often tougher`);
    }

    return parts.length > 0 ? parts.join('. ') + '.' : null;
  }

  /**
   * Check if reflection is expired
   */
  isExpired(reflection) {
    if (!reflection.expires_at) return true;
    return new Date(reflection.expires_at) < new Date();
  }

  /**
   * Get reflection history for a platform
   */
  async getHistory(userId, platform, limit = 5) {
    try {
      const { data } = await supabaseAdmin
        .from('reflection_history')
        .select('id, reflection_text, generated_at, themes')
        .eq('user_id', userId)
        .eq('platform', platform)
        .is('dismissed_at', null)
        .order('generated_at', { ascending: false })
        .range(1, limit); // Skip the first (current) one

      return data || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Format the response
   */
  formatResponse(reflection, history, lifeContext = null, visualData = null) {
    // Handle both stored and freshly generated reflections
    const reflectionData = reflection.reflection_text
      ? {
          id: reflection.id,
          text: reflection.reflection_text,
          generatedAt: reflection.generated_at,
          expiresAt: reflection.expires_at,
          confidence: reflection.confidence,
          themes: reflection.themes || []
        }
      : {
          id: null,
          text: reflection.text,
          generatedAt: new Date().toISOString(),
          expiresAt: null,
          confidence: reflection.confidence,
          themes: reflection.themes || []
        };

    const patterns = reflection.data_snapshot?.patterns || reflection.patterns || [];
    const evidence = reflection.data_snapshot?.evidence || reflection.evidence || [];
    const contextSnapshot = reflection.data_snapshot?.contextSnapshot || reflection.contextSnapshot || null;

    // Build cross-platform context info for the frontend
    const crossPlatformContext = {
      lifeContext: lifeContext ? {
        currentStatus: lifeContext.currentStatus,
        isOnVacation: lifeContext.isOnVacation,
        promptSummary: lifeContext.promptSummary,
        activeEvents: lifeContext.activeEvents || []
      } : contextSnapshot?.lifeContext || null
    };

    // Extract visual data from contextSnapshot if available
    const rawData = contextSnapshot?.rawDataUsed || visualData || {};

    return {
      success: true,
      reflection: reflectionData,
      evidence: evidence.map((e, i) => ({
        id: `evidence-${i}`,
        observation: e.observation || e.claim,
        dataPoints: e.dataPoints || [],
        confidence: e.confidence || 'medium'
      })),
      patterns: patterns.map((p, i) => ({
        id: `pattern-${i}`,
        text: typeof p === 'string' ? p : p.text,
        occurrences: typeof p === 'object' ? p.occurrences : 'noticed'
      })),
      crossPlatformContext,
      history: history.map(h => ({
        id: h.id,
        text: h.reflection_text,
        generatedAt: h.generated_at
      })),
      // NEW: Visual data for engaging display (no more textbook style)
      // Use structured data if available, otherwise parse from track names
      recentTracks: rawData.recentTracksStructured?.slice(0, 5)?.map(t => ({
        name: t.name,
        artist: t.artist,
        playedAt: t.playedAt
      })) || rawData.recentTrackNames?.slice(0, 5)?.map(name => {
        const parts = name.split(' by ');
        return {
          name: parts[0] || name,
          artist: parts[1] || 'Unknown Artist'
        };
      }) || [],
      topArtists: rawData.topArtists?.slice(0, 6) || [],
      currentMood: rawData.listeningContext ? {
        label: rawData.listeningContext,
        energy: rawData.averageEnergy || 0.5,
        valence: rawData.averageValence || 0.5
      } : null,
      // Spotify: Chart visualization data
      topArtistsWithPlays: rawData.topArtistsWithPlays || [],
      topGenres: rawData.topGenres || [],
      listeningHours: rawData.listeningHours || [],
      // Whoop: Metrics and visualization data
      currentMetrics: rawData.currentMetrics || null,
      sleepBreakdown: rawData.sleepBreakdown || null,
      recentTrends: rawData.recentTrends || [],
      history7Day: rawData.history7Day || [],
      // Calendar: Schedule visualization data
      todayEvents: rawData.todayEvents || [],
      upcomingEvents: rawData.upcomingEvents || [],
      eventTypeDistribution: rawData.eventTypeDistribution || [],
      weeklyHeatmap: rawData.weeklyHeatmap || [],
      scheduleStats: rawData.scheduleStats || null
    };
  }
}

const platformReflectionService = new PlatformReflectionService();
export default platformReflectionService;
