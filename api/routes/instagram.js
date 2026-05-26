/**
 * Instagram routes
 * =================
 * Phase 1 of the camofox plan, but rewritten for vanilla Playwright after the
 * Phase 0 spike validated that IG does not fingerprint-block Chromium on the
 * surfaces we care about. NO encrypted cookie storage, NO VPS.
 *
 * Endpoints:
 *   POST   /api/instagram/sync       — one-shot scrape. Body: { cookies, surfaces? }.
 *                                      Cookies never persisted.
 *   GET    /api/instagram/status     — connection status, last_synced_at, enabled_surfaces
 *   PATCH  /api/instagram/surfaces   — body: { enabled_surfaces: string[] }
 *   POST   /api/instagram/consent    — body: { consent_version }
 *   DELETE /api/instagram/session    — disconnect: deletes session row only
 *   DELETE /api/instagram/data       — purge IG memories from user_memories
 *   GET    /api/instagram/data-summary — counts for the privacy dashboard
 *
 * All endpoints require JWT auth via existing authenticateUser middleware.
 */

import express from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth.js';
import { getSupabase } from '../services/observationUtils.js';
import { addPlatformObservation } from '../services/memoryStreamService.js';
import { scrapeInstagramWithCookies } from '../services/instagramPlaywrightScraper.js';
import { normalizeInstagramScrape } from '../services/instagramObservationNormalizer.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('InstagramRoutes');
const router = express.Router();

const SUPPORTED_SURFACES = ['saved', 'own_posts', 'follows'];

const SyncBodySchema = z.object({
  cookies: z.array(z.object({
    name: z.string().min(1),
    value: z.string().min(1),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    expirationDate: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.string().optional(),
  })).min(1).max(50),
  surfaces: z.array(z.enum(['saved', 'own_posts', 'follows'])).optional(),
  username: z.string().regex(/^[a-zA-Z0-9._]{1,40}$/).optional(),
});

const SurfacesBodySchema = z.object({
  enabled_surfaces: z.array(z.enum(['saved', 'own_posts', 'follows'])).min(0).max(3),
});

const ConsentBodySchema = z.object({
  consent_version: z.number().int().min(1),
  username: z.string().regex(/^[a-zA-Z0-9._]{1,40}$/),
});

/**
 * Check the kill-switch env var. Default OFF — must be explicitly enabled.
 * `feature_flags` table in this codebase is per-user (user_id, flag_name, enabled),
 * not a global flag table, so we use env for the global kill switch.
 */
function _isKillSwitchActive() {
  const raw = process.env.INSTAGRAM_SCRAPING_ENABLED;
  return raw !== 'true' && raw !== '1';
}

/**
 * Upsert the session row. Cookies are NEVER stored — username + status only.
 */
async function _upsertSession(supabase, userId, username) {
  const { data, error } = await supabase
    .from('instagram_sessions')
    .upsert({
      user_id: userId,
      instagram_username: username || null,
      status: 'connected',
      consent_accepted_at: new Date().toISOString(),
      consent_version: 1,
    }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) {
    log.warn('session upsert error', { error: error.message });
  }
  return data;
}

async function _logSyncAttempt(supabase, userId, surface, result, durationMs) {
  try {
    await supabase.from('instagram_observations_log').insert({
      user_id: userId,
      surface,
      items_scraped: result.scraped[`${surface}_posts`]?.length || result.scraped[surface]?.length || 0,
      items_stored: 0, // updated below
      rate_limited: result.detected.rate_limit,
      captcha_triggered: result.detected.captcha,
      error: result.error,
      duration_ms: durationMs,
      started_at: new Date(Date.now() - durationMs).toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (e) {
    log.warn('sync log insert error', { error: e?.message });
  }
}

// ───────────────────────────────────────────────────────────────
// POST /sync
// ───────────────────────────────────────────────────────────────
router.post('/sync', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthenticated' });

  const supabase = await getSupabase();
  if (_isKillSwitchActive()) {
    return res.status(503).json({
      success: false,
      error: 'instagram_scraping is disabled by feature flag',
    });
  }

  const parsed = SyncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'invalid body',
      details: parsed.error.flatten(),
    });
  }

  const { cookies, surfaces, username } = parsed.data;
  const effectiveSurfaces = surfaces && surfaces.length > 0 ? surfaces : ['saved'];

  // Resolve username from session row if not provided.
  let effectiveUsername = username;
  if (!effectiveUsername) {
    const { data } = await supabase
      .from('instagram_sessions')
      .select('instagram_username')
      .eq('user_id', userId)
      .maybeSingle();
    effectiveUsername = data?.instagram_username;
  }
  if (!effectiveUsername) {
    return res.status(400).json({
      success: false,
      error: 'username required (provide in body or via prior /consent call)',
    });
  }

  // Upsert session row (records last_synced_at later).
  await _upsertSession(supabase, userId, effectiveUsername);

  // Run scraper inline. NEVER throws — returns envelope.
  const result = await scrapeInstagramWithCookies({
    cookies,
    username: effectiveUsername,
    surfaces: effectiveSurfaces,
  });

  // Bail early if IG blocked us.
  if (result.detected.captcha || result.detected.rate_limit || result.detected.suspended) {
    const newStatus = result.detected.suspended
      ? 'disconnected'
      : result.detected.rate_limit
      ? 'rate_limited'
      : 'needs_relogin';
    await supabase
      .from('instagram_sessions')
      .update({ status: newStatus, last_sync_error: result.error || 'IG challenge detected' })
      .eq('user_id', userId);
    return res.status(200).json({
      success: false,
      ok: false,
      detected: result.detected,
      error: result.error || 'IG returned a challenge — see detected flags',
    });
  }

  // Normalize and persist observations.
  const observations = normalizeInstagramScrape(result.scraped, { maxObservations: 80 });
  let storedCount = 0;
  for (const obs of observations) {
    try {
      const stored = await addPlatformObservation(userId, obs.content, 'instagram', {
        contentType: obs.contentType,
        source: 'instagram',
        scraped_at: new Date().toISOString(),
      });
      if (stored) storedCount++;
    } catch (e) {
      log.warn('addPlatformObservation error', { error: e?.message });
    }
  }

  // Update session row with sync completion.
  await supabase
    .from('instagram_sessions')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_post_count: storedCount,
      last_sync_error: null,
      status: 'connected',
    })
    .eq('user_id', userId);

  // Log the attempt.
  await _logSyncAttempt(supabase, userId, 'saved', result, result.duration_ms);

  return res.json({
    success: true,
    ok: result.ok,
    surfaces_scraped: effectiveSurfaces,
    items_found: {
      saved: result.scraped.saved_posts.length,
      own_posts: result.scraped.own_posts.length,
      follows: result.scraped.follows.length,
    },
    observations_stored: storedCount,
    duration_ms: result.duration_ms,
    // Diagnostic info ONLY when scrape returned empty — helps debug Sparticuz-vs-IG fingerprinting.
    // Includes page title + final URL + body preview, no cookies or auth data.
    diagnostics: Object.keys(result.diagnostics || {}).length > 0 ? result.diagnostics : undefined,
    detected: result.detected,
  });
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
