/**
 * WhatsApp Webhook — Kapso.ai Inbound Messages
 * ==============================================
 * Thin transport adapter for Kapso's (and Meta-native) webhook format.
 * Verifies the HMAC signature, dedups retries, normalizes the wire format,
 * and hands off to the provider-agnostic inbound pipeline
 * (services/whatsappInboundPipeline.js) which owns all the actual logic
 * (statement/receipt ingest, thread approvals, transaction capture, twin chat).
 *
 * Kapso sends:
 *   Header: X-Webhook-Event: whatsapp.message.received
 *   Header: X-Webhook-Signature: <HMAC-SHA256>
 *   Header: X-Idempotency-Key: <unique key>
 *   Body:   { message: { id, from, type, text/document/image, ... } }  (v2)
 *
 * POST /api/whatsapp/webhook
 */

import express from 'express';
import crypto from 'crypto';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { processInboundWhatsApp } from '../services/whatsappInboundPipeline.js';
import { connectAliasFromReplyId } from '../services/connectLinkService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppKapsoWebhook');
const router = express.Router();

// ====================================================================
// Dedup: prevent processing the same message twice (Kapso may retry)
// ====================================================================
const processedKeys = new Map(); // key -> timestamp
const DEDUP_TTL_MS = 300_000;    // 5 minutes

const dedupCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, ts] of processedKeys) {
    if (ts < cutoff) processedKeys.delete(key);
  }
}, 120_000);
dedupCleanupInterval.unref();

// ====================================================================
// Webhook signature verification (HMAC-SHA256)
// ====================================================================
function verifyKapsoSignature(signature, rawBody) {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    // Kapso may send raw hex or "sha256=hex" format — handle both
    const sigHash = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    const sigBuf = Buffer.from(sigHash, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    log.warn('Signature verification error', { error: err.message });
    return false;
  }
}

// ====================================================================
// Parse incoming message from either Kapso or Meta native format into the
// normalized shape the inbound pipeline expects.
// ====================================================================
function parseIncomingMessage(body) {
  // Kapso v2 text
  if (body?.message?.type === 'text' && body?.message?.from) {
    const msg = body.message;
    return {
      phone: msg.from,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: msg.username || null,
      format: 'kapso_v2',
    };
  }

  // Kapso v2 document (statement file)
  if (body?.message?.type === 'document' && body?.message?.from) {
    const msg = body.message;
    return {
      phone: msg.from,
      text: null,
      document: {
        id: msg.document?.id,
        filename: msg.document?.filename || null,
        mimeType: msg.document?.mime_type || null,
      },
      messageId: msg.id,
      contactName: msg.username || null,
      format: 'kapso_v2_document',
    };
  }

  // Kapso v2 image (Pix comprovante screenshot)
  if (body?.message?.type === 'image' && body?.message?.from) {
    const msg = body.message;
    return {
      phone: msg.from,
      text: null,
      image: {
        id: msg.image?.id,
        mimeType: msg.image?.mime_type || null,
        caption: msg.image?.caption || null,
      },
      messageId: msg.id,
      contactName: msg.username || null,
      format: 'kapso_v2_image',
    };
  }

  // Kapso v2 interactive reply (tapped a list row or quick-reply button). Map a
  // `connect:<alias>` selection back to a connect intent by synthesizing the
  // equivalent text, so it flows through the existing connect handler; for any
  // other reply, fall through to the row/button title as free text.
  if (body?.message?.type === 'interactive' && body?.message?.from) {
    const msg = body.message;
    const reply = msg.interactive?.list_reply || msg.interactive?.button_reply || null;
    const alias = connectAliasFromReplyId(reply?.id);
    return {
      phone: msg.from,
      text: alias ? `conecta ${alias}` : (reply?.title || null),
      messageId: msg.id,
      contactName: msg.username || null,
      format: 'kapso_v2_interactive',
    };
  }

  // Legacy Kapso v1
  if (body?.event === 'whatsapp.message.received' && body?.data?.message) {
    const { data } = body;
    const msg = data.message;
    if (msg.type !== 'text') return null;
    return {
      phone: data.from || data.contact?.wa_id,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: data.contact?.name,
      format: 'kapso',
    };
  }

  // Kapso batch
  if (body?.data?.messages?.length) {
    const msg = body.data.messages[0];
    if (msg.type !== 'text') return null;
    return {
      phone: msg.from || body.data.contact?.wa_id,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: body.data.contact?.name,
      format: 'kapso_batch',
    };
  }

  // Meta native
  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (messages?.length) {
    const msg = messages[0];
    if (msg.type !== 'text') return null;
    const contacts = body.entry[0].changes[0].value.contacts;
    return {
      phone: msg.from,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: contacts?.[0]?.profile?.name,
      format: 'meta_native',
    };
  }

  return null;
}

// ====================================================================
// POST /api/whatsapp/webhook — Incoming messages from Kapso
// ====================================================================
router.post('/webhook', async (req, res) => {
  // 1. Verify webhook signature
  if (!process.env.KAPSO_WEBHOOK_SECRET) {
    log.error('KAPSO_WEBHOOK_SECRET not configured — rejecting request');
    return res.sendStatus(403);
  }

  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    log.warn('Missing X-Webhook-Signature header');
    return res.sendStatus(403);
  }

  // Use raw body for HMAC verification (re-serialization changes bytes).
  const rawBody = req.rawBody;
  if (!rawBody) {
    log.error('rawBody missing — server.js rawBody capture is misconfigured');
    return res.sendStatus(500);
  }
  if (!verifyKapsoSignature(signature, rawBody)) {
    log.warn('Webhook signature verification failed');
    return res.sendStatus(403);
  }

  // 2. Dedup using X-Idempotency-Key when present, else a content-hash.
  const idempotencyKey = req.headers['x-idempotency-key']
    || `body-sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
  if (processedKeys.has(idempotencyKey)) {
    log.info('Duplicate webhook skipped', { idempotencyKey, source: req.headers['x-idempotency-key'] ? 'header' : 'body-hash' });
    return res.sendStatus(200);
  }
  processedKeys.set(idempotencyKey, Date.now());

  // 3. Process BEFORE responding — Vercel kills async work after res.end().
  try {
    const parsed = parseIncomingMessage(req.body);
    await processInboundWhatsApp(parsed, { send: sendWhatsAppMessage });
  } catch (err) {
    log.error('WhatsApp webhook processing error', { error: err.message, stack: err.stack });
  }

  res.sendStatus(200);
});

export default router;
