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

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from '../config/supabase.js';
import userContextAggregator from './userContextAggregator.js';
const CACHE_TTL_HOURS = 6;

// Static base instructions for all platform reflections (cached via Anthropic prompt caching)
// This constant covers all 6 platforms so the same cached block is reused across calls
const REFLECTION_BASE_SYSTEM = `You are someone's digital twin who has deeply observed their patterns.
You speak DIRECTLY to them in second person ("You", "Your").

CRITICAL RULES:
- NEVER use numbers, percentages, or counts ("You listened to 847 tracks" is WRONG)
- NEVER list items ("Your top artists are X, Y, Z" is WRONG)
- NEVER sound clinical or like an app notification
- DO notice emotional/behavioral patterns
- DO connect patterns to life context AND personality traits
- DO sound like a thoughtful friend who knows them well
- DO reference their personality when it explains a pattern (e.g., "As someone who uses music to shift moods...")

Respond ONLY in valid JSON with this exact schema:
{
  "reflection": "Your 2-4 sentence conversational observation",
  "themes": ["theme1", "theme2"],
  "confidence": "high" | "medium" | "low",
  "evidence": [
    {
      "observation": "A specific claim from your reflection",
      "dataPoints": ["Specific data that supports this claim", "Another supporting data point"],
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

The "evidence" array should show HOW you reached your conclusions. Each observation in the reflection should have supporting evidence.

PLATFORM-SPECIFIC OBSERVATION GUIDELINES:

SPOTIFY (Music):
- Focus on when/why they reach for certain sounds, what patterns say about emotional processing
- Connect music choices to time-of-day patterns, energy levels, and inner life
- Notice genre diversity, energy preferences, and mood-matching behavior
- Good example: "I notice you reach for melancholic indie when you're processing something - not when you're sad, but when you're thinking deeply."

WHOOP (Body/Health):
- Focus on stories their physiology tells that their calendar doesn't
- Connect body state to life events, compare today to typical patterns
- Notice recovery consistency, sleep quality trends, and strain-recovery balance
- Good example: "Your body tells stories your calendar doesn't. Today you're running above average - and I've noticed Tuesdays tend to be your strongest days."

CALENDAR (Time):
- Focus on what their schedule reveals about their values and priorities
- Notice how they protect (or don't protect) certain times, weekly rhythms
- Connect meeting density to focus blocks and personal time
- Good example: "The way you protect your mornings tells me something - that's when you do your best thinking, isn't it?"

YOUTUBE (Content):
- Focus on what subscriptions and viewing reveal about curiosities and passions
- Notice learning vs entertainment balance, depth vs breadth of interests
- Connect content choices to personality and how they explore the world
- Good example: "Your YouTube tells me you're a learner disguised as a browser. You subscribe to channels that teach you things you'll probably never be tested on."

TWITCH (Gaming/Streaming):
- Focus on what game/content preferences say about personality
- Notice competitive vs cooperative vs narrative preferences, community engagement
- Connect streaming habits to how they unwind and connect with others
- Good example: "Your Twitch follows paint a picture of someone who values community as much as competition."

WEB BROWSING (Digital Life):
- Focus on deepest curiosities revealed by searches and reading patterns
- Notice balance between learning, entertainment, and productivity
- Connect browsing patterns to personality traits they might not be aware of
- Good example: "Your browsing tells me something you might not realize - you're a quiet explorer. There's a thread connecting the articles you linger on."

Always write observations that feel personal, insightful, and grounded in the actual data provided. Never fabricate data points.`;

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
      case 'youtube':
        return this.getYouTubeData(userId);
      case 'twitch':
        return this.getTwitchData(userId);
      case 'web':
        return this.getWebBrowsingData(userId);
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
    const sleepBreakdown = sleepStages ? (() => {
      const deep = msToHours(sleepStages.deep);
      const rem = msToHours(sleepStages.rem);
      const light = msToHours(sleepStages.light);
      const awake = msToHours(sleepStages.awake);
      const stagesTotal = Math.round((deep + rem + light) * 10) / 10;
      return {
        deepSleep: deep,
        remSleep: rem,
        lightSleep: light,
        awakeDuring: awake,
        totalHours: stagesTotal > 0 ? stagesTotal : Math.round(sleepHours * 10) / 10,
        efficiency: sleepEfficiency || 0
      };
    })() : null;

    // Current metrics for visualization
    const currentMetrics = {
      recovery: recoveryScore,
      strain: Math.round(strainScore * 10) / 10,
      sleepPerformance: sleepPerformance,
      hrv: hrvCurrent,
      restingHR: rhrCurrent,
      sleepHours: Math.round(sleepHours * 10) / 10,
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
   * Get YouTube data for reflection
   * Reads from user_platform_data (stored by Nango extraction)
   */
  async getYouTubeData(userId) {
    try {
      const { data: youtubeData } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .order('extracted_at', { ascending: false });

      if (!youtubeData || youtubeData.length === 0) {
        return { success: false, error: 'YouTube not connected or no data' };
      }

      // Extract subscriptions
      const subsRow = youtubeData.find(d => d.data_type === 'subscriptions');
      const subscriptions = subsRow?.raw_data?.items || [];
      const topChannels = subscriptions
        .slice(0, 15)
        .map(s => ({
          name: s.snippet?.title,
          description: s.snippet?.description?.substring(0, 80)
        }))
        .filter(c => c.name);

      // Extract liked videos
      const likedRow = youtubeData.find(d => d.data_type === 'likedVideos');
      const likedVideos = likedRow?.raw_data?.items || [];
      const recentLiked = likedVideos.slice(0, 10).map(v => ({
        title: v.snippet?.title,
        channel: v.snippet?.channelTitle,
        publishedAt: v.snippet?.publishedAt
      }));

      // Extension-sourced: recent watch history
      const extensionWatches = youtubeData
        .filter(d => d.data_type === 'extension_video_watch' && d.raw_data?.action === 'end')
        .slice(0, 20)
        .map(d => ({
          title: d.raw_data.title,
          videoId: d.raw_data.videoId,
          watchDuration: d.raw_data.watchDurationSeconds,
          watchPercentage: d.raw_data.watchPercentage,
          completed: d.raw_data.completed,
          timestamp: d.raw_data.timestamp
        }));

      // Extension-sourced: search queries
      const extensionSearches = youtubeData
        .filter(d => d.data_type === 'extension_search')
        .slice(0, 10)
        .map(d => d.raw_data.query)
        .filter(Boolean);

      // Derive content categories
      const categories = {};
      likedVideos.forEach(v => {
        const title = (v.snippet?.title || '').toLowerCase();
        const desc = (v.snippet?.description || '').toLowerCase();
        const combined = title + ' ' + desc;
        if (/tutorial|learn|course|how to|explained/i.test(combined)) categories['Education'] = (categories['Education'] || 0) + 1;
        if (/game|gaming|play|stream/i.test(combined)) categories['Gaming'] = (categories['Gaming'] || 0) + 1;
        if (/music|song|album|concert|lyrics/i.test(combined)) categories['Music'] = (categories['Music'] || 0) + 1;
        if (/tech|code|programming|dev|software/i.test(combined)) categories['Technology'] = (categories['Technology'] || 0) + 1;
        if (/fitness|workout|health|exercise/i.test(combined)) categories['Fitness'] = (categories['Fitness'] || 0) + 1;
        if (/cook|recipe|food/i.test(combined)) categories['Food'] = (categories['Food'] || 0) + 1;
        if (/vlog|daily|life|travel/i.test(combined)) categories['Lifestyle'] = (categories['Lifestyle'] || 0) + 1;
        if (/science|research|space|nature/i.test(combined)) categories['Science'] = (categories['Science'] || 0) + 1;
        if (/news|politics|economy/i.test(combined)) categories['News'] = (categories['News'] || 0) + 1;
      });

      const totalCategorized = Object.values(categories).reduce((sum, c) => sum + c, 0) || 1;
      const contentCategories = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([category, count]) => ({
          category,
          percentage: Math.round((count / totalCategorized) * 100)
        }));

      // Calculate learning vs entertainment ratio
      const learningCategories = (categories['Education'] || 0) + (categories['Technology'] || 0) + (categories['Science'] || 0);
      const entertainmentCategories = (categories['Gaming'] || 0) + (categories['Music'] || 0) + (categories['Lifestyle'] || 0);
      const total = learningCategories + entertainmentCategories || 1;
      const learningRatio = Math.round((learningCategories / total) * 100);

      console.log(`📺 [Reflection] Found ${subscriptions.length} subs, ${likedVideos.length} liked, ${extensionWatches.length} extension watches for user ${userId}`);

      return {
        success: subscriptions.length > 0 || likedVideos.length > 0 || extensionWatches.length > 0,
        data: {
          topChannels,
          topChannelNames: topChannels.map(c => c.name),
          recentLiked,
          subscriptionCount: subscriptions.length,
          likedVideoCount: likedVideos.length,
          contentCategories,
          learningRatio,
          entertainmentRatio: 100 - learningRatio,
          // Extension data
          recentWatchHistory: extensionWatches,
          searchQueries: extensionSearches,
          hasExtensionData: extensionWatches.length > 0 || extensionSearches.length > 0
        }
      };
    } catch (error) {
      console.error('❌ [Reflection] YouTube data error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Twitch data for reflection
   * Reads from user_platform_data (stored by Nango extraction)
   */
  async getTwitchData(userId) {
    try {
      const { data: twitchData } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'twitch')
        .order('extracted_at', { ascending: false });

      if (!twitchData || twitchData.length === 0) {
        return { success: false, error: 'Twitch not connected or no data' };
      }

      // Extract followed channels
      const followedRow = twitchData.find(d => d.data_type === 'followedChannels');
      const followedChannels = followedRow?.raw_data?.data || [];
      const topChannels = followedChannels.slice(0, 15).map(c => ({
        name: c.broadcaster_name || c.broadcaster_login,
        gameName: c.game_name || null
      }));

      // Extract user info
      const userRow = twitchData.find(d => d.data_type === 'user');
      const twitchUser = userRow?.raw_data?.data?.[0] || {};

      // Derive gaming preferences from followed channels
      const gamePreferences = {};
      followedChannels.forEach(c => {
        if (c.game_name) {
          gamePreferences[c.game_name] = (gamePreferences[c.game_name] || 0) + 1;
        }
      });

      const totalGames = Object.values(gamePreferences).reduce((sum, c) => sum + c, 0) || 1;
      const gamingCategories = Object.entries(gamePreferences)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([game, count]) => ({
          game,
          percentage: Math.round((count / totalGames) * 100)
        }));

      // Extension-sourced: stream watches
      const extensionStreamWatches = twitchData
        .filter(d => d.data_type === 'extension_stream_watch' && d.raw_data?.action === 'end')
        .slice(0, 20)
        .map(d => ({
          channelName: d.raw_data.channelName,
          gameName: d.raw_data.gameName,
          watchDuration: d.raw_data.watchDurationSeconds,
          timestamp: d.raw_data.timestamp
        }));

      // Extension-sourced: browse categories
      const extensionBrowses = twitchData
        .filter(d => d.data_type === 'extension_browse')
        .slice(0, 10)
        .map(d => d.raw_data.category)
        .filter(Boolean);

      // Merge extension game data into gamingCategories
      const extensionGameCounts = {};
      extensionStreamWatches.forEach(w => {
        if (w.gameName) extensionGameCounts[w.gameName] = (extensionGameCounts[w.gameName] || 0) + 1;
      });
      Object.entries(extensionGameCounts).forEach(([game, count]) => {
        const existing = gamingCategories.find(c => c.game === game);
        if (existing) {
          existing.percentage += Math.round((count / (totalGames + Object.values(extensionGameCounts).reduce((a, b) => a + b, 0))) * 100);
        } else {
          gamingCategories.push({ game, percentage: Math.round((count / Math.max(totalGames, 1)) * 100) });
        }
      });
      // Re-sort and re-normalize
      gamingCategories.sort((a, b) => b.percentage - a.percentage);

      console.log(`🎮 [Reflection] Found ${followedChannels.length} followed, ${extensionStreamWatches.length} extension watches for user ${userId}`);

      return {
        success: followedChannels.length > 0 || extensionStreamWatches.length > 0,
        data: {
          topChannels,
          topChannelNames: topChannels.map(c => c.name),
          followedChannelCount: followedChannels.length,
          gamingCategories,
          displayName: twitchUser.display_name || null,
          broadcasterType: twitchUser.broadcaster_type || null,
          accountCreated: twitchUser.created_at || null,
          // Extension data
          recentStreamWatches: extensionStreamWatches,
          browseCategories: extensionBrowses,
          hasExtensionData: extensionStreamWatches.length > 0 || extensionBrowses.length > 0
        }
      };
    } catch (error) {
      console.error('❌ [Reflection] Twitch data error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Web Browsing data for reflection
   * Reads from user_platform_data (stored by browser extension universal collector)
   */
  async getWebBrowsingData(userId) {
    try {
      const { data: webData } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'web')
        .order('extracted_at', { ascending: false })
        .limit(300);

      if (!webData || webData.length === 0) {
        return { success: false, error: 'No web browsing data captured yet' };
      }

      // Page visits
      const pageVisits = webData.filter(d =>
        ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(d.data_type)
      );

      // Search queries
      const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');
      const recentSearches = searchEvents
        .slice(0, 15)
        .map(d => d.raw_data?.searchQuery)
        .filter(Boolean);

      // Top categories
      const categoryCounts = {};
      pageVisits.forEach(d => {
        const cat = d.raw_data?.category || 'Other';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      const totalVisits = pageVisits.length || 1;
      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([category, count]) => ({
          category,
          count,
          percentage: Math.round((count / totalVisits) * 100)
        }));

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

      // Top topics
      const topicCounts = {};
      pageVisits.forEach(d => {
        (d.raw_data?.metadata?.topics || []).forEach(t => {
          topicCounts[t] = (topicCounts[t] || 0) + 1;
        });
      });
      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([topic]) => topic);

      // Reading profile
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
      const dominantBehavior = Object.entries(readingBehaviors)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

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

      // Recent activity (for display)
      const recentActivity = pageVisits.slice(0, 10).map(d => ({
        title: d.raw_data?.title,
        domain: d.raw_data?.domain,
        category: d.raw_data?.category,
        timeOnPage: d.raw_data?.engagement?.timeOnPage,
        timestamp: d.raw_data?.timestamp
      }));

      console.log(`[Reflection] Found ${pageVisits.length} page visits, ${searchEvents.length} searches for user ${userId}`);

      return {
        success: pageVisits.length > 0,
        data: {
          totalPageVisits: pageVisits.length,
          totalSearches: searchEvents.length,
          topCategories,
          topDomains,
          topTopics,
          recentSearches,
          readingProfile: {
            avgEngagement,
            avgTimeOnPage,
            dominantBehavior,
            readingBehaviors,
            contentTypeDistribution: contentTypeCounts
          },
          recentActivity,
          hasExtensionData: true
        }
      };
    } catch (error) {
      console.error('[Reflection] Web browsing data error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a reflection using Claude
   */
  async generateReflection(platform, data, lifeContext = null, personalityQuiz = null, rawPlatformData = null) {
    const prompt = this.getPromptForPlatform(platform, data, lifeContext, personalityQuiz);

    try {
      const result = await complete({
        tier: TIER_ANALYSIS,
        system: REFLECTION_BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: prompt
        }],
        maxTokens: 1024,
        serviceName: 'platformReflection'
      });

      let responseText = result.content.trim();

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '');
      }

      const parsed = JSON.parse(responseText);

      return {
        text: parsed.reflection,
        themes: parsed.themes || [],
        confidence: parsed.confidence || 'medium',
        evidence: parsed.evidence || [],
        patterns: parsed.patterns || [],
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
      // Try template-based reflection using actual data before falling back to generic text
      const templateReflection = this.generateTemplateReflection(platform, rawPlatformData);
      if (templateReflection) {
        console.log(`[Reflection] Using template-based reflection for ${platform}`);
        return templateReflection;
      }
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

    // Dynamic context sections (life context + personality) - appended to user message
    const dynamicContext = `${lifeContextSection}${personalitySection}`.trim();

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

        return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: SPOTIFY (Music)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Artists they gravitate toward: ${data.topArtists?.join(', ') || 'various'}
- Recent listening includes: ${data.recentTrackNames?.slice(0, 5).join(', ') || 'various tracks'}
- Their music tends toward: ${data.averageEnergy > 0.6 ? 'higher energy' : data.averageEnergy < 0.4 ? 'calmer sounds' : 'balanced energy'}
- Emotional tone: ${data.averageValence > 0.6 ? 'more upbeat' : data.averageValence < 0.4 ? 'more melancholic' : 'varied'}
${listeningTimePattern ? `- ${listeningTimePattern}` : ''}
- Genre breadth: ${genreDiversity}

Write an observation about what their music choices reveal about them.`;

      case 'whoop':
        // Build historical context section if available
        const historicalSection = data.historicalContext?.summary
          ? `\nHISTORICAL PATTERNS (use this to make observations more insightful):
${data.historicalContext.summary}
- Recovery consistency: ${data.historicalContext.recoveryConsistency || 'unknown'}
${data.historicalContext.bestDay ? `- Best recovery days tend to be: ${data.historicalContext.bestDay}s` : ''}
`
          : '';

        return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: WHOOP (Body/Health)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't state it):
- Recovery trending: ${data.recoveryTrending}
- Current recovery level: ${data.recoveryLevel}
- Sleep lately: ${data.sleepQuality}
- Physical strain: ${data.strainLevel}
- HRV trend: ${data.hrvTrend}
${historicalSection}
Write an observation about what their body is telling them.`;

      case 'calendar':
        // Build weekly pattern insights
        const weeklyPatternSection = data.scheduleStats ? `
WEEKLY PATTERNS:
- Busiest day: ${data.scheduleStats.busiestDay || 'varies'}
- Protected focus blocks: ${data.scheduleStats.focusBlocks > 0 ? `${data.scheduleStats.focusBlocks} scheduled` : 'none visible'}
- Meeting preference: ${data.scheduleStats.preferredMeetingTime || 'varies'}
` : '';

        return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: CALENDAR (Time)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Today's density: ${data.dayDensity}
- Day of week: ${data.dayOfWeek}
- Types of events: ${data.eventTypes?.join(', ') || 'various'}
- Has protected open time: ${data.hasOpenTime ? 'yes' : 'limited'}
${data.upcomingEventTitle ? `- Coming up soon: "${data.upcomingEventTitle}"` : ''}
${weeklyPatternSection}
Write an observation about how they structure their time.`;

      case 'youtube':
        // Build extension data section
        const ytExtensionSection = data.hasExtensionData ? `
WATCH BEHAVIOR (from browser extension - actual viewing, not just likes):
- Recent watches: ${data.recentWatchHistory?.slice(0, 5).map(w => w.title).filter(Boolean).join(', ') || 'various'}
- Average watch completion: ${data.recentWatchHistory?.length > 0 ? Math.round(data.recentWatchHistory.filter(w => w.watchPercentage).reduce((a, w) => a + w.watchPercentage, 0) / data.recentWatchHistory.length) + '%' : 'unknown'}
- Recent searches: ${data.searchQueries?.slice(0, 5).join(', ') || 'none captured'}
` : '';

        return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: YOUTUBE (Content)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Channels they subscribe to: ${data.topChannelNames?.slice(0, 8).join(', ') || 'various'}
- Recently liked videos include: ${data.recentLiked?.slice(0, 5).map(v => v.title).join(', ') || 'various content'}
- Content categories: ${data.contentCategories?.map(c => c.category).join(', ') || 'diverse'}
- Learning vs Entertainment ratio: ${data.learningRatio || 50}% learning / ${data.entertainmentRatio || 50}% entertainment
${ytExtensionSection}
Write an observation about what their content choices reveal about them.`;

      case 'twitch':
        // Build extension data section for Twitch
        const twitchExtensionSection = data.hasExtensionData ? `
VIEWING BEHAVIOR (from browser extension - actual stream watching):
- Recent streams watched: ${data.recentStreamWatches?.slice(0, 5).map(w => `${w.channelName}${w.gameName ? ` (${w.gameName})` : ''}`).join(', ') || 'various'}
- Categories browsed: ${data.browseCategories?.slice(0, 5).join(', ') || 'none captured'}
` : '';

        return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: TWITCH (Gaming/Streaming)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Channels they follow: ${data.topChannelNames?.slice(0, 8).join(', ') || 'various'}
- Game preferences: ${data.gamingCategories?.map(g => g.game).join(', ') || 'diverse'}
- Number of followed channels: ${data.followedChannelCount || 0}
${data.broadcasterType ? `- They are a ${data.broadcasterType} broadcaster themselves` : '- Primarily a viewer/follower'}
${twitchExtensionSection}
Write an observation about what their streaming habits reveal about them.`;

      case 'web':
        return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: WEB BROWSING (Digital Life)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Top interest categories: ${data.topCategories?.map(c => c.category).join(', ') || 'diverse'}
- Most visited domains: ${data.topDomains?.slice(0, 8).map(d => d.domain).join(', ') || 'various'}
- Topics that keep appearing: ${data.topTopics?.slice(0, 10).join(', ') || 'varied interests'}
- Recent searches: ${data.recentSearches?.slice(0, 8).join(', ') || 'none captured yet'}
- Reading style: ${data.readingProfile?.dominantBehavior || 'varied'} reader
- Average time per page: ${data.readingProfile?.avgTimeOnPage ? data.readingProfile.avgTimeOnPage + ' seconds' : 'varies'}
- Content they engage with most: ${Object.entries(data.readingProfile?.contentTypeDistribution || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') || 'mixed'}

Write an observation about what their browsing patterns reveal about their soul.`;

      default:
        return `${dynamicContext ? dynamicContext + '\n\n' : ''}Generate a reflection about this person's digital patterns.`;
    }
  }

  /**
   * Generate a template-based reflection from actual platform data.
   * Used as a fallback when the AI API is unavailable.
   * Returns null if insufficient data to generate a meaningful observation.
   */
  generateTemplateReflection(platform, data) {
    if (!data) return null;

    try {
      switch (platform) {
        case 'spotify':
          return this.generateSpotifyTemplate(data);
        case 'whoop':
          return this.generateWhoopTemplate(data);
        case 'calendar':
          return this.generateCalendarTemplate(data);
        case 'youtube':
          return this.generateYouTubeTemplate(data);
        case 'twitch':
          return this.generateTwitchTemplate(data);
        case 'web':
          return this.generateWebTemplate(data);
        default:
          return null;
      }
    } catch (error) {
      console.error(`[Reflection] Template generation failed for ${platform}:`, error);
      return null;
    }
  }

  generateSpotifyTemplate(data) {
    const sentences = [];

    // Top artist observation
    const topArtist = data.topArtistsWithPlays?.[0];
    if (topArtist) {
      const totalPlays = data.topArtistsWithPlays.reduce((sum, a) => sum + a.plays, 0);
      const percent = totalPlays > 0 ? Math.round((topArtist.plays / totalPlays) * 100) : 0;
      if (percent > 30) {
        sentences.push(`${topArtist.name} dominates your listening with ${percent}% of your plays - they clearly resonate with something in you.`);
      } else {
        sentences.push(`${topArtist.name} leads your rotation, but you spread your attention across many artists.`);
      }
    }

    // Peak listening time
    const activeHours = data.listeningHours?.filter(h => h.plays > 0)?.sort((a, b) => b.plays - a.plays);
    if (activeHours?.length > 0) {
      const peakHour = activeHours[0].hour;
      const period = peakHour >= 5 && peakHour < 12 ? 'morning' :
                     peakHour >= 12 && peakHour < 17 ? 'afternoon' :
                     peakHour >= 17 && peakHour < 21 ? 'evening' : 'late night';
      sentences.push(`Your peak listening is in the ${period} - that's when music matters most to you.`);
    }

    // Genre diversity
    const genreCount = data.topGenres?.length || 0;
    const topGenre = data.topGenres?.[0]?.genre;
    if (genreCount > 0 && topGenre) {
      if (genreCount >= 4) {
        sentences.push(`You have a diverse taste spanning ${genreCount} genres, with ${topGenre} leading the way.`);
      } else {
        sentences.push(`Your taste centers around ${topGenre}, showing you know what sounds you're drawn to.`);
      }
    }

    if (sentences.length === 0) return null;

    return {
      text: sentences.slice(0, 3).join(' '),
      themes: ['listening patterns', 'musical identity'],
      confidence: 'medium',
      source: 'template',
      evidence: [],
      patterns: []
    };
  }

  generateWhoopTemplate(data) {
    const sentences = [];
    const metrics = data.currentMetrics;

    // Recovery observation
    if (metrics?.recovery != null) {
      const score = metrics.recovery;
      if (score >= 67) {
        sentences.push(`Your recovery score is ${score}% - your body is in a strong place today, ready for whatever you throw at it.`);
      } else if (score >= 34) {
        sentences.push(`Your recovery is at ${score}%, sitting in a moderate zone. Your body is asking you to be intentional about how you spend your energy today.`);
      } else {
        sentences.push(`Your recovery is at ${score}%, which is on the lower side. Today might be about rest and letting your body catch up.`);
      }
    }

    // Sleep observation
    const sleepBreakdown = data.sleepBreakdown;
    if (sleepBreakdown?.totalHours) {
      const hours = sleepBreakdown.totalHours;
      if (hours >= 8) {
        sentences.push(`You logged ${hours} hours of sleep last night - that's a solid foundation for today.`);
      } else if (hours >= 6) {
        sentences.push(`You got ${hours} hours of sleep, which is decent but your body would thank you for more.`);
      } else {
        sentences.push(`Only ${hours} hours of sleep last night - that's going to show up in how you feel today.`);
      }
    }

    // HRV / strain observation
    if (metrics?.hrv != null && metrics?.strain != null) {
      const strain = metrics.strain;
      if (strain > 15) {
        sentences.push(`Your strain has been high at ${strain}, so recovery will be key in the coming hours.`);
      } else if (strain < 8) {
        sentences.push(`Your strain is light at ${strain} - there's room to push yourself if you want to.`);
      }
    } else if (metrics?.stressLevel) {
      sentences.push(`Your estimated stress level is ${metrics.stressLevel.toLowerCase()} based on your vitals.`);
    }

    if (sentences.length === 0) return null;

    return {
      text: sentences.slice(0, 3).join(' '),
      themes: ['body awareness', 'recovery'],
      confidence: 'medium',
      source: 'template',
      evidence: [],
      patterns: []
    };
  }

  generateCalendarTemplate(data) {
    const sentences = [];

    // Day density
    const todayCount = data.todayEvents?.length || 0;
    const dayOfWeek = data.dayOfWeek || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    if (todayCount > 5) {
      sentences.push(`You have ${todayCount} events today - this ${dayOfWeek} is packed, and protecting any breathing room will matter.`);
    } else if (todayCount > 0) {
      sentences.push(`With ${todayCount} event${todayCount > 1 ? 's' : ''} today, this ${dayOfWeek} has a manageable rhythm to it.`);
    } else {
      sentences.push(`Your ${dayOfWeek} is wide open - a rare chance to focus on what matters most to you.`);
    }

    // Busiest day insight
    const stats = data.scheduleStats;
    if (stats?.busiestDay) {
      sentences.push(`${stats.busiestDay} tends to be your busiest day of the week, so plan your energy accordingly.`);
    }

    // Focus blocks
    if (stats?.focusBlocks > 0) {
      sentences.push(`You have ${stats.focusBlocks} focus block${stats.focusBlocks > 1 ? 's' : ''} scheduled - that tells me you value deep work.`);
    } else if (todayCount > 3) {
      sentences.push(`No dedicated focus blocks visible in your schedule - finding even 30 minutes of uninterrupted time could make a difference.`);
    }

    if (sentences.length === 0) return null;

    return {
      text: sentences.slice(0, 3).join(' '),
      themes: ['time management', 'priorities'],
      confidence: 'medium',
      source: 'template',
      evidence: [],
      patterns: []
    };
  }

  generateYouTubeTemplate(data) {
    const sentences = [];

    // Subscription overview
    if (data.subscriptionCount > 0) {
      const topChannels = data.topChannelNames?.slice(0, 3)?.join(', ');
      if (topChannels) {
        sentences.push(`With ${data.subscriptionCount} subscriptions including ${topChannels}, your YouTube paints a picture of your curiosities.`);
      }
    }

    // Learning vs entertainment
    if (data.learningRatio != null) {
      if (data.learningRatio > 60) {
        sentences.push(`About ${data.learningRatio}% of your content leans educational - you use YouTube as a learning tool more than most.`);
      } else if (data.learningRatio < 40) {
        sentences.push(`Your content skews toward entertainment at ${data.entertainmentRatio}%, and there's nothing wrong with that - it's how you recharge.`);
      } else {
        sentences.push(`You balance learning and entertainment almost evenly, mixing growth with relaxation.`);
      }
    }

    // Top category
    const topCat = data.contentCategories?.[0];
    if (topCat) {
      sentences.push(`${topCat.category} content leads your interests at ${topCat.percentage}% of what you engage with.`);
    }

    if (sentences.length === 0) return null;

    return {
      text: sentences.slice(0, 3).join(' '),
      themes: ['curiosity', 'content preferences'],
      confidence: 'medium',
      source: 'template',
      evidence: [],
      patterns: []
    };
  }

  generateTwitchTemplate(data) {
    const sentences = [];

    // Following overview
    if (data.followedChannelCount > 0) {
      sentences.push(`You follow ${data.followedChannelCount} channels on Twitch, building a community around your interests.`);
    }

    // Game preferences
    const topGame = data.gamingCategories?.[0];
    if (topGame) {
      const gameCount = data.gamingCategories.length;
      if (gameCount > 3) {
        sentences.push(`Your interests span ${gameCount} different games, with ${topGame.game} at the top - you like variety in your streams.`);
      } else {
        sentences.push(`${topGame.game} dominates your Twitch world, showing a deep commitment to that community.`);
      }
    }

    // Broadcaster type
    if (data.broadcasterType) {
      sentences.push(`As a ${data.broadcasterType} yourself, you're not just a viewer - you're part of the creator community.`);
    }

    if (sentences.length === 0) return null;

    return {
      text: sentences.slice(0, 3).join(' '),
      themes: ['gaming', 'community'],
      confidence: 'medium',
      source: 'template',
      evidence: [],
      patterns: []
    };
  }

  generateWebTemplate(data) {
    const sentences = [];

    // Top categories
    const topCat = data.topCategories?.[0];
    if (topCat) {
      sentences.push(`${topCat.category} makes up ${topCat.percentage}% of your browsing - it's clearly where your mind wanders most.`);
    }

    // Reading behavior
    if (data.readingProfile?.dominantBehavior) {
      const behavior = data.readingProfile.dominantBehavior;
      const avgTime = data.readingProfile.avgTimeOnPage;
      if (avgTime && avgTime > 60) {
        sentences.push(`You're a ${behavior} reader, spending an average of ${Math.round(avgTime / 60)} minutes per page - you dive deep into what catches your attention.`);
      } else {
        sentences.push(`Your browsing style is that of a ${behavior} reader, scanning broadly across topics.`);
      }
    }

    // Total activity
    if (data.totalPageVisits > 0) {
      const topDomain = data.topDomains?.[0]?.domain;
      if (topDomain) {
        sentences.push(`Across ${data.totalPageVisits} page visits, ${topDomain} is your most frequented destination.`);
      }
    }

    if (sentences.length === 0) return null;

    return {
      text: sentences.slice(0, 3).join(' '),
      themes: ['digital life', 'curiosity patterns'],
      confidence: 'medium',
      source: 'template',
      evidence: [],
      patterns: []
    };
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
      },
      youtube: {
        text: "Your content world is a map of your curiosities. I'm starting to see the threads that connect what you watch - the patterns that reveal what truly fascinates you.",
        themes: ['curiosity'],
        confidence: 'low',
        patterns: []
      },
      twitch: {
        text: "Your streaming world tells me how you unwind and connect. The channels you follow and the games you're drawn to reveal something about how you recharge.",
        themes: ['community'],
        confidence: 'low',
        patterns: []
      },
      web: {
        text: "Your digital footprint is starting to take shape. Every page you visit, every search you run, adds another thread to the story of who you are online. I'm beginning to see patterns in your curiosity.",
        themes: ['discovery'],
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
          themes: reflection.themes || [],
          source: reflection.source || 'ai'
        }
      : {
          id: null,
          text: reflection.text,
          generatedAt: new Date().toISOString(),
          expiresAt: null,
          confidence: reflection.confidence,
          themes: reflection.themes || [],
          source: reflection.source || 'ai'
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

    // Prefer fresh visualData over cached snapshot for up-to-date metrics
    const rawData = visualData || contextSnapshot?.rawDataUsed || {};

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
      scheduleStats: rawData.scheduleStats || null,
      // YouTube: Content visualization data
      youtubeChannels: rawData.topChannels || [],
      youtubeChannelNames: rawData.topChannelNames || [],
      youtubeRecentLiked: rawData.recentLiked || [],
      youtubeContentCategories: rawData.contentCategories || [],
      youtubeSubscriptionCount: rawData.subscriptionCount || 0,
      youtubeLikedVideoCount: rawData.likedVideoCount || 0,
      youtubeLearningRatio: rawData.learningRatio ?? null,
      // Twitch: Gaming visualization data
      twitchChannels: rawData.topChannels || [],
      twitchChannelNames: rawData.topChannelNames || [],
      twitchFollowedCount: rawData.followedChannelCount || 0,
      twitchGamingCategories: rawData.gamingCategories || [],
      twitchDisplayName: rawData.displayName || null,
      // Extension data for deeper insights
      youtubeWatchHistory: rawData.recentWatchHistory || [],
      youtubeSearchQueries: rawData.searchQueries || [],
      twitchStreamWatches: rawData.recentStreamWatches || [],
      twitchBrowseCategories: rawData.browseCategories || [],
      hasExtensionData: rawData.hasExtensionData || false,
      // Web browsing data
      webTopCategories: rawData.topCategories || [],
      webTopDomains: rawData.topDomains || [],
      webTopTopics: rawData.topTopics || [],
      webRecentSearches: rawData.recentSearches || [],
      webReadingProfile: rawData.readingProfile || null,
      webRecentActivity: rawData.recentActivity || [],
      webTotalPageVisits: rawData.totalPageVisits || 0,
      webTotalSearches: rawData.totalSearches || 0
    };
  }
}

const platformReflectionService = new PlatformReflectionService();
export default platformReflectionService;
