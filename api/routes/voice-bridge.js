/**
 * Voice Bridge Routes — /api/voice-bridge/*
 * ==========================================
 *
 * Pivot from custom whatsmeow Go bridge to WAHA (devlikeapro/waha) after
 * Meta repeatedly rejected QR-link attempts from Fly's outbound IP with
 * "couldn't link device". WAHA wraps whatsapp-web.js (Baileys in `noweb`
 * mode, Puppeteer/Chromium in `web` mode) and has a more browser-shaped
 * fingerprint that passes Meta's anti-bot checks reliably.
 *
 * WAHA contract (devlikeapro/waha REST API):
 *   - Auth: X-Api-Key header on every call
 *   - Session names: we use the TwinMe user_id (UUID)
 *   - QR pair: POST /api/sessions/start  → wait for STARTING/SCAN_QR_CODE
 *                GET  /api/sessions/{id}/auth/qr?format=image → PNG bytes
 *   - Status:  GET  /api/sessions/{id}  → { name, status, me?: {id, pushName} }
 *   - Logout:  POST /api/sessions/{id}/logout
 *   - Send:    POST /api/sendText      → { session, chatId, text }
 *   - Webhook: WAHA POSTs to WHATSAPP_HOOK_URL on configured events
 *
 * Inbound flow (voice → twin reply):
 *   1. User sends voice note (PTT) to themselves on WhatsApp
 *   2. WAHA fires `message` event → POSTs /voice-bridge/webhook
 *   3. We download the audio via WAHA's media URL (auth needed)
 *   4. Whisper-transcribe → UPDATE whatsapp_messages.transcript
 *   5. Mint self-JWT, call /chat/message (non-streaming), capture trace_id
 *   6. POST /api/sendText to WAHA with the twin's reply text
 *   7. INSERT outbound whatsapp_messages row
 *
 * Webhook auth: WAHA includes our configured `X-Twinme-Bridge-Secret`
 * header on every webhook call (set via WAHA's WHATSAPP_HOOK_HEADERS env).
 * Same shared secret as the old Go bridge — reused for continuity.
 *
 * Frontend contract (unchanged from the whatsmeow era):
 *   - POST /link/start, GET /link/status, POST /link/cancel, POST /unlink,
 *     GET /history all return the same shapes so VoiceSetupPage.tsx doesn't
 *     need any changes.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('VoiceBridge');
const router = express.Router();

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || process.env.BRIDGE_BASE_URL || '';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// WAHA Core (free) only allows ONE session named exactly 'default'. The
// WAHA Plus license adds multi-session support (~$30/mo). Until we move
// to Plus, the bridge supports a single linked user at a time. We keep
// the userId → session mapping in the whatsapp_links table:
//   - status='pending' rows are users currently trying to link
//   - status='linked' rows are the active link (at most one)
// The webhook handler resolves session 'default' → userId by querying
// whichever pending/linked row was most recently touched.
const WAHA_SESSION = 'default';

const SELF_API_BASE_URL =
  process.env.SELF_API_BASE_URL ||
  `http://localhost:${process.env.PORT || 3004}/api`;

let openai = null;
if (OPENAI_API_KEY && OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

function wahaConfigured() {
  return WAHA_BASE_URL && WAHA_API_KEY;
}

function wahaHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY, ...extra };
}

async function wahaFetch(path, init = {}) {
  if (!wahaConfigured()) throw new Error('waha_not_configured');
  const r = await fetch(`${WAHA_BASE_URL}${path}`, {
    ...init,
    headers: { ...wahaHeaders(), ...(init.headers || {}) },
  });
  return r;
}

// =====================================================================
// /webhook — WAHA → API   (auth: X-Twinme-Bridge-Secret header)
// =====================================================================
//
// WAHA POSTs here on `message` and `session.status` events. We handle:
//   - session.status:  pair completed (status=WORKING) → upsert link row
//                      or session ended → mark unlinked
//   - message:         voice note from the user → Whisper → chat → reply
//
// Auth: WAHA forwards a configured header. We compare against the same
// BRIDGE_SHARED_SECRET we used for the Go bridge.

function requireBridgeAuth(req, res, next) {
  const got = req.header('X-Twinme-Bridge-Secret') || req.header('X-Bridge-Secret');
  if (!BRIDGE_SHARED_SECRET) {
    log.error('BRIDGE_SHARED_SECRET not configured — rejecting all bridge calls');
    return res.status(503).json({ error: 'bridge_not_configured' });
  }
  if (!got || got !== BRIDGE_SHARED_SECRET) {
    log.warn('Webhook auth failed', { provided: got ? 'present' : 'missing' });
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

/**
 * resolveActiveUserId — WAHA Core uses session='default' for everyone, so the
 * webhook payload tells us the EVENT but not the WHICH USER it's for. We
 * resolve via DB: prefer the most recently-touched linked row, fall back
 * to the most recent pending row (for session.status events during pairing).
 */
