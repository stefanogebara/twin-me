/**
 * WhatsApp Webhook — Evolution API (self-hosted) Inbound Messages
 * ===============================================================
 * Thin transport adapter for Evolution API's "messages.upsert" webhook.
 * Evolution is the free, self-hosted alternative to Z-API (Baileys-based) —
 * no per-message cost, no 24h window. Verifies a shared secret, dedups,
 * normalizes the wire format, and hands off to the provider-agnostic inbound
 * pipeline (services/whatsappInboundPipeline.js).
 *
 * Auth: Evolution can be configured to send an `apikey` header on webhooks, but
 * for portability we also accept a shared secret in the URL query string —
 * configure the callback as
 *   https://<host>/api/whatsapp-evolution/webhook?secret=<EVOLUTION_WEBHOOK_SECRET>
 * Fails closed if the secret is unset or mismatched.
 *
 * POST /api/whatsapp-evolution/webhook
 */

import express from 'express';
import crypto from 'crypto';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { processInboundWhatsApp } from '../services/whatsappInboundPipeline.js';
import { parseEvolutionMessage } from '../services/evolutionParse.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppEvolutionWebhook');
const router = express.Router();

// ====================================================================
// Dedup: Evolution may resend on delivery timeout. Key on messageId.
// ====================================================================
const processedKeys = new Map();
const DEDUP_TTL_MS = 300_000;

const dedupCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, ts] of processedKeys) {
    if (ts < cutoff) processedKeys.delete(key);
  }
}, 120_000);
dedupCleanupInterval.unref();

// Shared-secret check (constant-time). Secret rides in ?secret=.
function verifySecret(provided) {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ====================================================================
// POST /api/whatsapp-evolution/webhook
// ====================================================================
router.post('/webhook', async (req, res) => {
  if (!process.env.EVOLUTION_WEBHOOK_SECRET) {
    log.error('EVOLUTION_WEBHOOK_SECRET not configured — rejecting request');
    return res.sendStatus(403);
  }
  if (!verifySecret(req.query.secret)) {
    log.warn('Evolution webhook secret mismatch');
    return res.sendStatus(403);
  }

  // Optional instance pinning.
  if (process.env.EVOLUTION_INSTANCE && req.body?.instance &&
      req.body.instance !== process.env.EVOLUTION_INSTANCE) {
    log.warn('Evolution callback from unexpected instance', { got: req.body.instance });
    return res.sendStatus(200);
  }

  // Dedup. Evolution `data` may be a single object or a one-element array.
  const data = Array.isArray(req.body?.data) ? req.body.data[0] : req.body?.data;
  const key = data?.key?.id
    || `body-sha256:${crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex')}`;
  if (processedKeys.has(key)) {
    log.info('Duplicate Evolution webhook skipped', { key });
    return res.sendStatus(200);
  }
  processedKeys.set(key, Date.now());

  // Process before responding (Vercel kills async work after res.end()).
  try {
    const parsed = parseEvolutionMessage(req.body);
    if (parsed) {
      await processInboundWhatsApp(parsed, { send: sendWhatsAppMessage });
    } else {
      log.info('Evolution callback ignored (own/group/non-message/unsupported)', { event: req.body?.event });
    }
  } catch (err) {
    log.error('Evolution webhook processing error', { error: err.message, stack: err.stack });
  }

  res.sendStatus(200);
});

export default router;
