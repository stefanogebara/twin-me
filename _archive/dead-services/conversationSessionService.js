/**
 * Conversation Session Service
 *
 * Manages conversation sessions by:
 * - Grouping messages into sessions (30-min gap = new session)
 * - Tracking session-level metrics (overall engagement, depth)
 * - Generating session summaries when session closes
 * - Linking individual messages to session_id
 */

import { supabaseAdmin } from './database.js';
import { addSessionAnalysisJob } from './queueService.js';

// Default session gap in minutes (30 min = new session)
const DEFAULT_SESSION_GAP_MINUTES = 30;

/**
 * Get or create a session for a user's conversation
 * Uses database function for atomic operation
 *
 * @param {string} userId - User UUID
 * @param {string} mcpClient - MCP client identifier (e.g., 'claude-desktop', 'twinme_web')
 * @param {number} sessionGapMinutes - Minutes of inactivity before new session
 * @returns {Object} Session info with id and isNew flag
 */
export async function getOrCreateSession(userId, mcpClient = 'unknown', sessionGapMinutes = DEFAULT_SESSION_GAP_MINUTES) {
  try {
    // Call the database function to get or create session
    const { data: sessionId, error } = await supabaseAdmin
      .rpc('get_or_create_conversation_session', {
        p_user_id: userId,
        p_mcp_client: mcpClient,
        p_session_gap_minutes: sessionGapMinutes
      });

    if (error) {
      console.error('[SessionService] RPC error:', error);
      throw error;
    }

    if (!sessionId) {
      throw new Error('Failed to get or create session');
    }

    // Get session details
    const { data: session } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    console.log('[SessionService] Got session:', {
      sessionId,
      messageCount: session?.message_count,
      isNew: session?.message_count === 0
    });

    return {
      id: sessionId,
      session,
      isNew: session?.message_count === 0
    };

  } catch (error) {
    console.error('[SessionService] Error getting/creating session:', error);
    throw error;
  }
}

/**
 * Get the next turn number for a session
 *
 * @param {string} sessionId - Session UUID
 * @returns {number} Next turn number
 */
export async function getNextTurnNumber(sessionId) {
  try {
    const { data: turnNumber, error } = await supabaseAdmin
      .rpc('get_next_turn_number', { p_session_id: sessionId });

    if (error) {
      console.error('[SessionService] Turn number error:', error);
      return 1;
    }

    return turnNumber || 1;

  } catch (error) {
    console.error('[SessionService] Error getting turn number:', error);
    return 1;
  }
}

/**
 * Get an active session for a user (if exists)
 *
 * @param {string} userId - User UUID
 * @param {number} sessionGapMinutes - Minutes before session considered stale
 * @returns {Object|null} Active session or null
 */
export async function getActiveSession(userId, sessionGapMinutes = DEFAULT_SESSION_GAP_MINUTES) {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('last_message_at', { ascending: false })
      .limit(1);

    if (error || !sessions || sessions.length === 0) {
      return null;
    }

    const session = sessions[0];
    const lastMessageAt = new Date(session.last_message_at);
    const gapThreshold = new Date(Date.now() - sessionGapMinutes * 60 * 1000);

    // Check if session is still active (within gap threshold)
    if (lastMessageAt < gapThreshold) {
      // Session is stale, close it
      await closeSession(session.id);
      return null;
    }

    return session;

  } catch (error) {
    console.error('[SessionService] Error getting active session:', error);
    return null;
  }
}

/**
 * Close a session and trigger analysis
 *
 * @param {string} sessionId - Session UUID
 * @param {boolean} analyzeSession - Whether to queue session analysis
 * @returns {Object} Update result
 */