async function resolveActiveUserId() {
  const { data: linked } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id, status, updated_at')
    .eq('status', 'linked')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linked) return linked.user_id;
  const { data: pending } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id, status, updated_at')
    .eq('status', 'pending')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return pending?.user_id || null;
}

router.post('/webhook', requireBridgeAuth, async (req, res) => {
  const { event, payload } = req.body || {};

  // CRITICAL: Vercel kills async work after res.json() on serverless. The
  // previous "respond 202 fast, do work in background" pattern silently
  // dropped every voice note. Do everything synchronously, respond at the
  // end. Vercel maxDuration default is 300s on Fluid Compute — plenty for
  // Whisper (~3s) + chat (~30s) + send (~1s) = ~34s end-to-end. WAHA may
  // exceed its own webhook timeout and retry, but the idempotency check
  // in handleInboundVoice (on whatsapp_message_id) catches duplicates.

  try {
    if (!event) {
      return res.status(202).json({ status: 'accepted', skipped: 'no_event' });
    }

    const userId = await resolveActiveUserId();
    if (!userId) {
      log.warn('Webhook fired but no pending/linked user', { event });
      return res.status(202).json({ status: 'accepted', skipped: 'no_user' });
    }

    if (event === 'session.status') {
      await handleSessionStatus(userId, payload);
      return res.status(202).json({ status: 'accepted', event });
    }

    if (event === 'message') {
      // Diagnostic: log payload shape so we can see what WAHA's noweb engine
      // actually sends for voice notes (type, media keys, fromMe).
      log.info('webhook message received', {
        userId,
        fromMe: payload?.fromMe,
        type: payload?.type,
        hasMedia: payload?.hasMedia,
        mimetype: payload?.media?.mimetype,
        hasMediaUrl: !!payload?.media?.url,
        msgId: payload?.id,
      });

      if (!payload || payload.fromMe === false) {
        return res.status(202).json({ status: 'accepted', skipped: 'not_from_me' });
      }
      const type = payload.type || payload?.media?.mimetype || '';
      const isVoice = type === 'ptt' || /audio\/ogg/i.test(type) || type === 'voice' || type === 'audio';
      if (!isVoice) {
        return res.status(202).json({ status: 'accepted', skipped: 'not_voice', type });
      }
      await handleInboundVoice(userId, payload);
      return res.status(202).json({ status: 'accepted', event });
    }

    return res.status(202).json({ status: 'accepted', skipped: 'unknown_event' });
  } catch (err) {
    log.error('webhook handler crashed', { error: err?.message, event });
    return res.status(500).json({ status: 'error', error: err?.message });
  }
});

async function handleSessionStatus(userId, payload) {
  const status = String(payload?.status || '').toUpperCase();
  log.info('waha session.status', { userId, status });

  if (status === 'WORKING') {
    // me may not be present immediately — WAHA emits status before the
    // identity is fully resolved. We backfill from a follow-up GET.
    let jid = payload?.me?.id || null;
    let displayName = payload?.me?.pushName || null;
    let phoneNumber = null;
    if (!jid && wahaConfigured()) {
      try {
        const r = await wahaFetch(`/api/sessions/${WAHA_SESSION}`);
        const body = await r.json().catch(() => null);
        jid = body?.me?.id || null;
        displayName = body?.me?.pushName || displayName;
      } catch (err) {
        log.warn('post-WORKING session fetch failed', { error: err?.message });
      }
    }
    if (!jid) {
      log.warn('WORKING status but no JID resolvable — deferring link row', { userId });
      return;
    }
    phoneNumber = '+' + jid.replace(/@.+$/, '').replace(/[^0-9]/g, '');
    await upsertWhatsappLink({ userId, jid, displayName, phoneNumber });
    return;
  }

  if (status === 'STOPPED' || status === 'FAILED' || status === 'SCAN_QR_CODE') {
    // SCAN_QR_CODE is just "waiting for scan" — not a link end. Ignore.
    if (status === 'SCAN_QR_CODE') return;
    // STOPPED / FAILED → flip any linked row to unlinked.
    await supabaseAdmin
      .from('whatsapp_links')
      .update({ status: 'unlinked', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'linked');
  }
}

async function upsertWhatsappLink({ userId, jid, displayName, phoneNumber }) {
  // Cross-user JID conflict guard
  const { data: conflict } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id')
    .eq('jid', jid)
    .eq('status', 'linked')
    .neq('user_id', userId)
    .maybeSingle();
  if (conflict) {
    log.warn('jid already linked to another user', { jid, otherUserId: conflict.user_id });
    return;
  }

  // Look for either (a) the placeholder 'pending' row created at /link/start
  // or (b) a row already keyed on the real jid. Update whichever we find,
  // patching jid up to the real value.
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_links')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'linked'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const fields = {
    jid,
    display_name: displayName || null,
    phone_number: phoneNumber || null,
    status: 'linked',
    linked_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabaseAdmin.from('whatsapp_links').update(fields).eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('whatsapp_links')
      .insert({ user_id: userId, ...fields });
  }
  log.info('whatsapp link upserted via webhook', { userId, jid });
}

