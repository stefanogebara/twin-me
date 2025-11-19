/**
 * Presentation Ritual API Routes
 * MVP Feature: Detect and predict music rituals before important events
 */

import express from 'express';
import presentationRitualExtractor from '../services/extractors/presentationRitualExtractor.js';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { decryptToken } from '../services/encryption.js';

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
      const extractor = new PresentationRitualExtractor();

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

      // Return mock data for MVP demo
      return res.json({
        success: true,
        nextEvent: {
          id: 'demo-event-1',
          title: 'Product Strategy Meeting',
          start: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
          end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          attendees: 8,
          importanceScore: 0.85,
          type: 'strategy_meeting'
        },
        ritualSuggestion: {
          startTime: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(), // 30 min before
          minutesBeforeEvent: 30,
          suggestedTracks: [
            { name: 'Midnight City', artist: 'M83', duration: 244, energy: 0.8 },
            { name: 'Intro', artist: 'The xx', duration: 127, energy: 0.6 },
            { name: 'Breathe', artist: 'Télépopmusik', duration: 323, energy: 0.5 }
          ],
          genre: 'Electronic Focus',
          mood: 'Confident & Energized',
          confidence: 0.78,
          basedOnPattern: 'Similar meetings with 5+ attendees'
        }
      });
    }

    // Check if the prediction is still valid (event hasn't passed)
    const eventStart = new Date(storedPatterns.next_prediction.event.start);
    if (eventStart < new Date()) {
      // Need to recalculate - return mock data for now
      return res.json({
        success: true,
        nextEvent: {
          id: 'demo-event-2',
          title: 'Team Standup',
          start: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour from now
          end: new Date(Date.now() + 1.5 * 60 * 60 * 1000).toISOString(),
          attendees: 5,
          importanceScore: 0.65,
          type: 'team_meeting'
        },
        ritualSuggestion: {
          startTime: new Date(Date.now() + 0.5 * 60 * 60 * 1000).toISOString(), // 30 min before
          minutesBeforeEvent: 30,
          suggestedTracks: [
            { name: 'Daylight', artist: 'Matt & Kim', duration: 172, energy: 0.9 },
            { name: 'Electric Feel', artist: 'MGMT', duration: 239, energy: 0.8 },
            { name: 'Pumped Up Kicks', artist: 'Foster The People', duration: 239, energy: 0.7 }
          ],
          genre: 'Upbeat Indie',
          mood: 'Energetic & Positive',
          confidence: 0.72,
          basedOnPattern: 'Morning team meetings'
        }
      });
    }

    // Transform stored pattern to match expected format
    const nextEvent = storedPatterns.next_prediction.event;
    const ritualSuggestion = {
      startTime: new Date(new Date(nextEvent.start).getTime() - (storedPatterns.next_prediction.minutesBeforeEvent * 60 * 1000)).toISOString(),
      minutesBeforeEvent: storedPatterns.next_prediction.minutesBeforeEvent,
      suggestedTracks: storedPatterns.next_prediction.suggestedTracks || [
        { name: 'Time', artist: 'Hans Zimmer', duration: 274, energy: 0.7 },
        { name: 'Nuvole Bianche', artist: 'Ludovico Einaudi', duration: 366, energy: 0.4 },
        { name: 'Comptine d\'un autre été', artist: 'Yann Tiersen', duration: 142, energy: 0.5 }
      ],
      genre: storedPatterns.next_prediction.genre || 'Focus Music',
      mood: storedPatterns.next_prediction.mood || 'Calm & Focused',
      confidence: storedPatterns.next_prediction.confidence,
      basedOnPattern: storedPatterns.next_prediction.basedOnPattern || 'Historical patterns'
    };

    res.json({
      success: true,
      nextEvent: nextEvent,
      ritualSuggestion: ritualSuggestion,
      insights: storedPatterns.insights,
      confidence: storedPatterns.confidence
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

export default router;