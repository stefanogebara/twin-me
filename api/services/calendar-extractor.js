/**
 * Google Calendar Data Extraction Service
 *
 * Extracts calendar data from Google Calendar using Pipedream Connect
 * Focuses on scheduling patterns and work-life balance analysis
 *
 * PRIVACY-FIRST APPROACH:
 * - We analyze scheduling patterns, NOT event content
 * - Event titles and metadata only (no detailed descriptions stored)
 * - Anonymize attendee information
 * - Focus on: meeting frequency, time preferences, work patterns, balance
 */

import axios from 'axios';
import { calendar_v3, google } from 'googleapis';

/**
 * Extract Google Calendar data using Pipedream account
 *
 * @param {string} pipedreamAccountId - Pipedream Connect account ID
 * @param {number} daysBack - Days of calendar history to analyze (default: 30)
 * @param {number} maxEvents - Max number of events to fetch (default: 100)
 * @returns {Promise<Object>} Calendar events and metadata
 */
export async function extractCalendarData(pipedreamAccountId, daysBack = 30, maxEvents = 100) {
  try {
    console.log('📅 [Calendar Extractor] Fetching calendar events via Pipedream...');

    // Validate Pipedream configuration
    if (!process.env.PIPEDREAM_PROJECT_KEY) {
      throw new Error('PIPEDREAM_PROJECT_KEY not configured');
    }

    // Get OAuth token from Pipedream Connect
    const tokenResponse = await axios.get(
      `https://api.pipedream.com/v1/connect/accounts/${pipedreamAccountId}/token`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PIPEDREAM_PROJECT_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      throw new Error('Failed to retrieve access token from Pipedream');
    }

    console.log('✅ [Calendar Extractor] Access token retrieved from Pipedream');

    // Initialize Google Calendar API client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth });

    // Calculate time range
    const now = new Date();
    const timeMin = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

    // Fetch calendar events
    console.log('📅 [Calendar Extractor] Fetching events from', timeMin.toISOString(), 'to', now.toISOString());
    const eventsResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: now.toISOString(),
      maxResults: maxEvents,
      singleEvents: true, // Expand recurring events
      orderBy: 'startTime'
    });

    const events = eventsResponse.data.items || [];

    if (events.length === 0) {
      console.log('⚠️ [Calendar Extractor] No events found');
      return {
        events: [],
        metadata: {
          daysAnalyzed: daysBack,
          timeRange: { start: timeMin.toISOString(), end: now.toISOString() }
        }
      };
    }

    console.log(`✅ [Calendar Extractor] Found ${events.length} events, parsing details...`);

    // Parse events for pattern analysis
    const parsedEvents = events.map(parseCalendarEvent).filter(Boolean);

    console.log(`✅ [Calendar Extractor] Extracted ${parsedEvents.length} events successfully`);

    return {
      events: parsedEvents,
      metadata: {
        daysAnalyzed: daysBack,
        timeRange: { start: timeMin.toISOString(), end: now.toISOString() },
        totalEvents: parsedEvents.length
      }
    };
  } catch (error) {
    console.error('❌ [Calendar Extractor] Error:', error);

    // Handle specific error cases
    if (error.response) {
      // Pipedream or Google API error
      console.error('API Error:', error.response.status, error.response.data);
      throw new Error(`API error: ${error.response.status}`);
    } else if (error.code === 'ENOTFOUND') {
      throw new Error('Network error: Unable to reach API');
    }

    throw new Error(`Calendar extraction failed: ${error.message}`);
  }
}

/**
 * Parse calendar event for scheduling pattern analysis
 *
 * @param {calendar_v3.Schema$Event} event - Google Calendar event object
 * @returns {Object} Parsed event metadata
 */
