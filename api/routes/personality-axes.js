/**
 * Personality Axes API Routes
 * ===========================
 * GET  /api/personality-axes       — Get personality axes (cached, 24h TTL)
 * POST /api/personality-axes       — Rebuild personality axes (rate limited: 1/6h)
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getPersonalityAxes, rebuildPersonalityAxes } from '../services/icaPersonalityService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('PersonalityAxesRoutes');

const REBUILD_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// ─── GET /api/personality-axes ──────────────────────────────────────────

router.get('/', authenticateUser, async (req, res) => {
  try {
    const result = await getPersonalityAxes(req.user.id);

    if (result.error) {
      log.warn('Get personality axes failed', { userId: req.user.id, error: result.error });
      return res.status(500).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    log.error('GET /personality-axes failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch personality axes' });
  }
});

// ─── POST /api/personality-axes ─────────────────────────────────────────

router.post('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Rate limit: 1 rebuild per 6 hours via personality_axes_cache.generated_at
    const { data: cache, error: cacheError } = await supabaseAdmin
      .from('personality_axes_cache')
      .select('generated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (cacheError) {
      log.warn('Cache check failed during rate limit', { userId, error: cacheError.message });
      // Proceed anyway — cache check failure shouldn't block rebuild
    }

    if (cache?.generated_at) {
      const msSinceGenerated = Date.now() - new Date(cache.generated_at).getTime();
      if (msSinceGenerated < REBUILD_COOLDOWN_MS) {
        const hoursRemaining = Math.ceil((REBUILD_COOLDOWN_MS - msSinceGenerated) / (60 * 60 * 1000));
        return res.status(429).json({
          success: false,
          error: `Personality axes can be rebuilt once every 6 hours. Next available in ${hoursRemaining} hour(s).`,
        });
      }
    }

    log.info('Triggering personality axes rebuild', { userId });
    const result = await rebuildPersonalityAxes(userId);

    if (result.error) {
      log.warn('Rebuild personality axes failed', { userId, error: result.error });
      return res.status(500).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    log.error('POST /personality-axes failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to rebuild personality axes' });
  }
});

export default router;
