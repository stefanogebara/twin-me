/**
 * Google Calendar OAuth Integration Routes
 *
 * Provides endpoints for:
 * - Connecting Google Calendar via OAuth (uses existing connectors flow)
 * - Fetching calendar events for today and tomorrow (for Presentation Ritual)
 * - Manual sync trigger
 * - Token refresh handling
 */

import express from 'express';
import { google } from 'googleapis';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { decryptToken, encryptToken } from '../services/encryption.js';
import { invalidatePlatformStatusCache } from '../services/redisClient.js';
import { lifeEventInferenceService } from '../services/lifeEventInferenceService.js';

const router = express.Router();

// Google Calendar OAuth configuration
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

/**
 * Helper to get valid access token, refreshing if needed
 */
async function getValidAccessToken(userId) {
  // Fetch connection from database
  const { data: connection, error: fetchError } = await supabaseAdmin
    .from('platform_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'google_calendar')
    .single();

  if (fetchError || !connection) {
    console.log(`[Calendar OAuth] No connection found for user: ${userId}`);
    return { accessToken: null, error: 'Calendar not connected' };
  }

  if (!connection.access_token) {
    console.log(`[Calendar OAuth] No access token for user: ${userId}`);
    return { accessToken: null, error: 'No access token available' };
  }

  // Check if token is expired
  const now = new Date();
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  const isExpired = expiresAt && expiresAt < now;

  if (isExpired && connection.refresh_token) {
    console.log(`[Calendar OAuth] Token expired, attempting refresh for user: ${userId}`);

    try {
      const refreshToken = decryptToken(connection.refresh_token);

      // Refresh the token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`[Calendar OAuth] Token refresh failed: ${errorText}`);
        return { accessToken: null, error: 'Token refresh failed', needsReconnect: true };
      }

      const newTokens = await tokenResponse.json();

      // Update stored tokens
      const updateData = {
        access_token: encryptToken(newTokens.access_token),
        token_expires_at: new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString(),
        updated_at: new Date().toISOString()
      };

      if (newTokens.refresh_token) {
        updateData.refresh_token = encryptToken(newTokens.refresh_token);
      }

      await supabaseAdmin
        .from('platform_connections')
        .update(updateData)
        .eq('user_id', userId)
        .eq('platform', 'google_calendar');

      // Invalidate cache
      await invalidatePlatformStatusCache(userId);

      console.log(`[Calendar OAuth] Token refreshed successfully for user: ${userId}`);
      return { accessToken: newTokens.access_token, error: null };

    } catch (refreshError) {
      console.error(`[Calendar OAuth] Refresh error:`, refreshError);
      return { accessToken: null, error: 'Token refresh failed', needsReconnect: true };
    }
  }

  // Token is valid, decrypt and return
  try {
    const accessToken = decryptToken(connection.access_token);
    return { accessToken, error: null };
  } catch (decryptError) {
    console.error(`[Calendar OAuth] Decrypt error:`, decryptError);
    return { accessToken: null, error: 'Failed to decrypt token', needsReconnect: true };
  }
}

/**
 * Classify event type based on title, description, and attendees
 * DASH 2.3: Improved event type classification with more categories
 */
function classifyEventType(event) {
  const title = (event.summary || '').toLowerCase();
  const description = (event.description || '').toLowerCase();
  const hasAttendees = event.attendees && event.attendees.length > 0;
  const attendeeCount = event.attendees?.length || 0;
  const combined = `${title} ${description}`;

  // Presentation/demo keywords (high priority)
  if (/presentation|demo|pitch|keynote|showcase|show\s*&\s*tell/i.test(combined)) {
    return 'presentation';
  }

  // Interview keywords (high priority)
  if (/interview|screening|candidate|hiring|recruiter/i.test(combined)) {
    return 'interview';
  }

  // Deadline keywords (high priority)
  if (/deadline|due|submission|deliver|handoff/i.test(combined)) {
    return 'deadline';
  }

  // Workout/fitness keywords
  if (/workout|gym|run|running|exercise|yoga|fitness|training|hiit|cardio|weights|crossfit|spin|cycling|swimming|pilates/i.test(combined)) {
    return 'workout';
  }

  // Focus/deep work keywords
  if (/focus\s*time|deep\s*work|coding|writing|blocked|no\s*meetings|heads\s*down|concentration|solo\s*work/i.test(combined)) {
    return 'focus';
  }

  // Learning/education keywords
  if (/class|lecture|session|course|workshop|training|seminar|webinar|tutorial|study|lesson|education/i.test(combined)) {
    return 'learning';
  }

  // Social keywords
  if (/lunch|dinner|breakfast|brunch|coffee|drinks|happy\s*hour|team\s*outing|social|celebration|party|birthday/i.test(combined)) {
    return 'social';
  }

  // Personal/vacation keywords (including Portuguese: férias, folga, licença, feriado, descanso)
  if (/break|personal|doctor|dentist|appointment|errand|pto|vacation|day\s*off|haircut|pickup|dropoff|f[eé]rias|folga|licen[cç]a|feriado|descanso|time\s*off|out\s*of\s*office|ooo/i.test(combined)) {
    return 'personal';
  }

  // Call keywords
  if (/call|phone|dial[\s-]*in|conference\s*call|zoom\s*call|google\s*meet/i.test(combined)) {
    return 'call';
  }

  // Work/project keywords
  if (/project|assignment|task|sprint|planning|brainstorm|strategy|roadmap|kickoff/i.test(combined)) {
    return 'work';
  }

  // Meeting (has attendees or meeting keywords)
  if (hasAttendees || /meeting|sync|standup|stand[\s-]*up|1[:\s]*1|one[\s-]*on[\s-]*one|review|huddle|catchup|catch[\s-]*up|check[\s-]*in|debrief/i.test(combined)) {
    return 'meeting';
  }

  // Default to 'general' instead of 'other' (better UX)
  return 'general';
}

