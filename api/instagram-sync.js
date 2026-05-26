/**
 * Instagram Sync — Standalone Vercel Serverless Function
 * ========================================================
 * Extracted from the Express monolith so the @sparticuz/chromium bundle
 * (~66MB) is isolated to ONE Lambda instead of polluting every route.
 *
 * Before this extraction:
 *   - Every /api/* route shared one Lambda with @sparticuz/chromium
 *   - 9-minute builds, slow cold starts on every endpoint
 * After:
 *   - /api/instagram/sync rewrites here; gets the heavy Chromium bundle
 *   - All other /api/instagram/* (status, consent, surfaces, delete) stay
 *     in the Express monolith with sub-second cold starts
 *
 * Route mapping: vercel.json "rewrites" forwards /api/instagram/sync here.
 *
 * Note: this re-implements the auth + Zod + DB plumbing inline (instead of
 * importing api/middleware/auth.js or api/services/memoryStreamService.js)
 * so the Lambda bundle stays tight. The downside is observations land in
 * user_memories WITHOUT embeddings — a separate cron (or follow-up sync)
 * picks them up. Acceptable for the manual-sync UX.
 */

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { supabaseAdmin } from './services/database.js';
import { scrapeInstagramWithCookies } from './services/instagramPlaywrightScraper.js';
import { normalizeInstagramScrape } from './services/instagramObservationNormalizer.js';
import { createLogger } from './services/logger.js';

const log = createLogger('instagram-sync');
const JWT_SECRET = process.env.JWT_SECRET;

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

function isKillSwitchActive() {
  const raw = process.env.INSTAGRAM_SCRAPING_ENABLED;
  return raw !== 'true' && raw !== '1';
}

function verifyJwt(req) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  if (!token || !JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return payload.id || payload.userId || null;
  } catch (e) {
    log.warn('JWT verify failed', { error: e?.message });
    return null;
  }
}

// Vercel serverless handler — matches Vercel function signature (req, res)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const userId = verifyJwt(req);
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }

  if (isKillSwitchActive()) {
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
  const effectiveSurfaces = (surfaces && surfaces.length > 0) ? surfaces : ['saved'];

  // Resolve username from session row if not in body
  let effectiveUsername = username;
  if (!effectiveUsername) {
    const { data } = await supabaseAdmin
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

  // Upsert session row (best-effort)
  try {
    await supabaseAdmin
      .from('instagram_sessions')
      .upsert({
        user_id: userId,
        instagram_username: effectiveUsername,
        status: 'connected',
        consent_accepted_at: new Date().toISOString(),
        consent_version: 1,
      }, { onConflict: 'user_id' });
  } catch (e) {
    log.warn('session upsert error', { error: e?.message });
  }

  // Run the scrape (this is the heavy call — pulls in playwright-core + @sparticuz/chromium)
  const result = await scrapeInstagramWithCookies({
    cookies,
    username: effectiveUsername,
    surfaces: effectiveSurfaces,
  });

  // IG challenge handling
  if (result.detected.captcha || result.detected.rate_limit || result.detected.suspended) {
    const newStatus = result.detected.suspended
      ? 'disconnected'
      : result.detected.rate_limit
      ? 'rate_limited'
      : 'needs_relogin';
    try {
      await supabaseAdmin
        .from('instagram_sessions')
        .update({ status: newStatus, last_sync_error: result.error || 'IG challenge detected' })
        .eq('user_id', userId);
    } catch {}
    return res.status(200).json({
      success: false,
      ok: false,
      detected: result.detected,
      diagnostics: result.diagnostics,
      error: result.error || 'IG returned a challenge — see detected flags',
    });
  }

  // Normalize + persist (inline, no embeddings — saves bundle size)
  const observations = normalizeInstagramScrape(result.scraped, { maxObservations: 80 });
  let storedCount = 0;
  const nowIso = new Date().toISOString();
  for (const obs of observations) {
    try {
      const { error } = await supabaseAdmin.from('user_memories').insert({
        user_id: userId,
        content: obs.content,
        memory_type: 'platform_data',
        importance_score: 5, // default mid-importance — re-rated by cron later
        metadata: {
          source: 'instagram',
          platform: 'instagram',
          contentType: obs.contentType,
          scraped_at: nowIso,
        },
      });
      if (!error) storedCount++;
    } catch (e) {
      log.warn('memory insert error', { error: e?.message });
    }
  }

  // Update session row with sync completion
  try {
    await supabaseAdmin
      .from('instagram_sessions')
      .update({
        last_synced_at: nowIso,
        last_sync_post_count: storedCount,
        last_sync_error: null,
        status: 'connected',
      })
      .eq('user_id', userId);
  } catch {}

  // Log the attempt (best-effort)
  try {
    await supabaseAdmin.from('instagram_observations_log').insert({
      user_id: userId,
      surface: effectiveSurfaces[0] || 'saved',
      items_scraped: result.scraped.saved_posts.length + result.scraped.own_posts.length + result.scraped.follows.length,
      items_stored: storedCount,
      rate_limited: result.detected.rate_limit,
      captcha_triggered: result.detected.captcha,
      error: result.error,
      duration_ms: result.duration_ms,
      started_at: new Date(Date.now() - result.duration_ms).toISOString(),
      completed_at: nowIso,
    });
  } catch {}

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
    diagnostics: Object.keys(result.diagnostics || {}).length > 0 ? result.diagnostics : undefined,
    detected: result.detected,
  });
}
