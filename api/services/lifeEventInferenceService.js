/**
 * Life Event Inference Service
 *
 * Analyzes calendar events and other platform data to infer significant
 * life events (vacation, conferences, training periods, etc.) that should
 * inform all twin reflections and recommendations.
 *
 * Key Features:
 * - Multilingual vacation detection (Férias, Vacaciones, Congé, etc.)
 * - Multi-day event detection for extended contexts
 * - Conference/travel detection
 * - Training period detection
 * - Auto-storage with confidence scoring
 */

import { supabaseAdmin } from './database.js';

class LifeEventInferenceService {
  constructor() {
    // Multilingual vacation keywords (Portuguese, Spanish, French, Dutch, Italian, German, English)
    this.vacationKeywords = /férias|vacaciones|congé|vakantie|ferie|urlaub|vacation|holidays?|pto|time\s*off|day\s*off|sabbatical|leave|break|off\s*work/i;

    // Conference/travel keywords
    this.conferenceKeywords = /conference|summit|convention|expo|trade\s*show|symposium|congress|forum|retreat|offsite|business\s*trip/i;

    // Training/fitness period keywords
    this.trainingKeywords = /training\s*(camp|program|period)|marathon\s*prep|race\s*prep|competition\s*prep|tournament|championship/i;

    // Holiday keywords (specific named holidays)
    this.holidayKeywords = /christmas|natal|navidad|noël|new\s*year|ano\s*novo|thanksgiving|easter|páscoa|hanukkah|diwali|eid/i;

    // Language detection patterns
    this.languagePatterns = {
      'pt': /férias|natal|ano\s*novo|páscoa|folga/i,
      'es': /vacaciones|navidad|año\s*nuevo|semana\s*santa/i,
      'fr': /congé|vacances|noël|pâques/i,
      'nl': /vakantie|kerst|nieuwjaar/i,
      'it': /ferie|vacanze|natale|capodanno/i,
      'de': /urlaub|ferien|weihnachten|neujahr/i,
      'en': /vacation|holiday|christmas|new\s*year/i
    };
  }

  /**
   * Detect the language of an event title
   */
  detectLanguage(text) {
    if (!text) return 'en';

    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    return 'en';
  }

  /**
   * Detect vacation events from calendar
   */
  detectVacation(events) {
    const vacationEvents = [];

    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.vacationKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        // Calculate duration in days
        const durationDays = endDate
          ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
          : 1;

        // Higher confidence for longer vacations and explicit vacation keywords
        let confidence = 0.7;
        if (durationDays >= 7) confidence = 0.95;
        else if (durationDays >= 3) confidence = 0.85;

        // Boost confidence for explicit vacation words
        if (/férias|vacation|pto|holidays/i.test(title)) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }

