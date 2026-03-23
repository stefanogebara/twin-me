/**
 * WhatsApp Service — Kapso.ai SDK with Meta Cloud API Fallback
 * ==============================================================
 * Uses kapso.ai WhatsApp API (cheaper, better DX, WhatsApp Flows)
 * with automatic fallback to direct Meta Cloud API if Kapso is
 * not configured.
 *
 * Kapso env vars:
 *   KAPSO_API_KEY — kapso.ai API key
 *   KAPSO_PHONE_NUMBER_ID — WhatsApp phone number ID on Kapso
 *
 * Fallback env vars (direct Meta Cloud API):
 *   TWINME_WHATSAPP_PHONE_NUMBER_ID
 *   TWINME_WHATSAPP_ACCESS_TOKEN
 *   TWINME_WHATSAPP_VERIFY_TOKEN
 *   TWINME_WHATSAPP_WEBHOOK_SECRET
 */

import crypto from 'crypto';
import axios from 'axios';
import { createLogger } from './logger.js';

const log = createLogger('WhatsApp');

const GRAPH_API_VERSION = 'v21.0';
const USE_KAPSO = !!process.env.KAPSO_API_KEY;

// Lazy-initialize Kapso client (only when needed)
let kapsoClient = null;

function getKapsoClient() {
  if (kapsoClient) return kapsoClient;
  try {
    // Dynamic import to avoid breaking if SDK not installed
    const { WhatsAppClient } = require('@kapso/whatsapp-cloud-api');
    kapsoClient = new WhatsAppClient({ kapsoApiKey: process.env.KAPSO_API_KEY });
    log.info('Kapso WhatsApp client initialized');
    return kapsoClient;
  } catch (err) {
    log.error('Failed to initialize Kapso client', { error: err.message });
    return null;
  }
}

/**
 * Send a text message via WhatsApp (Kapso or Meta Cloud API fallback).
 */
export async function sendWhatsAppMessage(recipientPhone, text) {
  // Try Kapso first
  if (USE_KAPSO) {
    const client = getKapsoClient();
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;

    if (client && phoneNumberId) {
      try {
        const result = await client.messages.sendText({
          phoneNumberId,
          to: recipientPhone,
          text,
        });
        log.info('WhatsApp message sent via Kapso', { recipientPhone, messageId: result?.messages?.[0]?.id });
        return { success: true, messageId: result?.messages?.[0]?.id, provider: 'kapso' };
      } catch (err) {
        log.warn('Kapso send failed, falling back to Meta Cloud API', { error: err.message });
        // Fall through to Meta Cloud API
      }
    }
  }

  // Fallback: direct Meta Cloud API
  const phoneNumberId = process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.TWINME_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    log.warn('WhatsApp not configured — no Kapso API key and no Meta Cloud API env vars');
    return { success: false, error: 'whatsapp_not_configured' };
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const { data } = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'text',
      text: { body: text },
    }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });

    return { success: true, messageId: data.messages?.[0]?.id, provider: 'meta' };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    log.error('Failed to send WhatsApp message', { recipientPhone, error: errMsg });
    return { success: false, error: errMsg };
  }
}

/**
 * Send a proactive insight via WhatsApp (plain text formatting).
 */
export async function sendWhatsAppInsight(recipientPhone, insight) {
  const emoji = {
    briefing: '\u2615', evening_recap: '\u{1F319}', music_mood_match: '\u{1F3B5}',
    email_triage: '\u{1F4E7}', reminder: '\u{1F514}', suggestion: '\u{1F4A1}', nudge: '\u{1F449}',
  }[insight.category] || '\u2728';

  const label = (insight.category || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const text = `${emoji} *${label}*\n\n${insight.insight || ''}`;

  return sendWhatsAppMessage(recipientPhone, text);
}

/**
 * Verify Meta webhook signature (SHA256 HMAC).
 */
export function verifyWebhookSignature(signature, rawBody) {
  const secret = process.env.TWINME_WHATSAPP_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigHash = signature.replace('sha256=', '');

  const sigBuf = Buffer.from(sigHash);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
