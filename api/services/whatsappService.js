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

async function getKapsoClient() {
  if (kapsoClient) return kapsoClient;
  try {
    // Dynamic import for ESM compatibility
    const { WhatsAppClient } = await import('@kapso/whatsapp-cloud-api');
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
 *
 * SAFETY: When TWINME_DISABLE_OUTBOUND_SEND=true, returns a no-op success.
 * Set this in any test environment that fires real webhook payloads —
 * otherwise every E2E run sends actual WhatsApp messages to real users.
 */
export async function sendWhatsAppMessage(recipientPhone, text) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') {
    log.info('Outbound WhatsApp send suppressed (TWINME_DISABLE_OUTBOUND_SEND=true)', {
      recipientPhone: recipientPhone?.slice(-4),
      textLen: text?.length || 0,
    });
    return { success: true, suppressed: true };
  }

  // Try Kapso first
  if (USE_KAPSO) {
    const client = await getKapsoClient();
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
function formatMeetingPrepMessage(insight) {
  const b = insight.metadata?.briefing_json;
  if (!b) return `Meeting prep\n\n${insight.insight || ''}`;

  const lines = [];
  lines.push(`*Meeting prep*`);
  lines.push(b.headline || '');
  lines.push('');

  if (b.attendees?.length) {
    for (const a of b.attendees) {
      lines.push(`*${a.name}*${a.company ? ` (${a.company})` : ''}`);
      if (a.whoTheyAre) lines.push(a.whoTheyAre);
      if (a.lastTouchpoint) lines.push(`Last: ${a.lastTouchpoint}`);
      lines.push('');
    }
  }

  if (b.talkingPoints?.length) {
    lines.push('*Talking points*');
    for (const tp of b.talkingPoints) lines.push(`- ${tp}`);
    lines.push('');
  }

  if (b.watchOuts?.length) {
    lines.push('*Watch out*');
    for (const wo of b.watchOuts) lines.push(`- ${wo}`);
  }

  return lines.join('\n').trim();
}

export async function sendWhatsAppInsight(recipientPhone, insight) {
  const text = insight.category === 'meeting_prep'
    ? formatMeetingPrepMessage(insight)
    : (() => {
        const label = (insight.category || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `*${label}*\n\n${insight.insight || ''}`;
      })();

  return sendWhatsAppMessage(recipientPhone, text);
}

/**
 * Mark a message as read (shows blue checkmarks to the sender).
 *
 * M8: Routes through Kapso when configured. Previous version always hit
 * Meta directly which made send/read inconsistent under Kapso setups.
 * Test-mode short-circuit so suite doesn't hit live APIs.
 */
export async function markMessageAsRead(messageId) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') return;
  if (!messageId) return;

  if (USE_KAPSO) {
    try {
      const client = await getKapsoClient();
      const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
      if (client?.messages?.markRead && phoneNumberId) {
        await client.messages.markRead({ phoneNumberId, messageId });
        return;
      }
    } catch {
      // fall through to Meta direct
    }
  }

  const phoneNumberId = process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.TWINME_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return;

  try {
    await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 3000 }
    );
  } catch {
    // Non-fatal
  }
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
