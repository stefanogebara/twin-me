/**
 * Presence elder channel — public call endpoints
 * ==============================================
 * The elder has no account: the call link token (presences.call_token, rotatable by
 * the owner via POST /api/presence/:id/call-link) IS the capability. Global /api
 * rate limiting applies; tokens are 192-bit random, unguessable, and constant-time
 * compared by the unique-index lookup.
 *
 *   GET  /api/presence-call/:token           call config: a session token + compiled brief
 *   GET  /api/presence-call/:token/home      her home screen (waiting notes, her recaps)
 *   POST /api/presence-call/:token/assent    her "Sim, pode", before the first call
 *   POST /api/presence-call/:token/complete  store the call, deliver notes, summarize
 *
 * With an ElevenLabs key the agent is private: the session is started with a
 * token this server fetches, and /complete reads the transcript ElevenLabs holds
 * for the conversation id the browser reports, so a fabricated transcript cannot
 * become her facts or the next call's prompt. Without a key (local development)
 * the public agent id and the browser's transcript are used.
 *
 * All table access goes through api/services/presenceStore.js.
 */

import express from 'express';
import {
  findPresenceByCallToken,
  getElderHome,
  createConversation,
  markQueuedNotesDelivered,
  recordElderAssent,
} from '../services/presenceStore.js';
import { compileCallBrief } from '../services/presenceCallBrief.js';
import { summarizeConversation } from '../services/presenceSummarizer.js';
import { voiceProvider } from '../services/voiceProvider.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('PresenceCall');
const router = express.Router();

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{6,80}$/;
// ElevenLabs' language code for Brazilian Portuguese (ASR and TTS).
const CALL_LANGUAGE = 'pt-br';
// The text she hears before her first call (PresenceCallPage assent screen). Bump
// when the wording changes so the version she agreed to is on record.
const ELDER_ASSENT_VERSION = 'elder-assent-v1';
const MAX_TRANSCRIPT_TURNS = 400;
const MAX_TURN_CHARS = 4000;
// A call counts as having happened (so a queued note counts as read to her) only
// once she has spoken, the agent has answered her, and a minute has passed.
const MIN_DELIVERED_CALL_SECONDS = 60;
const MIN_DELIVERED_CALL_TURNS = 3;

async function loadByToken(req, res) {
  const { token } = req.params;
  if (!TOKEN_RE.test(token)) {
    res.status(404).json({ success: false, error: 'Call link not found' });
    return null;
  }
  const { data, error } = await findPresenceByCallToken(token);
  if (error) {
    log.error('Token lookup failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Lookup failed' });
    return null;
  }
  // A draft has not finished setup, a paused one asked for quiet, a deleted one is
  // gone: only an active presence answers its link.
  if (!data || data.status !== 'active') {
    res.status(404).json({ success: false, error: 'Call link not found' });
    return null;
  }
  return data;
}

// ====================================================================
// GET /:token — everything the elder call page needs to start a session
// ====================================================================
router.get('/:token', async (req, res) => {
  try {
    const presence = await loadByToken(req, res);
    if (!presence) return;

    const agentId = process.env.ELEVENLABS_PRESENCE_AGENT_ID;
    if (!agentId) {
      return res.status(503).json({ success: false, error: 'Voice channel is not configured yet' });
    }

    const brief = await compileCallBrief(presence);

    // A private agent refuses a bare agent id; the browser starts the session with
    // this token instead. Without a key there is no token and the id is public.
    let conversationToken = null;
    const voice = voiceProvider();
    if (voice.isEnabled()) {
      const issued = await voice.getConversationToken(agentId);
      if (!issued.success) {
        log.error('Conversation token not issued', { presenceId: presence.id, error: issued.error });
        return res.status(502).json({ success: false, error: 'The voice channel did not answer' });
      }
      conversationToken = issued.token;
    }

    res.json({
      success: true,
      call: {
        agent_id: agentId,
        conversation_token: conversationToken,
        presence_id: presence.id,
        cared_for_name: presence.cared_for_name,
        caller_name: presence.caller_name,
        prompt: brief.prompt,
        first_message: brief.firstMessage,
        voice_id: brief.voiceId, // null until the cloned voice is ready
        language: CALL_LANGUAGE,
        assent_required: !presence.elder_assent_at,
      },
    });
  } catch (err) {
    log.error('GET call config failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to prepare the call' });
  }
});

// ====================================================================
// POST /:token/assent — her "Sim, pode", before the first call
// ====================================================================
router.post('/:token/assent', async (req, res) => {
  try {
    const presence = await loadByToken(req, res);
    if (!presence) return;

    const { error } = await recordElderAssent(presence.id, ELDER_ASSENT_VERSION);
    if (error) throw error;

    res.json({ success: true, assent_version: ELDER_ASSENT_VERSION });
  } catch (err) {
    log.error('POST assent failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to record' });
  }
});

