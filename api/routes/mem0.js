/**
 * Mem0 Memory Routes
 *
 * API endpoints for managing the intelligent memory layer
 * - View memories
 * - Search memories
 * - Add memories manually
 * - Delete memories
 * - Get memory statistics
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import {
  searchMemories,
  getAllMemories,
  addUserFact,
  deleteMemory,
  clearUserMemories,
  getMemoryStats,
  addPlatformMemory
} from '../services/mem0Service.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Mem0Route');

const router = express.Router();

/**
 * GET /api/mem0/memories - Get all memories for current user
 */
router.get('/memories', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const memories = await getAllMemories(userId, parseInt(limit));

    res.json({
      success: true,
      memories,
      count: memories.length
    });
  } catch (error) {
    log.error('Error fetching memories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch memories'
    });
  }
});

/**
 * GET /api/mem0/search - Search memories
 */
router.get('/search', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, limit = 5 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const memories = await searchMemories(userId, query, parseInt(limit));

    res.json({
      success: true,
      memories,
      count: memories.length,
      query
    });
  } catch (error) {
    log.error('Error searching memories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search memories'
    });
  }
});

/**
 * GET /api/mem0/stats - Get memory statistics
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await getMemoryStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    log.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch memory statistics'
    });
  }
});

/**
 * POST /api/mem0/fact - Add a user fact/preference
 */
router.post('/fact', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fact, category = 'general' } = req.body;

    if (!fact) {
      return res.status(400).json({
        success: false,
        error: 'Fact is required'
      });
    }

    const result = await addUserFact(userId, fact, category);

    res.json({
      success: true,
      message: 'Fact added to memory',
      result
    });
  } catch (error) {
    log.error('Error adding fact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add fact'
    });
  }
});

/**
 * POST /api/mem0/platform - Add platform data to memory
 */
router.post('/platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, dataType, data } = req.body;

    if (!platform || !dataType || !data) {
      return res.status(400).json({
        success: false,
        error: 'Platform, dataType, and data are required'
      });
    }

    const result = await addPlatformMemory(userId, platform, dataType, data);

    res.json({
      success: true,
      message: `Added ${platform} ${dataType} to memory`,
      result
    });
  } catch (error) {
    log.error('Error adding platform memory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add platform memory'
    });
  }
});

/**
 * DELETE /api/mem0/memory/:id - Delete a specific memory
 */
router.delete('/memory/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership before deleting
    const { data: memory, error: fetchErr } = await supabaseAdmin
      .from('user_memories')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchErr || !memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    if (memory.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await deleteMemory(id);

    if (!result) {
      return res.status(500).json({ success: false, error: 'Failed to delete memory' });
    }

    res.json({ success: true, message: 'Memory deleted' });
  } catch (error) {
    log.error('Error deleting memory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete memory'
    });
  }
});

/**
 * DELETE /api/mem0/clear - Clear all memories for current user
 */
router.delete('/clear', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { confirm } = req.body;

    if (confirm !== 'DELETE_ALL_MEMORIES') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Send { "confirm": "DELETE_ALL_MEMORIES" }'
      });
    }

    const result = await clearUserMemories(userId);

    res.json({
      success: result,
      message: result ? 'All memories cleared' : 'Failed to clear memories'
    });
  } catch (error) {
    log.error('Error clearing memories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear memories'
    });
  }
});

export default router;
