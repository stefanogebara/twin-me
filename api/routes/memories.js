/**
 * Memories API Routes
 * ===================
 * Endpoints for browsing the user's memory stream with filters.
 * Pure database queries — no LLM calls.
 *
 * GET /api/memories - Paginated, filterable list of memories
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Memories');

const router = express.Router();

const VALID_PLATFORMS = new Set([
  'spotify', 'google_calendar', 'youtube', 'gmail', 'discord',
  'linkedin', 'github', 'reddit', 'twitch', 'whoop',
]);

const VALID_TYPES = new Set([
  'reflection',
  'platform_data',
  'fact',
  'conversation',
  'observation',
]);

const VALID_EXPERTS = new Set([
  'personality_psychologist',
  'lifestyle_analyst',
  'cultural_identity',
  'social_dynamics',
  'motivation_analyst',
]);

const VALID_SORTS = new Set(['newest', 'importance', 'accessed']);

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * GET /api/memories
 * Returns a paginated, filterable list of memories for the authenticated user.
 *
 * Query params:
 *   type     - memory_type filter (comma-separated, optional)
 *   expert   - metadata.expert filter (optional)
 *   platform - metadata.platform or metadata.source filter (optional)
 *   sort     - 'newest' (default), 'importance', 'accessed'
 *   limit    - results per page (default 20, max 50)
 *   offset   - pagination offset (default 0)
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, expert, platform, sort = 'newest', q } = req.query;

    // Parse and clamp limit/offset
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Validate sort
    if (!VALID_SORTS.has(sort)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sort value. Must be one of: ${[...VALID_SORTS].join(', ')}`,
      });
    }

    // Validate type filter(s)
    let typeFilters = null;
    if (type) {
      typeFilters = type.split(',').map(t => t.trim()).filter(Boolean);
      const invalid = typeFilters.filter(t => !VALID_TYPES.has(t));
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid memory type(s): ${invalid.join(', ')}. Must be one of: ${[...VALID_TYPES].join(', ')}`,
        });
      }
    }

    // Validate expert filter
    if (expert && !VALID_EXPERTS.has(expert)) {
      return res.status(400).json({
        success: false,
        error: `Invalid expert value. Must be one of: ${[...VALID_EXPERTS].join(', ')}`,
      });
    }

    // Build the main query
    const SELECT_COLS = 'id, content, memory_type, importance_score, retrieval_count, created_at, last_accessed_at, metadata';

    let query = supabaseAdmin
      .from('user_memories')
      .select(SELECT_COLS, { count: 'exact' })
      .eq('user_id', userId)
      /* archived memories are moved to a separate table, not flagged */;

    // Apply type filter
    if (typeFilters && typeFilters.length === 1) {
      query = query.eq('memory_type', typeFilters[0]);
    } else if (typeFilters && typeFilters.length > 1) {
      query = query.in('memory_type', typeFilters);
    }

    // Apply expert filter (JSONB arrow)
    if (expert) {
      query = query.filter('metadata->>expert', 'eq', expert);
    }

    // Apply full-text search on content
    if (q && q.trim()) {
      query = query.ilike('content', `%${q.trim()}%`);
    }

    // Apply platform filter (check both metadata.platform and metadata.source)
    // Supabase JS doesn't support OR on JSONB arrows in a single query,
    // so we use an or() filter with two conditions.
    if (platform) {
      if (!VALID_PLATFORMS.has(platform)) {
        return res.status(400).json({ success: false, error: `Invalid platform: ${platform}` });
      }
      query = query.or(`metadata->>platform.eq.${platform},metadata->>source.eq.${platform}`);
    }

    // Apply sort
    switch (sort) {
      case 'importance':
        query = query.order('importance_score', { ascending: false })
                     .order('created_at', { ascending: false });
        break;
      case 'accessed':
        query = query.order('retrieval_count', { ascending: false, nullsFirst: false })
                     .order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute main query
    const { data: memories, count: total, error } = await query;

    if (error) {
      log.error('Failed to fetch memories', { error, userId });
      return res.status(500).json({ success: false, error: 'Failed to fetch memories' });
    }

    // Build composition counts (separate query)
    const composition = await getComposition(userId);

    res.json({
      success: true,
      memories: memories || [],
      total: total || 0,
      limit,
      offset,
      composition,
    });
  } catch (error) {
    log.error('Memories list error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch memories' });
  }
});

/**
 * Get memory type composition counts for a user.
 * Returns an object like { reflection: 3443, platform_data: 2630, ... }
 */
async function getComposition(userId) {
  const composition = {};

  // Query count per type in parallel
  const types = [...VALID_TYPES];
  const results = await Promise.all(
    types.map(type =>
      supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        /* archived memories are moved to a separate table, not flagged */
        .eq('memory_type', type)
    )
  );

  for (let i = 0; i < types.length; i++) {
    const { count, error } = results[i];
    if (error) {
      log.warn('Composition count failed for type', { type: types[i], error });
      composition[types[i]] = 0;
    } else {
      composition[types[i]] = count || 0;
    }
  }

  return composition;
}

export default router;