export async function closeSession(sessionId, analyzeSession = true) {
  try {
    // Get session details first
    const { data: session } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Close the session
    const { error } = await supabaseAdmin
      .from('conversation_sessions')
      .update({
        ended_at: session.last_message_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      throw error;
    }

    console.log('[SessionService] Session closed:', sessionId);

    // Queue session analysis if requested and session has messages
    if (analyzeSession && session.message_count > 0) {
      try {
        await addSessionAnalysisJob(session.user_id, sessionId, { delay: 2000 });
      } catch (queueError) {
        console.warn('[SessionService] Failed to queue session analysis:', queueError.message);
      }
    }

    return { success: true };

  } catch (error) {
    console.error('[SessionService] Error closing session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Close all stale sessions (for cron job)
 *
 * @param {number} sessionGapMinutes - Minutes before session considered stale
 * @returns {Object} Result with count of closed sessions
 */
export async function closeAllStaleSessions(sessionGapMinutes = DEFAULT_SESSION_GAP_MINUTES) {
  try {
    const { data: count, error } = await supabaseAdmin
      .rpc('close_stale_sessions', { p_gap_minutes: sessionGapMinutes });

    if (error) {
      console.error('[SessionService] Error closing stale sessions:', error);
      return { success: false, error: error.message };
    }

    if (count > 0) {
      console.log(`[SessionService] Closed ${count} stale sessions`);
    }

    return { success: true, closedCount: count };

  } catch (error) {
    console.error('[SessionService] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get sessions for a user with their messages
 *
 * @param {string} userId - User UUID
 * @param {number} limit - Maximum sessions to return
 * @returns {Array} Sessions with message counts
 */
export async function getUserSessions(userId, limit = 20) {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select(`
        *,
        messages:mcp_conversation_logs(
          id,
          user_message,
          twin_response,
          created_at,
          engagement_level,
          conversation_depth,
          topics_detected
        )
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return sessions || [];

  } catch (error) {
    console.error('[SessionService] Error getting user sessions:', error);
    return [];
  }
}

/**
 * Get session statistics for a user
 *
 * @param {string} userId - User UUID
 * @returns {Object} Session statistics
 */
export async function getSessionStats(userId) {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('message_count, overall_engagement, overall_depth, primary_topics, started_at, ended_at')
      .eq('user_id', userId);

    if (error || !sessions || sessions.length === 0) {
      return {
        totalSessions: 0,
        avgMessagesPerSession: 0,
        engagementDistribution: {},
        depthDistribution: {},
        topTopics: []
      };
    }

    // Calculate statistics
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0);
    const avgMessagesPerSession = Math.round((totalMessages / totalSessions) * 10) / 10;

    // Engagement distribution
    const engagementDist = { low: 0, medium: 0, high: 0, very_high: 0 };
    sessions.forEach(s => {
      if (s.overall_engagement) {
        engagementDist[s.overall_engagement]++;
      }
    });

    // Depth distribution
    const depthDist = { surface: 0, moderate: 0, deep: 0, expert: 0 };
    sessions.forEach(s => {
      if (s.overall_depth) {
        depthDist[s.overall_depth]++;
      }
    });

    // Top topics across all sessions
    const topicCounts = {};
    sessions.forEach(s => {
      (s.primary_topics || []).forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    // Calculate average session duration (for completed sessions)
    const completedSessions = sessions.filter(s => s.ended_at);
    let avgDurationMinutes = 0;
    if (completedSessions.length > 0) {
      const totalDuration = completedSessions.reduce((sum, s) => {
        const start = new Date(s.started_at);
        const end = new Date(s.ended_at);
        return sum + (end - start);
      }, 0);
      avgDurationMinutes = Math.round((totalDuration / completedSessions.length) / 60000);
    }

    return {
      totalSessions,
      avgMessagesPerSession,
      avgDurationMinutes,
      engagementDistribution: engagementDist,
      depthDistribution: depthDist,
      topTopics
    };

  } catch (error) {
    console.error('[SessionService] Error getting session stats:', error);
    return { error: error.message };
  }
}

/**
 * Update session with incremented message count
 * (Called by trigger, but can also be called manually)
 *
 * @param {string} sessionId - Session UUID
 * @param {number} wordCount - Word count from the message
 * @returns {Object} Update result
 */
export async function updateSessionOnMessage(sessionId, wordCount = 0) {
  try {
    const { error } = await supabaseAdmin
      .from('conversation_sessions')
      .update({
        message_count: supabaseAdmin.raw('message_count + 1'),
        user_message_count: supabaseAdmin.raw('user_message_count + 1'),
        total_words: supabaseAdmin.raw(`total_words + ${wordCount}`),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      throw error;
    }

    return { success: true };

  } catch (error) {
    console.error('[SessionService] Error updating session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get or create session and return session info with turn number
 * Convenience method for MCP logging
 *
 * @param {string} userId - User UUID
 * @param {string} mcpClient - MCP client identifier
 * @returns {Object} Session info including id and turnNumber
 */
export async function prepareSessionForMessage(userId, mcpClient = 'unknown') {
  try {
    const { id: sessionId, isNew } = await getOrCreateSession(userId, mcpClient);
    const turnNumber = await getNextTurnNumber(sessionId);

    return {
      sessionId,
      turnNumber,
      isNewSession: isNew
    };

  } catch (error) {
    console.error('[SessionService] Error preparing session:', error);
    // Return null session - message can still be logged without session
    return {
      sessionId: null,
      turnNumber: null,
      isNewSession: false,
      error: error.message
    };
  }
}

export default {
  getOrCreateSession,
  getNextTurnNumber,
  getActiveSession,
  closeSession,
  closeAllStaleSessions,
  getUserSessions,
  getSessionStats,
  updateSessionOnMessage,
  prepareSessionForMessage
};
