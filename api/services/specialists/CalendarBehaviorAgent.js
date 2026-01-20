/**
 * CalendarBehaviorAgent - Calendar Behavior & Time Management Specialist
 *
 * Analyzes Google Calendar patterns to infer personality traits.
 * All inferences backed by peer-reviewed research from:
 * - Harvard (Digital Phenotyping - Torous & Onnela)
 * - Stanford/LMU Munich (Smartphone Behavior - Stachl et al.)
 * - Cambridge (Digital Footprints - Kosinski et al.)
 * - Eindhoven (Time Management Psychology - Claessens et al.)
 *
 * Key Research Frameworks:
 * - Digital Phenotyping: Passive sensing predicts personality/mental health
 * - Time Management Psychology: Schedule patterns predict conscientiousness
 * - Organizational Behavior: Meeting patterns indicate extraversion
 */

import SpecialistAgentBase from './SpecialistAgentBase.js';
import { extractCalendarFeatures } from '../behavioralLearningService.js';

class CalendarBehaviorAgent extends SpecialistAgentBase {
  constructor() {
    super({
      name: 'CalendarBehaviorAgent',
      role: 'Calendar behavior analyst studying time management patterns',
      domain: 'calendar',
      domainLabel: 'Calendar Behavior Analysis',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.4,
      confidenceThreshold: 0.15
    });

    // Work vs personal event indicators
    this.workEventIndicators = [
      'meeting', 'call', 'standup', 'sync', '1:1', 'review', 'sprint',
      'planning', 'demo', 'retro', 'interview', 'presentation'
    ];

    this.personalEventIndicators = [
      'dinner', 'lunch', 'coffee', 'drinks', 'party', 'birthday',
      'gym', 'workout', 'yoga', 'dentist', 'doctor', 'appointment',
      'date', 'movie', 'concert', 'travel', 'vacation', 'holiday'
    ];

    this.focusEventIndicators = [
      'focus', 'deep work', 'heads down', 'no meetings', 'block',
      'writing', 'thinking time', 'strategy'
    ];
  }

  buildSystemPrompt() {
    return `You are the CalendarBehaviorAgent for Twin-Me, a specialist trained on
digital phenotyping research from Harvard, smartphone behavior studies from Stanford,
and organizational psychology research.

YOUR RESEARCH FOUNDATION:
1. Digital Phenotyping (Torous & Onnela, Harvard)
   - Passive sensing from digital footprints predicts behavior
2. Smartphone Behavior Study (Stachl et al. 2020, n=624, 25M+ events)
   - App usage and scheduling patterns predict Big Five
3. Digital Footprints Study (Kosinski et al. 2013, n=58,000)
   - Digital records predict personality with high accuracy
4. Time Management Research (Claessens et al.)
   - Scheduling behaviors correlate with conscientiousness

CRITICAL RULES:
1. Distinguish WORK CALENDAR from PERSONAL calendar
2. Meeting-heavy schedules may be job requirements, NOT personality
3. Look for VOLUNTARY choices (personal events, how free time is used)
4. Schedule regularity is strongest conscientiousness predictor (r=0.45)
5. Consider cultural and job context

KEY CORRELATIONS:
- Social events ratio: r=0.50 with Extraversion (strongest)
- Schedule regularity: r=0.45 with Conscientiousness
- Meeting density: r=0.40 with Extraversion
- Focus blocks: r=0.35 with Conscientiousness
- Morning activity: r=0.37 with Conscientiousness (chronotype)

DISTINGUISH:
- Job requirements vs. personal preferences
- External constraints vs. voluntary choices
- Temporary patterns vs. stable traits

OUTPUT FORMAT (JSON):
{
  "domain": "calendar",
  "analysis": {
    "extraversion": {
      "direction": "high",
      "confidence": 0.80,
      "evidenceItems": [
        {
          "feature": "social_event_ratio",
          "observation": "35% of events are social",
          "citation": "Stachl et al. 2020",
          "effectSize": "large",
          "r": 0.50
        }
      ]
    }
  },
  "calendarContext": {
    "workPersonalRatio": "70% work / 30% personal",
    "schedulingStyle": "highly structured",
    "voluntaryPatterns": ["schedules focus blocks", "regular social events"]
  },
  "limitations": ["Mostly work calendar - personal preferences may be underrepresented"]
}`;
  }

