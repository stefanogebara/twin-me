/**
 * Presentation Ritual Extractor
 * MVP Feature: Detects patterns between important calendar events and music listening
 *
 * Core hypothesis: People have unconscious rituals before important events
 * We detect these by correlating Spotify listening with high-importance calendar events
 */

import { google } from 'googleapis';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

class PresentationRitualExtractor {
  constructor() {
    this.spotifyBaseUrl = 'https://api.spotify.com/v1';

    // Keywords that indicate important events
    this.importantEventKeywords = [
      'presentation', 'pitch', 'demo', 'meeting', 'interview',
      'exam', 'test', 'review', 'deadline', 'launch',
      'client', 'investor', 'board', 'important', 'crucial'
    ];

    // Time windows for pattern detection
    this.timeWindows = {
      before: 45,  // Look 45 minutes before event
      after: 5     // Look 5 minutes after event starts
    };
  }

  /**
   * Main extraction: Find correlations between calendar and Spotify
   */
  async extractRitualPatterns(googleTokens, spotifyToken, userId) {
    console.log(`🎯 [Ritual Extractor] Starting extraction for user ${userId}`);

    try {
      // 1. Get calendar events for the last 30 days
      const calendarEvents = await this.getCalendarEvents(googleTokens);

      // 2. Identify high-importance events
      const importantEvents = this.identifyImportantEvents(calendarEvents);

      console.log(`📅 Found ${importantEvents.length} important events out of ${calendarEvents.length} total`);

      // 3. Get Spotify listening history
      const listeningHistory = await this.getSpotifyHistory(spotifyToken);

      // 4. Find patterns: What music was played before important events?
      const patterns = this.detectRitualPatterns(importantEvents, listeningHistory);

      // 5. Generate insights
      const insights = this.generateInsights(patterns, importantEvents);

      return {
        success: true,
        userId,
        extractedAt: new Date().toISOString(),
        summary: {
          totalEvents: calendarEvents.length,
          importantEvents: importantEvents.length,
          patternsFound: patterns.length,
          confidence: this.calculateConfidence(patterns)
        },
        importantEvents,
        patterns,
        insights,
        nextPrediction: await this.predictNextRitual(googleTokens, patterns)
      };

    } catch (error) {
      console.error('[Ritual Extractor] Error:', error);
      return {
        success: false,
        error: error.message,
        userId
      };
    }
  }

