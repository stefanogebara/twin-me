/**
 * REAL-TIME PATTERN TRACKING SERVICE
 *
 * Background job service that monitors upcoming calendar events and current
 * user activity to detect patterns in real-time and generate proactive suggestions.
 *
 * CAPABILITIES:
 * - Monitor upcoming calendar events (next 24 hours)
 * - Track current user activity across platforms
 * - Match activity to existing patterns
 * - Update pattern confidence scores dynamically
 * - Trigger proactive suggestions when patterns detected
 *
 * EXECUTION:
 * - Runs every 15 minutes as background job
 * - Event-triggered on calendar sync
 * - User-initiated via API
 *
 * EXAMPLE SCENARIOS:
 * - User has presentation in 25 minutes → check if they're following their ritual
 * - User started listening to focus music → predict upcoming work session
 * - Calendar event detected → prepare personalized suggestions
 */

import { createClient } from '@supabase/supabase-js';
import {
  getUserPatterns,
  scorePatternConfidence,
  getConfidenceDescription
} from './behavioralPatternRecognition.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ====================================================================
// BACKGROUND JOB SCHEDULER
// Runs pattern tracking at regular intervals
// ====================================================================

/**
 * Start pattern tracking background job
 * Runs every 15 minutes
 */
export function startPatternTrackingJob() {
  console.log('🚀 [Pattern Tracker] Starting background tracking job');

  // Run immediately on startup
  trackAllUsers().catch(err =>
    console.error('❌ [Pattern Tracker] Error in initial tracking run:', err)
  );

  // Then run every 15 minutes
  const intervalMinutes = 15;
  setInterval(() => {
    trackAllUsers().catch(err =>
      console.error('❌ [Pattern Tracker] Error in scheduled tracking run:', err)
    );
  }, intervalMinutes * 60 * 1000);

  console.log(`✅ [Pattern Tracker] Job scheduled to run every ${intervalMinutes} minutes`);
}

/**
 * Track patterns for all users with active pattern tracking
 */
async function trackAllUsers() {
  try {
    console.log('🔍 [Pattern Tracker] Running tracking cycle for all users');

    // Get users with pattern tracking enabled
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('pattern_tracking_enabled', true); // Assumes this column exists

    if (error) throw error;

    if (!users || users.length === 0) {
      console.log('⚠️ [Pattern Tracker] No users with pattern tracking enabled');
      return;
    }

    console.log(`🔍 [Pattern Tracker] Tracking ${users.length} users`);

    // Track each user in parallel (with rate limiting)
    const batchSize = 5;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.all(
        batch.map(user => trackUserPatterns(user.id).catch(err =>
          console.error(`❌ [Pattern Tracker] Error tracking user ${user.id}:`, err)
        ))
      );
    }

    console.log('✅ [Pattern Tracker] Tracking cycle complete');

  } catch (error) {
    console.error('❌ [Pattern Tracker] Error in trackAllUsers:', error);
  }
}

// ====================================================================
// INDIVIDUAL USER TRACKING
// Monitor single user's upcoming events and current activity
// ====================================================================

/**
 * Track patterns for a specific user
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Tracking results
 */
export async function trackUserPatterns(userId) {
  try {
    console.log(`🔍 [Pattern Tracker] Tracking user ${userId}`);

    // Step 1: Create tracking session
    const sessionId = await createTrackingSession(userId, 'scheduled');

    // Step 2: Get upcoming calendar events (next 24 hours)
    const upcomingEvents = await getUpcomingCalendarEvents(userId, 24);

    if (upcomingEvents.length === 0) {
      await updateTrackingSession(sessionId, {
        status: 'completed',
        patterns_matched: 0,
        patterns_discovered: 0
      });
      return { eventsTracked: 0, patternsMatched: 0 };
    }

    console.log(`📅 [Pattern Tracker] Found ${upcomingEvents.length} upcoming events`);

    // Step 3: Get user's behavioral patterns
    const userPatterns = await getUserPatterns(userId, { minConfidence: 50 });

    console.log(`🧠 [Pattern Tracker] User has ${userPatterns.length} active patterns`);

    // Step 4: Get current user activity
    const recentActivity = await getRecentUserActivity(userId, 60); // Last 60 minutes

    // Step 5: Match events to patterns and check for pattern execution
    const matchResults = await matchEventsToPatterns(
      userId,
      upcomingEvents,
      userPatterns,
      recentActivity
    );

    // Step 6: Update tracking session
    await updateTrackingSession(sessionId, {
      status: 'completed',
      tracked_events: upcomingEvents.map(e => ({ id: e.id, summary: e.summary, start: e.start })),
      detected_activities: recentActivity.map(a => ({ platform: a.platform, type: a.data_type })),
      patterns_matched: matchResults.patternsMatched,
      patterns_discovered: 0 // For now, discovery happens in main detection job
    });

    console.log(`✅ [Pattern Tracker] Tracked ${upcomingEvents.length} events, matched ${matchResults.patternsMatched} patterns`);

    return {
      eventsTracked: upcomingEvents.length,
      patternsMatched: matchResults.patternsMatched,
      suggestions: matchResults.suggestions
    };

  } catch (error) {
    console.error('❌ [Pattern Tracker] Error tracking user patterns:', error);
    throw error;
  }
}