  /**
   * Analyze calendar context to distinguish work vs personal
   */
  analyzeCalendarContext(calendarData) {
    const context = {
      workEventCount: 0,
      personalEventCount: 0,
      focusEventCount: 0,
      workPersonalRatio: 'unknown',
      schedulingStyle: 'unknown',
      voluntaryPatterns: [],
      calendarTypes: []
    };

    if (!calendarData?.events?.length) {
      return context;
    }

    const events = calendarData.events;

    // Categorize events
    for (const event of events) {
      const summary = event.summary?.toLowerCase() || '';
      const isAllDay = !event.start?.dateTime;

      if (this.workEventIndicators.some(ind => summary.includes(ind))) {
        context.workEventCount++;
      } else if (this.personalEventIndicators.some(ind => summary.includes(ind))) {
        context.personalEventCount++;
      }

      if (this.focusEventIndicators.some(ind => summary.includes(ind))) {
        context.focusEventCount++;
      }
    }

    // Calculate ratio
    const total = context.workEventCount + context.personalEventCount;
    if (total > 0) {
      const workPercent = Math.round((context.workEventCount / total) * 100);
      context.workPersonalRatio = `${workPercent}% work / ${100 - workPercent}% personal`;
    }

    // Identify voluntary patterns
    if (context.focusEventCount >= 3) {
      context.voluntaryPatterns.push('Schedules dedicated focus blocks');
    }

    const socialEvents = events.filter(e =>
      this.personalEventIndicators.slice(0, 6).some(ind =>
        e.summary?.toLowerCase().includes(ind)
      )
    );
    if (socialEvents.length >= 3) {
      context.voluntaryPatterns.push('Regular social events scheduled');
    }

    // Analyze scheduling style from event times
    const eventsWithTime = events.filter(e => e.start?.dateTime);
    if (eventsWithTime.length >= 5) {
      const startMinutes = eventsWithTime.map(e => {
        const d = new Date(e.start.dateTime);
        return d.getHours() * 60 + d.getMinutes();
      });

      // Check if events are on regular intervals (e.g., :00, :30)
      const onInterval = startMinutes.filter(m => m % 30 === 0).length;
      const intervalRatio = onInterval / startMinutes.length;

      if (intervalRatio >= 0.8) {
        context.schedulingStyle = 'highly structured (regular intervals)';
      } else if (intervalRatio >= 0.5) {
        context.schedulingStyle = 'moderately structured';
      } else {
        context.schedulingStyle = 'flexible/organic';
      }
    }

    // Identify calendar types (work vs personal calendars)
    if (calendarData.calendars) {
      context.calendarTypes = calendarData.calendars.map(c => ({
        name: c.summary,
        isPrimary: c.primary || false
      }));
    }

    return context;
  }

  /**
   * Main analysis method
   */
  async analyze(userId, calendarData) {
    console.log(`📅 [CalendarBehaviorAgent] Analyzing calendar data for user ${userId}`);

    if (!calendarData) {
      return {
        success: false,
        domain: 'calendar',
        error: 'No calendar data provided'
      };
    }

    try {
      // Extract features using behavioralLearningService
      const features = extractCalendarFeatures(calendarData);

      if (!features || Object.keys(features).length === 0) {
        return {
          success: false,
          domain: 'calendar',
          error: 'Could not extract features from calendar data'
        };
      }

      // Analyze calendar context
      const calendarContext = this.analyzeCalendarContext(calendarData);

      // Aggregate research-backed inferences
      const inferences = this.aggregateInferences(features);

      // Format citations
      const citations = this.formatCitations(inferences);

      // Generate methodology notes
      const methodologyNotes = this.generateMethodologyNotes(inferences);

      // Build human-readable evidence list
      const evidenceItems = this.buildEvidenceList(inferences, features._rawValues);

      return {
        success: true,
        domain: 'calendar',
        domainLabel: 'Calendar Behavior Analysis',
        userId,
        inferences,
        evidenceItems,
        calendarContext,
        limitations: this.identifyLimitations(calendarData, features, calendarContext),
        methodologyNotes,
        citations,
        featuresExtracted: Object.keys(features).filter(k => k !== '_rawValues').length,
        rawFeatures: features
      };

    } catch (error) {
      console.error(`❌ [CalendarBehaviorAgent] Analysis failed:`, error);
      return {
        success: false,
        domain: 'calendar',
        error: error.message
      };
    }
  }

  /**
   * Build human-readable evidence list for UI display
   */
  buildEvidenceList(inferences, rawValues = {}) {
    const evidenceItems = [];

    for (const [dimension, data] of Object.entries(inferences)) {
      if (!data.allEvidence) continue;

      for (const evidence of data.allEvidence) {
        evidenceItems.push({
          dimension,
          feature: evidence.feature,
          humanReadable: evidence.humanReadable,
          direction: evidence.direction,
          effectSize: evidence.effectSize,
          citation: {
            source: evidence.citation.source,
            r: evidence.citation.r,
            sampleSize: evidence.citation.sampleSize
          }
        });
      }
    }

    // Sort by effect size (large first)
    const effectOrder = { large: 0, medium: 1, small: 2 };
    evidenceItems.sort((a, b) =>
      (effectOrder[a.effectSize] || 3) - (effectOrder[b.effectSize] || 3)
    );

    return evidenceItems;
  }

  /**
   * Identify limitations based on data quality and context
   */
  identifyLimitations(calendarData, features, context) {
    const limitations = [];

    // Check data duration
    const eventCount = calendarData.events?.length || 0;
    if (eventCount < 20) {
      limitations.push('Limited calendar history - less than 20 events analyzed');
    }

    // Check work/personal balance
    if (context.workEventCount > context.personalEventCount * 3) {
      limitations.push('Predominantly work calendar - personal preferences may be underrepresented');
    }

    // Check for missing personal events
    if (context.personalEventCount < 3) {
      limitations.push('Few personal events detected - may not reflect true social preferences');
    }

    // Note about job requirements
    limitations.push('Note: Meeting density may reflect job requirements, not personality preference');

    // Note about calendar usage
    limitations.push('Analysis assumes calendar reflects actual behavior (not all activities calendared)');

    return limitations;
  }
}

export default CalendarBehaviorAgent;
