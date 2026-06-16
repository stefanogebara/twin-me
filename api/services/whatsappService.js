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

// Z-API (unofficial WhatsApp-Web HTTP API) — the active provider for the
// Brazilian money flow. Unlike Kapso/Meta there is NO 24h customer-service
// window, so the twin can reply to a forwarded Pix receipt or statement at any
// time. Configured by instance credentials; takes priority over Kapso/Meta
// when present so a single number routes through one provider.
//   ZAPI_INSTANCE_ID    — instance id from the Z-API dashboard
//   ZAPI_INSTANCE_TOKEN — instance token (the per-instance secret)
//   ZAPI_CLIENT_TOKEN   — account security token (Client-Token header)
const USE_ZAPI = !!(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_INSTANCE_TOKEN);

function zapiBaseUrl() {
  return `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_INSTANCE_TOKEN}`;
}

// Z-API wants DDI+DDD+number digits only — no '+', no 'whatsapp:' prefix.
function normalizeZapiPhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

/**
 * Send a text message via Z-API. Returns the same { success, messageId,
 * provider } shape as the Kapso/Meta paths. Audits to whatsapp_outbound_log.
 */
async function sendViaZapi(recipientPhone, text) {
  const url = `${zapiBaseUrl()}/send-text`;
  const phone = normalizeZapiPhone(recipientPhone);
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;

  try {
    const { data, status } = await axios.post(url, { phone, message: text }, { headers, timeout: 15000 });
    // Z-API 200 response: { zaapId, messageId, id }
    log.info('WhatsApp Z-API send response', { recipientSuffix: phone.slice(-4), httpStatus: status, messageId: data?.messageId });
    logOutbound({
      recipient: phone,
      recipient_input: recipientPhone,
      text_preview: text?.slice(0, 120) || null,
      text_len: text?.length || 0,
      provider: 'zapi',
      success: true,
      message_id: data?.messageId || data?.id || null,
      http_status: status,
      raw_response: data || null,
    });
    return { success: true, messageId: data?.messageId || data?.id, provider: 'zapi' };
  } catch (err) {
    const errMsg = err.response?.data?.error || err.response?.data?.message || err.message;
    log.error('Z-API send failed', { recipientSuffix: phone.slice(-4), error: errMsg, httpStatus: err.response?.status });
    logOutbound({
      recipient: phone,
      recipient_input: recipientPhone,
      text_preview: text?.slice(0, 120) || null,
      text_len: text?.length || 0,
      provider: 'zapi',
      success: false,
      error_message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
      http_status: err.response?.status || null,
      raw_error: err.response?.data || null,
    });
    return { success: false, error: errMsg, provider: 'zapi' };
  }
}

// Evolution API (open-source, self-hosted, Baileys-based WhatsApp-Web gateway).
// The free alternative to Z-API: no per-message cost, no 24h window, any number
// via QR — you run the server. Same { success, messageId, provider } envelope.
//   EVOLUTION_API_URL  — base URL of your Evolution instance (no trailing slash)
//   EVOLUTION_API_KEY  — global/instance apikey (sent as the `apikey` header)
//   EVOLUTION_INSTANCE — instance name
const USE_EVOLUTION = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);

// Evolution wants DDI+DDD+number digits only (same as Z-API).
function normalizeEvolutionPhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

