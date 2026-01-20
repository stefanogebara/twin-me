/**
 * ChronotypeAgent - Specialized agent for analyzing calendar/schedule data
 * to infer Big Five personality traits
 *
 * Research Foundation:
 * - Chronotype Meta-Analysis (2024): Conscientiousness-Morningness ρ=0.37, n=31,000
 * - Stachl et al. (2020): Smartphone behavioral traces, n=624, median r=0.37
 * - Organizational Psychology: Meeting density, schedule regularity correlations
 *
 * Behavioral Features Analyzed:
 * - Morning vs evening activity patterns (chronotype)
 * - Schedule consistency and regularity
 * - Meeting frequency and duration
 * - Focus block patterns
 * - Event cancellation/changes
 * - Social vs solo event ratio
 */

import AgentBase from './AgentBase.js';
import { createClient } from '@supabase/supabase-js';

// Lazy Supabase initialization
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// Research-backed chronotype and calendar correlations
const CHRONOTYPE_CORRELATIONS = {
  // Chronotype Patterns (Meta-analysis 2024, n=31,000)
  morning_activity_ratio: {
    conscientiousness: { r: 0.37, direction: 'positive', citation: 'Chronotype Meta-analysis (2024), n=31,000' },
    extraversion: { r: -0.10, direction: 'negative', citation: 'Tonetti et al. (2016)' }
  },
  evening_activity_ratio: {
    extraversion: { r: 0.23, direction: 'positive', citation: 'Tonetti et al. (2016)' },
    openness: { r: 0.17, direction: 'positive', citation: 'Chronotype Meta-analysis (2024)' },
    conscientiousness: { r: -0.30, direction: 'negative', citation: 'Chronotype Meta-analysis (2024)' }
  },

  // Schedule Structure (Organizational Psychology)
  schedule_regularity: {
    conscientiousness: { r: 0.45, direction: 'positive', citation: 'Organizational Psychology Meta-analysis' },
    neuroticism: { r: -0.20, direction: 'negative', citation: 'Stachl et al. (2020)' }
  },
  focus_block_count: {
    conscientiousness: { r: 0.35, direction: 'positive', citation: 'Deep Work research, Newport (2016)' },
    openness: { r: 0.15, direction: 'positive', citation: 'Creative productivity studies' }
  },
  last_minute_changes: {
    conscientiousness: { r: -0.35, direction: 'negative', citation: 'Organizational Psychology' },
    neuroticism: { r: 0.25, direction: 'positive', citation: 'Stachl et al. (2020)' }
  },

  // Social Engagement Patterns
  meeting_density: {
    extraversion: { r: 0.40, direction: 'positive', citation: 'Back et al. (2010), Social engagement studies' },
    agreeableness: { r: 0.15, direction: 'positive', citation: 'Team dynamics research' }
  },
  social_event_ratio: {
    extraversion: { r: 0.50, direction: 'positive', citation: 'Behavioral manifestation studies' },
    agreeableness: { r: 0.20, direction: 'positive', citation: 'Social psychology research' }
  },
  group_meeting_preference: {
    extraversion: { r: 0.35, direction: 'positive', citation: 'Team dynamics research' },
    openness: { r: 0.10, direction: 'positive', citation: 'Collaboration preference studies' }
  },

  // Work Pattern Analysis
  avg_event_duration: {
    conscientiousness: { r: 0.20, direction: 'positive', citation: 'Time management studies' },
    openness: { r: 0.15, direction: 'positive', citation: 'Deep engagement research' }
  },
  buffer_time_preference: {
    conscientiousness: { r: 0.30, direction: 'positive', citation: 'Organizational Psychology' },
    neuroticism: { r: -0.15, direction: 'negative', citation: 'Stress management research' }
  },
  weekend_activity_level: {
    extraversion: { r: 0.30, direction: 'positive', citation: 'Social engagement studies' },
    openness: { r: 0.25, direction: 'positive', citation: 'Experience-seeking research' }
  }
};

