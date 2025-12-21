/**
 * Presentation Ritual API Routes
 * MVP Feature: Detect and predict music rituals before important events
 */

import express from 'express';
import presentationRitualExtractor from '../services/extractors/presentationRitualExtractor.js';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { decryptToken } from '../services/encryption.js';
import intelligentTwinEngine from '../services/intelligentTwinEngine.js';
import userContextAggregator from '../services/userContextAggregator.js';
import intelligentMusicService from '../services/intelligentMusicService.js';

const router = express.Router();

/**
 * GET /api/presentation-ritual/analyze
 * Analyze user's patterns between calendar and Spotify
 */
router.get('/analyze', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`🎯 [Ritual API] Analyzing patterns for user ${userId}`);

    // Get Google Calendar tokens
    const { data: googleConnection, error: googleError } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'google_calendar')
      .single();

    console.log('[Ritual API] Google connection query result:', {
      hasData: !!googleConnection,
      error: googleError?.message,
      hasAccessToken: !!(googleConnection?.access_token)
    });

    if (!googleConnection) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar not connected. Please connect Google Calendar first.'
      });
    }

    // Get Spotify token directly from database
    const { data: spotifyConnection, error: spotifyError } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    console.log('[Ritual API] Spotify connection query result:', {
      hasData: !!spotifyConnection,
      error: spotifyError?.message,
      hasAccessToken: !!(spotifyConnection?.access_token)
    });

    if (!spotifyConnection || !spotifyConnection.access_token) {
      return res.status(400).json({
        success: false,
        error: 'Spotify not connected. Please connect Spotify first.'
      });
    }

    // Decrypt tokens before using them
    let decryptedSpotifyToken;
    let decryptedGoogleAccessToken;
    let decryptedGoogleRefreshToken;

    try {
      decryptedSpotifyToken = decryptToken(spotifyConnection.access_token);
      decryptedGoogleAccessToken = decryptToken(googleConnection.access_token);
      decryptedGoogleRefreshToken = googleConnection.refresh_token ? decryptToken(googleConnection.refresh_token) : null;
    } catch (decryptError) {
      console.error('[Ritual API] Token decryption error:', decryptError);
      return res.status(400).json({
        success: false,
        error: 'Token decryption failed. Please reconnect your platforms.',
        message: decryptError.message
      });
    }

    // Extract ritual patterns with decrypted tokens
    const googleTokens = {
      access_token: decryptedGoogleAccessToken,
      refresh_token: decryptedGoogleRefreshToken
    };

    const patterns = await presentationRitualExtractor.extractRitualPatterns(
      googleTokens,
      decryptedSpotifyToken,
      userId
    );

    // Store the analysis in database
    if (patterns.success) {
      await supabaseAdmin
        .from('ritual_patterns')
        .upsert({
          user_id: userId,
          patterns: patterns.patterns,
          insights: patterns.insights,
          next_prediction: patterns.nextPrediction,
          last_analyzed: new Date().toISOString(),
          confidence: patterns.summary.confidence
        }, {
          onConflict: 'user_id'
        });
    }

    res.json(patterns);
  } catch (error) {
    console.error('[Ritual API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze ritual patterns',
      message: error.message
    });
  }
});

/**
 * GET /api/presentation-ritual/next
 * Get the next predicted ritual
 */