// ====================================================================
// GET /:token/home — her own home screen
// ====================================================================
// Deliberately narrow: her name, who made the Presence, whether a note is waiting
// (and from whom — never the note body, which is delivered aloud in conversation),
// and her own recaps. The family-facing `summary`, `needs_family` and care signals
// are NEVER returned here — her screen must not show the family's analysis of her.
router.get('/:token/home', async (req, res) => {
  try {
    const presence = await loadByToken(req, res);
    if (!presence) return;

    const { notes: notesRes, conversations: convRes, error } = await getElderHome(presence.id);
    if (error) throw error;

    res.json({
      success: true,
      home: {
        cared_for_name: presence.cared_for_name,
        caller_name: presence.caller_name,
        waiting_notes: (notesRes.data || []).length,
        conversations: (convRes.data || [])
          .filter((c) => c.her_recap && c.turn_count > 1)
          .map((c) => ({ id: c.id, started_at: c.started_at, recap: c.her_recap })),
      },
    });
  } catch (err) {
    log.error('GET her home failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load' });
  }
});

// ====================================================================
// POST /:token/complete — client-captured transcript at session end
// ====================================================================
router.post('/:token/complete', async (req, res) => {
  try {
    const presence = await loadByToken(req, res);
    if (!presence) return;

    const raw = Array.isArray(req.body?.transcript) ? req.body.transcript : [];
    let transcript = raw
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
      .slice(0, MAX_TRANSCRIPT_TURNS)
      .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TURN_CHARS) }));
    let durationSeconds = Math.min(Math.max(parseInt(req.body?.duration_seconds, 10) || 0, 0), 4 * 3600);

    const conversationId = typeof req.body?.conversation_id === 'string' && CONVERSATION_ID_RE.test(req.body.conversation_id)
      ? req.body.conversation_id
      : null;

    // With a key, the record ElevenLabs holds is the transcript: the browser's copy is
    // only kept while the call is still being processed there.
    if (voiceProvider().isEnabled()) {
      if (!conversationId) {
        return res.status(400).json({ success: false, error: 'conversation_id is required' });
      }
      const held = await voiceProvider().getConversation(conversationId);
      if (!held.success || held.conversation?.agent_id !== process.env.ELEVENLABS_PRESENCE_AGENT_ID) {
        log.warn('Completion refused: conversation unknown or not ours', { presenceId: presence.id, conversationId, error: held.error });
        return res.status(409).json({ success: false, error: 'Conversation not recognized' });
      }
      const heldTranscript = Array.isArray(held.conversation.transcript) ? held.conversation.transcript : [];
      if (heldTranscript.length > 0) {
        transcript = heldTranscript
          .filter((t) => t && (t.role === 'user' || t.role === 'agent') && typeof t.message === 'string' && t.message)
          .slice(0, MAX_TRANSCRIPT_TURNS)
          .map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.message.slice(0, MAX_TURN_CHARS) }));
        const heldSeconds = parseInt(held.conversation.metadata?.call_duration_secs, 10);
        if (Number.isFinite(heldSeconds)) durationSeconds = Math.min(Math.max(heldSeconds, 0), 4 * 3600);
      } else {
        log.warn('Conversation still processing at ElevenLabs; keeping the transcript the browser sent', {
          presenceId: presence.id, conversationId, status: held.conversation.status,
        });
      }
    }

    const { data: conversation, error } = await createConversation({
      presence_id: presence.id,
      ended_at: new Date().toISOString(),
      transcript,
      turn_count: transcript.length,
      duration_seconds: durationSeconds,
      provider_conversation_id: conversationId,
    });
    if (error) throw error;

    // Queued notes were woven into this call's brief — mark them delivered, but only if
    // the call happened (a connect-and-drop never read them to her). The call is stored
    // already, so a failure is logged, not sent to her page (a retry would store the
    // call twice); the notes stay queued and are carried into her next call again.
    const callHappened = transcript.some((t) => t.role === 'user')
      && transcript.length >= MIN_DELIVERED_CALL_TURNS
      && durationSeconds >= MIN_DELIVERED_CALL_SECONDS;
    if (callHappened) {
      const { error: notesError } = await markQueuedNotesDelivered(presence.id);
      if (notesError) log.error('Queued notes not marked delivered', { error: notesError.message });
    }

    // Summarize in the background; the elder page never waits on an LLM.
    summarizeConversation(conversation.id, presence, transcript).catch((err) =>
      log.error('Background summary failed', { error: err.message }),
    );

    res.status(201).json({ success: true, conversation_id: conversation.id });
  } catch (err) {
    log.error('POST complete failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to save the conversation' });
  }
});

export default router;
