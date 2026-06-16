/**
 * WhatsApp Webhook — Z-API Inbound Messages
 * ==========================================
 * Thin transport adapter for Z-API's (unofficial WhatsApp-Web) webhook format.
 * Z-API is the active provider for the Brazilian money flow — no 24h window,
 * so forwarded Pix receipts / statements can be answered any time.
 *
 * Auth: Z-API cannot attach custom headers to its outbound callbacks, so the
 * webhook is secured with a shared secret carried in the URL query string
 * (configure the callback URL in the Z-API dashboard as
 *   https://<host>/api/whatsapp-zapi/webhook?secret=<ZAPI_WEBHOOK_SECRET>).
 * Fails closed if the secret is unset or mismatched.
 *
 * Z-API "on-message-received" body (per message type):
 *   text:     { phone, fromMe, isGroup, messageId, senderName, type:'ReceivedCallback', text:{ message } }
 *   image:    { ..., image:    { imageUrl, mimeType, caption } }
 *   document: { ..., document: { documentUrl, fileName, mimeType, title } }
 * Media arrives as a direct URL — downloadWhatsAppMedia GETs it.
 *
 * POST /api/whatsapp-zapi/webhook
 */

import express from 'express';
import crypto from 'crypto';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { processInboundWhatsApp } from '../services/whatsappInboundPipeline.js';
import { parseZapiMessage } from '../services/zapiParse.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppZapiWebhook');
const router = express.Router();

// ====================================================================
// Dedup: Z-API may resend on delivery timeout. Key on messageId.
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

// ====================================================================
// Shared-secret check (constant-time). Secret rides in ?secret=.
// ====================================================================
function verifySecret(provided) {
  const expected = process.env.ZAPI_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ====================================================================
// POST /api/whatsapp-zapi/webhook
// ====================================================================
router.post('/webhook', async (req, res) => {
  if (!process.env.ZAPI_WEBHOOK_SECRET) {
    log.error('ZAPI_WEBHOOK_SECRET not configured — rejecting request');
    return res.sendStatus(403);
  }
  if (!verifySecret(req.query.secret)) {
    log.warn('Z-API webhook secret mismatch');
    return res.sendStatus(403);
  }

  // Optional instance pinning: ignore callbacks from a different instance.
  if (process.env.ZAPI_INSTANCE_ID && req.body?.instanceId &&
      req.body.instanceId !== process.env.ZAPI_INSTANCE_ID) {
    log.warn('Z-API callback from unexpected instance', { got: req.body.instanceId?.slice(-6) });
    return res.sendStatus(200);
  }

  // Dedup
  const key = req.body?.messageId || req.body?.id
    || `body-sha256:${crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex')}`;
  if (processedKeys.has(key)) {
    log.info('Duplicate Z-API webhook skipped', { key });
    return res.sendStatus(200);
  }
  processedKeys.set(key, Date.now());

  // Process before responding (Vercel kills async work after res.end()).
  try {
    const parsed = parseZapiMessage(req.body);
    if (parsed) {
      await processInboundWhatsApp(parsed, { send: sendWhatsAppMessage });
    } else {
      log.info('Z-API callback ignored (own/group/status/unsupported)', { type: req.body?.type, fromMe: req.body?.fromMe });
    }
  } catch (err) {
    log.error('Z-API webhook processing error', { error: err.message, stack: err.stack });
  }

  res.sendStatus(200);
});

export default router;