router.get('/next', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get stored patterns
    const { data: storedPatterns } = await supabaseAdmin
      .from('ritual_patterns')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!storedPatterns || !storedPatterns.next_prediction) {
      // Try to generate fresh data if no stored patterns
      // Note: This is just using the imported instance, not creating a new one

      // Get connections
      const { data: connections } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .in('platform', ['google_calendar', 'spotify']);

      if (!connections || connections.length < 2) {
        return res.json({
          success: true,
          hasUpcomingRitual: false,
          message: 'Connect both Google Calendar and Spotify to enable ritual predictions'
        });
      }

      // Use Intelligent Twin Engine for dynamic recommendations
      console.log('🧠 [Ritual API] Using Intelligent Twin Engine for recommendations');
      const insights = await intelligentTwinEngine.generateInsightsAndRecommendations(userId, {
        includeMusic: true
      });

      if (!insights.success) {
        console.log('⚠️ [Ritual API] Intelligent insights unavailable, using fallback');
        // Fallback to basic context
        const context = await userContextAggregator.aggregateUserContext(userId);
        const nextEvent = context.calendar?.nextEvent;

        if (!nextEvent) {
          return res.json({
            success: true,
            hasUpcomingRitual: false,
            message: 'No upcoming events found in your calendar'
          });
        }

        // Get basic music suggestions
        const music = await intelligentMusicService.getRecommendations(userId, context, 'pre-event');

        return res.json({
          success: true,
          nextEvent: {
            id: nextEvent.id || 'event-' + Date.now(),
            title: nextEvent.title,
            start: nextEvent.start,
            end: nextEvent.end,
            attendees: nextEvent.attendeeCount || 0,
            importanceScore: nextEvent.importance === 'high' ? 0.85 : nextEvent.importance === 'medium' ? 0.65 : 0.45,
            type: nextEvent.type
          },
          ritualSuggestion: {
            startTime: new Date(new Date(nextEvent.start).getTime() - 30 * 60 * 1000).toISOString(),
            minutesBeforeEvent: 30,
            suggestedTracks: music.success ? music.recommendations?.tracks?.slice(0, 5) : [],
            suggestedPlaylists: music.success ? music.recommendations?.playlists?.slice(0, 3) : [],
            genre: music.success ? music.recommendations?.audioFeatureTargets?.mood : 'Focus',
            mood: music.success ? music.recommendations?.reasoning : 'Preparing for your event',
            confidence: 0.7,
            basedOnPattern: 'Intelligent recommendation based on your current state'
          }
        });
      }

      // Use full intelligent insights
      const nextEvent = insights.context?.calendar;
      const musicRecs = insights.music;

      if (!nextEvent) {
        return res.json({
          success: true,
          hasUpcomingRitual: false,
          insights: insights.insights,
          message: 'No upcoming events, but here are some insights for your day'
        });
      }

      return res.json({
        success: true,
        nextEvent: {
          id: nextEvent.id || 'event-' + Date.now(),
          title: nextEvent.title,
          start: nextEvent.start,
          end: nextEvent.end,
          attendees: nextEvent.attendeeCount || 0,
          importanceScore: nextEvent.importance === 'high' ? 0.85 : nextEvent.importance === 'medium' ? 0.65 : 0.45,
          type: nextEvent.type,
          minutesUntil: nextEvent.minutesUntil
        },
        ritualSuggestion: {
          startTime: insights.insights?.preparationAdvice?.startPrepTime
            ? new Date(new Date(nextEvent.start).getTime() - insights.insights.preparationAdvice.startPrepTime * 60 * 1000).toISOString()
            : new Date(new Date(nextEvent.start).getTime() - 30 * 60 * 1000).toISOString(),
          minutesBeforeEvent: insights.insights?.preparationAdvice?.startPrepTime || 30,
          suggestedTracks: musicRecs?.tracks?.slice(0, 5) || [],
          suggestedPlaylists: musicRecs?.playlists?.slice(0, 3) || [],
          genre: musicRecs?.audioFeatureTargets?.mood || 'Focus',
          mood: musicRecs?.reasoning || insights.insights?.currentState || 'Preparing for your event',
          confidence: 0.85,
          basedOnPattern: 'Intelligent cross-platform analysis'
        },
        insights: {
          currentState: insights.insights?.currentState,
          healthInsights: insights.insights?.healthInsights,
          recommendations: insights.insights?.recommendations,
          preparationAdvice: insights.insights?.preparationAdvice,
          personalizedTip: insights.insights?.personalizedTip
        },
        basedOn: {
          whoop: insights.context?.whoop,
          personality: insights.context?.personality,
          patterns: insights.context?.patterns
        }
      });
    }

    // Check if the prediction is still valid (event hasn't passed)
    const eventStart = new Date(storedPatterns.next_prediction.event.start);
    if (eventStart < new Date()) {
      // Event passed - get fresh intelligent recommendations
      console.log('🧠 [Ritual API] Stored prediction expired, getting fresh recommendations');
      const freshInsights = await intelligentTwinEngine.generateInsightsAndRecommendations(userId, {
        includeMusic: true
      });

      if (freshInsights.success && freshInsights.context?.calendar) {
        const freshEvent = freshInsights.context.calendar;
        const freshMusic = freshInsights.music;

        return res.json({
          success: true,
          nextEvent: {
            id: freshEvent.id || 'event-' + Date.now(),
            title: freshEvent.title,
            start: freshEvent.start,
            end: freshEvent.end,
            attendees: freshEvent.attendeeCount || 0,
            importanceScore: freshEvent.importance === 'high' ? 0.85 : 0.65,
            type: freshEvent.type
          },
          ritualSuggestion: {
            startTime: new Date(new Date(freshEvent.start).getTime() - 30 * 60 * 1000).toISOString(),
            minutesBeforeEvent: 30,
            suggestedTracks: freshMusic?.tracks?.slice(0, 5) || [],
            suggestedPlaylists: freshMusic?.playlists?.slice(0, 3) || [],
            genre: freshMusic?.audioFeatureTargets?.mood || 'Focus',
            mood: freshMusic?.reasoning || 'Preparing for your event',
            confidence: 0.8,
            basedOnPattern: 'Fresh intelligent analysis'
          },
          insights: freshInsights.insights
        });
      }

      // No upcoming events
      return res.json({
        success: true,
        hasUpcomingRitual: false,
        message: 'No upcoming events found',
        insights: freshInsights.insights
      });
    }

    // Transform stored pattern to match expected format, but enhance with intelligent music
    const nextEvent = storedPatterns.next_prediction.event;

    // Get intelligent music recommendations for the stored event
    const context = await userContextAggregator.aggregateUserContext(userId);
    const intelligentMusic = await intelligentMusicService.getRecommendations(userId, context, 'pre-event');

    const ritualSuggestion = {
      startTime: new Date(new Date(nextEvent.start).getTime() - (storedPatterns.next_prediction.minutesBeforeEvent * 60 * 1000)).toISOString(),
      minutesBeforeEvent: storedPatterns.next_prediction.minutesBeforeEvent,
      suggestedTracks: intelligentMusic.success ? intelligentMusic.recommendations?.tracks?.slice(0, 5) : (storedPatterns.next_prediction.suggestedTracks || []),
      suggestedPlaylists: intelligentMusic.success ? intelligentMusic.recommendations?.playlists?.slice(0, 3) : [],
      genre: intelligentMusic.success ? intelligentMusic.recommendations?.audioFeatureTargets?.mood : (storedPatterns.next_prediction.genre || 'Focus Music'),
      mood: intelligentMusic.success ? intelligentMusic.recommendations?.reasoning : (storedPatterns.next_prediction.mood || 'Calm & Focused'),
      confidence: storedPatterns.next_prediction.confidence,
      basedOnPattern: storedPatterns.next_prediction.basedOnPattern || 'Historical patterns enhanced with intelligent recommendations'
    };

    res.json({
      success: true,
      nextEvent: nextEvent,
      ritualSuggestion: ritualSuggestion,
      insights: storedPatterns.insights,
      confidence: storedPatterns.confidence,
      basedOn: intelligentMusic.success ? intelligentMusic.recommendations?.basedOn : null
    });
  } catch (error) {
    console.error('[Ritual API] Error getting next ritual:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next ritual',
      message: error.message
    });
  }
});

