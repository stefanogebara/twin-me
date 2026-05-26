/**
 * Voice Bridge Routes — /api/voice-bridge/*
 * ==========================================
 *
 * Endpoints consumed by the Go WhatsApp bridge (bridge/) and by the
 * /settings/voice frontend page. Separate file from the older
 * routes/voice.js (which handles direct file-upload voice notes) so the
 * two surfaces don't entangle.
 *
 * Auth model:
 *   - /inbound, /link/complete:  bridge → API. BRIDGE_SHARED_SECRET header.
 *   - /link/*, /unlink, /history: frontend → API. user JWT.
 *
 * Full inbound flow (Phase 2):
 *   1. Bridge receives a voice note in WhatsApp via whatsmeow event handler
 *   2. Bridge downloads + decrypts OGG/Opus audio, base64-encodes it
 *   3. Bridge POSTs /api/voice-bridge/inbound { userId, whatsappMessageId,
 *      senderJid, oggBase64, durationSeconds }
 *   4. We Whisper-transcribe → UPDATE whatsapp_messages.transcript
 *   5. We mint a short-lived JWT for that user → call /api/chat/message
 *      (non-streaming) → capture X-Twin-Trace-Id + assistant text
 *   6. UPDATE whatsapp_messages with trace_id + twin_conversation_id
 *   7. POST { text } to bridge /reply/:userId (bridge SendMessages back)
 *   8. INSERT outbound whatsapp_messages row
 *
 * Latency budget: Whisper ≤3s + chat ≤55s + send ≤1s = ≤59s. Vercel
 * maxDuration is 60s — tight but workable. Whisper failures still record
 * the inbound row (with error_message) so we don't lose the message.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('VoiceBridge');
const router = express.Router();

const BRIDGE_BASE_URL = process.env.BRIDGE_BASE_URL || '';
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Where to call /api/chat/message from this same process. In Vercel prod
// this should be set to https://www.twinme.me/api so the self-call routes
// through the same domain (matters for CORS-less server fetch + edge
// cache). Defaults to http://localhost:${PORT}/api for local dev.
const SELF_API_BASE_URL =
  process.env.SELF_API_BASE_URL ||
  `http://localhost:${process.env.PORT || 3004}/api`;

let openai = null;
if (OPENAI_API_KEY && OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

function bridgeConfigured() {
  return BRIDGE_BASE_URL && BRIDGE_SHARED_SECRET;
}

function bridgeHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Bridge-Secret': BRIDGE_SHARED_SECRET,
  };
}

// =====================================================================
// /inbound — bridge → API   (auth: X-Bridge-Secret)
// =====================================================================
function requireBridgeAuth(req, res, next) {
  const got = req.header('X-Bridge-Secret');
  if (!BRIDGE_SHARED_SECRET) {
    log.error('BRIDGE_SHARED_SECRET not configured — rejecting all bridge calls');
    return res.status(503).json({ error: 'bridge_not_configured' });
  }
  if (!got || got !== BRIDGE_SHARED_SECRET) {
    log.warn('Bridge auth failed', { provided: got ? 'present' : 'missing' });
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

/**
 * Transcribe an OGG/Opus voice note via Whisper.
 * Buffer in → text out. Returns { transcript } on success or throws.
 *
 * We deliberately use `gpt-4o-mini-transcribe` if available (cheaper than
 * whisper-1 by ~50% and quality is on par for short voice notes). Falls
 * back to whisper-1 if the model isn't enabled on the OpenAI key.
 */
async function transcribeOgg(oggBuffer) {
  if (!openai) throw new Error('whisper_not_configured');

  // OpenAI SDK expects a File-like object; toFile handles raw Buffers.
  const file = await OpenAI.toFile(oggBuffer, 'voice.ogg', { type: 'audio/ogg' });

  try {
    const r = await openai.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      response_format: 'text',
    });
    // gpt-4o-mini-transcribe with response_format='text' returns a plain string
    return { transcript: typeof r === 'string' ? r.trim() : (r.text || '').trim() };
  } catch (err) {
    // gpt-4o-mini-transcribe not enabled? fall back to whisper-1
    if (err?.status === 404 || /model/i.test(err?.message || '')) {
      const file2 = await OpenAI.toFile(oggBuffer, 'voice.ogg', { type: 'audio/ogg' });
      const r2 = await openai.audio.transcriptions.create({
        file: file2,
        model: 'whisper-1',
        response_format: 'text',
      });
      return { transcript: typeof r2 === 'string' ? r2.trim() : (r2.text || '').trim() };
    }
    throw err;
  }
}

