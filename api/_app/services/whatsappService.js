/**
 * WhatsApp Service — Kapso.ai SDK
 * ==============================================================
 * Sends via kapso.ai's WhatsApp Cloud API proxy (cheaper, better DX,
 * WhatsApp Flows). Z-API and Evolution remain as separate self-hosted/
 * unofficial providers for numbers outside the Kapso WABA (see USE_ZAPI /
 * USE_EVOLUTION below). The direct Meta Cloud API fallback was removed
 * 2026-09-22: it never had a working access token (invalidated by a
 * password change) and logged zero successful sends in whatsapp_outbound_log.
 *
 * Kapso env vars:
 *   KAPSO_API_KEY — kapso.ai API key
 *   KAPSO_PHONE_NUMBER_ID — WhatsApp phone number ID on Kapso
 *   KAPSO_WEBHOOK_SECRET — inbound webhook HMAC secret (verified in
 *     api/routes/whatsapp-kapso-webhook.js, not in this file)
 */

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
 * Map inbound `format` provenance (what the webhook routes stamp on parsed
 * messages) to a send provider. 'meta_native' arrives on the Kapso route and
 * is the same WABA number, so it maps to kapso — sends go via Kapso's proxy.
 * Exported for tests and for the inbound pipeline's affinity recording.
 */
export function deriveWaProvider(format) {
  if (!format || typeof format !== 'string') return null;
  if (format.startsWith('zapi')) return 'zapi';
  if (format.startsWith('evolution')) return 'evolution';
  if (format.startsWith('kapso') || format.startsWith('meta')) return 'kapso';
  return null;
}

/**
 * Kapso/Meta rejection for plain sends outside the 24h customer-service
 * window (HTTP 422). Live incident 2026-07-13: every non-template WhatsApp
 * send had failed with this since June 19, masked because deliverInsight
 * marks an insight delivered when ANY channel succeeds (Telegram always did).
 * Callers use this to surface the failure instead of burying it.
 */
export function isServiceWindowError(message) {
  return /24.?hour window/i.test(String(message || ''));
}

function providerConfigured(name) {
  if (name === 'zapi') return USE_ZAPI;
  if (name === 'evolution') return USE_EVOLUTION;
  if (name === 'kapso') return USE_KAPSO;
  return false;
}

/**
 * Send a text message via WhatsApp (Z-API, Evolution, or Kapso — priority chain below).
 *
 * SAFETY: When TWINME_DISABLE_OUTBOUND_SEND=true, returns a no-op success.
 * Set this in any test environment that fires real webhook payloads —
 * otherwise every E2E run sends actual WhatsApp messages to real users.
 *
 * opts.provider — affinity hint ('zapi' | 'evolution' | 'kapso'): send from
 * the number the user actually converses on (recorded at inbound time by
 * whatsappInboundPipeline). A hinted-but-unconfigured provider degrades to
 * the default priority chain: delivering from a new number beats not
 * delivering at all, and the user's next inbound re-records the affinity.
 */
export async function sendWhatsAppMessage(recipientPhone, text, opts = {}) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') {
    log.info('Outbound WhatsApp send suppressed (TWINME_DISABLE_OUTBOUND_SEND=true)', {
      recipientPhone: recipientPhone?.slice(-4),
      textLen: text?.length || 0,
    });
    return { success: true, suppressed: true };
  }

  const preferred = providerConfigured(opts.provider) ? opts.provider : null;
  if (opts.provider && !preferred) {
    log.warn('WA provider hint not configured — falling back to default chain', {
      hint: opts.provider,
    });
  }

  // Z-API takes priority when configured — it's the active provider for the
  // money flow (no 24h window). No Kapso/Meta fallback here: a Z-API instance
  // and a Meta WABA can't share the same WhatsApp number, so falling through
  // would send from the wrong sender.
  if (USE_ZAPI && (!preferred || preferred === 'zapi')) {
    return sendViaZapi(recipientPhone, text);
  }

  // Evolution API (self-hosted) — next in priority. Like Z-API, no fallback:
  // one number routes through one provider.
  if (USE_EVOLUTION && (!preferred || preferred === 'evolution')) {
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
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

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
        log.error('Kapso send failed', {
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
        return { success: false, error: errMsg };
      }
    }
  }

  // No provider configured (or Kapso configured without a phone number id).
  log.warn('WhatsApp not configured — no Z-API, Evolution, or Kapso env vars set');
  return { success: false, error: 'whatsapp_not_configured' };
}

/**
 * Send an interactive CTA-URL button (Meta "cta_url" interactive message via
 * Kapso) — a tappable button that opens `url` in the user's browser. Used for
 * "Connect Spotify" style OAuth buttons over WhatsApp.
 *
 * Only Kapso/Meta render a native button; for any other provider (or if the
 * interactive send fails) we fall back to a plain text message with the link,
 * which is tappable in every WhatsApp client. Interactive messages are session
 * messages — deliverable inside the 24h window, which is open here because the
 * user just messaged the twin to ask. Never throws.
 *
 * @param {string} recipientPhone
 * @param {{ body: string, buttonText: string, url: string }} opts
 */
