/**
 * ElevenLabs webhooks for Presence
 * ================================
 *   POST /api/webhooks/elevenlabs/post-call    post_call_transcription, call_initiation_failure
 *   POST /api/webhooks/elevenlabs/initiation   conversation-initiation data for an inbound call
 *
 * post-call is signed (ElevenLabs-Signature, HMAC over the raw body; secret
 * ELEVENLABS_POST_CALL_SECRET from the agent's webhook settings). The presence
 * comes from the presence_id dynamic variable we sent when dialing, or from
 * her phone when she called in. The conversation is stored once (unique
 * provider_conversation_id, checked first), the call row is closed, notes are
 * marked delivered under the same rule as the web channel, and then, after
 * the 200, the summary and the WhatsApp relay run. A store failure answers
 * 500 so ElevenLabs retries.
 *
 * initiation is called by ElevenLabs before an inbound call is answered, with
 * the shared secret it holds in its secrets manager (ELEVENLABS_WEBHOOK_SECRET,
 * header x-presence-secret). It replies with her brief as overrides.
 *
 * server.js keeps req.rawBody for this prefix. All table access goes through
 * api/services/presenceStore.js.
 */

import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  findActivePresenceById,
  findPresenceByElderPhone,
  findConversationByProviderId,
  createConversation,
  updateCallByConversation,
  markQueuedNotesDelivered,
  createCall,
} from '../services/presenceStore.js';
import { compileCallBrief } from '../services/presenceCallBrief.js';
import { summarizeConversation } from '../services/presenceSummarizer.js';
import { relayCall, relayNoAnswer } from '../services/presenceRelay.js';
import { verifyElevenLabsSignature } from '../services/elevenlabsWebhook.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ElevenLabsWebhook');
const router = express.Router();

const MAX_TRANSCRIPT_TURNS = 400;
const MAX_TURN_CHARS = 4000;
const MIN_DELIVERED_CALL_SECONDS = 60;
const MIN_DELIVERED_CALL_TURNS = 3;
const CALL_LANGUAGE = 'pt-br';
const FAILURE_STATUS = { busy: 'busy', 'no-answer': 'no_answer' };

function secretsMatch(given, expected) {
  if (typeof given !== 'string' || !expected) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** ElevenLabs' transcript items become the shape the summarizer and the pages read. */
function mapTranscript(items) {
  return (Array.isArray(items) ? items : [])
    .filter((t) => t && (t.role === 'user' || t.role === 'agent') && typeof t.message === 'string' && t.message)
    .slice(0, MAX_TRANSCRIPT_TURNS)
    .map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.message.slice(0, MAX_TURN_CHARS) }));
}

/** The presence a call belongs to: the dynamic variable we sent, else her phone. */
async function presenceForCall(data) {
  const presenceId = data?.conversation_initiation_client_data?.dynamic_variables?.presence_id;
  if (typeof presenceId === 'string' && presenceId) {
    const { data: byId, error } = await findActivePresenceById(presenceId);
    if (error) throw error;
    if (byId) return byId;
  }
  const phone = data?.metadata?.phone_call?.external_number;
  if (typeof phone === 'string' && phone) {
    const { data: byPhone, error } = await findPresenceByElderPhone(phone);
    if (error) throw error;
    if (byPhone) return byPhone;
  }
  return null;
}

async function handleTranscription(data) {
  const conversationId = typeof data?.conversation_id === 'string' ? data.conversation_id : null;
  if (!conversationId) return { received: true, ignored: 'no_conversation_id' };

  const presence = await presenceForCall(data);
  if (!presence) {
    log.warn('Post-call for an unknown presence', { conversationId });
    return { received: true, ignored: 'unknown_presence' };
  }

  const { data: existing, error: existingError } = await findConversationByProviderId(conversationId);
  if (existingError) throw existingError;
  if (existing) return { received: true, duplicate: true, conversation_id: existing.id };

  const transcript = mapTranscript(data.transcript);
  const heldSeconds = parseInt(data?.metadata?.call_duration_secs, 10);
  const durationSeconds = Number.isFinite(heldSeconds) ? Math.min(Math.max(heldSeconds, 0), 4 * 3600) : 0;
  const isPhone = Boolean(data?.metadata?.phone_call);

  const { data: conversation, error } = await createConversation({
    presence_id: presence.id,
    ended_at: new Date().toISOString(),
    transcript,
    turn_count: transcript.length,
    duration_seconds: durationSeconds,
    provider_conversation_id: conversationId,
    source: isPhone ? 'phone' : 'web_call',
  });
  if (error) throw error;

  const { error: callError } = await updateCallByConversation(conversationId, { status: 'completed', conversation_id: conversation.id });
  if (callError) log.error('Call row not closed', { conversationId, error: callError.message });

  const callHappened = transcript.some((t) => t.role === 'user')
    && transcript.length >= MIN_DELIVERED_CALL_TURNS
    && durationSeconds >= MIN_DELIVERED_CALL_SECONDS;
  if (callHappened) {
    const { error: notesError } = await markQueuedNotesDelivered(presence.id);
    if (notesError) log.error('Queued notes not marked delivered', { error: notesError.message });
  }

  // The summary and the relay run after the 200: ElevenLabs retries on 5xx only,
  // and the conversation is already safe.
  const firstCall = !presence.elder_assent_at;
  const after = async () => {
    const summary = await summarizeConversation(conversation.id, presence, transcript, { firstCall });
    await relayCall(presence, {
      id: conversation.id,
      presence_id: presence.id,
      summary: summary.summary,
      needs_family: summary.needsFamily,
      urgency: summary.urgency,
    });
  };
  return { received: true, conversation_id: conversation.id, after };
}

