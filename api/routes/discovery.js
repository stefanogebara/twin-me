// api/routes/discovery.js
import express from 'express';
import profileEnrichmentService from '../services/profileEnrichmentService.js';
import { searchWithBrave } from '../services/enrichment/braveSearchProvider.js';
import { inferNameFromEmail } from '../services/enrichment/enrichmentUtils.js';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
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
    // Always create a discovered object so we can attach persona_summary
    const discovered = (innerData && innerData.source !== 'none')
      ? innerData
      : { source: 'web_scrape', social_links: [], discovered_name: null, discovered_photo: null, discovered_company: null, discovered_location: null, discovered_bio: null, discovered_github_url: null, discovered_twitter_url: null, github_repos: null, github_followers: null, github_languages: null, github_top_repos: null };

    // Phase 2: Deep web scraping + LLM persona narrative
    // Time-budgeted: skip if Phase 1 already used >20s (Vercel 60s limit)
    let persona_summary = null;
    const personName = discovered.discovered_name || safeName || inferNameFromEmail(email);
    const phase1Elapsed = Date.now() - startTime;
    const PHASE2_BUDGET_MS = 30000; // 30s max for Phase 2 (server timeout is 55s)
    const skipPhase2 = phase1Elapsed > 20000;

    if (personName && process.env.BRAVE_SEARCH_API_KEY && !skipPhase2) {
      try {
        log.info(`Deep discovery for "${personName}" (${email}), budget: ${PHASE2_BUDGET_MS}ms`);

        // Race Phase 2 against a timeout
        const phase2Promise = (async () => {
          const braveResult = await searchWithBrave(personName, email);
          if (!braveResult) return null;

          const socialInfo = (discovered?.social_links || [])
            .map(l => `${l.platform}: ${l.url}`).join(', ');

          const knownFacts = [
            discovered?.discovered_name && `Name: ${discovered.discovered_name}`,
            discovered?.discovered_company && `Company: ${discovered.discovered_company}`,
            discovered?.hunter_position && `Role: ${discovered.hunter_position}${discovered.hunter_seniority ? ` (${discovered.hunter_seniority})` : ''}`,
            discovered?.discovered_location && `Location: ${discovered.discovered_location}`,
            discovered?.discovered_bio && `Bio: ${discovered.discovered_bio}`,
            discovered?.github_repos && `GitHub repos: ${discovered.github_repos}`,
            discovered?.github_languages?.length && `Languages: ${discovered.github_languages.join(', ')}`,
            discovered?.reddit_interests?.length && `Reddit communities: ${discovered.reddit_interests.join(', ')}`,
            discovered?.hn_topics?.length && `Hacker News topics: ${discovered.hn_topics.join(', ')}`,
            discovered?.hn_karma && `Hacker News karma: ${discovered.hn_karma}`,
            discovered?.twitter_bio && `Twitter/X bio: ${discovered.twitter_bio}`,
            discovered?.spotify_exists && `Has Spotify profile`,
            socialInfo && `Social profiles: ${socialInfo}`,
          ].filter(Boolean).join('\n');

          const evidence = [
            knownFacts && `=== KNOWN FACTS ===\n${knownFacts}`,
            braveResult.scrapedOnly && `=== SCRAPED WEB PAGES ===\n${braveResult.scrapedOnly.substring(0, 8000)}`,
            braveResult.snippetsOnly && `=== SEARCH SNIPPETS ===\n${braveResult.snippetsOnly.substring(0, 3000)}`,
          ].filter(Boolean).join('\n\n');

          if (evidence.length > 100) {
            const llmResult = await complete({
              tier: TIER_ANALYSIS,
              system: `You are a soul signature analyst. From web-scraped data about a person, write a vivid persona portrait.

RULES:
- Write in second person ("You...")
- Cover what you actually found: career, location, interests, personality, life details
- Be specific — mention real names, places, companies, projects, hobbies
- If you found a lot, write 4-6 sentences covering career, personal life, and what makes them unique
- If info is scarce, write 2-3 honest sentences with what you found — don't pad with generics
- NEVER fabricate or assume facts not in the evidence
- Tone: warm, perceptive, like a friend who just looked you up and is genuinely impressed
- NEVER mention platform names where you found the data (no "your Instagram", "on Pinterest", "your Twitter", "on LinkedIn", "your GitHub" etc.) — talk about the PERSON, not where you scraped them from
- Do NOT mention follower counts, profile URLs, or any social media metrics
- Focus on WHO they are, not WHERE they post`,
              messages: [{
                role: 'user',
                content: `Write a persona portrait for this person (email username: ${email.split('@')[0]}):\n\n${evidence}`,
              }],
              maxTokens: 200,
              serviceName: 'discovery-persona',
            });

            return { summary: llmResult?.content?.trim() || null, sources: braveResult.sources?.slice(0, 8) };
          }
          return { summary: null, sources: braveResult.sources?.slice(0, 8) };
        })();

        const timeoutPromise = new Promise(resolve =>
          setTimeout(() => resolve(null), PHASE2_BUDGET_MS)
        );

        const phase2Result = await Promise.race([phase2Promise, timeoutPromise]);

        if (phase2Result) {
          persona_summary = phase2Result.summary;
          if (phase2Result.sources?.length) {
            discovered._web_sources = phase2Result.sources;
          }
          log.info(`Persona summary generated: ${persona_summary?.length || 0} chars`);
        } else {
          log.warn('Phase 2 timed out or skipped — returning Phase 1 data only');
        }
      } catch (braveErr) {
        log.warn('Persona summary failed (non-blocking):', braveErr.message);
      }
    } else if (skipPhase2) {
      log.warn(`Phase 2 skipped — Phase 1 took ${phase1Elapsed}ms (>20s budget)`);
    }

    discovered.persona_summary = persona_summary;
    discovered.web_sources = discovered._web_sources || [];
    delete discovered._web_sources;

    // Only return discovered if we actually found something useful
    const hasAnything = persona_summary || discovered.discovered_name || discovered.social_links?.length > 0 || discovered.discovered_github_url;
    const finalDiscovered = hasAnything ? discovered : null;

    // Normalize response timing to prevent enumeration via latency
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_RESPONSE_DELAY_MS - elapsed);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    res.json({ success: true, discovered: finalDiscovered });
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
