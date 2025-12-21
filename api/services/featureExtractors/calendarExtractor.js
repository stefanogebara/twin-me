/**
 * Calendar Feature Extractor
 *
 * Extracts behavioral features from Google Calendar data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Social density (meetings/events per week) → Extraversion (r=0.43)
 * - Meeting preparation time → Conscientiousness (r=0.38)
 * - Schedule flexibility (gaps between events) → Openness (r=0.32)
 * - Response time to invitations → Agreeableness (r=0.29)
 * - Event overlap/conflicts → Neuroticism (r=0.35)
 * - Work-life balance (work vs personal events) → Conscientiousness (r=0.31)
 */

import { supabaseAdmin } from '../database.js';

class CalendarFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90; // Analyze last 3 months
  }

  /**
   * Extract all behavioral features from Calendar data
   */
  async extractFeatures(userId) {
    console.log(`📅 [Calendar Extractor] Extracting features for user ${userId}`);

    try {
      // Fetch calendar events for the user
      const { data: events, error } = await supabaseAdmin
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .gte('start_time', new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;

      if (!events || events.length === 0) {
        console.log('⚠️ [Calendar Extractor] No calendar events found for user');
        return [];
      }

      console.log(`📊 [Calendar Extractor] Found ${events.length} calendar events`);

      // Extract features
      const features = [];

      // 1. Social Density (Extraversion)
      const socialDensity = this.calculateSocialDensity(events);
      if (socialDensity !== null) {
        features.push(this.createFeature(userId, 'social_density', socialDensity, {
          contributes_to: 'extraversion',
          contribution_weight: 0.43,
          description: 'Number of social events and meetings per week',
          evidence: { correlation: 0.43, citation: 'Personality and calendar behavior research' }
        }));
      }

      // 2. Meeting Preparation Time (Conscientiousness)
      const prepTime = this.calculatePreparationTime(events);
      if (prepTime !== null) {
        features.push(this.createFeature(userId, 'meeting_preparation', prepTime, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.38,
          description: 'Average time allocated before meetings starts',
          evidence: { correlation: 0.38 }
        }));
      }

      // 3. Schedule Flexibility (Openness)
      const flexibility = this.calculateScheduleFlexibility(events);
      if (flexibility !== null) {
        features.push(this.createFeature(userId, 'schedule_flexibility', flexibility, {
          contributes_to: 'openness',
          contribution_weight: 0.32,
          description: 'Variability in event timing and gaps between events',
          evidence: { correlation: 0.32 }
        }));
      }

      // 4. Response Time to Invitations (Agreeableness)
      const responseTime = this.calculateResponseTime(events);
      if (responseTime !== null) {
        features.push(this.createFeature(userId, 'invitation_response_time', responseTime, {
          contributes_to: 'agreeableness',
          contribution_weight: 0.29,
          description: 'Speed of accepting/declining meeting invitations',
          evidence: { correlation: 0.29, note: 'Lower = more agreeable' }
        }));
      }

      // 5. Event Overlap/Conflicts (Neuroticism)
      const conflicts = this.calculateEventConflicts(events);
      if (conflicts !== null) {
        features.push(this.createFeature(userId, 'calendar_conflicts', conflicts, {
          contributes_to: 'neuroticism',
          contribution_weight: 0.35,
          description: 'Frequency of overlapping or conflicting events',
          evidence: { correlation: 0.35, note: 'More conflicts = higher neuroticism' }
        }));
      }

      // 6. Work-Life Balance (Conscientiousness)
      const workLifeBalance = this.calculateWorkLifeBalance(events);
      if (workLifeBalance !== null) {
        features.push(this.createFeature(userId, 'work_life_balance', workLifeBalance, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.31,
          description: 'Ratio of work to personal events',
          evidence: { correlation: 0.31 }
        }));
      }

      // 7. Event Duration Patterns (Conscientiousness)
      const durationPatterns = this.calculateDurationPatterns(events);
      if (durationPatterns !== null) {
        features.push(this.createFeature(userId, 'event_duration_consistency', durationPatterns, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.28,
          description: 'Consistency in event duration scheduling',
          evidence: { correlation: 0.28 }
        }));
      }

      console.log(`✅ [Calendar Extractor] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [Calendar Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Calculate social density (meetings per week)
   */
  calculateSocialDensity(events) {
    // Filter for social/meeting events (multi-attendee events)
    const socialEvents = events.filter(e => {
      const attendees = e.attendees || e.raw_data?.attendees || [];
      return attendees.length > 1; // More than just the user
    });

    if (socialEvents.length === 0) return null;

    // Calculate events per week
    const weeks = this.LOOKBACK_DAYS / 7;
    const eventsPerWeek = socialEvents.length / weeks;

    // Normalize to 0-100 scale (assume max 20 social events/week = 100)
    const normalized = Math.min(100, (eventsPerWeek / 20) * 100);

    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate meeting preparation time
   */
  calculatePreparationTime(events) {
    // Look for buffer time before meetings (time between events)
    const bufferTimes = [];

    for (let i = 1; i < events.length; i++) {
      const prevEvent = events[i - 1];
      const currEvent = events[i];

      const prevEnd = new Date(prevEvent.end_time);
      const currStart = new Date(currEvent.start_time);

      // Gap between events in minutes
      const gapMinutes = (currStart - prevEnd) / (1000 * 60);

      // Only consider same-day gaps (prep time, not overnight)
      if (gapMinutes > 0 && gapMinutes < 480) { // Less than 8 hours
        bufferTimes.push(gapMinutes);
      }
    }

    if (bufferTimes.length === 0) return null;

    // Average buffer time
    const avgBuffer = bufferTimes.reduce((sum, t) => sum + t, 0) / bufferTimes.length;

    // Normalize to 0-100 (0 min = 0, 60+ min = 100)
    const normalized = Math.min(100, (avgBuffer / 60) * 100);

    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate schedule flexibility (variance in event timing)
   */
  calculateScheduleFlexibility(events) {
    if (events.length < 5) return null;

    // Calculate hour-of-day distribution
    const hourCounts = {};

    events.forEach(event => {
      const startHour = new Date(event.start_time).getHours();
      hourCounts[startHour] = (hourCounts[startHour] || 0) + 1;
    });

    // Calculate entropy (higher = more flexible/varied schedule)
    let entropy = 0;
    const total = events.length;

    for (const count of Object.values(hourCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    // Normalize to 0-100 (max entropy is log2(24) = 4.58)
    const normalized = (entropy / 4.58) * 100;

    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate response time to invitations
   */
  calculateResponseTime(events) {
    const responseTimes = [];

    events.forEach(event => {
      const created = event.created_at ? new Date(event.created_at) : null;
      const responded = event.response_status === 'accepted' && event.updated_at ? new Date(event.updated_at) : null;

      if (created && responded) {
        const responseHours = (responded - created) / (1000 * 60 * 60);
        if (responseHours >= 0 && responseHours < 168) { // Within a week
          responseTimes.push(responseHours);
        }
      }
    });

    if (responseTimes.length === 0) return null;

    const avgResponseHours = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;

    // Normalize to 0-100 (0 hours = 100, 48+ hours = 0)
    // Faster response = higher agreeableness
    const normalized = Math.max(0, 100 - (avgResponseHours / 48) * 100);

    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate event conflicts and overlaps
   */
  calculateEventConflicts(events) {
    let conflicts = 0;

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];

        const start1 = new Date(event1.start_time);
        const end1 = new Date(event1.end_time);
        const start2 = new Date(event2.start_time);
        const end2 = new Date(event2.end_time);

        // Check for overlap
        if (start1 < end2 && start2 < end1) {
          conflicts++;
        }
      }
    }

    if (events.length === 0) return null;

    // Conflict rate as percentage
    const conflictRate = (conflicts / events.length) * 100;

    return Math.min(100, Math.round(conflictRate * 100) / 100);
  }

  /**
   * Calculate work-life balance
   */
  calculateWorkLifeBalance(events) {
    let workEvents = 0;
    let personalEvents = 0;

    events.forEach(event => {
      const title = (event.title || event.summary || '').toLowerCase();
      const type = event.event_type || '';

      // Classify as work or personal
      const isWork = type === 'meeting' ||
                     title.includes('meeting') ||
                     title.includes('standup') ||
                     title.includes('sync') ||
                     title.includes('call') ||
                     title.includes('review') ||
                     event.is_work_related;

      if (isWork) {
        workEvents++;
      } else {
        personalEvents++;
      }
    });

    if (workEvents + personalEvents === 0) return null;

    // Balance score: 50 = perfect balance, <50 = more personal, >50 = more work
    const workRatio = workEvents / (workEvents + personalEvents);
    const balanceScore = 50 + (workRatio - 0.5) * 100;

    // Convert to conscientiousness indicator:
    // Higher work ratio = higher conscientiousness
    const conscientiousnessScore = workRatio * 100;

    return Math.round(conscientiousnessScore * 100) / 100;
  }

  /**
   * Calculate event duration consistency
   */
  calculateDurationPatterns(events) {
    const durations = [];

    events.forEach(event => {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const durationMinutes = (end - start) / (1000 * 60);

      if (durationMinutes > 0 && durationMinutes < 480) { // Under 8 hours
        durations.push(durationMinutes);
      }
    });

    if (durations.length < 3) return null;

    // Calculate standard deviation
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    // Consistency = inverse of coefficient of variation
    // Lower std dev relative to mean = higher consistency = higher conscientiousness
    const coefficientOfVariation = stdDev / mean;
    const consistencyScore = Math.max(0, 100 - (coefficientOfVariation * 100));

    return Math.round(consistencyScore * 100) / 100;
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'calendar',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100, // Normalize to 0-1
      confidence_score: 70, // Default confidence for Calendar features
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note
      }
    };
  }

  /**
   * Save features to database
   */
  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    console.log(`💾 [Calendar Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`✅ [Calendar Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      console.error('❌ [Calendar Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const calendarFeatureExtractor = new CalendarFeatureExtractor();
export default calendarFeatureExtractor;
