/**
 * OG Image & Share Routes
 *
 * GET /api/og/soul-card?userId=X  -> PNG card for social previews / download
 * GET /api/s/:userId              -> HTML with OG meta tags + redirect to SPA
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin } from '../services/database.js';
import { renderSoulCard, renderFallbackCard } from '../services/soulCardRenderer.js';
import { get as cacheGet, set as cacheSet, del as cacheDel } from '../services/redisClient.js';
import jwt from 'jsonwebtoken';
import { createLogger } from '../services/logger.js';

const log = createLogger('OGImage');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OG_CARD_TTL = 3600;    // 1 hour
const OG_DATA_TTL = 900;     // 15 minutes
// CDN may serve a stale card for up to a day while revalidating in the
// background — repeat scraper traffic lands on Vercel's edge, not our CPU.
const OG_SWR_SECONDS = 86400;

// Dedicated per-IP limiter: the route is deliberately public (OG scrapers
// can't authenticate) and satori+resvg rendering is CPU-heavy, so the generic
// apiLimiter (500/15min) is too loose. Legit scrapers fetch a card once per
// share; the CDN absorbs repeats.
const OG_CARD_RATE_LIMIT_MAX = parseInt(process.env.OG_CARD_RATE_LIMIT_MAX, 10) || 30;
const ogCardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: OG_CARD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many soul-card requests. Please try again shortly.' },
});

// The fallback card is identical for every request — render it once per
// process instead of burning a full satori+resvg pass on every garbage or
// unknown userId (this endpoint is unauthenticated).
let fallbackCardPromise = null;
function getFallbackCard() {
  if (!fallbackCardPromise) {
    fallbackCardPromise = renderFallbackCard().catch((err) => {
      fallbackCardPromise = null; // allow retry on transient failure (e.g. fonts not ready)
      throw err;
    });
  }
  return fallbackCardPromise;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fetch soul signature + user name from Supabase. */
async function fetchSignatureData(userId) {
  if (!supabaseAdmin) return null;

  // Try cache first
  const cacheKey = `og:data:${userId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const { data: sig, error } = await supabaseAdmin
    .from('soul_signatures')
    .select('archetype_name, archetype_subtitle, defining_traits, color_scheme, is_public')
    .eq('user_id', userId)
    .single();

  if (error || !sig) return null;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('first_name')
    .eq('id', userId)
    .single();

  const result = {
    archetypeName: sig.archetype_name,
    subtitle: sig.archetype_subtitle,
    traits: sig.defining_traits || [],
    colorScheme: sig.color_scheme || {},
    isPublic: sig.is_public || false,
    firstName: user?.first_name || 'Someone',
  };

  await cacheSet(cacheKey, result, OG_DATA_TTL);
  return result;
}

/** Try to extract userId from JWT in Authorization header. */
function extractUserIdFromJWT(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId || decoded.id || decoded.sub || null;
  } catch {
    return null;
  }
}

// ─── GET /og/soul-card?userId=X ─────────────────────────────────────────────

router.get('/og/soul-card', ogCardLimiter, async (req, res) => {
  try {
    const { userId } = req.query;

    // Validate before any work — garbage params cost one memoized buffer, zero renders.
    if (!userId || !UUID_RE.test(userId)) {
      const fallback = await getFallbackCard();
      return sendPng(res, fallback, 300);
    }

    // Check PNG cache
    const pngCacheKey = `og:card:${userId}`;
    const cachedPng = await cacheGet(pngCacheKey);
    if (cachedPng) {
      const buf = Buffer.from(cachedPng, 'base64');
      return sendPng(res, buf, 3600);
    }

    // Fetch data
    const data = await fetchSignatureData(userId);

    if (!data) {
      const fallback = await getFallbackCard();
      return sendPng(res, fallback, 300);
    }

    // If private, only allow the owner to download
    if (!data.isPublic) {
      const requesterId = extractUserIdFromJWT(req);
      if (requesterId !== userId) {
        const fallback = await getFallbackCard();
        return sendPng(res, fallback, 300);
      }
    }

    // Render card
    const png = await renderSoulCard({
      firstName: data.firstName,
      archetypeName: data.archetypeName,
      subtitle: data.subtitle,
      traits: data.traits,
      colorScheme: data.colorScheme,
    });

    // Cache the PNG (base64 to fit in Redis JSON store)
    await cacheSet(pngCacheKey, png.toString('base64'), OG_CARD_TTL);

    return sendPng(res, png, 3600);
  } catch (err) {
    log.error('Error:', err);
    try {
      const fallback = await getFallbackCard();
      return sendPng(res, fallback, 60);
    } catch {
      return res.status(500).send('Internal server error');
    }
  }
});

function sendPng(res, buffer, maxAge) {
  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${OG_SWR_SECONDS}`,
    'Content-Length': buffer.length,
  });
  return res.send(buffer);
}

// ─── GET /s/:userId ─────────────────────────────────────────────────────────

router.get('/s/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!UUID_RE.test(userId)) {
      return sendOgHtml(res, {
        title: 'Soul Signature | Twin Me',
        description: 'Discover what makes you authentically you',
        imageUrl: `${getBaseUrl(req)}/api/og/soul-card?userId=unknown`,
        redirectUrl: '/',
      });
    }

    const data = await fetchSignatureData(userId);

    if (!data || !data.isPublic) {
      return sendOgHtml(res, {
        title: 'Soul Signature | Twin Me',
        description: 'Discover what makes you authentically you',
        imageUrl: `${getBaseUrl(req)}/api/og/soul-card?userId=${userId}`,
        redirectUrl: `/s/${userId}`,
      });
    }

    const title = `${data.archetypeName} - ${data.firstName}'s Soul Signature`;
    const description = data.subtitle ? `"${data.subtitle}"` : 'Discover what makes you authentically you';
    const imageUrl = `${getBaseUrl(req)}/api/og/soul-card?userId=${userId}`;

    return sendOgHtml(res, {
      title,
      description,
      imageUrl,
      redirectUrl: `/s/${userId}`,
    });
  } catch (err) {
    log.error('Error:', err);
    return sendOgHtml(res, {
      title: 'Soul Signature | Twin Me',
      description: 'Discover what makes you authentically you',
      imageUrl: `${getBaseUrl(req)}/api/og/soul-card?userId=unknown`,
      redirectUrl: '/',
    });
  }
});

function getBaseUrl(req) {
  if (process.env.NODE_ENV === 'production') {
    return 'https://twin-ai-learn.vercel.app';
  }
  return `${req.protocol}://${req.get('host')}`;
}

function sendOgHtml(res, { title, description, imageUrl, redirectUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImg = escapeHtml(imageUrl);
  const safeRedirect = escapeHtml(redirectUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImg}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImg}" />
  <meta http-equiv="refresh" content="0;url=${safeRedirect}" />
</head>
<body>
  <p>Redirecting to <a href="${safeRedirect}">${safeTitle}</a>...</p>
</body>
</html>`;

  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  });
  return res.send(html);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Exports ────────────────────────────────────────────────────────────────

export default router;

/**
 * Invalidate OG card cache for a user.
 * Call this when signature data changes (regeneration, visibility toggle).
 */
export async function invalidateOgCache(userId) {
  await cacheDel(`og:card:${userId}`);
  await cacheDel(`og:data:${userId}`);
}
