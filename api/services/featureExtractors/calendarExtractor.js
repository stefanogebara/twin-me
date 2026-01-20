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
 * - Time management score → Conscientiousness (r=0.375)
 * - Social contact frequency → Extraversion (r=0.35)
 * - Weekend activity pattern → Extraversion/Openness
 * - Event diversity → Openness (r=0.30)
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

      // ==========================================
      // NEW RESEARCH-BACKED FEATURES (2025)
      // ==========================================

      // 8. Time Management Score (Conscientiousness)
      const timeManagement = this.calculateTimeManagementScore(events);
      if (timeManagement !== null) {
        features.push(this.createFeature(userId, 'time_management_score', timeManagement.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.375,
          description: 'Overall time management effectiveness based on scheduling patterns',
          evidence: { correlation: 0.375, citation: 'Marengo et al. (2023)' },
          raw_value: timeManagement.rawValue
        }));
      }

      // 9. Social Contact Frequency (Extraversion)
      const socialContactFrequency = this.calculateSocialContactFrequency(events);
      if (socialContactFrequency !== null) {
        features.push(this.createFeature(userId, 'social_contact_frequency', socialContactFrequency.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.35,
          description: 'Frequency of scheduled social interactions',
          evidence: { correlation: 0.35, citation: 'Marengo et al. (2023)' },
          raw_value: socialContactFrequency.rawValue
        }));
      }

      // 10. Meeting Preparation Time (Conscientiousness) - matches correlation key
      const meetingPrepTime = this.calculateMeetingPreparationTime(events);
      if (meetingPrepTime !== null) {
        features.push(this.createFeature(userId, 'meeting_preparation_time', meetingPrepTime.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.32,
          description: 'Average time allocated before meetings for preparation',
          evidence: { correlation: 0.32, citation: 'Personality research' },
          raw_value: meetingPrepTime.rawValue
        }));
      }

      // 11. Weekend Activity Pattern (Extraversion/Openness)
      const weekendActivity = this.calculateWeekendActivityPattern(events);
      if (weekendActivity !== null) {
        features.push(this.createFeature(userId, 'weekend_activity_pattern', weekendActivity.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.28,
          description: 'Activity level during weekends',
          evidence: { correlation: 0.28, note: 'Active weekends = higher extraversion' },
          raw_value: weekendActivity.rawValue
        }));
      }

      // 12. Event Diversity (Openness)
      const eventDiversity = this.calculateEventDiversity(events);
      if (eventDiversity !== null) {
        features.push(this.createFeature(userId, 'event_diversity', eventDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.30,
          description: 'Variety in types of scheduled events',
          evidence: { correlation: 0.30, citation: 'Personality calendar research' },
          raw_value: eventDiversity.rawValue
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

  // ==========================================
  // NEW RESEARCH-BACKED CALCULATION METHODS
  // ==========================================

  /**
   * Calculate time management score
   * Research: Marengo et al. (2023) - Conscientiousness r=0.375
   */
  calculateTimeManagementScore(events) {
    if (events.length < 5) return null;

    let score = 0;
    let factors = 0;

    // Factor 1: Events start on time (round numbers like :00, :30)
    const punctualEvents = events.filter(e => {
      const startMinute = new Date(e.start_time).getMinutes();
      return startMinute === 0 || startMinute === 30 || startMinute === 15 || startMinute === 45;
    }).length;
    const punctualityScore = (punctualEvents / events.length) * 100;
    score += punctualityScore;
    factors++;

    // Factor 2: Appropriate gaps between events (not too tight, not too loose)
    const gaps = [];
    for (let i = 1; i < events.length; i++) {
      const prevEnd = new Date(events[i - 1].end_time);
      const currStart = new Date(events[i].start_time);
      const gapMinutes = (currStart - prevEnd) / (1000 * 60);
      if (gapMinutes > 0 && gapMinutes < 480) {
        gaps.push(gapMinutes);
      }
    }
    if (gaps.length > 0) {
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      // Ideal gap: 15-60 minutes
      const gapScore = avgGap >= 15 && avgGap <= 60 ? 100 :
                       avgGap < 15 ? (avgGap / 15) * 100 :
                       Math.max(0, 100 - ((avgGap - 60) / 120) * 100);
      score += gapScore;
      factors++;
    }

    // Factor 3: Low conflict rate
    let conflicts = 0;
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const start1 = new Date(events[i].start_time);
        const end1 = new Date(events[i].end_time);
        const start2 = new Date(events[j].start_time);
        const end2 = new Date(events[j].end_time);
        if (start1 < end2 && start2 < end1) conflicts++;
      }
    }
    const conflictRate = conflicts / events.length;
    const conflictScore = Math.max(0, 100 - conflictRate * 200);
    score += conflictScore;
    factors++;

    // Factor 4: Consistent event duration
    const durations = events.map(e => {
      return (new Date(e.end_time) - new Date(e.start_time)) / (1000 * 60);
    }).filter(d => d > 0 && d < 480);
    if (durations.length > 3) {
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
      const cv = Math.sqrt(variance) / mean;
      const consistencyScore = Math.max(0, 100 - cv * 100);
      score += consistencyScore;
      factors++;
    }

    if (factors === 0) return null;

    const finalScore = score / factors;

    return {
      value: Math.round(finalScore * 100) / 100,
      rawValue: {
        punctuality_percent: Math.round(punctualityScore),
        conflict_count: conflicts,
        events_analyzed: events.length
      }
    };
  }

  /**
   * Calculate social contact frequency
   * Research: Marengo et al. (2023) - Extraversion r=0.35
   */
  calculateSocialContactFrequency(events) {
    // Count events with multiple attendees (social interactions)
    const socialEvents = events.filter(e => {
      const attendees = e.attendees || e.raw_data?.attendees || [];
      return attendees.length > 1;
    });

    // Count events with titles suggesting social activity
    const socialKeywords = ['coffee', 'lunch', 'dinner', 'drinks', 'party', 'birthday', 'happy hour',
                           'team', 'catch up', '1:1', '1-on-1', 'one on one', 'social', 'networking'];
    const socialTitleEvents = events.filter(e => {
      const title = (e.title || e.summary || '').toLowerCase();
      return socialKeywords.some(keyword => title.includes(keyword));
    });

    // Unique social events (combine both indicators)
    const allSocialEventIds = new Set([
      ...socialEvents.map(e => e.id || e.start_time),
      ...socialTitleEvents.map(e => e.id || e.start_time)
    ]);

    const totalSocialEvents = allSocialEventIds.size;
    const weeks = this.LOOKBACK_DAYS / 7;
    const socialEventsPerWeek = totalSocialEvents / weeks;

    // Normalize: 0-10+ social events per week = 0-100
    const normalizedScore = Math.min(100, (socialEventsPerWeek / 10) * 100);

    return {
      value: Math.round(normalizedScore * 100) / 100,
      rawValue: {
        social_events_count: totalSocialEvents,
        social_events_per_week: Math.round(socialEventsPerWeek * 10) / 10
      }
    };
  }

  /**
   * Calculate meeting preparation time
   * Similar to calculatePreparationTime but with rawValue output
   */
  calculateMeetingPreparationTime(events) {
    const bufferTimes = [];

    for (let i = 1; i < events.length; i++) {
      const prevEvent = events[i - 1];
      const currEvent = events[i];

      // Check if current event is a meeting
      const isMeeting = (currEvent.attendees || currEvent.raw_data?.attendees || []).length > 1 ||
                        (currEvent.title || currEvent.summary || '').toLowerCase().includes('meeting');

      if (!isMeeting) continue;

      const prevEnd = new Date(prevEvent.end_time);
      const currStart = new Date(currEvent.start_time);
      const gapMinutes = (currStart - prevEnd) / (1000 * 60);

      // Only consider same-day gaps (prep time, not overnight)
      if (gapMinutes > 0 && gapMinutes < 480) {
        bufferTimes.push(gapMinutes);
      }
    }

    if (bufferTimes.length === 0) return null;

    const avgBuffer = bufferTimes.reduce((sum, t) => sum + t, 0) / bufferTimes.length;

    // Normalize: 0-60+ minutes = 0-100
    const normalized = Math.min(100, (avgBuffer / 60) * 100);

    return {
      value: Math.round(normalized * 100) / 100,
      rawValue: {
        avg_prep_minutes: Math.round(avgBuffer),
        meetings_with_buffer: bufferTimes.length
      }
    };
  }

  /**
   * Calculate weekend activity pattern
   * Research: Active weekends correlate with extraversion
   */
  calculateWeekendActivityPattern(events) {
    const weekdayEvents = [];
    const weekendEvents = [];

    events.forEach(event => {
      const dayOfWeek = new Date(event.start_time).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendEvents.push(event);
      } else {
        weekdayEvents.push(event);
      }
    });

    if (events.length < 5) return null;

    // Calculate events per day for weekday vs weekend
    const weekdayDays = (this.LOOKBACK_DAYS / 7) * 5;
    const weekendDays = (this.LOOKBACK_DAYS / 7) * 2;

    const weekdayDensity = weekdayEvents.length / weekdayDays;
    const weekendDensity = weekendEvents.length / weekendDays;

    // Ratio of weekend activity to weekday activity
    // Higher ratio = more active weekends = higher extraversion
    const activityRatio = weekdayDensity > 0 ? weekendDensity / weekdayDensity : 0;

    // Also consider absolute weekend activity
    const weekendEventsPerDay = weekendDensity;

    // Combine: weighted by ratio and absolute activity
    const activityScore = Math.min(100, (activityRatio * 50) + (weekendEventsPerDay * 25));

    return {
      value: Math.round(activityScore * 100) / 100,
      rawValue: {
        weekend_events: weekendEvents.length,
        weekday_events: weekdayEvents.length,
        weekend_weekday_ratio: Math.round(activityRatio * 100) / 100
      }
    };
  }

  /**
   * Calculate event diversity
   * Research: Variety in events correlates with openness
   */
  calculateEventDiversity(events) {
    if (events.length < 5) return null;

    // Classify events into categories based on title/type
    const categories = {
      work_meeting: 0,
      social: 0,
      exercise: 0,
      learning: 0,
      personal: 0,
      travel: 0,
      entertainment: 0,
      health: 0,
      other: 0
    };

    events.forEach(event => {
      const title = (event.title || event.summary || '').toLowerCase();
      const type = event.event_type || '';

      if (title.includes('meeting') || title.includes('standup') || title.includes('sync') || type === 'meeting') {
        categories.work_meeting++;
      } else if (title.includes('gym') || title.includes('workout') || title.includes('run') ||
                 title.includes('yoga') || title.includes('exercise') || title.includes('fitness')) {
        categories.exercise++;
      } else if (title.includes('lunch') || title.includes('dinner') || title.includes('party') ||
                 title.includes('drinks') || title.includes('coffee') || title.includes('birthday')) {
        categories.social++;
      } else if (title.includes('class') || title.includes('course') || title.includes('learn') ||
                 title.includes('study') || title.includes('training') || title.includes('workshop')) {
        categories.learning++;
      } else if (title.includes('flight') || title.includes('hotel') || title.includes('trip') ||
                 title.includes('vacation') || title.includes('travel')) {
        categories.travel++;
      } else if (title.includes('movie') || title.includes('concert') || title.includes('show') ||
                 title.includes('game') || title.includes('play')) {
        categories.entertainment++;
      } else if (title.includes('doctor') || title.includes('dentist') || title.includes('therapy') ||
                 title.includes('appointment') || title.includes('checkup')) {
        categories.health++;
      } else if (title.length > 0) {
        categories.personal++;
      } else {
        categories.other++;
      }
    });

    // Calculate Shannon entropy for diversity
    const total = events.length;
    let entropy = 0;
    const usedCategories = Object.values(categories).filter(c => c > 0);

    usedCategories.forEach(count => {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    });

    // Normalize: max entropy = log2(9 categories) ≈ 3.17
    const maxEntropy = Math.log2(Object.keys(categories).length);
    const diversityScore = (entropy / maxEntropy) * 100;

    // Bonus for having many categories represented
    const categoryBonus = Math.min(30, usedCategories.length * 5);
    const finalScore = Math.min(100, diversityScore * 0.7 + categoryBonus);

    return {
      value: Math.round(finalScore * 100) / 100,
      rawValue: {
        categories_used: usedCategories.length,
        top_category: Object.entries(categories).sort((a, b) => b[1] - a[1])[0][0],
        entropy: Math.round(entropy * 100) / 100
      }
    };
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
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || null
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
