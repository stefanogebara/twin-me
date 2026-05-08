/**
 * Public Soul Signature Routes
 *
 * Public (no auth) endpoint for viewing shared soul signatures,
 * and authenticated endpoint for toggling visibility.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';
import { getPublicSoulSignature, setSoulSignatureVisibility } from '../services/soulSignatureService.js';

const log = createLogger('SoulSignaturePublic');
// Lazy import to avoid crashing if OG image module fails to load
let invalidateOgCache = async () => {};
try {
  const ogModule = await import('./og-image.js');
  if (ogModule.invalidateOgCache) invalidateOgCache = ogModule.invalidateOgCache;
} catch {
  log.warn('OG image module not available, cache invalidation disabled');
}

const router = express.Router();

/**
 * GET /api/soul-signature/public/:userId
 *
 * Returns a user's soul signature if it's marked as public.
 * No authentication required - this is the endpoint for shared links.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/public/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!UUID_RE.test(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // Fetch soul signature only if public.
    // audit-2026-05-08: canonical public accessor for cache reuse.
    const signature = await getPublicSoulSignature(userId);
    if (!signature) {
      return res.status(404).json({ success: false, error: 'Soul signature not found or not public' });
    }

    // Fetch user's first name only (minimal public info)
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('name, first_name, avatar_url')
      .eq('id', userId)
      .single();

    const firstName = user?.first_name || user?.name?.split(' ')[0] || null;

    return res.json({
      success: true,
      signature: {
        ...signature,
        first_name: firstName,
        avatar_url: user?.avatar_url || null,
      },
    });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch signature' });
  }
});

/**
 * PATCH /api/soul-signature/visibility
 *
 * Toggle the public visibility of the authenticated user's soul signature.
 * Body: { is_public: boolean }
 */
router.patch('/visibility', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { is_public } = req.body;

    if (typeof is_public !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_public must be a boolean' });
    }

    // Use shared accessor — handles cache invalidation internally.
    const result = await setSoulSignatureVisibility(userId, is_public);
    if (!result.ok) {
      log.error('Error:', result.error?.message);
      return res.status(500).json({ success: false, error: 'Failed to update visibility' });
    }

    // OG card cache also has to be cleared on visibility change.
    await invalidateOgCache(userId).catch(err =>
      log.warn('Cache invalidation failed:', err.message)
    );

    return res.json({
      success: true,
      is_public: result.isPublic,
    });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update visibility' });
  }
});

/**
 * GET /api/soul-signature/share-status
 *
 * Get the current share status of the authenticated user's soul signature.
 */
router.get('/share-status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const { data, error } = await supabaseAdmin
      .from('soul_signatures')
      .select('is_public')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.json({ success: true, is_public: false, has_signature: false });
    }

    return res.json({
      success: true,
      is_public: data.is_public || false,
      has_signature: true,
      share_url: data.is_public ? `/api/s/${userId}` : null,
    });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch share status' });
  }
});

export default router;
