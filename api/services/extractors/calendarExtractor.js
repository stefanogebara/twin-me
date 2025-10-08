/**
 * Google Calendar Data Extractor
 * Extracts events, meeting patterns, and time management insights
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class CalendarExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://www.googleapis.com/calendar/v3';
  }

  /**
   * Main extraction method - extracts all Calendar data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Calendar] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractCalendars(userId);
      totalItems += await this.extractRecentEvents(userId);
      totalItems += await this.extractUpcomingEvents(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Calendar] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[Calendar] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Google Calendar API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Extract user's calendars
   */
  async extractCalendars(userId) {
    console.log(`[Calendar] Extracting calendars...`);
    let calendarCount = 0;

    try {
      const data = await this.makeRequest('/users/me/calendarList');

      if (data.items && data.items.length > 0) {
        for (const calendar of data.items) {
          await this.storeRawData(userId, 'calendar', 'calendar_info', {
            calendar_id: calendar.id,
            calendar_name: calendar.summary,
            description: calendar.description,
            timezone: calendar.timeZone,
            is_primary: calendar.primary || false,
            access_role: calendar.accessRole,
            color: calendar.backgroundColor,
            selected: calendar.selected
          });

          calendarCount++;
        }
      }

      console.log(`[Calendar] Extracted ${calendarCount} calendars`);
      return calendarCount;
    } catch (error) {
      console.error('[Calendar] Error extracting calendars:', error);
      return calendarCount;
    }
  }

  /**
   * Extract recent events (last 90 days)
   */
  async extractRecentEvents(userId) {
    console.log(`[Calendar] Extracting recent events...`);
    let eventCount = 0;

    try {
      // Get primary calendar
      const calendarsData = await this.makeRequest('/users/me/calendarList');
      const primaryCalendar = calendarsData.items?.find(cal => cal.primary);

      if (!primaryCalendar) {
        console.warn('[Calendar] No primary calendar found');
        return 0;
      }

      // Get events from last 90 days
      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - 90);
      const timeMax = new Date();

      const eventsData = await this.makeRequest(`/calendars/${encodeURIComponent(primaryCalendar.id)}/events`, {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 500,
        singleEvents: true,
        orderBy: 'startTime'
      });

      if (eventsData.items && eventsData.items.length > 0) {
        for (const event of eventsData.items) {
          // Skip declined events
          if (event.attendees?.some(att => att.self && att.responseStatus === 'declined')) {
            continue;
          }

          await this.storeRawData(userId, 'calendar', 'recent_event', {
            event_id: event.id,
            calendar_id: primaryCalendar.id,
            summary: event.summary,
            description: event.description,
            start_time: event.start?.dateTime || event.start?.date,
            end_time: event.end?.dateTime || event.end?.date,
            is_all_day: !event.start?.dateTime,
            location: event.location,
            attendee_count: event.attendees?.length || 0,
            attendees: event.attendees?.map(att => ({
              email: att.email,
              response_status: att.responseStatus,
              organizer: att.organizer || false
            })),
            is_recurring: !!event.recurringEventId,
            recurrence: event.recurrence,
            created: event.created,
            updated: event.updated,
            url: event.htmlLink,
            status: event.status,
            visibility: event.visibility
          });

          eventCount++;
        }
      }

      console.log(`[Calendar] Extracted ${eventCount} recent events`);
      return eventCount;
    } catch (error) {
      console.error('[Calendar] Error extracting recent events:', error);
      return eventCount;
    }
  }

  /**
   * Extract upcoming events (next 90 days)
   */
  async extractUpcomingEvents(userId) {
    console.log(`[Calendar] Extracting upcoming events...`);
    let eventCount = 0;

    try {
      // Get primary calendar
      const calendarsData = await this.makeRequest('/users/me/calendarList');
      const primaryCalendar = calendarsData.items?.find(cal => cal.primary);

      if (!primaryCalendar) {
        console.warn('[Calendar] No primary calendar found');
        return 0;
      }

      // Get events for next 90 days
      const timeMin = new Date();
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + 90);

      const eventsData = await this.makeRequest(`/calendars/${encodeURIComponent(primaryCalendar.id)}/events`, {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 500,
        singleEvents: true,
        orderBy: 'startTime'
      });

      if (eventsData.items && eventsData.items.length > 0) {
        for (const event of eventsData.items) {
          // Skip declined events
          if (event.attendees?.some(att => att.self && att.responseStatus === 'declined')) {
            continue;
          }

          await this.storeRawData(userId, 'calendar', 'upcoming_event', {
            event_id: event.id,
            calendar_id: primaryCalendar.id,
            summary: event.summary,
            description: event.description,
            start_time: event.start?.dateTime || event.start?.date,
            end_time: event.end?.dateTime || event.end?.date,
            is_all_day: !event.start?.dateTime,
            location: event.location,
            attendee_count: event.attendees?.length || 0,
            is_recurring: !!event.recurringEventId,
            recurrence: event.recurrence,
            url: event.htmlLink,
            status: event.status
          });

          eventCount++;
        }
      }

      console.log(`[Calendar] Extracted ${eventCount} upcoming events`);
      return eventCount;
    } catch (error) {
      console.error('[Calendar] Error extracting upcoming events:', error);
      return eventCount;
    }
  }

  /**
   * Helper: Sleep for rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Store raw data in database
   */
  async storeRawData(userId, platform, dataType, rawData) {
    try {
      const { error } = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          source_url: rawData.url || null,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[Calendar] Error storing data:', error);
      }
    } catch (error) {
      console.error('[Calendar] Exception storing data:', error);
    }
  }

  /**
   * Create extraction job
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabase
      .from('data_extraction_jobs')
      .insert({
        user_id: userId,
        connector_id: connectorId,
        platform: 'calendar',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Calendar] Error creating job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, totalItems) {
    await supabase
      .from('data_extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_items: totalItems,
        processed_items: totalItems,
        results: { message: 'Extraction completed successfully' }
      })
      .eq('id', jobId);
  }
}

export default CalendarExtractor;
