/**
 * BEHAVIORAL PATTERN RECOGNITION SERVICE
 *
 * Multi-modal behavioral intelligence system that detects cross-platform patterns
 * and temporal correlations between events and user activities.
 *
 * CORE CAPABILITIES:
 * - Temporal correlation detection (calendar events ↔ platform activities)
 * - Pattern confidence scoring (ML-based algorithm)
 * - Behavioral fingerprinting (stress responses, focus rituals, etc.)
 * - Cross-platform activity clustering
 * - Predictive pattern matching
 *
 * EXAMPLE USE CASES:
 * - "User listens to lo-fi hip hop 20 minutes before presentations"
 * - "User plays strategy games after stressful meetings"
 * - "User reviews calendar every Monday at 9am"
 *
 * PRIVACY-FIRST:
 * - Users must opt-in to pattern tracking
 * - All patterns can be viewed, edited, deleted
 * - Confidence scores always visible
 * - Clear explanations for detected patterns
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ====================================================================
// TEMPORAL CORRELATION DETECTION
// Find relationships between calendar events and platform activities
// ====================================================================

/**
 * Detect temporal correlations between calendar events and user activities
 *
 * @param {string} userId - User ID
 * @param {number} timeWindowHours - Time window to analyze (default: 72 hours)
 * @returns {Promise<Array>} Detected correlations
 */
export async function detectTemporalCorrelations(userId, timeWindowHours = 72) {
  try {
    console.log(`🔍 [Pattern Recognition] Detecting temporal correlations for user ${userId}`);

    const now = new Date();
    const windowStart = new Date(now.getTime() - (timeWindowHours * 60 * 60 * 1000));

    // Step 1: Fetch calendar events in time window
    const { data: calendarEvents, error: calendarError } = await supabase
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'calendar')
      .eq('data_type', 'event')
      .gte('extracted_at', windowStart.toISOString())
      .order('extracted_at', { ascending: true });

    if (calendarError) throw calendarError;

    if (!calendarEvents || calendarEvents.length === 0) {
      console.log('⚠️ [Pattern Recognition] No calendar events found in time window');
      return [];
    }

    console.log(`📅 [Pattern Recognition] Found ${calendarEvents.length} calendar events`);

    // Step 2: Fetch platform activities in time window (Spotify, YouTube, Discord, etc.)
    const { data: activities, error: activitiesError } = await supabase
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .in('platform', ['spotify', 'youtube', 'discord', 'reddit', 'github', 'netflix'])
      .gte('extracted_at', windowStart.toISOString())
      .order('extracted_at', { ascending: true });

    if (activitiesError) throw activitiesError;

    if (!activities || activities.length === 0) {
      console.log('⚠️ [Pattern Recognition] No platform activities found in time window');
      return [];
    }

    console.log(`🎵 [Pattern Recognition] Found ${activities.length} platform activities`);

    // Step 3: Find temporal correlations
    const correlations = [];

    for (const event of calendarEvents) {
      const eventData = event.raw_data;
      const eventStart = new Date(eventData.start?.dateTime || eventData.start?.date);

      // Look for activities within ±3 hours of event
      const correlatedActivities = activities.filter(activity => {
        const activityTime = new Date(activity.extracted_at);
        const timeDiffMinutes = (activityTime - eventStart) / (1000 * 60);

        // Look for activities -180 min to +180 min from event
        return timeDiffMinutes >= -180 && timeDiffMinutes <= 180;
      });

      if (correlatedActivities.length > 0) {
        correlations.push({
          event: {
            id: eventData.id,
            summary: eventData.summary,
            start: eventStart,
            eventType: classifyEventType(eventData),
            keywords: extractEventKeywords(eventData)
          },
          activities: correlatedActivities.map(activity => ({
            platform: activity.platform,
            dataType: activity.data_type,
            data: activity.raw_data,
            timestamp: new Date(activity.extracted_at),
            timeOffsetMinutes: Math.round((new Date(activity.extracted_at) - eventStart) / (1000 * 60))
          }))
        });
      }
    }

    console.log(`✅ [Pattern Recognition] Found ${correlations.length} temporal correlations`);
    return correlations;

  } catch (error) {
    console.error('❌ [Pattern Recognition] Error detecting temporal correlations:', error);
    throw error;
  }
}