function parseCalendarEvent(event) {
  try {
    if (!event.start || !event.end) {
      return null; // Skip events without time
    }

    // Get start and end times
    const startTime = event.start.dateTime || event.start.date;
    const endTime = event.end.dateTime || event.end.date;

    if (!startTime || !endTime) {
      return null;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Calculate duration in minutes
    const durationMinutes = (end - start) / (1000 * 60);

    // Determine event type and characteristics
    const isAllDay = !!event.start.date; // All-day events use 'date' instead of 'dateTime'
    const hasAttendees = event.attendees && event.attendees.length > 0;
    const attendeeCount = event.attendees ? event.attendees.length : 0;
    const isRecurring = !!event.recurringEventId;

    // Analyze event title patterns (privacy-preserving)
    const title = event.summary || 'Untitled';
    const titleAnalysis = analyzeTitlePattern(title);

    // Extract day of week and time of day
    const dayOfWeek = start.getDay(); // 0 = Sunday, 6 = Saturday
    const hourOfDay = start.getHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isWorkHours = hourOfDay >= 9 && hourOfDay < 17;

    // Response status (accepted, declined, tentative)
    const responseStatus = event.attendees?.find(a => a.self)?.responseStatus || 'accepted';

    return {
      id: event.id,
      // Privacy-preserving metadata
      titleCategory: titleAnalysis.category,
      titleLength: title.length,
      // Timing
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes,
      isAllDay,
      // Scheduling patterns
      dayOfWeek,
      hourOfDay,
      isWeekend,
      isWorkHours,
      // Meeting characteristics
      hasAttendees,
      attendeeCount,
      isRecurring,
      responseStatus,
      // Organizational info
      organizer: event.organizer?.self ? 'me' : 'other',
      colorId: event.colorId || null
    };
  } catch (error) {
    console.error('❌ [Calendar Extractor] Error parsing event:', error);
    return null;
  }
}

/**
 * Analyze event title to categorize event type (privacy-preserving)
 *
 * @param {string} title - Event title
 * @returns {Object} Title analysis
 */
function analyzeTitlePattern(title) {
  const lowerTitle = title.toLowerCase();

  // Meeting-related keywords
  const meetingKeywords = ['meeting', 'call', 'sync', 'standup', 'retrospective', 'planning', 'review', '1:1', 'one-on-one'];
  const workKeywords = ['work', 'project', 'deadline', 'sprint', 'demo', 'presentation'];
  const personalKeywords = ['lunch', 'break', 'gym', 'workout', 'dentist', 'doctor', 'appointment', 'personal'];
  const socialKeywords = ['coffee', 'dinner', 'birthday', 'party', 'event', 'hangout', 'catch up'];

  let category = 'other';

  if (meetingKeywords.some(keyword => lowerTitle.includes(keyword))) {
    category = 'meeting';
  } else if (workKeywords.some(keyword => lowerTitle.includes(keyword))) {
    category = 'work';
  } else if (personalKeywords.some(keyword => lowerTitle.includes(keyword))) {
    category = 'personal';
  } else if (socialKeywords.some(keyword => lowerTitle.includes(keyword))) {
    category = 'social';
  }

  return {
    category,
    hasQuestionMark: title.includes('?'),
    hasEmoji: /[\u{1F300}-\u{1F9FF}]/u.test(title)
  };
}

/**
 * Calculate scheduling patterns and statistics
 *
 * @param {Object} calendarData - Calendar events and metadata
 * @returns {Object} Scheduling pattern statistics
 */
export function calculateSchedulingPatterns(calendarData) {
  const events = calendarData.events || [];

  if (events.length === 0) {
    return {
      totalEvents: 0,
      message: 'No events to analyze'
    };
  }

  // Event type distribution
  const eventsByCategory = {
    meeting: events.filter(e => e.titleCategory === 'meeting').length,
    work: events.filter(e => e.titleCategory === 'work').length,
    personal: events.filter(e => e.titleCategory === 'personal').length,
    social: events.filter(e => e.titleCategory === 'social').length,
    other: events.filter(e => e.titleCategory === 'other').length
  };

  // Time patterns
  const weekendEvents = events.filter(e => e.isWeekend).length;
  const workHoursEvents = events.filter(e => e.isWorkHours).length;

  // Meeting characteristics
  const meetingsWithAttendees = events.filter(e => e.hasAttendees).length;
  const avgAttendees = meetingsWithAttendees > 0
    ? Math.round(events.filter(e => e.hasAttendees).reduce((sum, e) => sum + e.attendeeCount, 0) / meetingsWithAttendees)
    : 0;

  // Duration patterns
  const avgDuration = Math.round(events.reduce((sum, e) => sum + e.durationMinutes, 0) / events.length);

  // Day of week distribution
  const dayDistribution = new Array(7).fill(0);
  events.forEach(event => {
    dayDistribution[event.dayOfWeek]++;
  });

  const busiestDay = dayDistribution.indexOf(Math.max(...dayDistribution));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Hour of day distribution
  const hourDistribution = new Array(24).fill(0);
  events.forEach(event => {
    hourDistribution[event.hourOfDay]++;
  });

  const peakHours = hourDistribution
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => h.hour);

  return {
    totalEvents: events.length,
    daysAnalyzed: calendarData.metadata.daysAnalyzed,
    eventsByCategory,
    timePatterns: {
      weekendEvents,
      weekendPercentage: Math.round((weekendEvents / events.length) * 100),
      workHoursEvents,
      workHoursPercentage: Math.round((workHoursEvents / events.length) * 100),
      busiestDay: dayNames[busiestDay],
      peakHours
    },
    meetingPatterns: {
      meetingsWithAttendees,
      avgAttendees,
      meetingPercentage: Math.round((meetingsWithAttendees / events.length) * 100)
    },
    durationPatterns: {
      avgDuration,
      longMeetings: events.filter(e => e.durationMinutes > 60).length,
      shortMeetings: events.filter(e => e.durationMinutes <= 30).length
    },
    workLifeBalance: {
      workEvents: eventsByCategory.meeting + eventsByCategory.work,
      personalEvents: eventsByCategory.personal + eventsByCategory.social,
      balanceScore: calculateBalanceScore(eventsByCategory, weekendEvents, events.length)
    }
  };
}

/**
 * Calculate work-life balance score (0-100)
 *
 * @param {Object} eventsByCategory - Event category counts
 * @param {number} weekendEvents - Number of weekend events
 * @param {number} totalEvents - Total event count
 * @returns {number} Balance score (0-100, higher is better balance)
 */
function calculateBalanceScore(eventsByCategory, weekendEvents, totalEvents) {
  const workEvents = eventsByCategory.meeting + eventsByCategory.work;
  const personalEvents = eventsByCategory.personal + eventsByCategory.social;

  // Ideal ratio: 70% work, 30% personal
  const workRatio = workEvents / totalEvents;
  const personalRatio = personalEvents / totalEvents;

  let balanceScore = 50; // Start at neutral

  // Adjust based on work-personal ratio
  if (personalRatio >= 0.2 && personalRatio <= 0.4) {
    balanceScore += 25; // Good personal time allocation
  } else if (personalRatio < 0.1) {
    balanceScore -= 20; // Too work-focused
  }

  // Adjust based on weekend utilization
  const weekendRatio = weekendEvents / totalEvents;
  if (weekendRatio >= 0.1 && weekendRatio <= 0.3) {
    balanceScore += 25; // Healthy weekend activity
  } else if (weekendRatio < 0.05) {
    balanceScore += 10; // Good work-weekend separation
  } else if (weekendRatio > 0.4) {
    balanceScore -= 15; // Working too much on weekends
  }

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, balanceScore));
}