// =====================================================================
// Inbound voice pipeline (Whisper → chat → send)
// =====================================================================

async function transcribeOgg(oggBuffer) {
  if (!openai) throw new Error('whisper_not_configured');
  const file = await OpenAI.toFile(oggBuffer, 'voice.ogg', { type: 'audio/ogg' });
  try {
    const r = await openai.audio.transcriptions.create({
      file, model: 'gpt-4o-mini-transcribe', response_format: 'text',
    });
    return { transcript: typeof r === 'string' ? r.trim() : (r.text || '').trim() };
  } catch (err) {
    if (err?.status === 404 || /model/i.test(err?.message || '')) {
      const file2 = await OpenAI.toFile(oggBuffer, 'voice.ogg', { type: 'audio/ogg' });
      const r2 = await openai.audio.transcriptions.create({
        file: file2, model: 'whisper-1', response_format: 'text',
      });
      return { transcript: typeof r2 === 'string' ? r2.trim() : (r2.text || '').trim() };
    }
    throw err;
  }
}

function mintUserJwt(userId, email) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    { id: userId, userId, email: email || null, source: 'voice-bridge' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
}

async function callTwinChat({ userId, email, message }) {
  const token = mintUserJwt(userId, email);
  const controller = new AbortController();
  // Webhook runs synchronously (Vercel kills async work after res.json
  // on serverless) and the function's maxDuration is 60s. Reserve room
  // for Whisper (~3s) + sendText (~2s) + DB writes (~1s) + buffer.
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let res;
  try {
    res = await fetch(`${SELF_API_BASE_URL}/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, conversationId: null }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('chat_timeout');
    throw err;
  } finally { clearTimeout(timeoutId); }
  const traceId = res.headers.get('x-twin-trace-id') || null;
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw Object.assign(new Error('chat_call_failed'), {
      status: res.status, traceId, detail: body?.error || body?.message || null,
    });
  }
  return {
    text: body.message || '',
    traceId,
    conversationId: body.conversationId || null,
  };
}

async function sendTextViaWaha({ session, chatId, text }) {
  const r = await wahaFetch('/api/sendText', {
    method: 'POST',
    body: JSON.stringify({ session, chatId, text }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`waha_send_failed: ${r.status} ${detail.slice(0, 200)}`);
  }
  return r.json().catch(() => ({}));
}

async function downloadWahaMedia(mediaUrl) {
  // Media URLs from WAHA are signed but also require X-Api-Key on noweb engine.
  const r = await fetch(mediaUrl, { headers: { 'X-Api-Key': WAHA_API_KEY } });
  if (!r.ok) throw new Error(`waha_media_download_failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function handleInboundVoice(userId, payload) {
  const whatsappMessageId = payload?.id || `waha:${Date.now()}`;
  const senderJid = payload?.from || '';
  const chatId = senderJid;
  const mediaUrl = payload?.media?.url || payload?.mediaUrl || null;
  const durationSeconds = payload?.duration ?? payload?.media?.duration ?? null;

  // Idempotency
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id')
    .eq('whatsapp_message_id', whatsappMessageId)
    .eq('direction', 'inbound')
    .maybeSingle();
  if (existing) {
    log.info('Duplicate inbound voice — skipping', { whatsappMessageId });
    return;
  }

  // Need link row + email for JWT
  const { data: link } = await supabaseAdmin
    .from('whatsapp_links')
    .select('id, jid, status')
    .eq('user_id', userId)
    .eq('status', 'linked')
    .maybeSingle();
  if (!link) {
    log.warn('Voice for unlinked user', { userId, senderJid });
    return;
  }
  const { data: userRow } = await supabaseAdmin
    .from('users').select('email').eq('id', userId).maybeSingle();

  // Persist row immediately
  const { data: msgRow, error: insertErr } = await supabaseAdmin
    .from('whatsapp_messages')
    .insert({
      user_id: userId,
      link_id: link.id,
      direction: 'inbound',
      whatsapp_message_id: whatsappMessageId,
      message_type: 'voice',
      duration_seconds: durationSeconds || null,
    })
    .select('id').single();
  if (insertErr || !msgRow) {
    log.error('whatsapp_messages insert failed', { error: insertErr?.message });
    return;
  }

  let transcript = null;
  try {
    if (!mediaUrl) throw new Error('no_media_url');
    const oggBuffer = await downloadWahaMedia(mediaUrl);
    const { transcript: tx } = await transcribeOgg(oggBuffer);
    transcript = tx;
    await supabaseAdmin.from('whatsapp_messages').update({ transcript }).eq('id', msgRow.id);

    if (!transcript?.trim()) {
      await supabaseAdmin.from('whatsapp_messages')
        .update({ error_message: 'empty_transcript' }).eq('id', msgRow.id);
      return;
    }

    const { text: replyText, traceId, conversationId } = await callTwinChat({
      userId, email: userRow?.email, message: transcript,
    });
    await supabaseAdmin.from('whatsapp_messages')
      .update({ trace_id: traceId, twin_conversation_id: conversationId })
      .eq('id', msgRow.id);

    if (!replyText) {
      await supabaseAdmin.from('whatsapp_messages')
        .update({ error_message: 'empty_reply' }).eq('id', msgRow.id);
      return;
    }

    await sendTextViaWaha({ session: WAHA_SESSION, chatId, text: replyText });

    await supabaseAdmin.from('whatsapp_messages').insert({
      user_id: userId,
      link_id: link.id,
      direction: 'outbound',
      whatsapp_message_id: `out:${msgRow.id}`,
      message_type: 'text',
      text_body: replyText,
      trace_id: traceId,
      twin_conversation_id: conversationId,
    });
  } catch (err) {
    log.error('inbound voice pipeline failed', {
      messageId: msgRow.id, error: err?.message, status: err?.status,
    });
    await supabaseAdmin.from('whatsapp_messages').update({
      transcript: transcript || null,
      error_message: (err?.message || 'unknown_error').slice(0, 500),
    }).eq('id', msgRow.id);
  }
}

// =====================================================================
// Frontend-facing endpoints (same shapes as the whatsmeow era)
// =====================================================================

// POST /link/start — create/restart WAHA session, return QR data URL
router.post('/link/start', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  if (!wahaConfigured()) return res.status(503).json({ error: 'bridge_not_configured' });

  // Reserve this user as the active pairing target. WAHA Core can only run
  // one 'default' session, so we use the whatsapp_links table to track who
  // owns the current session. If another user is already pending or linked,
  // refuse — UI tells them to wait or unlink the existing one.
  const { data: existingOther } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id, status')
    .in('status', ['pending', 'linked'])
    .neq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (existingOther) {
    log.warn('link/start blocked — another user holds the bridge', {
      requester: userId, holder: existingOther.user_id, status: existingOther.status,
    });
    return res.status(409).json({ error: 'bridge_busy' });
  }

  // Mark this user as pending (idempotent — UPDATE if exists, INSERT if not)
  const { data: ownRow } = await supabaseAdmin
    .from('whatsapp_links')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'linked'])
    .maybeSingle();
  if (ownRow) {
    await supabaseAdmin
      .from('whatsapp_links')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', ownRow.id);
  } else {
    await supabaseAdmin
      .from('whatsapp_links')
      .insert({
        user_id: userId, jid: 'pending', status: 'pending',
        updated_at: new Date().toISOString(),
      });
  }

  try {
    // Logout any existing session to force a fresh QR (idempotent on noweb).
    await wahaFetch(`/api/sessions/${WAHA_SESSION}/logout`, { method: 'POST' })
      .catch(() => {});
    // Start (or restart) the session
    const startRes = await wahaFetch('/api/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ name: WAHA_SESSION }),
    });
    if (!startRes.ok && startRes.status !== 422) {
      const detail = await startRes.text().catch(() => '');
      log.error('waha session start failed', { userId, status: startRes.status, detail: detail.slice(0, 200) });
      return res.status(502).json({ error: 'waha_unreachable' });
    }
    // Poll the session status briefly to wait for SCAN_QR_CODE, then fetch QR
    const deadline = Date.now() + 8_000;
    let qrData = null;
    while (Date.now() < deadline) {
      const stat = await wahaFetch(`/api/sessions/${WAHA_SESSION}`);
      const body = await stat.json().catch(() => null);
      if (body?.status === 'WORKING') {
        return res.json({ status: 'linked' });
      }
      if (body?.status === 'SCAN_QR_CODE' || body?.status === 'STARTING') {
        const qrRes = await wahaFetch(
          `/api/${WAHA_SESSION}/auth/qr?format=image`
        );
        if (qrRes.ok) {
          const arr = Buffer.from(await qrRes.arrayBuffer());
          if (arr.length > 0) {
            qrData = 'data:image/png;base64,' + arr.toString('base64');
            break;
          }
        }
      }
      await new Promise(r => setTimeout(r, 700));
    }
    return res.json({
      status: 'pending',
      qrCode: qrData,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  } catch (err) {
    log.error('link/start failed', { error: err?.message });
    return res.status(502).json({ error: 'bridge_unreachable' });
  }
});

// GET /link/status — DB first, WAHA second
router.get('/link/status', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const { data: link } = await supabaseAdmin
    .from('whatsapp_links')
    .select('jid, display_name, phone_number, status, linked_at, last_seen_at')
    .eq('user_id', userId)
    .eq('status', 'linked')
    .maybeSingle();

  if (link) {
    return res.json({
      status: 'linked',
      jid: link.jid,
      displayName: link.display_name,
      phoneNumber: link.phone_number,
      linkedAt: link.linked_at,
      lastSeenAt: link.last_seen_at,
    });
  }

  if (!wahaConfigured()) return res.json({ status: 'none' });

  try {
    const stat = await wahaFetch(`/api/sessions/${WAHA_SESSION}`);
    if (stat.status === 404) return res.json({ status: 'none' });
    const body = await stat.json().catch(() => null);
    if (!body) return res.json({ status: 'none' });

    if (body.status === 'WORKING') {
      // Race: webhook hasn't fired yet but session is already linked. Refresh
      // the link row inline so the next poll lands on the DB path.
      const me = body.me || {};
      if (me.id) {
        await upsertWhatsappLink({
          userId,
          jid: me.id,
          displayName: me.pushName,
          phoneNumber: '+' + me.id.replace(/@.+$/, '').replace(/[^0-9]/g, ''),
        }).catch(() => {});
      }
      return res.json({ status: 'linked', jid: me.id, displayName: me.pushName });
    }

    if (body.status === 'SCAN_QR_CODE' || body.status === 'STARTING') {
      const qrRes = await wahaFetch(
        `/api/${WAHA_SESSION}/auth/qr?format=image`
      );
      let qrCode = null;
      if (qrRes.ok) {
        const arr = Buffer.from(await qrRes.arrayBuffer());
        if (arr.length > 0) qrCode = 'data:image/png;base64,' + arr.toString('base64');
      }
      return res.json({
        status: 'pending',
        qrCode,
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      });
    }

    return res.json({ status: 'none' });
  } catch (err) {
    log.warn('link/status WAHA poll failed', { error: err?.message });
    return res.json({ status: 'none' });
  }
});

router.post('/link/cancel', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  // Drop any placeholder 'pending' row this user owns so the next user can link.
  await supabaseAdmin
    .from('whatsapp_links')
    .update({ status: 'unlinked', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (wahaConfigured()) {
    await wahaFetch(`/api/sessions/${WAHA_SESSION}/logout`, { method: 'POST' })
      .catch(() => {});
  }
  return res.json({ status: 'cancelled' });
});

router.post('/unlink', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { error } = await supabaseAdmin
    .from('whatsapp_links')
    .update({ status: 'unlinked', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'linked');
  if (error) {
    log.error('unlink DB update failed', { error: error.message });
    return res.status(500).json({ error: 'unlink_failed' });
  }
  if (wahaConfigured()) {
    await wahaFetch(`/api/sessions/${WAHA_SESSION}/logout`, { method: 'POST' })
      .catch(() => {});
  }
  return res.json({ status: 'unlinked' });
});

router.get('/history', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, direction, message_type, transcript, text_body, duration_seconds, created_at, error_message')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ messages: data || [] });
});

export default router;
