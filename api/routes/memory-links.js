/**
 * Memory Links API
 * =================
 * GET /api/memory/:memoryId/links
 *
 * Returns the Zettelkasten-style links for a given memory, ordered by
 * strength (cosine similarity) descending.
 *
 * Each entry in data[] has:
 *   link_type  — 'semantic' | 'reflection_source'
 *   strength   — 0.0–1.0 (cosine similarity or 1.0 for provenance links)
 *   target     — { id, content, memory_type, importance_score, created_at }
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getLinkedMemories } from '../services/memoryLinksService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('MemoryLinksRoute');

const router = express.Router({ mergeParams: true });

/**
 * GET /api/memory/:memoryId/links
 * Query params:
 *   limit (optional, default 5, max 20)
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { memoryId } = req.params;
    const userId = req.user.id;
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));

    if (!memoryId) {
      return res.status(400).json({ success: false, error: 'memoryId is required' });
    }

    const links = await getLinkedMemories(memoryId, userId, limit);
    res.json({ success: true, data: links });
  } catch (err) {
    log.error('[memory-links] GET /:memoryId/links error:', err.message);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? err.message : 'Failed to load memory links',
    });
  }
});

export default router;