/**
 * Create tracking session record
 */
async function createTrackingSession(userId, sessionType) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + (24 * 60 * 60 * 1000));

  const { data, error } = await supabase
    .from('pattern_tracking_sessions')
    .insert({
      user_id: userId,
      session_type: sessionType,
      window_start: now.toISOString(),
      window_end: windowEnd.toISOString(),
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;

  return data.id;
}

/**
 * Update tracking session with results
 */
async function updateTrackingSession(sessionId, updates) {
  const { error } = await supabase
    .from('pattern_tracking_sessions')
    .update({
      ...updates,
      completed_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) throw error;
}

/**
 * Get upcoming calendar events
 */
async function getUpcomingCalendarEvents(userId, hoursAhead) {
  const now = new Date();
  const futureTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));

  const { data, error } = await supabase
    .from('user_platform_data')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'calendar')
    .eq('data_type', 'event')
    .gte('raw_data->start->dateTime', now.toISOString())
    .lte('raw_data->start->dateTime', futureTime.toISOString())
    .order('raw_data->start->dateTime', { ascending: true });

  if (error) throw error;

  return (data || []).map(event => ({
    id: event.raw_data.id,
    summary: event.raw_data.summary,
    description: event.raw_data.description,
    start: new Date(event.raw_data.start?.dateTime || event.raw_data.start?.date),
    attendees: event.raw_data.attendees || [],
    eventData: event.raw_data
  }));
}

/**
 * Get recent user activity across all platforms
 */