/**
 * Mint a 5-min HS256 JWT for `userId` so the internal /chat/message self-
 * call passes authenticateUser. We trust the bridge-auth check above.
 *
 * The auth middleware reads `payload.id || payload.userId` (auth.js:115).
 * The 24-hour email-verification grace path skips the check if the user's
 * record can't be loaded — but real users sending voice notes are well past
 * 24h anyway, so we fetch the email defensively to keep that path clean.
 */
function mintUserJwt(userId, email) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    { id: userId, userId, email: email || null, source: 'voice-bridge' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
}

/**
 * Call our own /api/chat/message with the transcribed text. Returns
 * { text, traceId, conversationId } on success. Non-streaming mode so
 * we get a JSON body back instead of SSE — simpler to parse and we don't
 * need progressive rendering for WhatsApp text replies.
 */
async function callTwinChat({ userId, email, message }) {
  const token = mintUserJwt(userId, email);
  const url = `${SELF_API_BASE_URL}/chat/message`;

  // 55s — leaves Vercel maxDuration (60s) a 5s buffer for the reply POST
  // back to the bridge + outbound row insert.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversationId: null }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('chat_timeout');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const traceId = res.headers.get('x-twin-trace-id') || null;
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw Object.assign(new Error('chat_call_failed'), {
      status: res.status,
      traceId,
      detail: body?.error || body?.message || null,
    });
  }
  return {
    text: body.message || '',
    traceId,
    conversationId: body.conversationId || null,
  };
}

/**
 * Tell the bridge to deliver `text` back to the user's WhatsApp.
 * Bridge-side this is whatsmeow.SendMessage to the user's own JID.
 */
async function sendReplyViaBridge(userId, text) {
  if (!bridgeConfigured()) throw new Error('bridge_not_configured');
  const url = `${BRIDGE_BASE_URL}/reply/${userId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: bridgeHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`bridge_reply_failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return true;
}

