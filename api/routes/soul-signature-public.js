/**
 * Public Soul Signature Routes
 *
 * Public (no auth) endpoint for viewing shared soul signatures,
 * and authenticated endpoint for toggling visibility.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { invalidateOgCache } from './og-image.js';

const router = express.Router();

/**
 * GET /api/soul-signature/public/:userId
 *
 * Returns a user's soul signature if it's marked as public.
 * No authentication required - this is the endpoint for shared links.
 */
router.get('/public/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // Fetch soul signature only if public
    const { data: signature, error } = await supabaseAdmin
      .from('soul_signatures')
      .select('archetype_name, archetype_subtitle, narrative, defining_traits, color_scheme, icon_type, updated_at')
      .eq('user_id', userId)
      .eq('is_public', true)
      .single();

    if (error || !signature) {
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
    console.error('[Public Signature] Error:', error);
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

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const { data, error } = await supabaseAdmin
      .from('soul_signatures')
      .update({ is_public, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('is_public')
      .single();

    if (error) {
      console.error('[Signature Visibility] Error:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to update visibility' });
    }

    // Invalidate OG card cache when visibility changes
    await invalidateOgCache(userId).catch(err =>
      console.warn('[Signature Visibility] Cache invalidation failed:', err.message)
    );

    return res.json({
      success: true,
      is_public: data.is_public,
    });
  } catch (error) {
    console.error('[Signature Visibility] Error:', error);
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
    console.error('[Share Status] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch share status' });
  }
});

export default router;
