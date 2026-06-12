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
import { supabaseAdmin } from '../config/supabase.js';

const log = createLogger('WhatsApp');

/**
 * Audit every outbound send to whatsapp_outbound_log.
 *
 * Vercel log search drops the structured payload content of info-level
 * logs and times out under realistic load — we cannot reliably read what
 * Kapso/Meta returned for a given send. This sink writes the full shape
 * to Postgres so we can SELECT against it deterministically.
 *
 * Fire-and-forget. Audit failures must never block the actual send path.
 */
async function logOutbound(row) {
  try {
    await supabaseAdmin.from('whatsapp_outbound_log').insert(row);
  } catch (err) {
    // Audit is best-effort. Never let it throw into the send path.
    log.warn('whatsapp_outbound_log insert failed', { error: err.message });
  }
}

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
 * Download inbound media (receipt images) by Kapso media ID.
 * Used by WhatsApp transaction capture (replan-2026-06-12). Kapso resolves
 * the short-lived Meta media URL server-side; we get bytes back.
 * No Meta fallback — Kapso is the only prod inbound path.
 *
 * @returns {{ ok: true, buffer: Buffer } | { ok: false, error: string }}
 */
export async function downloadWhatsAppMedia(mediaId) {
  try {
    const client = await getKapsoClient();
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
    if (!client?.media?.download || !phoneNumberId) {
      return { ok: false, error: 'kapso_client_unavailable' };
    }
    const arrayBuffer = await client.media.download({ mediaId, phoneNumberId });
    return { ok: true, buffer: Buffer.from(arrayBuffer) };
  } catch (err) {
    log.warn('WhatsApp media download failed', { mediaId, error: err.message });
    return { ok: false, error: err.message };
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
        // audit-2026-05-27: diagnose silent-no-delivery. Log the full request shape
        // so we can correlate to Kapso's response. recipientPhone format matters
        // here — Brazilian numbers may need the leading-9 stripped depending on
        // the WABA configuration ("nono dígito" rule).
        log.info('WhatsApp Kapso send entry', {
          recipientPhone,
          recipientStartsWithPlus: recipientPhone?.startsWith?.('+'),
          recipientLen: recipientPhone?.length,
          phoneNumberIdSuffix: phoneNumberId?.slice(-6),
          textLen: text?.length,
        });
        const result = await client.messages.sendText({
          phoneNumberId,
          to: recipientPhone,
          body: text,
        });
        // audit-2026-05-27: log the FULL Kapso response, not just messageId.
        // contacts[0].input vs contacts[0].wa_id reveals number normalization
        // (e.g. "+5511999002121" → "+551199002121" via Brazilian 9-digit drop).
        // messages[0].id confirms a Meta message_id was minted. The presence
        // of a `warning` or `message_status` field is the real "is it actually
        // going to deliver" signal.
        log.info('WhatsApp Kapso send response', {
          recipientPhone,
          messageId: result?.messages?.[0]?.id,
          contacts: result?.contacts,
          messages: result?.messages,
          warning: result?.warning,
          messageStatus: result?.messageStatus,
        });
        // audit-2026-05-27: persist the full response so we can query it
        // when Vercel log search lets us down.
        logOutbound({
          recipient: recipientPhone,
          recipient_input: recipientPhone,
          text_preview: text?.slice(0, 120) || null,
          text_len: text?.length || 0,
          provider: 'kapso',
          success: true,
          message_id: result?.messages?.[0]?.id || null,
          wa_id: result?.contacts?.[0]?.wa_id || null,
          warning: result?.warning || null,
          message_status: result?.messageStatus || null,
          raw_response: result || null,
        });
        return { success: true, messageId: result?.messages?.[0]?.id, provider: 'kapso' };
      } catch (err) {
        log.warn('Kapso send failed, falling back to Meta Cloud API', {
          error: err.message,
          status: err.response?.status,
          body: err.response?.data,
        });
        logOutbound({
          recipient: recipientPhone,
          recipient_input: recipientPhone,
          text_preview: text?.slice(0, 120) || null,
          text_len: text?.length || 0,
          provider: 'kapso',
          success: false,
          error_message: err.message,
          http_status: err.response?.status || null,
          raw_error: err.response?.data || null,
        });
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

  log.info('WhatsApp send entry', {
    recipientPhone,
    recipientStartsWithPlus: recipientPhone?.startsWith?.('+'),
    recipientLen: recipientPhone?.length,
    textLen: text?.length,
    useKapso: USE_KAPSO,
    phoneIdSuffix: phoneNumberId?.slice(-6),
    accessTokenLen: accessToken?.length || 0,
  });

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const { data, status } = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'text',
      text: { body: text },
    }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });

    // audit-2026-05-27: diagnose the silent-no-delivery case. Meta returns
    // 200 with messages[0].id but the recipient sees nothing — often a
    // 24h-customer-window or wrong-phone_number_id problem. Surfacing the
    // full response lets us see Meta's own status hints (e.g. warning,
    // message_status, contacts.input vs contacts.wa_id mismatch).
    log.info('WhatsApp Meta send response', {
      httpStatus: status,
      messages: data?.messages,
      contacts: data?.contacts,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: text?.slice(0, 120) || null,
      text_len: text?.length || 0,
      provider: 'meta',
      success: true,
      message_id: data?.messages?.[0]?.id || null,
      wa_id: data?.contacts?.[0]?.wa_id || null,
      http_status: status,
      raw_response: data || null,
    });

    return { success: true, messageId: data.messages?.[0]?.id, provider: 'meta' };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    log.error('Failed to send WhatsApp message', {
      recipientPhone,
      error: errMsg,
      metaError: err.response?.data?.error,
      httpStatus: err.response?.status,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: text?.slice(0, 120) || null,
      text_len: text?.length || 0,
      provider: 'meta',
      success: false,
      error_message: errMsg,
      http_status: err.response?.status || null,
      raw_error: err.response?.data || null,
    });
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