/**
 * GET /api/presentation-ritual/today
 * Get today's events and suggested rituals
 */
router.get('/today', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get Google Calendar tokens
    const { data: googleConnection } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'google_calendar')
      .single();

    if (!googleConnection) {
      return res.json({
        success: true,
        todayEvents: [],
        message: 'Connect Google Calendar to see your events'
      });
    }

    // Decrypt tokens before using them
    let decryptedGoogleAccessToken;
    let decryptedGoogleRefreshToken;

    try {
      decryptedGoogleAccessToken = decryptToken(googleConnection.access_token);
      decryptedGoogleRefreshToken = googleConnection.refresh_token ? decryptToken(googleConnection.refresh_token) : null;
    } catch (decryptError) {
      console.error('[Ritual API] Token decryption error:', decryptError);
      return res.json({
        success: true,
        todayEvents: [],
        message: 'Token error - please reconnect Google Calendar'
      });
    }

    // Get today's events directly
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: decryptedGoogleAccessToken,
      refresh_token: decryptedGoogleRefreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Set date range for today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];

    // Get stored patterns for ritual suggestions
    const { data: storedPatterns } = await supabaseAdmin
      .from('ritual_patterns')
      .select('insights, confidence')
      .eq('user_id', userId)
      .single();

    res.json({
      success: true,
      todayEvents: events.map(event => ({
        id: event.id,
        title: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        attendees: event.attendees?.length || 0
      })),
      insights: storedPatterns?.insights || [],
      patternConfidence: storedPatterns?.confidence || 0
    });
  } catch (error) {
    console.error('[Ritual API] Error getting today info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get today\'s information',
      message: error.message
    });
  }
});