router.post('/inbound', requireBridgeAuth, async (req, res) => {
  const { userId, whatsappMessageId, senderJid, oggBase64, durationSeconds } = req.body || {};

  if (!userId || !whatsappMessageId || !oggBase64) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  // Idempotency first — bridge may retry on transient errors, and we don't
  // want a double-transcribe + double-chat-call.
  try {
    const { data: existing } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id')
      .eq('whatsapp_message_id', whatsappMessageId)
      .eq('direction', 'inbound')
      .maybeSingle();
    if (existing) {
      log.info('Duplicate inbound voice — skipping', { whatsappMessageId });
      return res.json({ status: 'duplicate', messageId: existing.id });
    }
  } catch (err) {
    log.error('idempotency check failed', { error: err?.message });
    // Fall through — better to risk a duplicate than drop the message.
  }

  // Verify link is active + grab the user's email for the JWT payload.
  const { data: link } = await supabaseAdmin
    .from('whatsapp_links')
    .select('id, jid, status')
    .eq('user_id', userId)
    .eq('status', 'linked')
    .maybeSingle();
  if (!link) {
    log.warn('Voice inbound for unlinked user', { userId, senderJid });
    return res.status(404).json({ error: 'no_active_link' });
  }

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  // Record the inbound row immediately so we never lose the fact that a
  // voice note arrived even if downstream Whisper / chat / reply fails.
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
    .select('id')
    .single();
  if (insertErr) {
    log.error('whatsapp_messages insert failed', { error: insertErr.message });
    return res.status(500).json({ error: 'persist_failed' });
  }

  // ACK the bridge synchronously so it doesn't retry while we process. The
  // actual transcribe + chat + reply chain runs in the background; the
  // user's reply lands on WhatsApp asynchronously, which matches expected
  // WhatsApp UX (replies appear over time). Failures get persisted onto
  // the same whatsapp_messages row so the user-visible history is honest.
  res.status(202).json({ status: 'accepted', messageId: msgRow.id });

  // ------------------ background pipeline ------------------
  (async () => {
    let transcript = null;
    try {
      const oggBuffer = Buffer.from(oggBase64, 'base64');
      const t0 = Date.now();
      const { transcript: tx } = await transcribeOgg(oggBuffer);
      transcript = tx;
      log.info('whisper transcribed', { messageId: msgRow.id, ms: Date.now() - t0, chars: tx.length });

      await supabaseAdmin
        .from('whatsapp_messages')
        .update({ transcript })
        .eq('id', msgRow.id);

      if (!transcript || !transcript.trim()) {
        await supabaseAdmin
          .from('whatsapp_messages')
          .update({ error_message: 'empty_transcript' })
          .eq('id', msgRow.id);
        return;
      }

      // Twin chat call
      const tChat0 = Date.now();
      const { text: replyText, traceId, conversationId } = await callTwinChat({
        userId,
        email: userRow?.email,
        message: transcript,
      });
      log.info('twin chat replied', { messageId: msgRow.id, ms: Date.now() - tChat0, traceId, chars: replyText.length });

      await supabaseAdmin
        .from('whatsapp_messages')
        .update({
          trace_id: traceId,
          twin_conversation_id: conversationId,
        })
        .eq('id', msgRow.id);

      if (!replyText) {
        await supabaseAdmin
          .from('whatsapp_messages')
          .update({ error_message: 'empty_reply' })
          .eq('id', msgRow.id);
        return;
      }

      // Send the reply via the bridge
      await sendReplyViaBridge(userId, replyText);

      // Persist outbound row
      await supabaseAdmin
        .from('whatsapp_messages')
        .insert({
          user_id: userId,
          link_id: link.id,
          direction: 'outbound',
          // Outbound messages don't have a WhatsApp message id at the
          // time we send — whatsmeow returns one but we don't plumb it
          // back yet. Use a deterministic placeholder so the row is
          // unique and traceable to the inbound id.
          whatsapp_message_id: `out:${msgRow.id}`,
          message_type: 'text',
          text_body: replyText,
          trace_id: traceId,
          twin_conversation_id: conversationId,
        });
    } catch (err) {
      log.error('inbound voice pipeline failed', {
        messageId: msgRow.id,
        error: err?.message,
        detail: err?.detail,
        status: err?.status,
      });
      await supabaseAdmin
        .from('whatsapp_messages')
        .update({
          transcript: transcript || null,
          error_message: (err?.message || 'unknown_error').slice(0, 500),
        })
        .eq('id', msgRow.id);
    }
  })().catch((err) => log.error('background pipeline crash', { error: err?.message }));
});

// =====================================================================
// /links/active — bridge → API, used on bridge startup to resume sessions
// =====================================================================
//
// The bridge keeps whatsmeow's device + session blobs in the shared
// Postgres DB, but it doesn't know which device belongs to which TwinMe
// user. On boot it asks us to enumerate all currently-linked rows so it
// can map JID → userId and reconnect each whatsmeow client.

router.get('/links/active', requireBridgeAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id, jid')
    .eq('status', 'linked');
  if (error) {
    log.error('links/active fetch failed', { error: error.message });
    return res.status(500).json({ error: 'fetch_failed' });
  }
  return res.json({
    links: (data || []).map(r => ({ userId: r.user_id, jid: r.jid })),
  });
});

