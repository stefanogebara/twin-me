// api/routes/discovery.js
import express from 'express';
import profileEnrichmentService from '../services/profileEnrichmentService.js';

const router = express.Router();

// In-memory rate limiter: 3 requests per IP per 15 min (tighter for abuse prevention)
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MIN_RESPONSE_DELAY_MS = 800; // Prevent timing attacks / email enumeration

const attempts = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  attempts.set(ip, entry);
  return true;
}

// Prune expired entries every 30 min to prevent unbounded Map growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

// POST /api/discovery/scan — public endpoint with rate limiting
router.post('/scan', async (req, res) => {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress;

  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in 15 minutes.' });
  }

  const { email, name } = req.body;
  if (!email || typeof email !== 'string' || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // Sanitize name input
  const safeName = name && typeof name === 'string' ? name.substring(0, 100).trim() : null;

  try {
    const result = await profileEnrichmentService.quickEnrich(email, safeName);
    const innerData = result?.data;
    const discovered = (innerData && innerData.source !== 'none') ? innerData : null;

    // Normalize response timing to prevent enumeration via latency
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_RESPONSE_DELAY_MS - elapsed);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    res.json({ discovered });
  } catch (err) {
    console.error('[Discovery] Scan error:', err.message);
    // Same response shape on error — prevents enumeration
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_RESPONSE_DELAY_MS - elapsed);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    res.json({ discovered: null });
  }
});

export default router;