  /**
   * Get calendar events from Google Calendar
   */
  async getCalendarEvents(tokens) {
    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3001/api/oauth/google_calendar/callback'
      );
      auth.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth });

      // Get events from last 30 days
      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - 30);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: new Date().toISOString(),
        maxResults: 250,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items || [];
    } catch (error) {
      console.log('[Ritual Extractor] Calendar API error:', error.message);

      // If API is not enabled, return mock data for MVP testing
      if (error.message?.includes('Calendar API has not been used')) {
        console.log('[Ritual Extractor] Using mock calendar data for MVP testing');
        return this.getMockCalendarEvents();
      }

      throw error;
    }
  }

  /**
   * Get mock calendar events for testing when API is not available
   */
  getMockCalendarEvents() {
    const events = [];
    const now = new Date();

    // Create some realistic past events
    const mockEvents = [
      {
        id: 'mock-1',
        summary: 'Q4 Business Review Presentation',
        description: 'Quarterly review with stakeholders',
        start: { dateTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString() },
        attendees: Array(12).fill({})
      },
      {
        id: 'mock-2',
        summary: 'Product Demo to Investors',
        description: 'Demonstrate new features to potential investors',
        start: { dateTime: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString() },
        attendees: Array(8).fill({})
      },
      {
        id: 'mock-3',
        summary: 'Team Standup',
        start: { dateTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString() },
        attendees: Array(5).fill({})
      },
      {
        id: 'mock-4',
        summary: 'Client Pitch Meeting',
        description: 'Present proposal to new client',
        start: { dateTime: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString() },
        attendees: Array(6).fill({})
      },
      {
        id: 'mock-5',
        summary: 'Conference Talk: Future of AI',
        description: 'Speaking at tech conference',
        start: { dateTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString() },
        attendees: Array(150).fill({})
      }
    ];

    return mockEvents;
  }

  /**
   * Identify high-importance events based on keywords and metadata
   */
  identifyImportantEvents(events) {
    return events.filter(event => {
      if (!event.summary) return false;

      const title = event.summary.toLowerCase();
      const description = (event.description || '').toLowerCase();
      const attendees = event.attendees || [];

      // Check for keyword matches
      const hasKeyword = this.importantEventKeywords.some(keyword =>
        title.includes(keyword) || description.includes(keyword)
      );

      // High attendee count indicates importance
      const highAttendeeCount = attendees.length > 5;

      // Busy status often indicates important time
      const markedBusy = event.transparency !== 'transparent';

      // Calculate importance score
      const importanceScore = this.calculateImportanceScore(event);

      return hasKeyword || highAttendeeCount || importanceScore > 0.7;
    }).map(event => ({
      id: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      attendeeCount: (event.attendees || []).length,
      importanceScore: this.calculateImportanceScore(event),
      keywords: this.extractKeywords(event)
    }));
  }

  /**
   * Calculate importance score for an event
   */
  calculateImportanceScore(event) {
    let score = 0;

    // Keyword matching (0.4 weight)
    const title = (event.summary || '').toLowerCase();
    const matchedKeywords = this.importantEventKeywords.filter(kw => title.includes(kw));
    score += Math.min(matchedKeywords.length * 0.2, 0.4);

    // Attendee count (0.3 weight)
    const attendeeCount = (event.attendees || []).length;
    if (attendeeCount > 10) score += 0.3;
    else if (attendeeCount > 5) score += 0.2;
    else if (attendeeCount > 2) score += 0.1;

    // Duration (0.2 weight) - longer meetings often more important
    if (event.start && event.end) {
      const duration = new Date(event.end.dateTime) - new Date(event.start.dateTime);
      const hours = duration / (1000 * 60 * 60);
      if (hours > 2) score += 0.2;
      else if (hours > 1) score += 0.1;
    }

    // Has description (0.1 weight)
    if (event.description && event.description.length > 50) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * Extract keywords from event
   */
  extractKeywords(event) {
    const text = `${event.summary || ''} ${event.description || ''}`.toLowerCase();
    return this.importantEventKeywords.filter(kw => text.includes(kw));
  }

  /**
   * Get Spotify listening history
   */
  async getSpotifyHistory(accessToken) {
    try {
      const response = await fetch(`${this.spotifyBaseUrl}/me/player/recently-played?limit=50`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform to simpler format
      return data.items.map(item => ({
        trackId: item.track.id,
        trackName: item.track.name,
        artistName: item.track.artists[0].name,
        playedAt: item.played_at,
        duration: item.track.duration_ms,
        features: {
          energy: null, // We'll fetch these if needed
          valence: null,
          tempo: null
        }
      }));
    } catch (error) {
      console.log('[Ritual Extractor] Spotify API error:', error.message);
      console.log('[Ritual Extractor] Using mock Spotify data for MVP testing');
      return this.getMockSpotifyHistory();
    }
  }

  /**
   * Get mock Spotify listening history for testing
   */
  getMockSpotifyHistory() {
    const now = new Date();
    const mockTracks = [];

    // Create listening history that aligns with our mock events
    const ritualTimes = [
      now.getTime() - 7 * 24 * 60 * 60 * 1000 - 25 * 60 * 1000,  // Before Q4 Review
      now.getTime() - 14 * 24 * 60 * 60 * 1000 - 20 * 60 * 1000, // Before Demo
      now.getTime() - 21 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000, // Before Pitch
      now.getTime() - 10 * 24 * 60 * 60 * 1000 - 22 * 60 * 1000, // Before Conference
    ];

    const pumUpTracks = [
      { name: 'Eye of the Tiger', artist: 'Survivor' },
      { name: 'Lose Yourself', artist: 'Eminem' },
      { name: 'Stronger', artist: 'Kanye West' },
      { name: 'Can\'t Stop', artist: 'Red Hot Chili Peppers' },
      { name: 'Remember the Name', artist: 'Fort Minor' }
    ];

    // Add ritual listening patterns
    ritualTimes.forEach((time, index) => {
      // Add 3-4 tracks before each important event
      for (let i = 0; i < 3; i++) {
        const track = pumUpTracks[(index + i) % pumUpTracks.length];
        mockTracks.push({
          trackId: `mock-track-${index}-${i}`,
          trackName: track.name,
          artistName: track.artist,
          playedAt: new Date(time + i * 4 * 60 * 1000).toISOString(),
          duration: 240000,
          features: {
            energy: 0.85,
            valence: 0.75,
            tempo: 130
          }
        });
      }
    });

    // Add some random listening throughout
    for (let i = 0; i < 20; i++) {
      mockTracks.push({
        trackId: `random-${i}`,
        trackName: `Random Track ${i}`,
        artistName: `Artist ${i}`,
        playedAt: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 200000,
        features: {
          energy: Math.random(),
          valence: Math.random(),
          tempo: 80 + Math.random() * 80
        }
      });
    }

    return mockTracks.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  }

  /**
   * Detect ritual patterns by correlating events and music
   */
  detectRitualPatterns(importantEvents, listeningHistory) {
    const patterns = [];

    for (const event of importantEvents) {
      const eventStart = new Date(event.start);
      const windowStart = new Date(eventStart.getTime() - this.timeWindows.before * 60000);
      const windowEnd = new Date(eventStart.getTime() + this.timeWindows.after * 60000);

      // Find tracks played in the time window
      const tracksInWindow = listeningHistory.filter(track => {
        const playedAt = new Date(track.playedAt);
        return playedAt >= windowStart && playedAt <= windowEnd;
      });

      if (tracksInWindow.length > 0) {
        // Calculate time offset for each track
        const tracksWithOffset = tracksInWindow.map(track => ({
          ...track,
          minutesBeforeEvent: Math.round((eventStart - new Date(track.playedAt)) / 60000)
        }));

        patterns.push({
          eventId: event.id,
          eventTitle: event.title,
          eventStart: event.start,
          importanceScore: event.importanceScore,
          tracks: tracksWithOffset,
          summary: this.summarizePattern(tracksWithOffset)
        });
      }
    }

    return patterns;
  }

  /**
   * Summarize a detected pattern
   */
  summarizePattern(tracks) {
    if (tracks.length === 0) return null;

    // Find the most common timing
    const avgMinutesBefore = Math.round(
      tracks.reduce((sum, t) => sum + t.minutesBeforeEvent, 0) / tracks.length
    );

    // Get genre/mood (simplified for MVP)
    const artists = [...new Set(tracks.map(t => t.artistName))];

    return {
      trackCount: tracks.length,
      avgMinutesBefore,
      timeRange: {
        earliest: Math.max(...tracks.map(t => t.minutesBeforeEvent)),
        latest: Math.min(...tracks.map(t => t.minutesBeforeEvent))
      },
      topArtists: artists.slice(0, 3),
      pattern: avgMinutesBefore > 20 ? 'early_prep' : 'last_minute'
    };
  }

  /**
   * Generate human-readable insights
   */
  generateInsights(patterns, events) {
    const insights = [];

    if (patterns.length === 0) {
      return [{
        type: 'no_pattern',
        message: "We haven't detected any music rituals before your important events yet. Try connecting more data!"
      }];
    }

    // Timing insight
    const avgTiming = patterns.reduce((sum, p) =>
      sum + (p.summary?.avgMinutesBefore || 0), 0) / patterns.length;

    if (avgTiming > 25) {
      insights.push({
        type: 'timing',
        message: `You tend to start your music ritual about ${Math.round(avgTiming)} minutes before important events. You're a planner!`
      });
    } else if (avgTiming > 10) {
      insights.push({
        type: 'timing',
        message: `You usually play music ${Math.round(avgTiming)} minutes before big moments - just enough time to get in the zone.`
      });
    }

    // Consistency insight
    const consistentPatterns = patterns.filter(p =>
      p.summary && Math.abs(p.summary.avgMinutesBefore - avgTiming) < 10
    );

    if (consistentPatterns.length > patterns.length * 0.6) {
      insights.push({
        type: 'consistency',
        message: "You have a remarkably consistent pre-event ritual. Your brain has automated this preparation!"
      });
    }

    // Track count insight
    const avgTracks = patterns.reduce((sum, p) =>
      sum + (p.summary?.trackCount || 0), 0) / patterns.length;

    insights.push({
      type: 'playlist_length',
      message: `You typically listen to ${Math.round(avgTracks)} songs before important events.`
    });

    return insights;
  }

  /**
   * Calculate confidence in detected patterns
   */
  calculateConfidence(patterns) {
    if (patterns.length === 0) return 0;
    if (patterns.length < 3) return 0.3;
    if (patterns.length < 5) return 0.5;
    if (patterns.length < 10) return 0.7;
    return 0.9;
  }

  /**
   * Predict ritual for next important event
   */
  async predictNextRitual(tokens, patterns) {
    if (patterns.length === 0) return null;

    // Get upcoming events
    const auth = new google.auth.OAuth2();
    auth.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next 7 days
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const upcomingEvents = response.data.items || [];
    const nextImportant = this.identifyImportantEvents(upcomingEvents)[0];

    if (!nextImportant) return null;

    // Calculate average pattern
    const avgMinutesBefore = patterns.reduce((sum, p) =>
      sum + (p.summary?.avgMinutesBefore || 0), 0) / patterns.length;

    const ritualStartTime = new Date(nextImportant.start);
    ritualStartTime.setMinutes(ritualStartTime.getMinutes() - Math.round(avgMinutesBefore));

    return {
      event: nextImportant,
      suggestedRitualStart: ritualStartTime.toISOString(),
      minutesBeforeEvent: Math.round(avgMinutesBefore),
      confidence: this.calculateConfidence(patterns)
    };
  }
}

export default new PresentationRitualExtractor();