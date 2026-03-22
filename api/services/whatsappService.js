/**
 * WhatsApp Service — Meta Cloud API for TwinMe Messaging
 * ========================================================
 * Separate WABA from Seatable. Handles outbound messaging,
 * template sending, and webhook signature verification.
 *
 * Env vars (feature-flagged off until ops complete):
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

/**
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendWhatsAppMessage(recipientPhone, text) {
  const phoneNumberId = process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.TWINME_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    log.warn('WhatsApp not configured — missing env vars');
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

    return { success: true, messageId: data.messages?.[0]?.id };
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