export async function sendWhatsAppCtaButton(recipientPhone, { body, buttonText, url }) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') {
    return { success: true, suppressed: true };
  }
  const linkFallback = () => sendWhatsAppMessage(recipientPhone, `${body}\n\n${buttonText}: ${url}`);

  // Native interactive buttons are Kapso/Meta-only, and the twin's
  // conversational number (where connect requests arrive) is Kapso — so attempt
  // the native button whenever Kapso is configured, regardless of whether Z-API
  // is also set up for the separate money-flow number. Only fall back to a
  // tappable text link when Kapso isn't available at all.
  if (!USE_KAPSO) {
    return linkFallback();
  }
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!apiKey || !phoneNumberId) return linkFallback();

  try {
    const apiUrl = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: String(body).slice(0, 1024) },
        action: {
          name: 'cta_url',
          // Meta caps the display text at 20 chars.
          parameters: { display_text: String(buttonText).slice(0, 20), url },
        },
      },
    };
    const { data, status } = await axios.post(apiUrl, payload, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: `[cta_url:${buttonText}]`,
      text_len: 0,
      provider: 'kapso',
      success: true,
      message_id: data?.messages?.[0]?.id || null,
      http_status: status,
      raw_response: data || null,
    });
    return { success: true, messageId: data?.messages?.[0]?.id, provider: 'kapso', interactive: true };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    log.warn('Kapso cta_url send failed, falling back to text link', { error: errMsg, status: err.response?.status });
    return linkFallback();
  }
}

/**
 * Send an interactive list (Meta "list" interactive via Kapso) — a tappable
 * menu where each row carries an id the webhook maps back to an action. Used
 * for the "which platform do you want to connect?" menu.
 *
 * Native list is Kapso/Meta-only; for any other provider or on failure we fall
 * back to a numbered text menu of the row titles (tappable nowhere, but still
 * actionable since the user can reply with the platform name). Never throws.
 *
 * @param {string} recipientPhone
 * @param {{ body: string, buttonText: string, sections: Array<{title?: string, rows: Array<{id: string, title: string, description?: string}>}>, header?: string }} opts
 */
export async function sendWhatsAppList(recipientPhone, { body, buttonText, sections, header } = {}) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') {
    return { success: true, suppressed: true };
  }
  const allRows = (sections || []).flatMap((s) => s.rows || []);
  const textFallback = () => {
    const lines = allRows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
    return sendWhatsAppMessage(recipientPhone, `${body}\n\n${lines}`);
  };

  if (!USE_KAPSO) return textFallback();
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!apiKey || !phoneNumberId) return textFallback();

  try {
    const apiUrl = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
    const interactive = {
      type: 'list',
      body: { text: String(body).slice(0, 1024) },
      action: {
        // Meta caps the list button label at 20 chars and rows at 10 per list.
        button: String(buttonText).slice(0, 20),
        sections: (sections || []).map((s) => ({
          ...(s.title ? { title: String(s.title).slice(0, 24) } : {}),
          rows: (s.rows || []).slice(0, 10).map((r) => ({
            id: String(r.id).slice(0, 200),
            title: String(r.title).slice(0, 24),
            ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
          })),
        })),
      },
    };
    if (header) interactive.header = { type: 'text', text: String(header).slice(0, 60) };

    const payload = { messaging_product: 'whatsapp', to: recipientPhone, type: 'interactive', interactive };
    const { data, status } = await axios.post(apiUrl, payload, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: `[list:${allRows.length} rows]`,
      text_len: 0,
      provider: 'kapso',
      success: true,
      message_id: data?.messages?.[0]?.id || null,
      http_status: status,
      raw_response: data || null,
    });
    return { success: true, messageId: data?.messages?.[0]?.id, provider: 'kapso', interactive: true };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    log.warn('Kapso list send failed, falling back to text menu', { error: errMsg, status: err.response?.status });
    return textFallback();
  }
}

/**
 * Send up to three reply buttons (Meta "button" interactive via Kapso). A tap comes back as an
 * interactive `button_reply` carrying the button's id. Any other provider, or a refused send,
 * gets the body alone: the body already numbers the choices, and a bare number is read as a tap.
 */
export async function sendWhatsAppButtons(recipientPhone, { body, buttons } = {}) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') {
    return { success: true, suppressed: true };
  }
  const textFallback = () => sendWhatsAppMessage(recipientPhone, String(body || ''));

  if (!USE_KAPSO) return textFallback();
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!apiKey || !phoneNumberId || !(buttons || []).length) return textFallback();

  try {
    const apiUrl = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
    const interactive = {
      type: 'button',
      body: { text: String(body).slice(0, 1024) },
      action: {
        // Meta allows three reply buttons, a 20-character title and a 256-character id.
        buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) } })),
      },
    };
    const payload = { messaging_product: 'whatsapp', to: recipientPhone, type: 'interactive', interactive };
    const { data, status } = await axios.post(apiUrl, payload, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: `[buttons:${interactive.action.buttons.length}]`,
      text_len: 0,
      provider: 'kapso',
      success: true,
      message_id: data?.messages?.[0]?.id || null,
      http_status: status,
      raw_response: data || null,
    });
    return { success: true, messageId: data?.messages?.[0]?.id, provider: 'kapso', interactive: true };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    log.warn('Kapso buttons send failed, falling back to text', { error: errMsg, status: err.response?.status });
    return textFallback();
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