// =====================================================================
// /link/complete — bridge → API   (auth: X-Bridge-Secret)
// =====================================================================
//
// Bridge calls this after whatsmeow fires *events.PairSuccess. We upsert
// the whatsapp_links row so it stays consistent across bridge restarts.
//
// Bridge passes the JID + display name + phone number. We trust them
// because the bridge-auth check protects this endpoint.
router.post('/link/complete', requireBridgeAuth, async (req, res) => {
  const { userId, jid, displayName, phoneNumber } = req.body || {};
  if (!userId || !jid) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  // 1. If THIS user already has a different linked JID, unlink the old one.
  //    Users switch phones; we keep the row for audit but flip the status.
  await supabaseAdmin
    .from('whatsapp_links')
    .update({ status: 'unlinked', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'linked')
    .neq('jid', jid);

  // 2. Check whether ANOTHER user currently has this JID linked. The
  //    partial unique index (idx_whatsapp_links_active_jid) will reject
  //    a second linked row for the same jid, so detect early and return
  //    a clean error rather than relying on a constraint violation.
  const { data: conflict } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id')
    .eq('jid', jid)
    .eq('status', 'linked')
    .neq('user_id', userId)
    .maybeSingle();
  if (conflict) {
    log.warn('whatsapp jid already linked to another user', { jid, otherUserId: conflict.user_id });
    return res.status(409).json({ error: 'jid_already_linked' });
  }

  // 3. UPDATE existing pending/linked row for this user+jid, or INSERT new.
  //    We avoid `.upsert()` because the table has no UNIQUE(user_id, jid)
  //    constraint — only a partial unique index on (jid) WHERE linked,
  //    which Postgres ON CONFLICT can't target.
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_links')
    .select('id')
    .eq('user_id', userId)
    .eq('jid', jid)
    .in('status', ['pending', 'linked'])
    .maybeSingle();

  const linkedFields = {
    display_name: displayName || null,
    phone_number: phoneNumber || null,
    status: 'linked',
    linked_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let linkRow;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_links')
      .update(linkedFields)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) {
      log.error('link/complete update failed', { userId, jid, error: error.message });
      return res.status(500).json({ error: 'link_persist_failed' });
    }
    linkRow = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_links')
      .insert({ user_id: userId, jid, ...linkedFields })
      .select('id')
      .single();
    if (error) {
      log.error('link/complete insert failed', { userId, jid, error: error.message });
      return res.status(500).json({ error: 'link_persist_failed' });
    }
    linkRow = data;
  }

  log.info('whatsapp link completed', { userId, jid, linkId: linkRow.id });
  return res.json({ status: 'linked', linkId: linkRow.id });
});

// =====================================================================
// /link/start — frontend → API → bridge
// =====================================================================

router.post('/link/start', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  if (!bridgeConfigured()) {
    return res.status(503).json({ error: 'bridge_not_configured' });
  }

  try {
    const r = await fetch(`${BRIDGE_BASE_URL}/link/start`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body: JSON.stringify({ userId }),
    });
    const body = await r.json().catch(() => ({}));
    return res.status(r.status).json(body);
  } catch (err) {
    log.error('link/start proxy failed', { error: err?.message });
    return res.status(502).json({ error: 'bridge_unreachable' });
  }
});

// =====================================================================
// /link/status — frontend polls this
// =====================================================================

router.get('/link/status', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  // DB is source of truth for completed links
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

  // No DB row — bridge is source of truth for pending pairings
  if (!bridgeConfigured()) {
    return res.json({ status: 'none' });
  }
  try {
    const r = await fetch(`${BRIDGE_BASE_URL}/link/status/${userId}`, {
      headers: bridgeHeaders(),
    });
    const body = await r.json().catch(() => ({ status: 'none' }));
    return res.json(body);
  } catch (err) {
    return res.json({ status: 'none' });
  }
});

// =====================================================================
// /link/cancel — abandon a pending link
// =====================================================================

router.post('/link/cancel', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  if (bridgeConfigured()) {
    try {
      await fetch(`${BRIDGE_BASE_URL}/link/cancel/${userId}`, {
        method: 'POST',
        headers: bridgeHeaders(),
      });
    } catch { /* non-fatal */ }
  }
  return res.json({ status: 'cancelled' });
});

// =====================================================================
// /unlink — destroy an existing link
// =====================================================================

router.post('/unlink', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { error } = await supabaseAdmin
    .from('whatsapp_links')
    .update({ status: 'unlinked', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'linked');
  if (error) {
    log.error('unlink failed', { error: error.message });
    return res.status(500).json({ error: 'unlink_failed' });
  }
  if (bridgeConfigured()) {
    try {
      await fetch(`${BRIDGE_BASE_URL}/link/cancel/${userId}`, {
        method: 'POST',
        headers: bridgeHeaders(),
      });
    } catch { /* non-fatal */ }
  }
  return res.json({ status: 'unlinked' });
});

// =====================================================================
// /history — recent WhatsApp messages for the user
// =====================================================================

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