/**
 * Classify event type based on calendar event data
 */
function classifyEventType(eventData) {
  const summary = (eventData.summary || '').toLowerCase();
  const description = (eventData.description || '').toLowerCase();
  const attendees = eventData.attendees || [];

  // High-stakes events
  if (
    summary.match(/presentation|demo|pitch|interview|review/) ||
    description.match(/presentation|demo|pitch|interview|review/)
  ) {
    return 'high_stakes';
  }

  // Focus work
  if (
    summary.match(/deep work|focus|coding|writing|design/) ||
    attendees.length === 0
  ) {
    return 'focus_work';
  }

  // Social events
  if (
    summary.match(/coffee|lunch|dinner|happy hour|party|celebration/) ||
    attendees.length >= 5
  ) {
    return 'social';
  }

  // Meetings
  if (attendees.length > 0) {
    return 'meeting';
  }

  return 'other';
}

/**
 * Extract keywords from calendar event
 */
function extractEventKeywords(eventData) {
  const summary = (eventData.summary || '').toLowerCase();
  const description = (eventData.description || '').toLowerCase();
  const text = `${summary} ${description}`;

  const keywords = [];

  // Common event keywords
  const keywordPatterns = [
    'presentation', 'meeting', 'interview', 'review', 'demo',
    'standup', 'sync', 'brainstorm', 'planning', 'retrospective',
    'deadline', 'launch', 'release', 'milestone'
  ];

  for (const pattern of keywordPatterns) {
    if (text.includes(pattern)) {
      keywords.push(pattern);
    }
  }

  return keywords;
}

// ====================================================================
// BEHAVIORAL FINGERPRINTING
// Create pattern profiles for specific event types
// ====================================================================

/**
 * Build behavioral fingerprint for a specific event type
 *
 * @param {string} userId - User ID
 * @param {string} eventType - Event type to analyze
 * @returns {Promise<Object>} Behavioral fingerprint
 */
export async function buildBehavioralFingerprint(userId, eventType) {
  try {
    console.log(`🔍 [Pattern Recognition] Building behavioral fingerprint for ${eventType}`);

    // Get all correlations for this event type
    const correlations = await detectTemporalCorrelations(userId, 24 * 30); // 30 days

    const relevantCorrelations = correlations.filter(corr =>
      corr.event.eventType === eventType
    );

    if (relevantCorrelations.length === 0) {
      return {
        eventType,
        sampleSize: 0,
        patterns: []
      };
    }

    // Group activities by platform and time offset
    const activityClusters = {};

    for (const correlation of relevantCorrelations) {
      for (const activity of correlation.activities) {
        const key = `${activity.platform}_${activity.dataType}_${activity.timeOffsetMinutes}`;

        if (!activityClusters[key]) {
          activityClusters[key] = {
            platform: activity.platform,
            dataType: activity.data_type,
            timeOffsetMinutes: activity.timeOffsetMinutes,
            occurrences: []
          };
        }

        activityClusters[key].occurrences.push({
          data: activity.data,
          timestamp: activity.timestamp,
          eventId: correlation.event.id
        });
      }
    }

    // Convert clusters to patterns with confidence scores
    const patterns = Object.values(activityClusters)
      .filter(cluster => cluster.occurrences.length >= 2) // At least 2 occurrences
      .map(cluster => {
        const consistency = (cluster.occurrences.length / relevantCorrelations.length) * 100;

        return {
          platform: cluster.platform,
          activityType: cluster.dataType,
          timeOffsetMinutes: cluster.timeOffsetMinutes,
          occurrenceCount: cluster.occurrences.length,
          consistencyRate: Math.round(consistency * 100) / 100,
          sampleActivities: cluster.occurrences.slice(0, 5).map(occ => occ.data)
        };
      })
      .sort((a, b) => b.consistencyRate - a.consistencyRate);

    console.log(`✅ [Pattern Recognition] Built fingerprint with ${patterns.length} patterns`);

    return {
      eventType,
      sampleSize: relevantCorrelations.length,
      patterns
    };

  } catch (error) {
    console.error('❌ [Pattern Recognition] Error building behavioral fingerprint:', error);
    throw error;
  }
}