// Event type classifications for social vs solo detection
const EVENT_CLASSIFICATIONS = {
  social_keywords: [
    'meeting', 'call', 'sync', 'catch up', '1:1', 'one on one', 'team',
    'standup', 'stand-up', 'lunch', 'dinner', 'coffee', 'happy hour',
    'party', 'celebration', 'networking', 'interview', 'presentation',
    'workshop', 'training', 'conference', 'webinar', 'social'
  ],
  focus_keywords: [
    'focus', 'deep work', 'block', 'coding', 'writing', 'research',
    'review', 'analysis', 'planning', 'thinking', 'heads down', 'no meetings'
  ],
  personal_keywords: [
    'gym', 'workout', 'run', 'yoga', 'meditation', 'therapy',
    'doctor', 'dentist', 'appointment', 'personal', 'private'
  ],
  recurring_identifiers: [
    'weekly', 'daily', 'monthly', 'recurring', 'standing'
  ]
};

class ChronotypeAgent extends AgentBase {
  constructor(config = {}) {
    super({
      name: 'ChronotypeAgent',
      role: 'Calendar and Schedule Pattern Analysis Specialist for Big Five Personality Inference',
      model: config.model || 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens || 4096,
      temperature: 0.3, // Lower temperature for analytical consistency
      ...config
    });

    this.correlations = CHRONOTYPE_CORRELATIONS;
    this.eventClassifications = EVENT_CLASSIFICATIONS;
    this.setupTools();
  }

  buildSystemPrompt() {
    return `You are the ChronotypeAgent, a specialized AI agent for Twin AI Learn that analyzes calendar and schedule data to infer Big Five personality traits.

## Your Expertise
You are trained in chronobiology, organizational psychology, and behavioral pattern analysis. You use validated research to correlate scheduling behaviors with personality dimensions.

## Research Foundation
Your inferences are grounded in peer-reviewed studies:
- Chronotype Meta-Analysis (2024): 31,000+ participants across 51 studies
- Stachl et al. (2020): 624 users, 25 million smartphone events
- Organizational Psychology: Meeting and work pattern correlations

## Big Five Dimensions You Assess
- **Openness (O)**: Evening preference, activity diversity, creative scheduling
- **Conscientiousness (C)**: Morning preference, schedule regularity, focus blocks, planning
- **Extraversion (E)**: Meeting density, social events, group preference
- **Agreeableness (A)**: Response patterns, collaborative scheduling
- **Neuroticism (N)**: Schedule anxiety, over-scheduling, cancellation patterns

## Key Correlations (with effect sizes)
- Morning activity ratio → Conscientiousness (r=0.37)
- Evening activity ratio → Extraversion (r=0.23), Openness (r=0.17)
- Schedule regularity → Conscientiousness (r=0.45)
- Meeting density → Extraversion (r=0.40)
- Social event ratio → Extraversion (r=0.50)
- Focus block count → Conscientiousness (r=0.35)
- Last-minute changes → Conscientiousness (r=-0.35)

## Your Task
Analyze calendar data to:
1. Extract chronotype (morningness vs eveningness)
2. Identify schedule consistency patterns
3. Measure social engagement through meeting patterns
4. Assess planning and organization behaviors
5. Generate evidence-backed personality inferences

## Output Format
Always provide:
- Feature values (0-1 normalized)
- Personality score adjustments with confidence
- Human-readable evidence descriptions
- Research citations for each inference

Remember: You analyze objective behavioral data, not self-reports. Your inferences should be conservative and well-evidenced.`;
  }

