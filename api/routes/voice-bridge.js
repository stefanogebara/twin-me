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
 *   - /inbound:        bridge → API. Authenticated by BRIDGE_SHARED_SECRET header.
 *   - /link/*:         frontend → API. Authenticated by user JWT.
 *
 * Flow recap (askjo.ai-inspired voice surface, Phase 1):
 *   1. User visits /settings/voice
 *   2. Frontend hits POST /api/voice-bridge/link/start → API proxies to bridge
 *   3. Bridge returns a QR code; frontend renders it
 *   4. User scans QR with their WhatsApp Linked Devices flow
 *   5. Future voice messages: bridge POSTs /api/voice-bridge/inbound
 *   6. API: Whisper-transcribes → /api/chat/message → grabs reply →
 *      POST to bridge /reply/:userId
 *
 * Phase 1 = wire-up + persistence shell. Phase 2 = real Whisper + chat call.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('VoiceBridge');
const router = express.Router();

const BRIDGE_BASE_URL = process.env.BRIDGE_BASE_URL || '';
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET || '';

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
// /inbound — bridge → API
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

router.post('/inbound', requireBridgeAuth, async (req, res) => {
  const { userId, whatsappMessageId, senderJid, oggBase64, durationSeconds } = req.body || {};

  if (!userId || !whatsappMessageId || !oggBase64) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    // Idempotency: skip if we've already processed this WhatsApp message id.
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

    // TODO Phase 2:
    //   1. Whisper-transcribe Buffer.from(oggBase64, 'base64')
    //   2. UPDATE whatsapp_messages SET transcript = ... WHERE id = msgRow.id
    //   3. Call internal POST /api/chat/message with the transcript
    //   4. Capture X-Twin-Trace-Id + accumulated SSE response text
    //   5. UPDATE whatsapp_messages SET trace_id, twin_conversation_id ...
    //   6. POST { text } to bridge /reply/:userId
    //   7. INSERT a second whatsapp_messages row (direction='outbound', text_body=reply)

    log.info('Voice inbound recorded (Phase 1 stub)', {
      userId, messageId: msgRow.id, duration: durationSeconds,
    });

    return res.status(202).json({
      status: 'accepted',
      phase: '1-stub',
      messageId: msgRow.id,
      todo: ['whisper_transcribe', 'chat_handler_call', 'reply_to_bridge'],
    });
  } catch (err) {
    log.error('inbound voice failed', { error: err?.message });
    return res.status(500).json({ error: 'internal_error' });
  }
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
    .select('id, direction, message_type, transcript, text_body, duration_seconds, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ messages: data || [] });
});

export default router;
