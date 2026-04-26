/**
 * Temporary debug endpoint to surface what process.env actually contains
 * for the purchase bot config. DELETE this file after troubleshooting.
 *
 * Returns the literal string + length + JSON-encoded form so we can spot
 * trailing whitespace / quote-wrapping / any encoding weirdness.
 *
 * Auth: requires a magic header (DEBUG_TOKEN env). Without it: 404 — looks
 * like the route doesn't exist.
 */
import express from 'express';

const router = express.Router();

router.get('/purchase-env', (req, res) => {
  // 404 unless caller has the magic token. Don't even confirm route exists.
  if (req.headers['x-debug-token'] !== process.env.DEBUG_TOKEN) {
    return res.sendStatus(404);
  }

  const inspect = (key) => {
    const v = process.env[key];
    if (v === undefined) return { value: null, undefined: true };
    return {
      length: v.length,
      raw_json: JSON.stringify(v),
      starts: v.slice(0, 6),
      ends: v.slice(-4),
      eq_true: v === 'true',
    };
  };

  res.json({
    PURCHASE_BOT_ENABLED: inspect('PURCHASE_BOT_ENABLED'),
    PURCHASE_RATE_LIMIT_PER_HOUR: inspect('PURCHASE_RATE_LIMIT_PER_HOUR'),
    NODE_ENV: process.env.NODE_ENV,
  });
});

export default router;