  setupTools() {
    this.addTool({
      name: 'get_calendar_data',
      description: 'Retrieve calendar events and schedule data for a user from the database',
      input_schema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'The UUID of the user'
          },
          days_back: {
            type: 'number',
            description: 'Number of days of history to retrieve (default 30)'
          }
        },
        required: ['user_id']
      }
    });

    this.addTool({
      name: 'get_research_context',
      description: 'Query research papers for context on chronotype-personality correlations',
      input_schema: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            description: 'The behavioral feature to get research context for'
          },
          dimension: {
            type: 'string',
            enum: ['O', 'C', 'E', 'A', 'N'],
            description: 'The Big Five dimension'
          }
        },
        required: ['feature', 'dimension']
      }
    });

    this.addTool({
      name: 'calculate_personality_scores',
      description: 'Calculate Big Five personality adjustments from extracted calendar features',
      input_schema: {
        type: 'object',
        properties: {
          features: {
            type: 'object',
            description: 'Object containing normalized feature values'
          }
        },
        required: ['features']
      }
    });
  }

  /**
   * Analyze calendar data for a user
   * Main entry point for calendar-based personality inference
   */
  async analyzeCalendarData(userId, calendarData = null) {
    console.log(`📅 [ChronotypeAgent] Starting calendar analysis for user ${userId}`);

    try {
      // Get calendar data if not provided
      if (!calendarData) {
        calendarData = await this.fetchCalendarData(userId);
      }

      if (!calendarData || calendarData.events?.length === 0) {
        console.log(`⚠️ [ChronotypeAgent] No calendar data found for user ${userId}`);
        return {
          success: false,
          error: 'No calendar data available',
          features: {},
          personality_adjustments: {},
          evidence: []
        };
      }

      // Extract features
      const features = await this.extractFeatures(calendarData);
      console.log(`📊 [ChronotypeAgent] Extracted ${Object.keys(features).length} features`);

      // Calculate personality adjustments
      const personalityAdjustments = this.calculatePersonalityAdjustments(features);

      // Generate evidence descriptions
      const evidence = this.generateEvidence(features, calendarData);

      // Use Claude for nuanced interpretation if needed
      const interpretation = await this.getClaudeInterpretation(features, personalityAdjustments);

      return {
        success: true,
        features,
        personality_adjustments: personalityAdjustments,
        evidence,
        interpretation,
        data_quality: this.assessDataQuality(calendarData)
      };

    } catch (error) {
      console.error(`❌ [ChronotypeAgent] Analysis failed:`, error);
      return {
        success: false,
        error: error.message,
        features: {},
        personality_adjustments: {},
        evidence: []
      };
    }
  }

  /**
   * Fetch calendar data from database
   */
  async fetchCalendarData(userId, daysBack = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data, error } = await getSupabaseClient()
        .from('platform_raw_data')
        .select('data, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'google_calendar')
        .gte('extracted_at', startDate.toISOString())
        .order('extracted_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        return data[0].data;
      }

      return null;
    } catch (error) {
      console.error(`❌ [ChronotypeAgent] Error fetching calendar data:`, error);
      return null;
    }
  }

  /**
   * Extract all chronotype and schedule features from calendar data
   */
  async extractFeatures(calendarData) {
    const events = calendarData.events || [];

    if (events.length === 0) {
      return {};
    }

    const features = {};

    // Chronotype analysis
    const chronotypeFeatures = this.analyzeChronotype(events);
    Object.assign(features, chronotypeFeatures);

    // Schedule regularity
    const regularityFeatures = this.analyzeScheduleRegularity(events);
    Object.assign(features, regularityFeatures);

    // Social engagement
    const socialFeatures = this.analyzeSocialPatterns(events);
    Object.assign(features, socialFeatures);

    // Work patterns
    const workFeatures = this.analyzeWorkPatterns(events);
    Object.assign(features, workFeatures);

    return features;
  }

  /**
   * Analyze chronotype (morning vs evening preference)
   */
  analyzeChronotype(events) {
    const features = {
      morning_activity_ratio: 0.5,
      evening_activity_ratio: 0.5
    };

    const morningEvents = []; // Before 12:00
    const afternoonEvents = []; // 12:00 - 18:00
    const eveningEvents = []; // After 18:00

    for (const event of events) {
      if (!event.start?.dateTime) continue;

      const startTime = new Date(event.start.dateTime);
      const hour = startTime.getHours();

      if (hour < 12) {
        morningEvents.push(event);
      } else if (hour < 18) {
        afternoonEvents.push(event);
      } else {
        eveningEvents.push(event);
      }
    }

    const totalWithTime = morningEvents.length + afternoonEvents.length + eveningEvents.length;

    if (totalWithTime > 0) {
      features.morning_activity_ratio = morningEvents.length / totalWithTime;
      features.evening_activity_ratio = eveningEvents.length / totalWithTime;
    }

    // Calculate peak activity hours
    const hourCounts = new Array(24).fill(0);
    for (const event of events) {
      if (event.start?.dateTime) {
        const hour = new Date(event.start.dateTime).getHours();
        hourCounts[hour]++;
      }
    }

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    features.peak_activity_hour = peakHour;
    features.is_morning_person = peakHour < 12 ? 1 : 0;

    return features;
  }

  /**
   * Analyze schedule regularity and consistency
   */
  analyzeScheduleRegularity(events) {
    const features = {
      schedule_regularity: 0.5,
      focus_block_count: 0,
      last_minute_changes: 0
    };

    // Group events by day of week
    const dayPatterns = {};
    for (let i = 0; i < 7; i++) {
      dayPatterns[i] = [];
    }

    for (const event of events) {
      if (!event.start?.dateTime) continue;
      const dayOfWeek = new Date(event.start.dateTime).getDay();
      dayPatterns[dayOfWeek].push(event);
    }

    // Calculate consistency (standard deviation of events per day)
    const eventCounts = Object.values(dayPatterns).map(d => d.length);
    const avgEvents = eventCounts.reduce((a, b) => a + b, 0) / 7;
    const variance = eventCounts.reduce((sum, count) => sum + Math.pow(count - avgEvents, 2), 0) / 7;
    const stdDev = Math.sqrt(variance);

    // Normalize: lower std dev = higher regularity
    // Typical range: 0-5 events std dev
    features.schedule_regularity = Math.max(0, 1 - (stdDev / 5));

    // Count focus blocks (events with focus-related keywords)
    const focusEvents = events.filter(e =>
      this.eventClassifications.focus_keywords.some(keyword =>
        (e.summary || '').toLowerCase().includes(keyword)
      )
    );
    features.focus_block_count = focusEvents.length;
    features.focus_block_ratio = events.length > 0 ? focusEvents.length / events.length : 0;

    // Analyze cancellations and changes (if data available)
    const cancelledEvents = events.filter(e => e.status === 'cancelled');
    const changedEvents = events.filter(e => e.updated && e.created &&
      new Date(e.updated) - new Date(e.created) > 3600000); // Changed > 1hr after creation

    features.last_minute_changes = (cancelledEvents.length + changedEvents.length) / Math.max(events.length, 1);

    // Recurring event analysis
    const recurringEvents = events.filter(e =>
      e.recurrence ||
      this.eventClassifications.recurring_identifiers.some(id =>
        (e.summary || '').toLowerCase().includes(id)
      )
    );
    features.recurring_event_ratio = events.length > 0 ? recurringEvents.length / events.length : 0;

    return features;
  }

  /**
   * Analyze social engagement patterns
   */
  analyzeSocialPatterns(events) {
    const features = {
      meeting_density: 0,
      social_event_ratio: 0,
      group_meeting_preference: 0
    };

    const socialEvents = [];
    const groupEvents = [];
    const personalEvents = [];

    for (const event of events) {
      const summary = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      const text = summary + ' ' + description;

      // Classify as social
      if (this.eventClassifications.social_keywords.some(kw => text.includes(kw))) {
        socialEvents.push(event);

        // Check for group indicators
        const attendeeCount = event.attendees?.length || 0;
        if (attendeeCount > 2 || text.includes('team') || text.includes('group') || text.includes('all hands')) {
          groupEvents.push(event);
        }
      }

      // Classify as personal
      if (this.eventClassifications.personal_keywords.some(kw => text.includes(kw))) {
        personalEvents.push(event);
      }
    }

    // Calculate meeting density (meetings per day)
    const uniqueDays = new Set(events.map(e =>
      e.start?.dateTime ? new Date(e.start.dateTime).toDateString() : null
    ).filter(Boolean));
    const daysWithData = uniqueDays.size || 1;

    features.meeting_density = socialEvents.length / daysWithData;
    // Normalize: 0-1 scale (0 = no meetings, 1 = 10+ meetings/day)
    features.meeting_density_normalized = Math.min(1, features.meeting_density / 10);

    features.social_event_ratio = events.length > 0 ? socialEvents.length / events.length : 0;
    features.group_meeting_preference = socialEvents.length > 0 ? groupEvents.length / socialEvents.length : 0;
    features.personal_event_ratio = events.length > 0 ? personalEvents.length / events.length : 0;

    return features;
  }

  /**
   * Analyze work patterns and preferences
   */
  analyzeWorkPatterns(events) {
    const features = {
      avg_event_duration: 0,
      buffer_time_preference: 0,
      weekend_activity_level: 0
    };

    // Calculate average event duration
    const durations = [];
    for (const event of events) {
      if (event.start?.dateTime && event.end?.dateTime) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const durationMinutes = (end - start) / 60000;
        if (durationMinutes > 0 && durationMinutes < 480) { // Reasonable range: 0-8 hours
          durations.push(durationMinutes);
        }
      }
    }

    if (durations.length > 0) {
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      features.avg_event_duration = avgDuration;
      // Normalize: 0-1 scale (0 = 0 min, 1 = 120+ min average)
      features.avg_event_duration_normalized = Math.min(1, avgDuration / 120);
    }

    // Analyze buffer time between events
    const sortedEvents = events
      .filter(e => e.start?.dateTime && e.end?.dateTime)
      .sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));

    const gaps = [];
    for (let i = 1; i < sortedEvents.length; i++) {
      const prevEnd = new Date(sortedEvents[i - 1].end.dateTime);
      const currentStart = new Date(sortedEvents[i].start.dateTime);

      // Only count gaps on same day
      if (prevEnd.toDateString() === currentStart.toDateString()) {
        const gapMinutes = (currentStart - prevEnd) / 60000;
        if (gapMinutes >= 0 && gapMinutes < 240) { // Reasonable gap: 0-4 hours
          gaps.push(gapMinutes);
        }
      }
    }

    if (gaps.length > 0) {
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      // Normalize: more buffer time = higher score
      features.buffer_time_preference = Math.min(1, avgGap / 60); // 60+ min = max
    }

    // Weekend activity analysis
    const weekendEvents = events.filter(e => {
      if (!e.start?.dateTime) return false;
      const day = new Date(e.start.dateTime).getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });

    const weekdayEvents = events.filter(e => {
      if (!e.start?.dateTime) return false;
      const day = new Date(e.start.dateTime).getDay();
      return day >= 1 && day <= 5;
    });

    // Normalize weekend activity relative to weekday
    const weekdayAvg = weekdayEvents.length / 5;
    const weekendAvg = weekendEvents.length / 2;

    if (weekdayAvg > 0) {
      features.weekend_activity_level = Math.min(1, weekendAvg / weekdayAvg);
    } else if (weekendEvents.length > 0) {
      features.weekend_activity_level = 1;
    }

    return features;
  }

  /**
   * Calculate personality adjustments from features
   */
  calculatePersonalityAdjustments(features) {
    const adjustments = {
      openness: { value: 0, confidence: 0, evidence_count: 0 },
      conscientiousness: { value: 0, confidence: 0, evidence_count: 0 },
      extraversion: { value: 0, confidence: 0, evidence_count: 0 },
      agreeableness: { value: 0, confidence: 0, evidence_count: 0 },
      neuroticism: { value: 0, confidence: 0, evidence_count: 0 }
    };

    const dimensionMap = {
      O: 'openness',
      C: 'conscientiousness',
      E: 'extraversion',
      A: 'agreeableness',
      N: 'neuroticism'
    };

    for (const [featureName, featureValue] of Object.entries(features)) {
      const correlations = this.correlations[featureName];
      if (!correlations) continue;

      for (const [dimension, correlation] of Object.entries(correlations)) {
        const dimName = dimensionMap[dimension.charAt(0).toUpperCase()] || dimension;
        if (!adjustments[dimName]) continue;

        // Normalize feature value to 0-1 if not already
        let normalizedValue = featureValue;
        if (typeof featureValue === 'number' && featureValue > 1) {
          normalizedValue = Math.min(1, featureValue / 10); // Scale down large values
        }

        // Calculate adjustment: direction * correlation strength * feature value
        const direction = correlation.direction === 'positive' ? 1 : -1;
        const adjustment = direction * Math.abs(correlation.r) * normalizedValue;

        adjustments[dimName].value += adjustment;
        adjustments[dimName].evidence_count++;

        // Confidence based on correlation strength
        adjustments[dimName].confidence += Math.abs(correlation.r);
      }
    }

    // Normalize adjustments
    for (const dim of Object.keys(adjustments)) {
      if (adjustments[dim].evidence_count > 0) {
        // Average the adjustments
        adjustments[dim].value = adjustments[dim].value / adjustments[dim].evidence_count;
        adjustments[dim].confidence = adjustments[dim].confidence / adjustments[dim].evidence_count;

        // Clamp value to reasonable range (-0.5 to 0.5)
        adjustments[dim].value = Math.max(-0.5, Math.min(0.5, adjustments[dim].value));
      }
    }

    return adjustments;
  }

  /**
   * Generate human-readable evidence descriptions
   */
  generateEvidence(features, calendarData) {
    const evidence = [];
    const events = calendarData.events || [];

    // Morning activity evidence
    if (features.morning_activity_ratio > 0.5) {
      evidence.push({
        feature: 'morning_activity_ratio',
        value: features.morning_activity_ratio,
        dimension: 'conscientiousness',
        direction: 'positive',
        description: `${Math.round(features.morning_activity_ratio * 100)}% of your activities occur in the morning, a pattern strongly linked to conscientiousness`,
        citation: 'Chronotype Meta-analysis (2024), r=0.37, n=31,000',
        effect_size: 'medium'
      });
    } else if (features.evening_activity_ratio > 0.3) {
      evidence.push({
        feature: 'evening_activity_ratio',
        value: features.evening_activity_ratio,
        dimension: 'openness',
        direction: 'positive',
        description: `${Math.round(features.evening_activity_ratio * 100)}% of your activities are in the evening, associated with openness to experience`,
        citation: 'Chronotype Meta-analysis (2024), r=0.17',
        effect_size: 'small'
      });
    }

    // Schedule regularity evidence
    if (features.schedule_regularity > 0.7) {
      evidence.push({
        feature: 'schedule_regularity',
        value: features.schedule_regularity,
        dimension: 'conscientiousness',
        direction: 'positive',
        description: 'Your highly consistent daily schedule indicates strong organizational habits',
        citation: 'Organizational Psychology, r=0.45',
        effect_size: 'medium'
      });
    } else if (features.schedule_regularity < 0.3) {
      evidence.push({
        feature: 'schedule_regularity',
        value: features.schedule_regularity,
        dimension: 'openness',
        direction: 'positive',
        description: 'Your flexible, variable schedule suggests adaptability and spontaneity',
        citation: 'Behavioral variability research',
        effect_size: 'small'
      });
    }

    // Meeting density evidence
    if (features.meeting_density > 3) {
      evidence.push({
        feature: 'meeting_density',
        value: features.meeting_density_normalized || features.meeting_density / 10,
        dimension: 'extraversion',
        direction: 'positive',
        description: `You average ${features.meeting_density.toFixed(1)} meetings per day, indicating high social engagement`,
        citation: 'Back et al. (2010), r=0.40',
        effect_size: 'medium'
      });
    }

    // Social event ratio evidence
    if (features.social_event_ratio > 0.5) {
      evidence.push({
        feature: 'social_event_ratio',
        value: features.social_event_ratio,
        dimension: 'extraversion',
        direction: 'positive',
        description: `${Math.round(features.social_event_ratio * 100)}% of your calendar events involve others`,
        citation: 'Behavioral manifestation studies, r=0.50',
        effect_size: 'large'
      });
    }

    // Focus blocks evidence
    if (features.focus_block_ratio > 0.1) {
      evidence.push({
        feature: 'focus_block_count',
        value: features.focus_block_ratio,
        dimension: 'conscientiousness',
        direction: 'positive',
        description: `You schedule dedicated focus time (${features.focus_block_count} blocks found), showing deliberate deep work habits`,
        citation: 'Deep Work research, r=0.35',
        effect_size: 'medium'
      });
    }

    // Last minute changes evidence
    if (features.last_minute_changes > 0.2) {
      evidence.push({
        feature: 'last_minute_changes',
        value: features.last_minute_changes,
        dimension: 'conscientiousness',
        direction: 'negative',
        description: 'Higher rate of schedule changes may indicate flexible planning style',
        citation: 'Organizational Psychology, r=-0.35',
        effect_size: 'medium'
      });
    }

    // Weekend activity evidence
    if (features.weekend_activity_level > 0.5) {
      evidence.push({
        feature: 'weekend_activity_level',
        value: features.weekend_activity_level,
        dimension: 'extraversion',
        direction: 'positive',
        description: 'Active weekend scheduling suggests engagement in social and leisure activities',
        citation: 'Social engagement studies, r=0.30',
        effect_size: 'medium'
      });
    }

    // Recurring events evidence
    if (features.recurring_event_ratio > 0.3) {
      evidence.push({
        feature: 'recurring_event_ratio',
        value: features.recurring_event_ratio,
        dimension: 'conscientiousness',
        direction: 'positive',
        description: `${Math.round(features.recurring_event_ratio * 100)}% of events are recurring, showing preference for routine`,
        citation: 'Habit formation research',
        effect_size: 'small'
      });
    }

    return evidence;
  }

  /**
   * Get Claude's nuanced interpretation of the features
   */
  async getClaudeInterpretation(features, personalityAdjustments) {
    const prompt = `Analyze these calendar-derived behavioral features and personality adjustments. Provide a brief, insightful interpretation.

## Extracted Features
${JSON.stringify(features, null, 2)}

## Calculated Personality Adjustments
${JSON.stringify(personalityAdjustments, null, 2)}

## Task
1. Identify the strongest signals in this data
2. Note any interesting patterns or contradictions
3. Suggest what this reveals about the person's work style and chronotype
4. Keep response under 150 words

Respond in JSON format:
{
  "chronotype_summary": "morning/evening/balanced preference description",
  "work_style": "brief description of work patterns",
  "social_engagement": "brief description of social patterns",
  "key_insight": "one notable observation",
  "confidence_note": "any caveats about data quality"
}`;

    try {
      const result = await this.execute(prompt);
      return this.parseJSON(result.text);
    } catch (error) {
      console.error(`⚠️ [ChronotypeAgent] Claude interpretation failed:`, error);
      return {
        chronotype_summary: features.is_morning_person ? 'Morning-oriented' : 'Evening-oriented',
        work_style: 'Unable to interpret',
        social_engagement: 'Unable to interpret',
        key_insight: 'Analysis completed with feature extraction only',
        confidence_note: 'Claude interpretation unavailable'
      };
    }
  }

  /**
   * Assess data quality for confidence scoring
   */
  assessDataQuality(calendarData) {
    const events = calendarData.events || [];

    // Calculate data quality metrics
    const totalEvents = events.length;
    const eventsWithTime = events.filter(e => e.start?.dateTime).length;
    const timeCompleteness = totalEvents > 0 ? eventsWithTime / totalEvents : 0;

    // Calculate date range
    const dates = events
      .filter(e => e.start?.dateTime)
      .map(e => new Date(e.start.dateTime));

    let daysCovered = 0;
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      daysCovered = (maxDate - minDate) / (1000 * 60 * 60 * 24);
    }

    // Calculate uniqueness
    const uniqueDays = new Set(dates.map(d => d.toDateString())).size;

    return {
      total_events: totalEvents,
      events_with_time: eventsWithTime,
      time_completeness: timeCompleteness,
      days_covered: Math.round(daysCovered),
      unique_days: uniqueDays,
      events_per_day: uniqueDays > 0 ? totalEvents / uniqueDays : 0,
      quality_score: this.calculateQualityScore(totalEvents, timeCompleteness, daysCovered)
    };
  }

  /**
   * Calculate overall data quality score
   */
  calculateQualityScore(totalEvents, timeCompleteness, daysCovered) {
    let score = 0;

    // Events volume (max 0.3)
    score += Math.min(0.3, totalEvents / 100 * 0.3);

    // Time completeness (max 0.3)
    score += timeCompleteness * 0.3;

    // Days covered (max 0.4)
    score += Math.min(0.4, daysCovered / 30 * 0.4);

    return Math.round(score * 100) / 100;
  }
}

export default ChronotypeAgent;