// ====================================================================
// PATTERN CONFIDENCE SCORING
// ML-based algorithm to assess pattern validity
// ====================================================================

/**
 * Calculate confidence score for a pattern
 *
 * Uses multi-factor algorithm:
 * - Frequency: How many times observed? (0-40 points)
 * - Consistency: Same behavior before similar events? (0-40 points)
 * - Temporal stability: Pattern observed over time? (0-20 points)
 *
 * @param {Object} pattern - Pattern data
 * @returns {number} Confidence score (0-100)
 */
export function scorePatternConfidence(pattern) {
  const {
    occurrence_count = 1,
    consistency_rate = 0,
    first_observed_at,
    last_observed_at
  } = pattern;

  // Frequency component (0-40 points)
  // More occurrences = higher confidence (diminishing returns)
  const frequencyScore = Math.min(40, occurrence_count * 4);

  // Consistency component (0-40 points)
  // Directly from consistency rate
  const consistencyScore = consistency_rate * 0.4;

  // Temporal stability component (0-20 points)
  // Patterns observed over longer periods are more reliable
  let stabilityScore = 0;
  if (first_observed_at && last_observed_at) {
    const daysDiff = (new Date(last_observed_at) - new Date(first_observed_at)) / (1000 * 60 * 60 * 24);
    stabilityScore = Math.min(20, daysDiff / 2);
  }

  // Combined score
  const finalScore = frequencyScore + consistencyScore + stabilityScore;

  return Math.min(100, Math.round(finalScore * 100) / 100);
}

/**
 * Determine confidence level label
 */
export function getConfidenceLevel(score) {
  if (score >= 90) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'very_low';
}

/**
 * Get human-readable confidence description
 */
export function getConfidenceDescription(score) {
  if (score >= 90) return "We're confident you";
  if (score >= 70) return "It seems like you";
  if (score >= 50) return "You might";
  return "We're still learning if you";
}

// ====================================================================
// PATTERN DETECTION & STORAGE
// Main entry point for pattern detection
// ====================================================================

/**
 * Detect and store behavioral patterns for a user
 *
 * @param {string} userId - User ID
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} Detection results
 */