export async function sendWhatsAppInsight(recipientPhone, insight, opts = {}) {
  const text = insight.category === 'meeting_prep'
    ? formatMeetingPrepMessage(insight)
    : (() => {
        const label = (insight.category || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `*${label}*\n\n${insight.insight || ''}`;
      })();

  // opts.provider = affinity hint recorded from the user's inbound thread —
  // deliveries must leave from the number the user actually converses on.
  return sendWhatsAppMessage(recipientPhone, text, opts);
}

/**
 * Send a pre-approved template message (statement nag, future re-engagement).
 *
 * Templates are the ONLY way to reach a user outside Meta's 24h customer
 * service window — a plain text send is silently dropped there, which is why
 * the monthly statement nag needs this. Template must already exist on the
 * WABA (scripts/register-statement-nag-template.mjs registers it; Meta reviews
 * it before it becomes sendable).
 *
 * Kapso-only: the production number lives on Kapso, and a half-configured Meta
 * fallback would mask "template not registered" errors. Returns
 * { success:false } on any failure so callers can fall back to plain text
 * (which still works inside the 24h window).
 *
 * Variables (optional) fill the template's BODY {{1}}, {{2}}, … placeholders in
 * order. Static templates like `statement_nag` pass none; a parameterized
 * template (e.g. a re-engagement template with a name + detail) passes
 * ['Stefano', 'your statement closed']. Each value MUST correspond to an
 * approved placeholder — Meta rejects sends whose parameter count doesn't match
 * the registered template.
 *
 * @param {string} recipientPhone
 * @param {string} templateName   e.g. 'statement_nag'
 * @param {string} [languageCode] BCP-47-ish template language, default 'en'
 * @param {string[]} [variables]  BODY parameter values in {{1}}..{{n}} order
 */
export async function sendWhatsAppTemplate(recipientPhone, templateName, languageCode = 'en', variables = []) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') {
    log.info('Outbound WhatsApp template send suppressed (TWINME_DISABLE_OUTBOUND_SEND=true)', {
      recipientPhone: recipientPhone?.slice(-4),
      templateName,
      variableCount: variables?.length || 0,
    });
    return { success: true, suppressed: true };
  }
  if (!USE_KAPSO) {
    return { success: false, error: 'whatsapp_not_configured' };
  }

  const client = await getKapsoClient();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!client || !phoneNumberId) {
    return { success: false, error: 'kapso_client_unavailable' };
  }

  const template = {
    name: templateName,
    language: { code: languageCode },
  };
  // Only attach a BODY component when there are variables — a components array
  // with an empty parameter list is rejected by Meta for static templates.
  if (Array.isArray(variables) && variables.length > 0) {
    template.components = [{
      type: 'body',
      parameters: variables.map((v) => ({ type: 'text', text: String(v) })),
    }];
  }

  try {
    const result = await client.messages.sendTemplate({
      phoneNumberId,
      to: recipientPhone,
      template,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: `[template:${templateName}]`,
      text_len: 0,
      provider: 'kapso',
      success: true,
      message_id: result?.messages?.[0]?.id || null,
      wa_id: result?.contacts?.[0]?.wa_id || null,
      raw_response: result || null,
    });
    return { success: true, messageId: result?.messages?.[0]?.id, provider: 'kapso' };
  } catch (err) {
    log.warn('Kapso template send failed', {
      templateName,
      error: err.message,
      status: err.response?.status,
      body: err.response?.data,
    });
    logOutbound({
      recipient: recipientPhone,
      recipient_input: recipientPhone,
      text_preview: `[template:${templateName}]`,
      text_len: 0,
      provider: 'kapso',
      success: false,
      error_message: err.message,
      http_status: err.response?.status || null,
      raw_error: err.response?.data || null,
    });
    return { success: false, error: err.message };
  }
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
    log.warn('downloadWhatsAppMedia: Kapso not configured');
    return null;
  }
  try {
    const client = await getKapsoClient();
    if (!client?.media?.download) {
      log.warn('downloadWhatsAppMedia: Kapso client has no media.download');
      return null;
    }
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
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
export async function markMessageAsRead(messageId, { typing = false } = {}) {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND === 'true') return;
  if (!messageId) return;
  if (!USE_KAPSO) return;

  try {
    const client = await getKapsoClient();
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
    if (client?.messages?.markRead && phoneNumberId) {
      /* The typing indicator with the read receipt: while the ledger works, the person sees it working (Instinct's silence-is-work, 2026-09-24). */
      await client.messages.markRead({ phoneNumberId, messageId, ...(typing ? { typingIndicator: { type: 'text' } } : {}) });
    }
  } catch {
    // Non-fatal
  }
}
