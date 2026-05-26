/**
 * Instagram routes (lightweight) — Express monolith subset
 * =========================================================
 * The HEAVY /sync endpoint is now a standalone Vercel function
 * (api/instagram-sync.js) so the @sparticuz/chromium bundle doesn't
 * pollute every route's Lambda. See vercel.json rewrites.
 *
 * What stays here (lightweight, no Playwright/Chromium):
 *   GET    /api/instagram/status      — connection status
 *   PATCH  /api/instagram/surfaces    — enable/disable scrape surfaces
 *   POST   /api/instagram/consent     — record consent + username
 *   DELETE /api/instagram/session     — disconnect
 *   DELETE /api/instagram/data        — purge IG memories
 *   GET    /api/instagram/data-summary
 *
 * All endpoints require JWT auth via authenticateUser middleware.
 */

import express from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth.js';
import { getSupabase } from '../services/observationUtils.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('InstagramRoutes');
const router = express.Router();

const SurfacesBodySchema = z.object({
  enabled_surfaces: z.array(z.enum(['saved', 'own_posts', 'follows'])).min(0).max(3),
});

const ConsentBodySchema = z.object({
  consent_version: z.number().int().min(1),
  username: z.string().regex(/^[a-zA-Z0-9._]{1,40}$/),
});

// ───────────────────────────────────────────────────────────────
// GET /status
// ───────────────────────────────────────────────────────────────
router.get('/status', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('instagram_sessions')
    .select('instagram_username, status, enabled_surfaces, last_synced_at, last_sync_post_count, last_sync_error')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn('status query error', { error: error.message });
    return res.status(500).json({ success: false, error: 'status query failed' });
  }

  return res.json({
    success: true,
    connected: !!data && data.status === 'connected',
    session: data || null,
  });
});

// ───────────────────────────────────────────────────────────────
// PATCH /surfaces
// ───────────────────────────────────────────────────────────────
router.patch('/surfaces', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const parsed = SurfacesBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.flatten() });
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('instagram_sessions')
    .update({ enabled_surfaces: parsed.data.enabled_surfaces })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    log.warn('surfaces update error', { error: error.message });
    return res.status(500).json({ success: false, error: 'surfaces update failed' });
  }
  return res.json({ success: true, session: data });
});

// ───────────────────────────────────────────────────────────────
// POST /consent
// Record the consent acceptance + initial username before first /sync.
// ───────────────────────────────────────────────────────────────
router.post('/consent', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const parsed = ConsentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.flatten() });
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('instagram_sessions')
    .upsert({
      user_id: userId,
      instagram_username: parsed.data.username,
      status: 'connected',
      consent_accepted_at: new Date().toISOString(),
      consent_version: parsed.data.consent_version,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    log.warn('consent upsert error', { error: error.message });
    return res.status(500).json({ success: false, error: 'consent upsert failed' });
  }
  return res.json({ success: true, session: data });
});

// ───────────────────────────────────────────────────────────────
// DELETE /session — disconnect
// ───────────────────────────────────────────────────────────────
router.delete('/session', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const supabase = await getSupabase();
  const { error } = await supabase
    .from('instagram_sessions')
    .delete()
    .eq('user_id', userId);

  if (error) {
    log.warn('session delete error', { error: error.message });
    return res.status(500).json({ success: false, error: 'session delete failed' });
  }
  return res.json({ success: true });
});

// ───────────────────────────────────────────────────────────────
// DELETE /data — purge IG memories from user_memories
// ───────────────────────────────────────────────────────────────
router.delete('/data', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const supabase = await getSupabase();
  // Delete platform_data memories where metadata.source = 'instagram'
  const { error, count } = await supabase
    .from('user_memories')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .eq('metadata->>source', 'instagram');

  if (error) {
    log.warn('data delete error', { error: error.message });
    return res.status(500).json({ success: false, error: 'data delete failed' });
  }
  return res.json({ success: true, deleted_count: count || 0 });
});

// ───────────────────────────────────────────────────────────────
// GET /data-summary
// ───────────────────────────────────────────────────────────────
router.get('/data-summary', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const supabase = await getSupabase();
  const { count, error } = await supabase
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .eq('metadata->>source', 'instagram');

  if (error) {
    log.warn('data-summary error', { error: error.message });
    return res.status(500).json({ success: false, error: 'data-summary failed' });
  }
  return res.json({ success: true, memory_count: count || 0 });
});

export default router;
