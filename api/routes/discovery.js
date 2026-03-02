// api/routes/discovery.js
import express from 'express';
import profileEnrichmentService from '../services/profileEnrichmentService.js';

const router = express.Router();

// Simple in-memory rate limit: 5 requests per IP per 15 min
const attempts = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > entry.resetAt) { attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 }); return true; }
  if (entry.count >= 5) return false;
  entry.count++;
  attempts.set(ip, entry);
  return true;
}

// POST /api/discovery/scan — no auth required
router.post('/scan', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Try again in 15 minutes.' });

  const { email, name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const result = await profileEnrichmentService.quickEnrich(email, name || null);
    // result = { success, data: { discovered_name, ... }, elapsed }
    // Return null if nothing was found (source === 'none' means both Gravatar + GitHub failed)
    const innerData = result?.data;
    const discovered = (innerData && innerData.source !== 'none') ? innerData : null;
    res.json({ discovered });
  } catch (err) {
    console.error('[Discovery] Scan error:', err.message);
    res.json({ discovered: null });
  }
});

export default router;