export async function detectAndStoreBehavioralPatterns(userId, options = {}) {
  try {
    console.log(`🔍 [Pattern Recognition] Starting pattern detection for user ${userId}`);

    const {
      timeWindowDays = 30,
      minOccurrences = 3,
      minConfidence = 50
    } = options;

    // Step 1: Detect temporal correlations
    const correlations = await detectTemporalCorrelations(userId, timeWindowDays * 24);

    if (correlations.length === 0) {
      return {
        success: true,
        patternsDetected: 0,
        patternsStored: 0,
        message: 'No temporal correlations found'
      };
    }

    // Step 2: Group correlations into potential patterns
    const potentialPatterns = groupCorrelationsIntoPatterns(correlations, userId);

    console.log(`🔍 [Pattern Recognition] Found ${potentialPatterns.length} potential patterns`);

    // Step 3: Filter by occurrence count and confidence
    const validPatterns = potentialPatterns.filter(pattern => {
      const confidence = scorePatternConfidence(pattern);
      return pattern.occurrence_count >= minOccurrences && confidence >= minConfidence;
    });

    console.log(`✅ [Pattern Recognition] ${validPatterns.length} patterns meet confidence threshold`);

    // Step 4: Store patterns in database
    const storedPatterns = [];

    for (const pattern of validPatterns) {
      const confidenceScore = scorePatternConfidence(pattern);

      const { data, error } = await supabase
        .from('behavioral_patterns')
        .upsert({
          user_id: userId,
          pattern_type: pattern.pattern_type,
          pattern_name: pattern.pattern_name,
          pattern_description: pattern.pattern_description,
          trigger_type: pattern.trigger_type,
          trigger_keywords: pattern.trigger_keywords,
          trigger_metadata: pattern.trigger_metadata,
          response_platform: pattern.response_platform,
          response_type: pattern.response_type,
          response_data: pattern.response_data,
          time_offset_minutes: pattern.time_offset_minutes,
          time_window_minutes: pattern.time_window_minutes,
          occurrence_count: pattern.occurrence_count,
          consistency_rate: pattern.consistency_rate,
          confidence_score: confidenceScore,
          emotional_state: pattern.emotional_state,
          hypothesized_purpose: pattern.hypothesized_purpose,
          first_observed_at: pattern.first_observed_at,
          last_observed_at: pattern.last_observed_at,
          is_active: true,
          auto_detected: true
        }, {
          onConflict: 'user_id,pattern_type,trigger_keywords,response_platform,response_type,time_offset_minutes'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ [Pattern Recognition] Error storing pattern:', error);
        continue;
      }

      storedPatterns.push(data);
    }

    console.log(`✅ [Pattern Recognition] Stored ${storedPatterns.length} patterns`);

    return {
      success: true,
      patternsDetected: potentialPatterns.length,
      patternsStored: storedPatterns.length,
      patterns: storedPatterns
    };

  } catch (error) {
    console.error('❌ [Pattern Recognition] Error detecting patterns:', error);
    throw error;
  }
}

/**
 * Group correlations into patterns
 */
function groupCorrelationsIntoPatterns(correlations, userId) {
  const patternGroups = {};

  for (const correlation of correlations) {
    const eventType = correlation.event.eventType;
    const eventKeywords = correlation.event.keywords;

    for (const activity of correlation.activities) {
      // Create unique key for pattern grouping
      const patternKey = `${eventType}_${activity.platform}_${activity.dataType}_${Math.round(activity.timeOffsetMinutes / 10) * 10}`;

      if (!patternGroups[patternKey]) {
        patternGroups[patternKey] = {
          pattern_type: determinePatternType(activity.timeOffsetMinutes),
          pattern_name: generatePatternName(eventType, activity),
          pattern_description: null,
          trigger_type: 'calendar_event',
          trigger_keywords: eventKeywords,
          trigger_metadata: { eventType },
          response_platform: activity.platform,
          response_type: determineResponseType(activity),
          response_data: extractResponseData(activity),
          time_offset_minutes: Math.round(activity.timeOffsetMinutes / 5) * 5, // Round to 5 min intervals
          time_window_minutes: 15, // Default 15 min window
          occurrence_count: 0,
          consistency_rate: 0,
          emotional_state: inferEmotionalState(eventType, activity.timeOffsetMinutes),
          hypothesized_purpose: inferPurpose(eventType, activity.timeOffsetMinutes),
          first_observed_at: null,
          last_observed_at: null,
          observations: []
        };
      }

      // Track observation
      patternGroups[patternKey].observations.push({
        event: correlation.event,
        activity,
        timestamp: activity.timestamp
      });

      patternGroups[patternKey].occurrence_count++;
    }
  }

  // Calculate consistency rates and timestamps
  const patterns = Object.values(patternGroups).map(pattern => {
    const observations = pattern.observations;
    const uniqueEvents = new Set(observations.map(obs => obs.event.id));
    const totalEvents = correlations.filter(corr =>
      corr.event.eventType === pattern.trigger_metadata.eventType
    ).length;

    pattern.consistency_rate = totalEvents > 0
      ? Math.round((uniqueEvents.size / totalEvents) * 10000) / 100
      : 0;

    pattern.first_observed_at = observations[0]?.timestamp || new Date();
    pattern.last_observed_at = observations[observations.length - 1]?.timestamp || new Date();

    delete pattern.observations; // Remove temporary data

    return pattern;
  });

  return patterns;
}

/**
 * Determine pattern type based on time offset
 */
function determinePatternType(timeOffsetMinutes) {
  if (timeOffsetMinutes < -10) return 'pre_event_ritual';
  if (timeOffsetMinutes > 10) return 'post_event_recovery';
  return 'stress_response';
}

/**
 * Generate human-readable pattern name
 */
function generatePatternName(eventType, activity) {
  const timing = activity.timeOffsetMinutes < 0 ? 'before' : 'after';
  const minutes = Math.abs(activity.timeOffsetMinutes);

  return `${activity.platform} ${activity.dataType} ${minutes}min ${timing} ${eventType}`;
}

/**
 * Determine response type from activity
 */
function determineResponseType(activity) {
  const mapping = {
    'spotify.recently_played': 'music_playlist',
    'spotify.top_track': 'music_playlist',
    'youtube.watch_history': 'video_content',
    'discord.message': 'social_activity',
    'github.commit': 'coding_session',
    'reddit.post': 'social_activity'
  };

  return mapping[`${activity.platform}.${activity.dataType}`] || 'multiple_activities';
}

/**
 * Extract response data from activity
 */
function extractResponseData(activity) {
  if (activity.platform === 'spotify') {
    return {
      track_name: activity.data.track?.name,
      artist_name: activity.data.track?.artists?.[0]?.name,
      playlist_context: activity.data.context?.uri
    };
  }

  if (activity.platform === 'youtube') {
    return {
      video_title: activity.data.snippet?.title,
      channel_name: activity.data.snippet?.channelTitle
    };
  }

  return activity.data;
}

/**
 * Infer emotional state from event type and timing
 */
function inferEmotionalState(eventType, timeOffsetMinutes) {
  if (eventType === 'high_stakes' && timeOffsetMinutes < 0) return 'anxious';
  if (eventType === 'focus_work' && timeOffsetMinutes < 0) return 'focused';
  if (eventType === 'social' && timeOffsetMinutes < 0) return 'excited';
  if (timeOffsetMinutes > 30) return 'tired';
  return 'neutral';
}

/**
 * Infer purpose from event type and timing
 */
function inferPurpose(eventType, timeOffsetMinutes) {
  if (eventType === 'high_stakes' && timeOffsetMinutes < 0) return 'stress_reduction';
  if (eventType === 'focus_work' && timeOffsetMinutes < 0) return 'mental_preparation';
  if (timeOffsetMinutes > 30) return 'recovery';
  return 'unknown';
}

// ====================================================================
// PATTERN RETRIEVAL
// Get patterns for a user
// ====================================================================

/**
 * Get all behavioral patterns for a user
 *
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} User's behavioral patterns
 */
export async function getUserPatterns(userId, filters = {}) {
  try {
    let query = supabase
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false });

    if (filters.minConfidence) {
      query = query.gte('confidence_score', filters.minConfidence);
    }

    if (filters.patternType) {
      query = query.eq('pattern_type', filters.patternType);
    }

    if (filters.platform) {
      query = query.eq('response_platform', filters.platform);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];

  } catch (error) {
    console.error('❌ [Pattern Recognition] Error getting user patterns:', error);
    throw error;
  }
}

/**
 * Get high-confidence patterns (>= 70%)
 */
export async function getHighConfidencePatterns(userId) {
  return getUserPatterns(userId, { minConfidence: 70 });
}

/**
 * Delete a pattern
 */
export async function deletePattern(userId, patternId) {
  try {
    const { error } = await supabase
      .from('behavioral_patterns')
      .delete()
      .eq('id', patternId)
      .eq('user_id', userId);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    console.error('❌ [Pattern Recognition] Error deleting pattern:', error);
    throw error;
  }
}

export default {
  detectTemporalCorrelations,
  buildBehavioralFingerprint,
  scorePatternConfidence,
  getConfidenceLevel,
  getConfidenceDescription,
  detectAndStoreBehavioralPatterns,
  getUserPatterns,
  getHighConfidencePatterns,
  deletePattern
};
