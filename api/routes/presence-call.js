/**
 * Presence elder channel — public call endpoints
 * ==============================================
 * The elder has no account: the call link token (presences.call_token, rotatable by
 * the owner via POST /api/presence/:id/call-link) IS the capability. Global /api
 * rate limiting applies; tokens are 192-bit random, unguessable, and constant-time
 * compared by the unique-index lookup.
 *
 *   GET  /api/presence-call/:token           call config: agent id + compiled brief
 *   POST /api/presence-call/:token/complete  store transcript, deliver notes, summarize
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { compileCallBrief } from '../services/presenceCallBrief.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('PresenceCall');
const router = express.Router();

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_TRANSCRIPT_TURNS = 400;
const MAX_TURN_CHARS = 4000;

async function loadByToken(req, res) {
  const { token } = req.params;
  if (!TOKEN_RE.test(token)) {
    res.status(404).json({ success: false, error: 'Call link not found' });
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from('presences')
    .select('*')
    .eq('call_token', token)
    .neq('status', 'deleted')
    .maybeSingle();
  if (error) {
    log.error('Token lookup failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Lookup failed' });
    return null;
  }
  if (!data || data.status === 'paused') {
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
    res.json({
      success: true,
      call: {
        agent_id: agentId,
        cared_for_name: presence.cared_for_name,
        caller_name: presence.caller_name,
        prompt: brief.prompt,
        first_message: brief.firstMessage,
        voice_id: brief.voiceId, // null until the cloned voice is ready
        language: 'pt',
      },
    });
  } catch (err) {
    log.error('GET call config failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to prepare the call' });
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

    const [notesRes, convRes] = await Promise.all([
      supabaseAdmin.from('presence_notes')
        .select('id, created_at')
        .eq('presence_id', presence.id).eq('status', 'queued')
        .order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('presence_conversations')
        .select('id, started_at, her_recap, turn_count')
        .eq('presence_id', presence.id).eq('status', 'summarized')
        .order('started_at', { ascending: false }).limit(4),
    ]);

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
    const transcript = raw
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
      .slice(0, MAX_TRANSCRIPT_TURNS)
      .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TURN_CHARS) }));

    const durationSeconds = Math.min(Math.max(parseInt(req.body?.duration_seconds, 10) || 0, 0), 4 * 3600);

    const { data: conversation, error } = await supabaseAdmin
      .from('presence_conversations')
      .insert({
        presence_id: presence.id,
        ended_at: new Date().toISOString(),
        transcript,
        turn_count: transcript.length,
        duration_seconds: durationSeconds,
      })
      .select('id')
      .single();
    if (error) throw error;

    // Queued notes were woven into this call's brief — mark them delivered.
    await supabaseAdmin
      .from('presence_notes')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('presence_id', presence.id)
      .eq('status', 'queued');

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

/**
 * Family digest: a short summary + the items that need a person.
 * Routed through llmGateway per repo policy (cheap analysis tier).
 */
async function summarizeConversation(conversationId, presence, transcript) {
  if (transcript.length === 0) {
    await supabaseAdmin.from('presence_conversations')
      .update({ status: 'summarized', summary: 'A call was opened but no conversation was captured.' })
      .eq('id', conversationId);
    return;
  }

  const { complete, TIER_ANALYSIS } = await import('../services/llmGateway.js');
  const caredFor = presence.cared_for_name?.trim() || 'She';

  const text = transcript
    .map((t) => `${t.role === 'user' ? caredFor : 'AI presence'}: ${t.content}`)
    .join('\n')
    .slice(0, 24000);

  const completion = await complete({
    tier: TIER_ANALYSIS,
    serviceName: 'presence-call-summary',
    userId: presence.owner_user_id,
    system: `You process a voice conversation between an older adult and her family's AI presence. Reply with STRICT JSON only: {"summary": "2-3 warm, specific sentences in English about how she was and what she shared", "her_recap": "ONE short warm sentence addressed to HER, in the same language she spoke, naming what you talked about — e.g. \"Falamos do seu passeio e do kebab em Madri.\" Never mention worries, health, or anything you are reporting to her family.", "needs_family": ["each item that needs a real person; empty array if none"], "learned_facts": [{"question": "short topic label", "answer": "one specific autobiographical fact SHE stated about her own life, worth remembering for future conversations"}], "unknown_people": ["names of people she mentioned whose relationship to her is unclear from the conversation"]}.

needs_family must include, in plain family-facing language:
- any request, question or practical need she raised;
- any health mention, pain, worry or confusion;
- emotional withdrawal: if she went quiet, gave one-word answers, or ended the conversation shortly after a specific topic, say so and name the topic. A family wants to know this more than anything else in the call. Report it even when nothing was explicitly asked of them.

Every needs_family entry is a plain sentence a family member reads on their phone. Never prefix a category label; never use capitals for emphasis. Write "She went quiet after the Presence mentioned her late mother's cooking, and did not speak again." — not "EMOTIONAL WITHDRAWAL: ..."

Max 6 learned_facts, max 3 unknown_people. Never invent content not in the transcript.`,
    messages: [{ role: 'user', content: text }],
    maxTokens: 400,
    temperature: 0.3,
  });

  let summary = '';
  let herRecap = '';
  let needsFamily = [];
  let learnedFacts = [];
  let unknownPeople = [];
  try {
    const content = completion?.content || '';
    const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    summary = String(parsed.summary || '').slice(0, 2000);
    herRecap = String(parsed.her_recap || '').slice(0, 400);
    needsFamily = Array.isArray(parsed.needs_family) ? parsed.needs_family.map((s) => String(s).slice(0, 500)).slice(0, 10) : [];
    learnedFacts = Array.isArray(parsed.learned_facts) ? parsed.learned_facts.slice(0, 6) : [];
    unknownPeople = Array.isArray(parsed.unknown_people) ? parsed.unknown_people.map((s) => String(s).slice(0, 80)).slice(0, 3) : [];
  } catch {
    summary = 'Conversation recorded. Summary unavailable this time.';
  }

  await supabaseAdmin
    .from('presence_conversations')
    .update({ summary, her_recap: herRecap, needs_family: needsFamily, status: 'summarized' })
    .eq('id', conversationId);

  // Learning loop (context architecture §3): what she said about her own life enters
  // the biography store as PROVISIONAL (30-day TTL, write gate) so the next call brief
  // remembers it; people we can't place become ASK items for the family.
  const thirtyDays = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const factRows = learnedFacts
    .filter((f) => f && typeof f.answer === 'string' && f.answer.trim())
    .map((f) => ({
      presence_id: presence.id,
      kind: 'biography',
      question: String(f.question || 'From conversation').slice(0, 1000),
      answer: String(f.answer).slice(0, 4000),
      source: 'elder_conversation',
      confidence: 'provisional',
      expires_at: thirtyDays,
    }))
    .concat(unknownPeople.map((name) => ({
      presence_id: presence.id,
      kind: 'biography',
      question: `Who is "${name}"? She mentioned them in conversation.`,
      answer: 'Awaiting the family — mentioned but not in the family map.',
      source: 'elder_conversation',
      confidence: 'ask',
      expires_at: thirtyDays,
    })));
  if (factRows.length > 0) {
    const { error: factError } = await supabaseAdmin.from('presence_facts').insert(factRows);
    if (factError) log.error('Learned-fact insert failed', { error: factError.message });
  }

  log.info('Conversation summarized', { conversationId, needsFamily: needsFamily.length, learned: factRows.length });
}

export default router;