async function handleInitiationFailure(data) {
  const conversationId = typeof data?.conversation_id === 'string' ? data.conversation_id : null;
  if (!conversationId) return { received: true, ignored: 'no_conversation_id' };
  const reason = String(data?.failure_reason || 'unknown');
  const status = FAILURE_STATUS[reason] || 'failed';
  const { data: updated, error } = await updateCallByConversation(conversationId, { status, failure_reason: reason.slice(0, 200) });
  if (error) throw error;
  log.info('Call did not connect', { conversationId, reason });

  // After the day's second attempt, the family hears about it. This event carries no
  // presence id, so the call row (which the dial recorded) says whose it was.
  const call = Array.isArray(updated) ? updated[0] : null;
  if (call?.attempt >= 2 && status !== 'failed' && call.presence_id) {
    const { data: presence, error: presenceError } = await findActivePresenceById(call.presence_id);
    if (presenceError) throw presenceError;
    if (presence) return { received: true, after: () => relayNoAnswer(presence) };
  }
  return { received: true };
}

router.post('/post-call', async (req, res) => {
  try {
    const secret = process.env.ELEVENLABS_POST_CALL_SECRET;
    if (!secret) return res.status(503).json({ error: 'Webhook secret not configured' });
    if (typeof req.rawBody !== 'string') {
      log.error('Raw body missing: server.js must keep it for this prefix');
      return res.status(500).json({ error: 'Raw body unavailable' });
    }
    if (!verifyElevenLabsSignature(req.rawBody, req.get('ElevenLabs-Signature'), secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body || {};
    let result;
    if (type === 'post_call_transcription') result = await handleTranscription(data);
    else if (type === 'call_initiation_failure') result = await handleInitiationFailure(data);
    else result = { received: true, ignored: String(type || 'unknown') };

    const { after, ...body } = result;
    res.json(body);
    if (after) {
      after().catch((err) => log.error('Post-call follow-up failed', { error: err.message }));
    }
  } catch (err) {
    log.error('Post-call webhook failed', { error: err.message });
    res.status(500).json({ error: 'Failed to store the call' });
  }
});

router.post('/initiation', async (req, res) => {
  try {
    if (!secretsMatch(req.get('x-presence-secret'), process.env.ELEVENLABS_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid secret' });
    }
    const callerId = typeof req.body?.caller_id === 'string' ? req.body.caller_id : '';
    const conversationId = typeof req.body?.conversation_id === 'string' ? req.body.conversation_id : null;

    const { data: presence, error } = await findPresenceByElderPhone(callerId);
    if (error) throw error;
    if (!presence) {
      log.info('Inbound call from an unknown number', { callerId: callerId.slice(-4) });
      return res.status(404).json({ error: 'Unknown caller' });
    }

    const firstCall = !presence.elder_assent_at;
    const brief = await compileCallBrief(presence, { firstCall });
    const overrides = { agent: { prompt: { prompt: brief.prompt }, first_message: brief.firstMessage, language: CALL_LANGUAGE } };
    if (brief.voiceId) overrides.tts = { voice_id: brief.voiceId };

    const { error: callError } = await createCall({
      presence_id: presence.id,
      scheduled_for: new Date().toISOString(),
      attempt: 1,
      direction: 'inbound',
      status: 'answered',
      provider_conversation_id: conversationId,
    });
    if (callError) log.error('Inbound call not recorded', { presenceId: presence.id, error: callError.message });

    res.json({
      type: 'conversation_initiation_client_data',
      conversation_config_override: overrides,
      dynamic_variables: { presence_id: presence.id },
    });
  } catch (err) {
    log.error('Initiation webhook failed', { error: err.message });
    res.status(500).json({ error: 'Failed to prepare the call' });
  }
});

export default router;
