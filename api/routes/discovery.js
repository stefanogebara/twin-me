// api/routes/discovery.js
import express from 'express';
import profileEnrichmentService from '../services/profileEnrichmentService.js';
import { braveWebSearch } from '../services/enrichment/braveSearchProvider.js';
import { inferNameFromEmail } from '../services/enrichment/enrichmentUtils.js';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';
import { getRedisClient, isRedisAvailable } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Discovery');

const router = express.Router();

// Rate limiter: 3 requests per IP per 15 min (tighter for abuse prevention)
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_S = 15 * 60; // 15 minutes in seconds
const MIN_RESPONSE_DELAY_MS = 800; // Prevent timing attacks / email enumeration

// In-memory fallback (resets on cold start — Redis is the primary store)
const fallbackAttempts = new Map();

/**
 * Check rate limit for discovery/scan endpoint.
 * Uses Redis INCR with TTL for cross-instance persistence.
 * Falls back to in-memory Map if Redis is unavailable.
 * @param {string} ip - Client IP address
 * @returns {Promise<boolean>} true if allowed, false if rate limited
 */
async function rateLimit(ip) {
  // Try Redis first (survives Vercel cold starts)
  try {
    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      const key = `ratelimit:scan:${ip}`;
      const count = await client.incr(key);
      // Set TTL only on first request (when count becomes 1)
      if (count === 1) {
        await client.expire(key, RATE_LIMIT_WINDOW_S);
      }
      return count <= RATE_LIMIT_MAX;
    }
  } catch (redisErr) {
    log.warn('Redis rate limit failed, using in-memory fallback:', redisErr.message);
  }

  // Fallback: in-memory Map (resets on cold start)
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_S * 1000;
  const entry = fallbackAttempts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    fallbackAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  fallbackAttempts.set(ip, entry);
  return true;
}

// Prune expired in-memory entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of fallbackAttempts) {
    if (now > entry.resetAt) fallbackAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

// POST /api/discovery/scan — public endpoint with rate limiting
router.post('/scan', async (req, res) => {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress;

  if (!(await rateLimit(ip))) {
    return res.status(429).json({ success: false, error: 'Too many requests. Try again in 15 minutes.' });
  }

  const { email, name } = req.body;
  if (!email || typeof email !== 'string' || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }

  // Sanitize name input
  const safeName = name && typeof name === 'string' ? name.substring(0, 100).trim() : null;

  try {
    // Phase 1: Quick enrichment (Gravatar + GitHub + social probing) — ~2s
    const result = await profileEnrichmentService.quickEnrich(email, safeName);
    const innerData = result?.data;
    const discovered = (innerData && innerData.source !== 'none') ? innerData : null;

    // Phase 2: Brave search + LLM persona summary — runs in parallel with response delay
    // Only if we have BRAVE_SEARCH_API_KEY and either a name or an inferred one
    let persona_summary = null;
    const personName = discovered?.discovered_name || safeName || inferNameFromEmail(email);

    if (personName && process.env.BRAVE_SEARCH_API_KEY) {
      try {
        const searchQuery = `"${personName}" ${email.split('@')[0]}`;
        const braveResults = await braveWebSearch(searchQuery, process.env.BRAVE_SEARCH_API_KEY);

        // Gather all evidence: Brave snippets + quickEnrich data
        const snippets = (braveResults || [])
          .map(r => `${r.title}: ${r.description}${r.extra_snippets ? ' ' + r.extra_snippets.join(' ') : ''}`)
          .join('\n');

        const socialInfo = (discovered?.social_links || [])
          .map(l => `${l.platform}: ${l.url}`).join(', ');

        const knownFacts = [
          discovered?.discovered_name && `Name: ${discovered.discovered_name}`,
          discovered?.discovered_company && `Company: ${discovered.discovered_company}`,
          discovered?.discovered_location && `Location: ${discovered.discovered_location}`,
          discovered?.discovered_bio && `Bio: ${discovered.discovered_bio}`,
          discovered?.github_repos && `GitHub repos: ${discovered.github_repos}`,
          discovered?.github_languages?.length && `Languages: ${discovered.github_languages.join(', ')}`,
          socialInfo && `Social profiles: ${socialInfo}`,
        ].filter(Boolean).join('\n');

        const evidence = [knownFacts, snippets].filter(Boolean).join('\n\n---\nWeb results:\n');

        if (evidence.length > 50) {
          const llmResult = await complete({
            tier: TIER_EXTRACTION,
            system: `You write brief, warm persona summaries for a soul signature app. Be specific — mention actual details found. If info is scarce, be honest but intriguing. Never fabricate. Write in second person ("You..."). 2-4 sentences max.`,
            messages: [{
              role: 'user',
              content: `Based on what we found about this person (email: ${email}), write a brief persona snapshot:\n\n${evidence}`,
            }],
            serviceName: 'discovery-persona',
          });
          persona_summary = llmResult?.content?.trim() || null;
        }
      } catch (braveErr) {
        log.warn('Persona summary failed (non-blocking):', braveErr.message);
      }
    }

    if (discovered) {
      discovered.persona_summary = persona_summary;
    }

    // Normalize response timing to prevent enumeration via latency
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_RESPONSE_DELAY_MS - elapsed);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    res.json({ success: true, discovered });
  } catch (err) {
    log.error('Scan error:', err.message);
    // Same response shape on error — prevents enumeration
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_RESPONSE_DELAY_MS - elapsed);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    res.json({ success: true, discovered: null });
  }
});

export default router;
