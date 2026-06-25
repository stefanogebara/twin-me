/**
 * Webhook: Vapi call events
 * =========================
 * Receives Vapi server messages for the twin's outbound calls. We act on the
 * terminal end-of-call-report (store transcript + outcome, notify the user) and
 * acknowledge everything else.
 *
 * Auth: a shared secret. Set VAPI_WEBHOOK_SECRET here AND as the webhook's
 * "Server Secret" in Vapi; Vapi sends it back in the X-Vapi-Secret header. No
 * secret configured → every call is rejected (the feature is off until set up).
 *
 * Mounted at /api/webhooks/vapi. Errors return 200 so Vapi doesn't hammer
 * retries on a bug on our side (the report is already logged).
 */

import express from 'express';
import crypto from 'crypto';
import { handleCallWebhook } from '../services/callService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('VapiWebhook');
const router = express.Router();

/**
 * Constant-time comparison of the X-Vapi-Secret header against the configured
 * secret. Returns false when no secret is configured (feature inert) or on any
 * mismatch. Pure.
 */
export function verifyVapiSecret(headers = {}) {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = headers['x-vapi-secret'] || headers['X-Vapi-Secret'] || '';
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/', async (req, res) => {
  if (!verifyVapiSecret(req.headers)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await handleCallWebhook(req.body);
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('vapi webhook handler failed', { error: err.message });
    // 200 on our own error so Vapi doesn't retry-storm; the event is logged.
    return res.status(200).json({ success: false, error: 'internal' });
  }
});

export default router;
