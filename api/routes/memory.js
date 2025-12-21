import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { MemoryManager } from '../services/memoryArchitecture.js';
import { successResponse, errorResponse } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/memory/:sessionId
 * Get memory context for a specific session
 */
router.get('/:sessionId', authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    // Enhanced logging for debugging
    console.log('[Memory API] GET /:sessionId request:', {
      sessionId,
      userId,
      hasUser: !!req.user,
      authHeader: req.headers.authorization ? 'Present' : 'Missing'
    });

    if (!userId) {
      console.error('[Memory API] No user ID found in request');
      return errorResponse(res, 'AUTH_REQUIRED', 'Authentication required', 401);
    }

    // Initialize memory manager
    const memory = new MemoryManager(userId, sessionId);
    await memory.initialize();

    // Get full context
    const memoryContext = await memory.getContextForAI();

    // Add metadata
    const response = {
      sessionId,
      userId,
      workingMemory: {
        messages: Array.isArray(memoryContext.workingMemory) ? memoryContext.workingMemory : [],
        scratchpad: memory.workingMemory.scratchpad || '',
        messageCount: Array.isArray(memoryContext.workingMemory) ? memoryContext.workingMemory.length : 0
      },
      coreMemory: {
        preferences: memoryContext.coreMemory || {},
        importantFacts: memoryContext.coreMemory?.important_facts || [],
        preferenceCount: memoryContext.coreMemory ? Object.keys(memoryContext.coreMemory).length : 0
      },
      longTermMemory: {
        soulSignature: memoryContext.longTermMemory || {},
        lifeClusters: memoryContext.longTermMemory?.life_clusters || [],
        clusterCount: memoryContext.longTermMemory?.life_clusters ? memoryContext.longTermMemory.life_clusters.length : 0
      },
      timestamp: new Date().toISOString()
    };

    return successResponse(res, response, 'Memory retrieved successfully');
  } catch (error) {
    console.error('[Memory API] Error fetching memory:', error);
    return errorResponse(res, 'MEMORY_FETCH_ERROR', 'Failed to fetch memory data', 500);
  }
});

/**
 * GET /api/memory/sessions/list
 * Get all sessions for the authenticated user
 */
router.get('/sessions/list', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Enhanced logging for debugging
    console.log('[Memory API] GET /sessions/list request:', {
      userId,
      hasUser: !!req.user,
      authHeader: req.headers.authorization ? 'Present' : 'Missing'
    });

    if (!userId) {
      console.error('[Memory API] No user ID found in request');
      return errorResponse(res, 'AUTH_REQUIRED', 'Authentication required', 401);
    }

    const { supabaseAdmin } = await import('../config/supabase.js');

    // Get all sessions for this user
    const { data: sessions, error } = await supabaseAdmin
      .from('working_memory')
      .select('session_id, created_at, updated_at, context')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Format sessions with message count
    const formattedSessions = sessions.map(session => ({
      sessionId: session.session_id,
      messageCount: Array.isArray(session.context) ? session.context.length : 0,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      preview: Array.isArray(session.context) && session.context.length > 0
        ? session.context[session.context.length - 1].content.substring(0, 100) + '...'
        : 'No messages'
    }));

    return successResponse(res, { sessions: formattedSessions }, 'Sessions retrieved successfully');
  } catch (error) {
    console.error('[Memory API] Error fetching sessions:', error);
    return errorResponse(res, 'SESSIONS_FETCH_ERROR', 'Failed to fetch sessions', 500);
  }
});

/**
 * DELETE /api/memory/:sessionId
 * Delete a specific session's working memory
 */
router.delete('/:sessionId', authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { supabaseAdmin } = await import('../config/supabase.js');

    // Delete working memory for this session
    const { error } = await supabaseAdmin
      .from('working_memory')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return successResponse(res, { sessionId }, 'Session deleted successfully');
  } catch (error) {
    console.error('[Memory API] Error deleting session:', error);
    return errorResponse(res, 'SESSION_DELETE_ERROR', 'Failed to delete session', 500);
  }
});

export default router;