/**
 * POST /api/presentation-ritual/feedback
 * Record user feedback on suggested rituals
 */
router.post('/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId, accepted, actualTiming, notes } = req.body;

    // Store feedback for improving predictions
    await supabaseAdmin
      .from('ritual_feedback')
      .insert({
        user_id: userId,
        event_id: eventId,
        accepted,
        actual_timing: actualTiming,
        notes,
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      message: 'Thank you for your feedback! This helps Twin-Me learn your patterns better.'
    });
  } catch (error) {
    console.error('[Ritual API] Error storing feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store feedback',
      message: error.message
    });
  }
});

/**
 * GET /api/presentation-ritual/stats
 * Get ritual statistics (streak, focus score, etc.)
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`📊 [Ritual API] Getting stats for user ${userId}`);

    // Get ritual patterns to calculate stats
    const { data: ritualPattern } = await supabaseAdmin
      .from('ritual_patterns')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Calculate ritual streak from agent_tasks or ritual_feedback
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get completed ritual feedback in last 30 days
    const { data: feedbackData } = await supabaseAdmin
      .from('ritual_feedback')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    // Calculate streak (consecutive days with rituals)
    let ritualStreak = 0;
    if (feedbackData && feedbackData.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let currentDate = new Date(today);
      const feedbackDates = feedbackData.map(f => {
        const d = new Date(f.created_at);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      });

      const uniqueDates = [...new Set(feedbackDates)].sort((a, b) => b - a);

      for (const dateTime of uniqueDates) {
        if (dateTime === currentDate.getTime()) {
          ritualStreak++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else if (dateTime < currentDate.getTime()) {
          break;
        }
      }
    }

    // Calculate focus score from ritual confidence and pattern strength
    let focusScore = 50; // Default
    if (ritualPattern) {
      const confidence = ritualPattern.confidence || 0.5;
      const patternStrength = ritualPattern.pattern_strength || 0.5;

      // Focus score formula: weighted average of confidence and pattern strength
      focusScore = Math.round((confidence * 0.6 + patternStrength * 0.4) * 100);

      // Boost by streak (up to 20 points)
      const streakBonus = Math.min(ritualStreak * 2, 20);
      focusScore = Math.min(focusScore + streakBonus, 100);
    }

    res.json({
      success: true,
      stats: {
        ritualStreak,
        focusScore,
        totalRituals: feedbackData?.length || 0,
        hasPattern: !!ritualPattern,
        patternConfidence: ritualPattern?.confidence || 0
      }
    });
  } catch (error) {
    console.error('[Ritual API] Error getting stats:', error);
    // Return default values instead of error to avoid breaking the dashboard
    res.json({
      success: true,
      stats: {
        ritualStreak: 0,
        focusScore: 50,
        totalRituals: 0,
        hasPattern: false,
        patternConfidence: 0
      }
    });
  }
});

export default router;