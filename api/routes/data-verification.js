/**
 * Data Verification Routes - Verify actual access to connected services
 */

import express from 'express';
import supabase from '../config/supabase.js';
import { decryptToken } from '../services/encryption.js';
const router = express.Router();

/**
 * GET /api/data-verification/gmail/:userId
 * Fetch sample Gmail messages to verify access
 */
router.get('/gmail/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get connection from database
    const { data: connection, error } = await supabase
      .from('data_connectors')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google_gmail')
      .eq('is_active', true)
      .single();

    if (error || !connection || !connection.access_token_encrypted) {
      return res.status(404).json({
        success: false,
        error: 'Gmail not connected or token expired'
      });
    }

    // Decrypt the access token
    let accessToken;
    try {
      accessToken = decryptToken(connection.access_token_encrypted);
    } catch (decryptError) {
      console.error('Token decryption error:', decryptError);
      return res.status(500).json({
        success: false,
        error: 'Failed to decrypt access token'
      });
    }

    console.log('📧 Fetching Gmail messages for verification...');

    // First get total and unread counts
    let totalEmails = 0;
    let unreadCount = 0;

    try {
      // Get total emails count
      const totalResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (totalResponse.ok) {
        const totalData = await totalResponse.json();
        totalEmails = totalData.resultSizeEstimate || 0;
      }

      // Get unread count
      const unreadResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=1',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (unreadResponse.ok) {
        const unreadData = await unreadResponse.json();
        unreadCount = unreadData.resultSizeEstimate || 0;
      }
    } catch (e) {
      console.log('Could not fetch email counts:', e);
    }

    // Fetch recent messages from Gmail API
    const messagesResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!messagesResponse.ok) {
      if (messagesResponse.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Gmail access token expired. Please reconnect.'
        });
      }
      throw new Error(`Gmail API error: ${messagesResponse.status}`);
    }

    const messagesData = await messagesResponse.json();
    const messages = [];

    // Fetch details for each message
    if (messagesData.messages && messagesData.messages.length > 0) {
      for (const msg of messagesData.messages.slice(0, 3)) { // Get first 3 messages
        const messageResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (messageResponse.ok) {
          const messageData = await messageResponse.json();

          // Extract relevant headers
          const headers = messageData.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
          const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
          const date = headers.find(h => h.name === 'Date')?.value || '';

          // Extract snippet
          const snippet = messageData.snippet || '';

          messages.push({
            id: msg.id,
            subject,
            from,
            date,
            snippet: snippet.substring(0, 100) + (snippet.length > 100 ? '...' : '')
          });
        }
      }
    }

    console.log(`✅ Successfully fetched ${messages.length} Gmail messages`);

    res.json({
      success: true,
      data: {
        provider: 'Gmail',
        messageCount: messages.length,
        totalEmails,
        unreadCount,
        lastSync: connection.last_sync || new Date().toISOString(),
        messages,
        accessVerified: true
      }
    });

  } catch (error) {
    console.error('Error fetching Gmail data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Gmail data'
    });
  }
});

/**
 * GET /api/data-verification/calendar/:userId
 * Fetch sample calendar events to verify access
 */
router.get('/calendar/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get connection from database
    const { data: connection, error } = await supabase
      .from('data_connectors')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')
      .eq('is_active', true)
      .single();

    if (error || !connection || !connection.access_token_encrypted) {
      return res.status(404).json({
        success: false,
        error: 'Google Calendar not connected or token expired'
      });
    }

    // Decrypt the access token
    let accessToken;
    try {
      accessToken = decryptToken(connection.access_token_encrypted);
    } catch (decryptError) {
      console.error('Token decryption error:', decryptError);
      return res.status(500).json({
        success: false,
        error: 'Failed to decrypt access token'
      });
    }

    console.log('📅 Fetching Calendar events for verification...');

    // Get calendar list first
    const calendarsResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!calendarsResponse.ok) {
      if (calendarsResponse.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Calendar access token expired. Please reconnect.'
        });
      }
      throw new Error(`Calendar API error: ${calendarsResponse.status}`);
    }

    const calendarsData = await calendarsResponse.json();
    const primaryCalendar = calendarsData.items?.find(cal => cal.primary) || calendarsData.items?.[0];

    if (!primaryCalendar) {
      return res.json({
        success: true,
        data: {
          provider: 'Google Calendar',
          eventCount: 0,
          events: [],
          accessVerified: true,
          message: 'No calendars found'
        }
      });
    }

    // Fetch upcoming events from primary calendar
    const now = new Date().toISOString();
    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(primaryCalendar.id)}/events?` +
      `maxResults=5&orderBy=startTime&singleEvents=true&timeMin=${now}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!eventsResponse.ok) {
      throw new Error(`Calendar Events API error: ${eventsResponse.status}`);
    }

    const eventsData = await eventsResponse.json();
    const events = (eventsData.items || []).map(event => ({
      id: event.id,
      summary: event.summary || 'Untitled Event',
      start: event.start?.dateTime || event.start?.date || 'No date',
      end: event.end?.dateTime || event.end?.date || 'No date',
      location: event.location || 'No location',
      description: event.description ?
        (event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '')) :
        'No description'
    }));

    console.log(`✅ Successfully fetched ${events.length} Calendar events`);

    res.json({
      success: true,
      data: {
        provider: 'Google Calendar',
        calendarName: primaryCalendar.summary,
        eventCount: events.length,
        totalEvents: eventsData.items ? eventsData.items.length : 0,
        lastSync: connection.last_sync || new Date().toISOString(),
        events,
        accessVerified: true
      }
    });

  } catch (error) {
    console.error('Error fetching Calendar data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Calendar data'
    });
  }
});

/**
 * GET /api/data-verification/all/:userId
 * Fetch verification data for all connected services
 */
router.get('/all/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const verificationResults = {};

    // Check Gmail - query database for active connection
    const { data: gmailConnection } = await supabase
      .from('data_connectors')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google_gmail')
      .eq('is_active', true)
      .single();

    if (gmailConnection) {
      try {
        const gmailResponse = await fetch(`http://localhost:3001/api/data-verification/gmail/${userId}`);
        if (gmailResponse.ok) {
          const gmailData = await gmailResponse.json();
          verificationResults.gmail = gmailData.data;
        }
      } catch (e) {
        console.error('Gmail verification failed:', e);
        verificationResults.gmail = { error: 'Failed to verify Gmail access' };
      }
    }

    // Check Calendar - query database for active connection
    const { data: calendarConnection } = await supabase
      .from('data_connectors')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')
      .eq('is_active', true)
      .single();

    if (calendarConnection) {
      try {
        const calendarResponse = await fetch(`http://localhost:3001/api/data-verification/calendar/${userId}`);
        if (calendarResponse.ok) {
          const calendarData = await calendarResponse.json();
          verificationResults.calendar = calendarData.data;
        }
      } catch (e) {
        console.error('Calendar verification failed:', e);
        verificationResults.calendar = { error: 'Failed to verify Calendar access' };
      }
    }

    res.json({
      success: true,
      data: verificationResults
    });

  } catch (error) {
    console.error('Error verifying all connections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify connections'
    });
  }
});

export default router;