/**
 * Check if event is important (presentations, interviews, deadlines)
 */
function isEventImportant(event) {
  const type = classifyEventType(event);
  return ['presentation', 'interview', 'deadline'].includes(type);
}

/**
 * GET /api/oauth/calendar/connect
 * Initiates OAuth flow for Google Calendar
 * Redirects to the connectors auth endpoint
 */
router.get('/connect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const returnUrl = req.query.returnUrl || '/get-started';

    console.log(`[Calendar OAuth] Initiating connect for user: ${userId}`);

    // Generate OAuth URL using existing pattern
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
    const redirectUri = `${appUrl}/oauth/callback`;

    const state = Buffer.from(JSON.stringify({
      provider: 'google_calendar',
      userId,
      timestamp: Date.now(),
      returnUrl
    })).toString('base64');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(CALENDAR_SCOPES.join(' '))}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${state}`;

    res.json({
      success: true,
      data: {
        authUrl,
        state
      }
    });

  } catch (error) {
    console.error('[Calendar OAuth] Connect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate calendar OAuth',
      details: error.message
    });
  }
});

/**
 * GET /api/calendar/events
 * Fetches user's calendar events for today and tomorrow
 * Returns events formatted for Dashboard Presentation Ritual feature
 */
router.get('/events', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`[Calendar Events] Fetching events for user: ${userId}`);

    // Get valid access token
    const { accessToken, error: tokenError, needsReconnect } = await getValidAccessToken(userId);

    if (tokenError) {
      console.log(`[Calendar Events] Token error: ${tokenError}`);
      return res.status(needsReconnect ? 401 : 404).json({
        success: false,
        error: tokenError,
        needsReconnect: needsReconnect || false
      });
    }

    // Initialize Google Calendar API client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth });

    // Calculate time range: now to end of tomorrow
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    console.log(`[Calendar Events] Fetching from ${startOfToday.toISOString()} to ${endOfTomorrow.toISOString()}`);

    // First, list ALL calendars the user has access to (including imported calendars)
    console.log(`[Calendar Events] Fetching calendar list...`);
    const calendarListResponse = await calendar.calendarList.list();
    const calendars = calendarListResponse.data.items || [];

    console.log(`[Calendar Events] Found ${calendars.length} calendars:`, calendars.map(c => c.summary).join(', '));

    // Fetch events from ALL calendars
    const allRawEvents = [];
    for (const cal of calendars) {
      try {
        console.log(`[Calendar Events]   → Fetching events from "${cal.summary}" (${cal.id})`);
        const eventsResponse = await calendar.events.list({
          calendarId: cal.id,
          timeMin: startOfToday.toISOString(),
          timeMax: endOfTomorrow.toISOString(),
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime'
        });

        const calendarEvents = eventsResponse.data.items || [];
        console.log(`[Calendar Events]   ✓ Found ${calendarEvents.length} events in "${cal.summary}"`);

        // Tag each event with its source calendar
        calendarEvents.forEach(event => {
          event.sourceCalendar = {
            id: cal.id,
            summary: cal.summary,
            backgroundColor: cal.backgroundColor
          };
        });

        allRawEvents.push(...calendarEvents);
      } catch (calError) {
        console.warn(`[Calendar Events]   ✗ Failed to fetch from "${cal.summary}":`, calError.message);
        // Continue with other calendars even if one fails
      }
    }

    const rawEvents = allRawEvents;

    console.log(`[Calendar Events] Found ${rawEvents.length} total events across all calendars`);

    // Transform events to Dashboard format
    const events = rawEvents.map(event => {
      const startTime = event.start.dateTime || event.start.date;
      const endTime = event.end.dateTime || event.end.date;
      const eventType = classifyEventType(event);

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        type: eventType,
        isImportant: isEventImportant(event),
        location: event.location || null,
        description: event.description || null,
        sourceCalendar: event.sourceCalendar || { summary: 'Unknown' }, // Include source calendar info
        attendees: event.attendees?.map(a => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus
        })) || []
      };
    });

    // Optionally store events in database for caching
    if (events.length > 0) {
      // Upsert events to calendar_events table (if it exists)
      try {
        for (const event of events) {
          await supabaseAdmin
            .from('calendar_events')
            .upsert({
              user_id: userId,
              google_event_id: event.id,
              title: event.title,
              description: event.description,
              start_time: event.startTime.toISOString(),
              end_time: event.endTime.toISOString(),
              location: event.location,
              is_important: event.isImportant,
              event_type: event.type,
              attendees: event.attendees,
              synced_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,google_event_id'
            });
        }
        console.log(`[Calendar Events] Stored ${events.length} events in database`);
      } catch (dbError) {
        // Log but don't fail - database storage is optional
        console.warn(`[Calendar Events] Failed to store events in database:`, dbError.message);
      }
    }

    // Update last sync time in platform_connections
    await supabaseAdmin
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: 'success',
        metadata: {
          last_sync: new Date().toISOString(),
          last_sync_status: 'success',
          event_count: events.length
        }
      })
      .eq('user_id', userId)
      .eq('platform', 'google_calendar');

    res.json({
      success: true,
      data: {
        events,
        count: events.length,
        timeRange: {
          start: startOfToday.toISOString(),
          end: endOfTomorrow.toISOString()
        },
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Calendar Events] Error:', error);

    // Check for specific Google API errors
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        error: 'Calendar authentication expired',
        needsReconnect: true
      });
    }

    // Check if Google Calendar API is not enabled
    if (error.message?.includes('Google Calendar API has not been used') ||
        error.message?.includes('calendar-json.googleapis.com')) {
      return res.status(200).json({
        success: true,
        data: {
          events: [],
          count: 0,
          timeRange: {
            start: new Date().toISOString(),
            end: new Date().toISOString()
          },
          fetchedAt: new Date().toISOString(),
          message: 'Google Calendar API needs to be enabled in your Google Cloud Console'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar events',
      details: error.message
    });
  }
});

/**
 * POST /api/calendar/sync
 * Manual sync trigger - fetches latest events and updates database
 */
router.post('/sync', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { daysAhead = 7 } = req.body;

    console.log(`[Calendar Sync] Manual sync for user: ${userId}, days ahead: ${daysAhead}`);

    // Get valid access token
    const { accessToken, error: tokenError, needsReconnect } = await getValidAccessToken(userId);

    if (tokenError) {
      return res.status(needsReconnect ? 401 : 404).json({
        success: false,
        error: tokenError,
        needsReconnect: needsReconnect || false
      });
    }

    // Initialize Google Calendar API client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth });

    // Calculate time range
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);

    // First, list ALL calendars the user has access to (including imported calendars)
    console.log(`[Calendar Sync] Fetching calendar list...`);
    const calendarListResponse = await calendar.calendarList.list();
    const calendars = calendarListResponse.data.items || [];

    console.log(`[Calendar Sync] Found ${calendars.length} calendars:`, calendars.map(c => c.summary).join(', '));

    // Fetch events from ALL calendars
    const allRawEvents = [];
    for (const cal of calendars) {
      try {
        console.log(`[Calendar Sync]   → Fetching events from "${cal.summary}" (${cal.id})`);
        const eventsResponse = await calendar.events.list({
          calendarId: cal.id,
          timeMin: startOfToday.toISOString(),
          timeMax: endDate.toISOString(),
          maxResults: 100,
          singleEvents: true,
          orderBy: 'startTime'
        });

        const calendarEvents = eventsResponse.data.items || [];
        console.log(`[Calendar Sync]   ✓ Found ${calendarEvents.length} events in "${cal.summary}"`);

        // Tag each event with its source calendar
        calendarEvents.forEach(event => {
          event.sourceCalendar = {
            id: cal.id,
            summary: cal.summary,
            backgroundColor: cal.backgroundColor
          };
        });

        allRawEvents.push(...calendarEvents);
      } catch (calError) {
        console.warn(`[Calendar Sync]   ✗ Failed to fetch from "${cal.summary}":`, calError.message);
        // Continue with other calendars even if one fails
      }
    }

    const rawEvents = allRawEvents;

    console.log(`[Calendar Sync] Synced ${rawEvents.length} total events across all calendars`);

    // Transform and store events
    const events = [];
    for (const event of rawEvents) {
      const startTime = event.start.dateTime || event.start.date;
      const endTime = event.end.dateTime || event.end.date;
      const eventType = classifyEventType(event);

      const transformedEvent = {
        id: event.id,
        title: event.summary || 'Untitled Event',
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        type: eventType,
        isImportant: isEventImportant(event),
        location: event.location || null,
        description: event.description || null,
        sourceCalendar: event.sourceCalendar || { summary: 'Unknown' }, // Include source calendar info
        attendees: event.attendees?.map(a => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus
        })) || []
      };

      events.push(transformedEvent);

      // Store in database
      try {
        await supabaseAdmin
          .from('calendar_events')
          .upsert({
            user_id: userId,
            google_event_id: transformedEvent.id,
            title: transformedEvent.title,
            description: transformedEvent.description,
            start_time: transformedEvent.startTime.toISOString(),
            end_time: transformedEvent.endTime.toISOString(),
            location: transformedEvent.location,
            is_important: transformedEvent.isImportant,
            event_type: transformedEvent.type,
            attendees: transformedEvent.attendees,
            synced_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,google_event_id'
          });
      } catch (dbError) {
        console.warn(`[Calendar Sync] Failed to store event ${transformedEvent.id}:`, dbError.message);
      }
    }

    // Update platform connection
    await supabaseAdmin
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: 'success',
        metadata: {
          last_sync: new Date().toISOString(),
          last_sync_status: 'success',
          event_count: events.length,
          sync_type: 'manual'
        }
      })
      .eq('user_id', userId)
      .eq('platform', 'google_calendar');

    // AUTO-INFER life events from calendar (vacation, conferences, etc.)
    let inferredLifeEvents = [];
    try {
      inferredLifeEvents = await lifeEventInferenceService.inferAndStoreLifeEvents(userId, events);
      if (inferredLifeEvents.length > 0) {
        console.log(`[Calendar Sync] Auto-stored ${inferredLifeEvents.length} life events for user ${userId}`);
      }
    } catch (inferenceError) {
      console.warn('[Calendar Sync] Life event inference failed:', inferenceError.message);
      // Non-blocking - sync still succeeds even if inference fails
    }

    res.json({
      success: true,
      data: {
        syncedEvents: events.length,
        daysAhead,
        syncedAt: new Date().toISOString(),
        inferredLifeEvents: inferredLifeEvents.length // Return count of auto-detected events
      }
    });

  } catch (error) {
    console.error('[Calendar Sync] Error:', error);

    // Update sync status to failed
    await supabaseAdmin
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: 'failed',
        metadata: {
          last_sync: new Date().toISOString(),
          last_sync_status: 'failed',
          error: error.message
        }
      })
      .eq('user_id', req.user.id)
      .eq('platform', 'google_calendar');

    res.status(500).json({
      success: false,
      error: 'Failed to sync calendar',
      details: error.message
    });
  }
});

/**
 * GET /api/calendar/status
 * Get Google Calendar connection status
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: connection, error } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'google_calendar')
      .single();

    if (error || !connection) {
      return res.json({
        success: true,
        data: {
          connected: false,
          platform: 'google_calendar'
        }
      });
    }

    // Check token expiration
    const now = new Date();
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const isExpired = expiresAt && expiresAt < now;

    res.json({
      success: true,
      data: {
        connected: !!connection.connected_at,
        platform: 'google_calendar',
        connectedAt: connection.connected_at,
        lastSync: connection.last_sync,
        lastSyncStatus: connection.last_sync_status,
        tokenExpired: isExpired,
        expiresAt: expiresAt?.toISOString()
      }
    });

  } catch (error) {
    console.error('[Calendar Status] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get calendar status',
      details: error.message
    });
  }
});

/**
 * DELETE /api/calendar/disconnect
 * Disconnect Google Calendar
 */
router.delete('/disconnect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`[Calendar Disconnect] Disconnecting for user: ${userId}`);

    // Update connection status
    await supabaseAdmin
      .from('platform_connections')
      .update({ connected: false })
      .eq('user_id', userId)
      .eq('platform', 'google_calendar');

    // Invalidate cache
    await invalidatePlatformStatusCache(userId);

    // Optionally delete cached events
    try {
      await supabaseAdmin
        .from('calendar_events')
        .delete()
        .eq('user_id', userId);
      console.log(`[Calendar Disconnect] Deleted cached events for user: ${userId}`);
    } catch (deleteError) {
      console.warn(`[Calendar Disconnect] Failed to delete events:`, deleteError.message);
    }

    res.json({
      success: true,
      message: 'Calendar disconnected successfully'
    });

  } catch (error) {
    console.error('[Calendar Disconnect] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect calendar',
      details: error.message
    });
  }
});

export default router;