async function getRecentUserActivity(userId, minutesBack) {
  const cutoffTime = new Date(Date.now() - (minutesBack * 60 * 1000));

  const { data, error } = await supabase
    .from('user_platform_data')
    .select('*')
    .eq('user_id', userId)
    .in('platform', ['spotify', 'youtube', 'discord', 'reddit', 'github'])
    .gte('extracted_at', cutoffTime.toISOString())
    .order('extracted_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return data || [];
}

/**
 * Match upcoming events to behavioral patterns
 */
async function matchEventsToPatterns(userId, upcomingEvents, userPatterns, recentActivity) {
  const matches = [];
  const suggestions = [];

  for (const event of upcomingEvents) {
    const minutesUntilEvent = (event.start - new Date()) / (1000 * 60);

    // Find patterns that should be triggered at this time
    const relevantPatterns = userPatterns.filter(pattern => {
      // Pattern timing matches (within ±10 minutes)
      const expectedTriggerTime = Math.abs(pattern.time_offset_minutes);
      const timingMatch = Math.abs(minutesUntilEvent - expectedTriggerTime) <= 10;

      // Pattern type matches event characteristics
      const eventKeywords = (event.summary || '').toLowerCase();
      const keywordMatch = pattern.trigger_keywords?.some(keyword =>
        eventKeywords.includes(keyword.toLowerCase())
      );

      return timingMatch && (keywordMatch || pattern.trigger_keywords?.length === 0);
    });

    for (const pattern of relevantPatterns) {
      // Check if user is following the pattern (activity in last 60 minutes)
      const isFollowingPattern = recentActivity.some(activity =>
        activity.platform === pattern.response_platform &&
        activity.data_type === pattern.response_type
      );

      matches.push({
        event,
        pattern,
        isFollowing: isFollowingPattern,
        minutesUntilEvent: Math.round(minutesUntilEvent)
      });

      // Generate suggestion if pattern is not being followed
      if (!isFollowingPattern && pattern.confidence_score >= 70) {
        suggestions.push({
          type: 'pattern_suggestion',
          event: {
            id: event.id,
            summary: event.summary,
            start: event.start
          },
          pattern: {
            id: pattern.id,
            name: pattern.pattern_name,
            description: getConfidenceDescription(pattern.confidence_score),
            activity: formatPatternActivity(pattern),
            timing: `${Math.abs(pattern.time_offset_minutes)} minutes before`
          },
          message: generateSuggestionMessage(pattern, event, minutesUntilEvent),
          confidence: pattern.confidence_score
        });
      }

      // Record pattern observation
      await recordPatternObservation(
        pattern.id,
        userId,
        event,
        recentActivity.find(a =>
          a.platform === pattern.response_platform &&
          a.data_type === pattern.response_type
        ),
        isFollowingPattern
      );
    }
  }

  return {
    patternsMatched: matches.length,
    matches,
    suggestions
  };
}

/**
 * Record pattern observation
 */
async function recordPatternObservation(patternId, userId, event, activity, matched) {
  if (!matched) return; // Only record when pattern is actually followed

  const { error } = await supabase
    .from('pattern_observations')
    .insert({
      pattern_id: patternId,
      user_id: userId,
      trigger_event_id: event.id,
      trigger_event_data: {
        summary: event.summary,
        start: event.start
      },
      trigger_timestamp: event.start,
      response_activity_id: activity?.source_url,
      response_activity_data: activity?.raw_data,
      response_timestamp: activity ? new Date(activity.extracted_at) : null,
      actual_time_offset_minutes: activity
        ? Math.round((new Date(activity.extracted_at) - event.start) / (1000 * 60))
        : null,
      match_strength: 100 // Default for now, can be made more sophisticated
    });

  if (error) {
    console.error('❌ [Pattern Tracker] Error recording observation:', error);
  }

  // Update pattern's last_observed_at and occurrence_count
  await supabase.rpc('increment_pattern_occurrence', {
    p_pattern_id: patternId,
    p_observation_time: new Date().toISOString()
  });
}

/**
 * Format pattern activity for display
 */
function formatPatternActivity(pattern) {
  const platform = pattern.response_platform;
  const type = pattern.response_type;

  if (type === 'music_playlist') {
    const data = pattern.response_data;
    return `Listen to ${data.playlist_name || data.genre || 'music'}`;
  }

  if (type === 'video_content') {
    return `Watch ${platform} videos`;
  }

  if (type === 'social_activity') {
    return `Check ${platform}`;
  }

  return `Use ${platform}`;
}

/**
 * Generate suggestion message
 */
function generateSuggestionMessage(pattern, event, minutesUntilEvent) {
  const activity = formatPatternActivity(pattern);
  const eventName = event.summary;
  const timing = Math.round(minutesUntilEvent);

  const confidence = getConfidenceDescription(pattern.confidence_score);

  return `${confidence} usually ${activity} before "${eventName}". Your event starts in ${timing} minutes.`;
}

// ====================================================================
// PATTERN PREDICTION
// Predict upcoming pattern executions
// ====================================================================

/**
 * Predict next pattern occurrence based on calendar events
 *
 * @param {string} userId - User ID
 * @param {string} patternId - Pattern ID
 * @returns {Promise<Object>} Prediction
 */
export async function predictNextPatternOccurrence(userId, patternId) {
  try {
    // Get pattern details
    const { data: pattern, error: patternError } = await supabase
      .from('behavioral_patterns')
      .select('*')
      .eq('id', patternId)
      .eq('user_id', userId)
      .single();

    if (patternError) throw patternError;

    // Get upcoming calendar events
    const upcomingEvents = await getUpcomingCalendarEvents(userId, 24 * 7); // Next week

    // Find events that match pattern's trigger keywords
    const matchingEvents = upcomingEvents.filter(event => {
      const eventText = `${event.summary} ${event.description}`.toLowerCase();
      return pattern.trigger_keywords?.some(keyword =>
        eventText.includes(keyword.toLowerCase())
      );
    });

    if (matchingEvents.length === 0) {
      return {
        predicted: false,
        message: 'No matching events found in the next 7 days'
      };
    }

    // Calculate predicted execution time
    const nextEvent = matchingEvents[0];
    const executionTime = new Date(
      nextEvent.start.getTime() + (pattern.time_offset_minutes * 60 * 1000)
    );

    // Update pattern with prediction
    await supabase
      .from('behavioral_patterns')
      .update({ next_predicted_occurrence: executionTime.toISOString() })
      .eq('id', patternId);

    return {
      predicted: true,
      event: nextEvent,
      executionTime,
      pattern: {
        name: pattern.pattern_name,
        activity: formatPatternActivity(pattern)
      }
    };

  } catch (error) {
    console.error('❌ [Pattern Tracker] Error predicting pattern occurrence:', error);
    throw error;
  }
}

// ====================================================================
// MANUAL TRACKING TRIGGERS
// User or system triggered tracking
// ====================================================================

/**
 * Manually trigger pattern tracking for a user
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Tracking results
 */
export async function triggerManualTracking(userId) {
  console.log(`🔍 [Pattern Tracker] Manual tracking triggered for user ${userId}`);
  return trackUserPatterns(userId);
}

/**
 * Track patterns when new calendar event is detected
 *
 * @param {string} userId - User ID
 * @param {Object} newEvent - Calendar event
 * @returns {Promise<Object>} Tracking results
 */
export async function trackOnCalendarUpdate(userId, newEvent) {
  try {
    console.log(`📅 [Pattern Tracker] Calendar event detected for user ${userId}`);

    const sessionId = await createTrackingSession(userId, 'event_triggered');

    // Get patterns that might match this event
    const userPatterns = await getUserPatterns(userId, { minConfidence: 50 });

    const eventKeywords = (newEvent.summary || '').toLowerCase();
    const relevantPatterns = userPatterns.filter(pattern =>
      pattern.trigger_keywords?.some(keyword =>
        eventKeywords.includes(keyword.toLowerCase())
      )
    );

    if (relevantPatterns.length > 0) {
      console.log(`🧠 [Pattern Tracker] Found ${relevantPatterns.length} relevant patterns`);

      // Generate suggestions for this event
      const suggestions = relevantPatterns.map(pattern => ({
        type: 'pattern_suggestion',
        event: newEvent,
        pattern: {
          id: pattern.id,
          name: pattern.pattern_name,
          activity: formatPatternActivity(pattern),
          timing: `${Math.abs(pattern.time_offset_minutes)} minutes before`
        },
        message: `Based on your past behavior, consider ${formatPatternActivity(pattern)} before this event.`,
        confidence: pattern.confidence_score
      }));

      await updateTrackingSession(sessionId, {
        status: 'completed',
        tracked_events: [newEvent],
        patterns_matched: relevantPatterns.length
      });

      return { patternsMatched: relevantPatterns.length, suggestions };
    }

    await updateTrackingSession(sessionId, {
      status: 'completed',
      tracked_events: [newEvent],
      patterns_matched: 0
    });

    return { patternsMatched: 0, suggestions: [] };

  } catch (error) {
    console.error('❌ [Pattern Tracker] Error tracking calendar update:', error);
    throw error;
  }
}

// ====================================================================
// PATTERN TRACKING STATUS
// Get current tracking status for a user
// ====================================================================

/**
 * Get pattern tracking status for a user
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Tracking status
 */
export async function getPatternTrackingStatus(userId) {
  try {
    // Get recent tracking sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('pattern_tracking_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (sessionsError) throw sessionsError;

    // Get active patterns count
    const { count: activePatterns, error: countError } = await supabase
      .from('behavioral_patterns')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (countError) throw countError;

    // Get upcoming events count
    const upcomingEvents = await getUpcomingCalendarEvents(userId, 24);

    return {
      isEnabled: true, // From user settings
      activePatterns: activePatterns || 0,
      upcomingEvents: upcomingEvents.length,
      recentSessions: sessions || [],
      lastTrackedAt: sessions?.[0]?.created_at || null
    };

  } catch (error) {
    console.error('❌ [Pattern Tracker] Error getting tracking status:', error);
    throw error;
  }
}

export default {
  startPatternTrackingJob,
  trackUserPatterns,
  predictNextPatternOccurrence,
  triggerManualTracking,
  trackOnCalendarUpdate,
  getPatternTrackingStatus
};