        vacationEvents.push({
          type: 'vacation',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          durationDays,
          confidence,
          sourceEventId: event.id || event.google_event_id,
          detectedLanguage: this.detectLanguage(combined),
          metadata: {
            hasDescription: !!description,
            isAllDay: !!(event.start?.date || event.all_day),
            attendeeCount: event.attendees?.length || 0
          }
        });
      }
    }

    return this.mergeOverlappingEvents(vacationEvents);
  }

  /**
   * Detect conference/travel events
   */
  detectConference(events) {
    const conferenceEvents = [];

    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.conferenceKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        conferenceEvents.push({
          type: 'conference',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          confidence: 0.8,
          sourceEventId: event.id || event.google_event_id,
          detectedLanguage: this.detectLanguage(combined),
          metadata: {
            location: event.location,
            isTravel: /travel|trip|flight|hotel/i.test(combined)
          }
        });
      }
    }

    return conferenceEvents;
  }

  /**
   * Detect training/competition periods
   */
  detectTrainingPeriod(events) {
    const trainingEvents = [];

    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.trainingKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        trainingEvents.push({
          type: 'training',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          confidence: 0.75,
          sourceEventId: event.id || event.google_event_id,
          metadata: {
            isCompetition: /competition|tournament|championship|race|marathon/i.test(combined)
          }
        });
      }
    }

    return trainingEvents;
  }

  /**
   * Detect named holidays
   */
  detectHoliday(events) {
    const holidayEvents = [];

    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.holidayKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        holidayEvents.push({
          type: 'holiday',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          confidence: 0.9,
          sourceEventId: event.id || event.google_event_id,
          detectedLanguage: this.detectLanguage(combined),
          metadata: {
            holidayType: this.identifyHolidayType(combined)
          }
        });
      }
    }

    return holidayEvents;
  }

  /**
   * Identify specific holiday type
   */
  identifyHolidayType(text) {
    if (/christmas|natal|navidad|noël|weihnachten|kerst/i.test(text)) return 'christmas';
    if (/new\s*year|ano\s*novo|año\s*nuevo|nieuwjaar|neujahr/i.test(text)) return 'new_year';
    if (/thanksgiving/i.test(text)) return 'thanksgiving';
    if (/easter|páscoa|pâques|pasqua/i.test(text)) return 'easter';
    return 'other';
  }

  /**
   * Merge overlapping events of the same type
   */
  mergeOverlappingEvents(events) {
    if (events.length <= 1) return events;

    // Sort by start date
    events.sort((a, b) => a.startDate - b.startDate);

    const merged = [];
    let current = events[0];

    for (let i = 1; i < events.length; i++) {
      const next = events[i];

      // Check if events overlap or are adjacent (within 1 day)
      const gap = (next.startDate - (current.endDate || current.startDate)) / (1000 * 60 * 60 * 24);

      if (gap <= 1) {
        // Merge events
        current = {
          ...current,
          endDate: new Date(Math.max(
            current.endDate?.getTime() || current.startDate.getTime(),
            next.endDate?.getTime() || next.startDate.getTime()
          )),
          durationDays: Math.ceil(
            (Math.max(
              current.endDate?.getTime() || current.startDate.getTime(),
              next.endDate?.getTime() || next.startDate.getTime()
            ) - current.startDate.getTime()) / (1000 * 60 * 60 * 24)
          ),
          confidence: Math.max(current.confidence, next.confidence),
          title: current.title, // Keep the first title
          metadata: {
            ...current.metadata,
            mergedCount: (current.metadata?.mergedCount || 1) + 1
          }
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged;
  }

  /**
   * Main inference method - analyzes all events and returns inferred life events
   */
  async inferLifeEvents(userId, events) {
    console.log(`🔍 [Life Event Inference] Analyzing ${events.length} events for user ${userId}`);

    const inferredEvents = [];

    // Run all detectors
    const vacations = this.detectVacation(events);
    const conferences = this.detectConference(events);
    const training = this.detectTrainingPeriod(events);
    const holidays = this.detectHoliday(events);

    inferredEvents.push(...vacations);
    inferredEvents.push(...conferences);
    inferredEvents.push(...training);
    inferredEvents.push(...holidays);

    console.log(`📋 [Life Event Inference] Found ${inferredEvents.length} life events:`, {
      vacations: vacations.length,
      conferences: conferences.length,
      training: training.length,
      holidays: holidays.length
    });

    return inferredEvents;
  }

  /**
   * Infer life events and store them in the database
   */
  async inferAndStoreLifeEvents(userId, events) {
    const inferredEvents = await this.inferLifeEvents(userId, events);

    if (inferredEvents.length === 0) {
      return [];
    }

    const storedEvents = [];

    for (const event of inferredEvents) {
      try {
        // Check if this event already exists (by source event ID or similar dates)
        const { data: existing } = await supabaseAdmin
          .from('life_context')
          .select('id')
          .eq('user_id', userId)
          .eq('context_type', event.type)
          .eq('source_event_id', event.sourceEventId)
          .single();

        if (existing) {
          console.log(`⏭️ [Life Event Inference] Event already exists, skipping: ${event.title}`);
          continue;
        }

        // Insert new life context
        const { data, error } = await supabaseAdmin
          .from('life_context')
          .insert({
            user_id: userId,
            context_type: event.type,
            title: event.title,
            start_date: event.startDate.toISOString(),
            end_date: event.endDate?.toISOString(),
            source: 'calendar_inference',
            source_event_id: event.sourceEventId,
            source_platform: 'google_calendar',
            confidence: event.confidence,
            detected_language: event.detectedLanguage,
            original_title: event.originalTitle,
            metadata: event.metadata,
            is_active: true
          })
          .select()
          .single();

        if (error) {
          console.error(`❌ [Life Event Inference] Failed to store event: ${error.message}`);
        } else {
          console.log(`✅ [Life Event Inference] Stored: ${event.type} - "${event.title}" (confidence: ${event.confidence})`);
          storedEvents.push(data);
        }
      } catch (err) {
        console.error(`❌ [Life Event Inference] Error processing event: ${err.message}`);
      }
    }

    return storedEvents;
  }

  /**
   * Get active life context for a user (currently happening)
   */
  async getActiveLifeContext(userId) {
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('life_context')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_dismissed', false)
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('start_date', { ascending: false });

    if (error) {
      console.error(`❌ [Life Event Inference] Failed to get active context: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Get upcoming life context for a user
   */
  async getUpcomingLifeContext(userId, daysAhead = 14) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const { data, error } = await supabaseAdmin
      .from('life_context')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_dismissed', false)
      .gt('start_date', now.toISOString())
      .lte('start_date', futureDate.toISOString())
      .order('start_date', { ascending: true });

    if (error) {
      console.error(`❌ [Life Event Inference] Failed to get upcoming context: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Build a summary of life context for use in prompts
   */
  async buildLifeContextSummary(userId) {
    const [activeContext, upcomingContext] = await Promise.all([
      this.getActiveLifeContext(userId),
      this.getUpcomingLifeContext(userId, 7) // Next 7 days
    ]);

    const summary = {
      isOnVacation: activeContext.some(c => c.context_type === 'vacation'),
      isAtConference: activeContext.some(c => c.context_type === 'conference'),
      isInTraining: activeContext.some(c => c.context_type === 'training'),
      isHoliday: activeContext.some(c => c.context_type === 'holiday'),
      activeEvents: activeContext.map(c => ({
        type: c.context_type,
        title: c.title,
        startDate: c.start_date,
        endDate: c.end_date,
        daysRemaining: c.end_date
          ? Math.ceil((new Date(c.end_date) - new Date()) / (1000 * 60 * 60 * 24))
          : null
      })),
      upcomingEvents: upcomingContext.map(c => ({
        type: c.context_type,
        title: c.title,
        startDate: c.start_date,
        daysUntil: Math.ceil((new Date(c.start_date) - new Date()) / (1000 * 60 * 60 * 24))
      }))
    };

    // Build human-readable summary for LLM prompts
    summary.promptSummary = this.buildPromptSummary(summary);

    return summary;
  }

  /**
   * Build human-readable summary for LLM prompts
   */
  buildPromptSummary(summary) {
    const parts = [];

    if (summary.isOnVacation) {
      const vacation = summary.activeEvents.find(e => e.type === 'vacation');
      if (vacation) {
        parts.push(`Currently on vacation: "${vacation.title}"${vacation.daysRemaining ? ` (${vacation.daysRemaining} days remaining)` : ''}`);
      }
    }

    if (summary.isAtConference) {
      const conference = summary.activeEvents.find(e => e.type === 'conference');
      if (conference) {
        parts.push(`At conference: "${conference.title}"`);
      }
    }

    if (summary.isInTraining) {
      const training = summary.activeEvents.find(e => e.type === 'training');
      if (training) {
        parts.push(`In training period: "${training.title}"`);
      }
    }

    if (summary.upcomingEvents.length > 0) {
      const upcoming = summary.upcomingEvents[0];
      parts.push(`Upcoming: ${upcoming.type} "${upcoming.title}" in ${upcoming.daysUntil} days`);
    }

    return parts.length > 0 ? parts.join('. ') : 'No significant life events detected.';
  }
}

// Export singleton instance
export const lifeEventInferenceService = new LifeEventInferenceService();
export default lifeEventInferenceService;