/** Send a text message via Evolution API v2. */
async function sendViaEvolution(recipientPhone, text) {
  const base = process.env.EVOLUTION_API_URL.replace(/\/+$/, '');
  const url = `${base}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
  const number = normalizeEvolutionPhone(recipientPhone);
  const headers = { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY };

  try {
    const { data, status } = await axios.post(url, { number, text }, { headers, timeout: 15000 });
    // Evolution 201 response: { key: { id }, message: {...}, status }
    const messageId = data?.key?.id || null;
    log.info('WhatsApp Evolution send response', { recipientSuffix: number.slice(-4), httpStatus: status, messageId });
    logOutbound({
      recipient: number,
      recipient_input: recipientPhone,
      text_preview: text?.slice(0, 120) || null,
      text_len: text?.length || 0,
      provider: 'evolution',
      success: true,
      message_id: messageId,
      http_status: status,
      raw_response: data || null,
    });
    return { success: true, messageId, provider: 'evolution' };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
    log.error('Evolution send failed', { recipientSuffix: number.slice(-4), error: errMsg, httpStatus: err.response?.status });
    logOutbound({
      recipient: number,
      recipient_input: recipientPhone,
      text_preview: text?.slice(0, 120) || null,
      text_len: text?.length || 0,
      provider: 'evolution',
      success: false,
      error_message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
      http_status: err.response?.status || null,
      raw_error: err.response?.data || null,
    });
    return { success: false, error: errMsg, provider: 'evolution' };
  }
}

/**
 * Download Evolution media. Unlike Z-API, Evolution does NOT expose a directly
 * fetchable URL — the WhatsApp CDN url in the webhook is encrypted. Instead you
 * POST the message key to getBase64FromMediaMessage and decode the base64.
 * The inbound parse encodes the media id as `evolution:<messageId>`.
 *
 * NOTE: authored against the v2 docs; needs one live verification (scan QR,
 * forward a statement) before the media path is trusted. The text loop is the
 * verified core.
 */
async function downloadEvolutionMedia(messageId) {
  const base = process.env.EVOLUTION_API_URL.replace(/\/+$/, '');
  const url = `${base}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE}`;
  const headers = { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY };
  try {
    const { data } = await axios.post(
      url,
      { message: { key: { id: messageId } }, convertToMp4: false },
      { headers, timeout: 20000 },
    );
    const b64 = data?.base64;
    if (!b64) {
      log.warn('Evolution getBase64 returned no base64', { messageId });
      return null;
    }
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_MEDIA_BYTES) {
      log.warn('Evolution media exceeds size cap', { messageId, bytes: buffer.length });
      return null;
    }
    return buffer;
  } catch (err) {
    log.warn('Evolution media download failed', { messageId, error: err.message });
    return null;
  }
}

// Lazy-initialize Kapso client (only when needed)
let kapsoClient = null;

async function getKapsoClient() {
  if (kapsoClient) return kapsoClient;
  try {
    // Dynamic import for ESM compatibility
    const { WhatsAppClient } = await import('@kapso/whatsapp-cloud-api');
    // .trim() defends against a trailing newline/space in the env var — a
    // classic footgun when the key is pasted into a dashboard (the stray \n is
    // invisible but makes Kapso reject every send with "Authentication Error").
    kapsoClient = new WhatsAppClient({ kapsoApiKey: process.env.KAPSO_API_KEY?.trim() });
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

  // Z-API takes priority when configured — it's the active provider for the
  // money flow (no 24h window). No Kapso/Meta fallback here: a Z-API instance
  // and a Meta WABA can't share the same WhatsApp number, so falling through
  // would send from the wrong sender.
  if (USE_ZAPI) {
    return sendViaZapi(recipientPhone, text);
  }

  // Evolution API (self-hosted) — next in priority. Like Z-API, no fallback:
  // one number routes through one provider.
  if (USE_EVOLUTION) {
    return sendViaEvolution(recipientPhone, text);
  }

  // Kapso (official Meta Cloud API, via Kapso's proxy).
  //
  // 2026-06-16: call the proxy endpoint DIRECTLY with the X-API-Key header
  // instead of via the @kapso/whatsapp-cloud-api SDK. The SDK path never set
  // `baseUrl`, so it sent the Kapso key to Meta's graph.facebook.com — which
  // 401'd every single outbound ("Authentication Error") for the app's entire
  // history (~247 failures, zero successes). This is the exact request shape
  // verified working against api.kapso.ai (GET + POST both 200, real message
  // delivered). .trim() guards a pasted trailing newline in the env var.
  if (USE_KAPSO) {
    const apiKey = process.env.KAPSO_API_KEY?.trim();
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;

    if (apiKey && phoneNumberId) {
      try {
        const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
        log.info('WhatsApp Kapso send entry', {
          recipientLen: recipientPhone?.length,
          phoneNumberIdSuffix: phoneNumberId?.slice(-6),
          textLen: text?.length,
        });
        const { data, status } = await axios.post(
          url,
          { messaging_product: 'whatsapp', to: recipientPhone, type: 'text', text: { body: text } },
          { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 15000 },
        );
        // Kapso/Meta 200 response: { messaging_product, contacts:[{input,wa_id}], messages:[{id}] }
        log.info('WhatsApp Kapso send response', {
          httpStatus: status,
          messages: data?.messages,
          contacts: data?.contacts,
        });
        logOutbound({
          recipient: recipientPhone,
          recipient_input: recipientPhone,
          text_preview: text?.slice(0, 120) || null,
          text_len: text?.length || 0,
          provider: 'kapso',
          success: true,
          message_id: data?.messages?.[0]?.id || null,
          wa_id: data?.contacts?.[0]?.wa_id || null,
          http_status: status,
          raw_response: data || null,
        });
        return { success: true, messageId: data?.messages?.[0]?.id, provider: 'kapso' };
      } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message;
        log.warn('Kapso send failed, falling back to Meta Cloud API', {
          error: errMsg,
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
          error_message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
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
 * Download inbound WhatsApp media (statement attachments, receipts) by media id.
 *
 * Kapso proxies Meta's media endpoints: GET metadata resolves the short-lived
 * URL, then the SDK fetches the bytes with client auth. Returns a Buffer or
 * null — callers treat a failed download as "statement didn't arrive" and ask
 * the user to resend, so this never throws.
 *
 * Size guard: bank statements are tens of KB; anything over the cap is not a
 * statement and would only burn lambda memory.
 */
const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB

export async function downloadWhatsAppMedia(mediaId) {
  if (!mediaId) return null;

  // Z-API delivers media as a direct URL in the inbound webhook (image.imageUrl,
  // document.documentUrl) — no media-id resolution step. The inbound pipeline
  // passes that URL through as `id`, so a download is just a GET. This also
  // lets a Z-API-routed message work regardless of whether Kapso env is set.
  if (typeof mediaId === 'string' && /^https?:\/\//i.test(mediaId)) {
    try {
      const { data } = await axios.get(mediaId, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: MAX_MEDIA_BYTES });
      const buffer = Buffer.from(data);
      if (buffer.length > MAX_MEDIA_BYTES) {
        log.warn('downloadWhatsAppMedia: media exceeds size cap', { bytes: buffer.length });
        return null;
      }
      return buffer;
    } catch (err) {
      log.warn('downloadWhatsAppMedia (direct URL) failed', { error: err.message });
      return null;
    }
  }

  // Evolution media: `evolution:<messageId>` → getBase64FromMediaMessage.
  if (typeof mediaId === 'string' && mediaId.startsWith('evolution:')) {
    return downloadEvolutionMedia(mediaId.slice('evolution:'.length));
  }

  if (!USE_KAPSO) {
    log.warn('downloadWhatsAppMedia: Kapso not configured (no Meta-direct fallback implemented)');
    return null;
  }
  try {
    const client = await getKapsoClient();
    if (!client?.media?.download) {
      log.warn('downloadWhatsAppMedia: Kapso client has no media.download');
      return null;
    }
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
    const buf = await client.media.download({ mediaId, phoneNumberId, as: 'arrayBuffer' });
    const buffer = Buffer.from(buf);
    if (buffer.length > MAX_MEDIA_BYTES) {
      log.warn('downloadWhatsAppMedia: media exceeds size cap', { mediaId, bytes: buffer.length });
      return null;
    }
    return buffer;
  } catch (err) {
    log.warn('downloadWhatsAppMedia failed', { mediaId, error: err.message });
    return null;
  }
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
