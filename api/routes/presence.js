/**
 * Presence API
 * ============
 * Family-relay AI companion for older adults. Backs /presence/onboarding.
 * Data model: 20260831_create_presence_tables.sql. Design:
 * .claude/plans/2026-08-31-presence-onboarding-system/ (§API) and
 * .claude/plans/2026-08-31-presence-context-architecture/.
 *
 * Endpoints (all JWT-authenticated; ownership enforced on every :id):
 *   GET    /api/presence/mine            — resume: latest presence + people + voice
 *   POST   /api/presence                 — create a draft
 *   PATCH  /api/presence/:id             — update bond/tone/status fields
 *   POST   /api/presence/:id/consent     — append a consent record (never updates)
 *   PUT    /api/presence/:id/people      — replace the family map (bounded)
 *   POST   /api/presence/:id/facts       — upsert one fact by (kind, question)
 *   POST   /api/presence/:id/notes       — queue a note for the next conversation
 *   POST   /api/presence/:id/voice-status— record sample/queue state (metadata only;
 *                                          sample file upload is the next slice, and
 *                                          'queued' requires an own_voice consent row)
 *
 * Uses public.users.id (req.user.id), NOT auth.users.id — CLAUDE.md convention.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authenticateUser } from '../middleware/auth.js';
import { voiceService } from '../services/voiceService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';
import { deriveReadiness } from '../services/presenceReadiness.js';

const log = createLogger('Presence');
const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATCHABLE_FIELDS = ['cared_for_name', 'relationship', 'caller_name', 'tone', 'status'];
const VALID_STATUSES = new Set(['draft', 'active', 'paused', 'deleted']);
const VALID_CONSENT_KINDS = new Set(['own_voice', 'own_voice_revoked', 'ai_disclosure']);
const VALID_FACT_KINDS = new Set(['tone', 'language', 'boundary', 'anchor', 'biography', 'care_signal']);
const VALID_VOICE_STATUSES = new Set(['samples_recorded', 'queued']);
const MAX_PEOPLE = 8;

// "Tell me about her" voice notes: disk-staged, transcribed, then deleted.
const aboutUploadDir = './uploads/voice';
const aboutUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(aboutUploadDir, { recursive: true });
      cb(null, aboutUploadDir);
    },
    filename: (req, file, cb) => cb(null, `about-${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname) || '.webm'}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^audio\//.test(file.mimetype) || file.mimetype === 'video/webm'),
});

// Readiness: the compiled brief translated into plain language, plus the gate the
// call link enforces. Thresholds are deliberately low (a widow with one child must
// not be blocked) — the mirror does the persuading, not the gate.
async function computeReadiness(presence) {
  const [people, facts, notes, conversations, voice] = await Promise.all([
    supabaseAdmin.from('presence_people').select('id', { count: 'exact', head: true })
      .eq('presence_id', presence.id).eq('status', 'active'),
    supabaseAdmin.from('presence_facts').select('kind, confidence')
      .eq('presence_id', presence.id).eq('status', 'active'),
    supabaseAdmin.from('presence_notes').select('id', { count: 'exact', head: true })
      .eq('presence_id', presence.id).eq('status', 'queued'),
    supabaseAdmin.from('presence_conversations').select('id', { count: 'exact', head: true })
      .eq('presence_id', presence.id),
    supabaseAdmin.from('presence_voice').select('status').eq('presence_id', presence.id).maybeSingle(),
  ]);
  const kinds = (facts.data || []);
  const count = (kind) => kinds.filter((f) => f.kind === kind && f.confidence !== 'ask').length;
  const counts = {
    people: people.count || 0,
    anchors: count('anchor'),
    boundaries: count('boundary'),
    biography: count('biography'),
    notes_queued: notes.count || 0,
    conversations: conversations.count || 0,
  };
  const hasIntro = kinds.some((f) => f.kind === 'biography');
  const derived = deriveReadiness({ caredForName: presence.cared_for_name, tone: presence.tone, counts, hasIntro });
  return { ...derived, counts, voice_status: voice.data?.status || 'none' };
}

/** Fetch a presence and verify the requester owns it. Returns null after responding. */
async function loadOwned(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    res.status(400).json({ success: false, error: 'Invalid presence id' });
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from('presences')
    .select('id, owner_user_id, status, cared_for_name, caller_name, tone')
    .eq('id', id)
    .neq('status', 'deleted')
    .maybeSingle();
  if (error) {
    log.error('Presence lookup failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Lookup failed' });
    return null;
  }
  if (!data || data.owner_user_id !== req.user.id) {
    res.status(404).json({ success: false, error: 'Presence not found' });
    return null;
  }
  return data;
}

const clip = (value, max) => String(value ?? '').slice(0, max);

/** Find an existing person whose name is the same as, or a whole-word part of, the candidate. */
function findSamePerson(people, candidateName) {
  const norm = (v) => String(v || '').toLowerCase().normalize('NFC').trim();
  const cand = norm(candidateName);
  if (!cand) return null;
  const words = (v) => norm(v).split(/\s+/).filter(Boolean);
  const cw = words(cand);
  return people.find((p) => {
    const pn = norm(p.name);
    if (!pn) return false;
    if (pn === cand) return true;
    const pw = words(pn);
    // e.g. "tia rê" ⊇ "rê", "dona lurdes" ⊇ "lurdes" — shared last word or full containment as words
    return pw.every((w) => cw.includes(w)) || cw.every((w) => pw.includes(w));
  }) || null;
}

// ====================================================================
// GET /mine — resume the latest presence for this user
// ====================================================================
router.get('/mine', authenticateUser, async (req, res) => {
  try {
    const { data: presence, error } = await supabaseAdmin
      .from('presences')
      .select('*')
      .eq('owner_user_id', req.user.id)
      .neq('status', 'deleted')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!presence) return res.json({ success: true, presence: null });

    const [people, voice, facts] = await Promise.all([
      supabaseAdmin.from('presence_people').select('id, name, relation, called_by')
        .eq('presence_id', presence.id).eq('status', 'active').order('created_at'),
      supabaseAdmin.from('presence_voice').select('status, sample_count, sample_seconds')
        .eq('presence_id', presence.id).maybeSingle(),
      supabaseAdmin.from('presence_facts').select('id, kind, question, answer')
        .eq('presence_id', presence.id).eq('status', 'active').order('created_at'),
    ]);

    res.json({
      success: true,
      presence,
      people: people.data || [],
      voice: voice.data || null,
      facts: facts.data || [],
    });
  } catch (err) {
    log.error('GET /mine failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load presence' });
  }
});

// ====================================================================
// POST / — create a draft
// ====================================================================
router.post('/', authenticateUser, async (req, res) => {
  try {
    const body = req.body || {};
    const { data, error } = await supabaseAdmin
      .from('presences')
      .insert({
        owner_user_id: req.user.id,
        cared_for_name: clip(body.cared_for_name, 120),
        relationship: clip(body.relationship || 'grandmother', 40),
        caller_name: clip(body.caller_name, 120),
        tone: clip(body.tone, 80),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, presence: data });
  } catch (err) {
    log.error('POST / failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create presence' });
  }
});

// ====================================================================
// PATCH /:id — update whitelisted fields
// ====================================================================
router.patch('/:id', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const patch = {};
    for (const field of PATCHABLE_FIELDS) {
      if (req.body?.[field] === undefined) continue;
      if (field === 'status') {
        if (!VALID_STATUSES.has(req.body.status)) {
          return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        patch.status = req.body.status;
      } else {
        patch[field] = clip(req.body[field], field === 'relationship' ? 40 : field === 'tone' ? 80 : 120);
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: 'No patchable fields provided' });
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('presences').update(patch).eq('id', owned.id).select().single();
    if (error) throw error;
    res.json({ success: true, presence: data });
  } catch (err) {
    log.error('PATCH /:id failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update presence' });
  }
});

// ====================================================================
// POST /:id/consent — append-only consent record
// ====================================================================
router.post('/:id/consent', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const { kind, text_version: textVersion } = req.body || {};
    if (!VALID_CONSENT_KINDS.has(kind) || !textVersion) {
      return res.status(400).json({ success: false, error: 'kind and text_version are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('presence_consents')
      .insert({ presence_id: owned.id, user_id: req.user.id, kind, text_version: clip(textVersion, 2000) })
      .select('id, kind, accepted_at')
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, consent: data });
  } catch (err) {
    log.error('POST consent failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to record consent' });
  }
});

// ====================================================================
// PUT /:id/people — replace the family map
// ====================================================================
router.put('/:id/people', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const incoming = Array.isArray(req.body?.people) ? req.body.people : null;
    if (!incoming) return res.status(400).json({ success: false, error: 'people array is required' });

    const rows = incoming
      .map((p) => ({
        presence_id: owned.id,
        name: clip(p?.name, 120).trim(),
        relation: clip(p?.relation, 80).trim(),
        called_by: clip(p?.called_by, 120).trim(),
      }))
      .filter((p) => p.name.length > 0)
      .slice(0, MAX_PEOPLE);

    // Replace-all sync: soft-delete the current map, insert the new one.
    const { error: clearError } = await supabaseAdmin
      .from('presence_people')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('presence_id', owned.id)
      .eq('status', 'active');
    if (clearError) throw clearError;

    let people = [];
    if (rows.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('presence_people').insert(rows).select('id, name, relation, called_by');
      if (error) throw error;
      people = data;
    }
    res.json({ success: true, people });
  } catch (err) {
    log.error('PUT people failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to save family map' });
  }
});

// ====================================================================
// POST /:id/facts — upsert one fact by (kind, question)
// ====================================================================
router.post('/:id/facts', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const { kind, question = '', answer } = req.body || {};
    if (!VALID_FACT_KINDS.has(kind) || !answer || !String(answer).trim()) {
      return res.status(400).json({ success: false, error: 'kind and answer are required' });
    }
    const source = req.body?.source === 'family_app' ? 'family_app' : 'family_onboarding';

    const { data: existing, error: findError } = await supabaseAdmin
      .from('presence_facts')
      .select('id')
      .eq('presence_id', owned.id)
      .eq('kind', kind)
      .eq('question', clip(question, 1000))
      .eq('status', 'active')
      .maybeSingle();
    if (findError) throw findError;

    let fact;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('presence_facts')
        .update({ answer: clip(answer, 4000), source, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, kind, question, answer')
        .single();
      if (error) throw error;
      fact = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('presence_facts')
        .insert({ presence_id: owned.id, kind, question: clip(question, 1000), answer: clip(answer, 4000), source })
        .select('id, kind, question, answer')
        .single();
      if (error) throw error;
      fact = data;
    }
    res.status(201).json({ success: true, fact });
  } catch (err) {
    log.error('POST facts failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to save fact' });
  }
});

// ====================================================================
// POST /:id/notes — queue a note for her next conversation
// ====================================================================
router.post('/:id/notes', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ success: false, error: 'body is required' });

    const { data, error } = await supabaseAdmin
      .from('presence_notes')
      .insert({ presence_id: owned.id, author_user_id: req.user.id, body: clip(body, 2000) })
      .select('id, body, status, created_at')
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, note: data });
  } catch (err) {
    log.error('POST notes failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to queue note' });
  }
});

// ====================================================================
// POST /:id/voice-status — sample/queue metadata (no files yet)
// ====================================================================
router.post('/:id/voice-status', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const { status } = req.body || {};
    if (!VALID_VOICE_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: "status must be 'samples_recorded' or 'queued'" });
    }

    // Consent gate: nothing enters the build queue without an own_voice consent
    // row that hasn't been revoked afterwards.
    if (status === 'queued') {
      const { data: consents, error: consentError } = await supabaseAdmin
        .from('presence_consents')
        .select('kind, accepted_at')
        .eq('presence_id', owned.id)
        .in('kind', ['own_voice', 'own_voice_revoked'])
        .order('accepted_at', { ascending: false })
        .limit(1);
      if (consentError) throw consentError;
      if (!consents?.length || consents[0].kind !== 'own_voice') {
        return res.status(409).json({ success: false, error: 'Voice consent is required before queueing a build' });
      }
    }

    const sampleCount = Math.min(Math.max(parseInt(req.body?.sample_count, 10) || 0, 0), 20);
    const sampleSeconds = Math.min(Math.max(parseInt(req.body?.sample_seconds, 10) || 0, 0), 3600);

    const { data, error } = await supabaseAdmin
      .from('presence_voice')
      .upsert(
        {
          presence_id: owned.id,
          status,
          sample_count: sampleCount,
          sample_seconds: sampleSeconds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'presence_id' },
      )
      .select('status, sample_count, sample_seconds')
      .single();
    if (error) throw error;
    res.json({ success: true, voice: data });
  } catch (err) {
    log.error('POST voice-status failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update voice status' });
  }
});

// ====================================================================
// POST /:id/call-link — create or rotate the elder call link
// ====================================================================
router.post('/:id/call-link', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const readiness = await computeReadiness(owned);
    if (!readiness.ready) {
      return res.status(409).json({
        success: false,
        error: 'The Presence is not ready for a first call yet',
        missing: readiness.missing,
        readiness,
      });
    }

    const { randomBytes } = await import('crypto');
    const token = randomBytes(24).toString('base64url');
    const { error } = await supabaseAdmin
      .from('presences')
      .update({ call_token: token, call_token_created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', owned.id);
    if (error) throw error;

    res.status(201).json({ success: true, call_path: `/call/${token}` });
  } catch (err) {
    log.error('POST call-link failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create call link' });
  }
});

// ====================================================================
// GET /:id/overview — everything the family dashboard renders
// ====================================================================
router.get('/:id/overview', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const [presence, people, voice, facts, notes, conversations] = await Promise.all([
      supabaseAdmin.from('presences').select('*').eq('id', owned.id).single(),
      supabaseAdmin.from('presence_people').select('id, name, relation, called_by')
        .eq('presence_id', owned.id).eq('status', 'active').order('created_at'),
      supabaseAdmin.from('presence_voice').select('status, sample_count, sample_seconds')
        .eq('presence_id', owned.id).maybeSingle(),
      supabaseAdmin.from('presence_facts').select('id, kind, question, answer, confidence, source')
        .eq('presence_id', owned.id).eq('status', 'active').order('created_at'),
      supabaseAdmin.from('presence_notes').select('id, body, status, created_at, delivered_at')
        .eq('presence_id', owned.id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('presence_conversations')
        .select('id, started_at, ended_at, turn_count, duration_seconds, summary, needs_family, status')
        .eq('presence_id', owned.id).order('started_at', { ascending: false }).limit(10),
    ]);

    res.json({
      success: true,
      presence: presence.data,
      people: people.data || [],
      voice: voice.data || null,
      facts: facts.data || [],
      notes: notes.data || [],
      conversations: conversations.data || [],
    });
  } catch (err) {
    log.error('GET overview failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load overview' });
  }
});

// ====================================================================
// GET /:id/readiness — what she knows, in plain language + the gate
// ====================================================================
router.get('/:id/readiness', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;
    const readiness = await computeReadiness(owned);
    res.json({ success: true, ...readiness });
  } catch (err) {
    log.error('GET readiness failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to compute readiness' });
  }
});

// ====================================================================
// POST /:id/about — "Tell me about her": voice note or text → structure
// ====================================================================
router.post('/:id/about', authenticateUser, aboutUpload.single('audio'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    let transcript = String(req.body?.text || '').trim();
    if (!transcript && filePath) {
      if (!voiceService.speechToTextEnabled) {
        return res.status(503).json({ success: false, error: 'Transcription is not configured' });
      }
      const stream = fs.createReadStream(filePath);
      stream.name = req.file.originalname || 'about.webm';
      const stt = await voiceService.speechToText(stream);
      if (!stt.success) {
        return res.status(502).json({ success: false, error: 'Could not transcribe the recording' });
      }
      transcript = String(stt.transcription || '').trim();
    }
    if (!transcript) {
      return res.status(400).json({ success: false, error: 'Record a voice note or write a few lines' });
    }
    transcript = transcript.slice(0, 12000);

    const { complete, TIER_ANALYSIS } = await import('../services/llmGateway.js');
    const her = owned.cared_for_name?.trim() || 'her';
    const completion = await complete({
      tier: TIER_ANALYSIS,
      serviceName: 'presence-about-extract',
      userId: req.user.id,
      system: `A family member is describing ${her}, an older relative, so an AI companion can know her. Extract STRICT JSON only: {"people": [{"name": "", "relation": "relation TO ${her} (e.g. daughter, neighbor)", "called_by": "what ${her} calls them, or empty"}], "anchors": [{"kind": "place|dish|person|other", "value": "one specific story seed from her world"}], "boundaries": ["things the AI must never say or bring up"], "facts": [{"question": "short topic label", "answer": "one specific fact about her life, routines, health context, likes"}], "tone_hint": "one of: Gentle teasing, Very affectionate, Calm and practical, Storytelling, or empty"}. Keep names exactly as said. If a person has died, the relation MUST end with "(deceased)" — e.g. "husband (deceased)" — so the companion never speaks of them as living. Max 8 people, 6 anchors, 6 boundaries, 12 facts. Never invent.`,
      messages: [{ role: 'user', content: transcript }],
      maxTokens: 900,
      temperature: 0.2,
    });

    let extracted = { people: [], anchors: [], boundaries: [], facts: [], tone_hint: '' };
    try {
      const content = completion?.content || '';
      const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
      extracted = {
        people: (Array.isArray(parsed.people) ? parsed.people : []).slice(0, 8)
          .map((p) => ({ name: clip(p?.name, 120).trim(), relation: clip(p?.relation, 80).trim(), called_by: clip(p?.called_by, 120).trim() }))
          .filter((p) => p.name),
        anchors: (Array.isArray(parsed.anchors) ? parsed.anchors : []).slice(0, 6)
          .map((a) => ({ kind: ['place', 'dish', 'person'].includes(a?.kind) ? a.kind : 'other', value: clip(a?.value, 500).trim() }))
          .filter((a) => a.value),
        boundaries: (Array.isArray(parsed.boundaries) ? parsed.boundaries : []).slice(0, 6).map((b) => clip(b, 500).trim()).filter(Boolean),
        facts: (Array.isArray(parsed.facts) ? parsed.facts : []).slice(0, 12)
          .map((f) => ({ question: clip(f?.question, 200).trim() || 'About her', answer: clip(f?.answer, 1000).trim() }))
          .filter((f) => f.answer),
        tone_hint: clip(parsed.tone_hint, 80).trim(),
      };
    } catch {
      log.warn('About extraction returned non-JSON; saving transcript only');
    }

    // Persist: merge people by name (case-insensitive), upsert facts, keep the raw note.
    const { data: existingPeople } = await supabaseAdmin
      .from('presence_people').select('id, name, relation, called_by').eq('presence_id', owned.id).eq('status', 'active');
    const knownList = existingPeople || [];
    const newPeople = [];
    for (const person of extracted.people) {
      const match = findSamePerson(knownList, person.name);
      if (match) {
        // Enrich the existing row instead of duplicating it.
        const patch = {};
        if (!match.relation && person.relation) patch.relation = person.relation;
        if (!match.called_by && person.called_by) patch.called_by = person.called_by;
        if (Object.keys(patch).length) {
          await supabaseAdmin.from('presence_people').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', match.id);
        }
      } else if (knownList.length + newPeople.length < MAX_PEOPLE) {
        newPeople.push(person);
        knownList.push({ id: null, ...person });
      }
    }
    if (newPeople.length > 0) {
      await supabaseAdmin.from('presence_people').insert(newPeople.map((p) => ({ presence_id: owned.id, ...p })));
    }

    const factRows = [
      { kind: 'biography', question: 'Family introduction', answer: transcript.slice(0, 4000) },
      ...extracted.anchors.map((a) => ({ kind: 'anchor', question: a.kind === 'other' ? 'From her world' : `A ${a.kind} that matters`, answer: a.value })),
      ...extracted.boundaries.map((b) => ({ kind: 'boundary', question: 'From the family', answer: b })),
      ...extracted.facts.map((f) => ({ kind: 'biography', question: f.question, answer: f.answer })),
    ];
    // Replace any previous introduction so re-recording does not duplicate.
    await supabaseAdmin.from('presence_facts')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('presence_id', owned.id).eq('kind', 'biography').eq('question', 'Family introduction').eq('status', 'active');
    const { error: factError } = await supabaseAdmin.from('presence_facts')
      .insert(factRows.map((r) => ({ presence_id: owned.id, source: 'family_onboarding', confidence: 'committed', ...r })));
    if (factError) throw factError;

    if (extracted.tone_hint && !owned.tone) {
      await supabaseAdmin.from('presences').update({ tone: extracted.tone_hint, updated_at: new Date().toISOString() }).eq('id', owned.id);
    }

    res.status(201).json({
      success: true,
      transcript,
      extracted,
      saved: { people: newPeople.length, facts: factRows.length },
    });
  } catch (err) {
    log.error('POST about failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to process the description' });
  } finally {
    if (filePath) fs.unlink(filePath, () => {});
  }
});

// ====================================================================
// POST /:id/voice-samples — upload a sample; clone (flagged) or queue
// ====================================================================
// Policy: cloning spends real money and creates a voice on the ElevenLabs
// account, so it runs only when PRESENCE_VOICE_CLONE_ENABLED=true. Otherwise
// the state is 'queued' and the UI says so honestly. Consent is checked either
// way; samples are never stored server-side — the temp file is deleted after.
router.post('/:id/voice-samples', authenticateUser, aboutUpload.single('audio'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;
    if (!filePath) return res.status(400).json({ success: false, error: 'An audio sample is required' });

    const { data: consents } = await supabaseAdmin
      .from('presence_consents').select('kind')
      .eq('presence_id', owned.id).in('kind', ['own_voice', 'own_voice_revoked'])
      .order('accepted_at', { ascending: false }).limit(1);
    if (!consents?.length || consents[0].kind !== 'own_voice') {
      return res.status(409).json({ success: false, error: 'Voice consent is required first' });
    }

    const seconds = Math.min(Math.max(parseInt(req.body?.sample_seconds, 10) || 0, 0), 600);
    const { data: current } = await supabaseAdmin.from('presence_voice')
      .select('status, sample_count, sample_seconds, elevenlabs_voice_id')
      .eq('presence_id', owned.id).maybeSingle();
    const sampleCount = (current?.sample_count || 0) + 1;
    const sampleSeconds = (current?.sample_seconds || 0) + seconds;

    const cloneEnabled = process.env.PRESENCE_VOICE_CLONE_ENABLED === 'true' && voiceService.isEnabled();
    let status = 'queued';
    let voiceId = current?.elevenlabs_voice_id || null;
    let note = 'Sample received. Voice build queued.';

    if (cloneEnabled) {
      const voiceName = `Presence · ${owned.caller_name?.trim() || 'family'} → ${owned.cared_for_name?.trim() || 'her'}`;
      if (voiceId && current?.status === 'ready') {
        const added = await voiceService.addSamplesToVoice(voiceId, filePath, voiceName);
        status = added.success ? 'ready' : 'ready';
        note = added.success ? 'Sample added to your voice.' : `Kept existing voice; new sample not added (${String(added.error).slice(0, 120)})`;
      } else {
        const cloned = await voiceService.cloneVoice(filePath, voiceName, `Presence voice, consent recorded. Presence ${owned.id}`);
        if (cloned.success) {
          voiceId = cloned.voiceId;
          status = 'ready';
          note = 'Your voice is ready. Her calls use it from now on.';
        } else {
          status = 'failed';
          note = `Clone failed: ${String(cloned.error).slice(0, 160)}`;
        }
      }
    }

    const { data, error } = await supabaseAdmin.from('presence_voice').upsert({
      presence_id: owned.id,
      status,
      sample_count: sampleCount,
      sample_seconds: sampleSeconds,
      elevenlabs_voice_id: voiceId,
      note: note.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'presence_id' }).select('status, sample_count, sample_seconds, note').single();
    if (error) throw error;

    res.status(201).json({ success: true, voice: data, clone_enabled: cloneEnabled });
  } catch (err) {
    log.error('POST voice-samples failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to process the sample' });
  } finally {
    if (filePath) fs.unlink(filePath, () => {});
  }
});

// ====================================================================
// POST /:id/voice-revoke — consent withdrawal: delete the voice for real
// ====================================================================
router.post('/:id/voice-revoke', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;

    const { data: current } = await supabaseAdmin.from('presence_voice')
      .select('elevenlabs_voice_id').eq('presence_id', owned.id).maybeSingle();
    if (current?.elevenlabs_voice_id && voiceService.isEnabled()) {
      const deleted = await voiceService.deleteVoice(current.elevenlabs_voice_id);
      if (!deleted.success) log.warn('ElevenLabs voice delete failed on revoke', { error: deleted.error });
    }

    await supabaseAdmin.from('presence_consents').insert({
      presence_id: owned.id, user_id: req.user.id, kind: 'own_voice_revoked',
      text_version: 'Consent withdrawn by the owner; cloned voice deleted.',
    });
    const { data, error } = await supabaseAdmin.from('presence_voice').upsert({
      presence_id: owned.id, status: 'revoked', elevenlabs_voice_id: null,
      note: 'Voice removed at your request.', updated_at: new Date().toISOString(),
    }, { onConflict: 'presence_id' }).select('status').single();
    if (error) throw error;

    res.json({ success: true, voice: data });
  } catch (err) {
    log.error('POST voice-revoke failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to revoke the voice' });
  }
});

// ====================================================================
// POST /:id/asks/:factId — answer or dismiss a "who is X?" question card
// ====================================================================
router.post('/:id/asks/:factId', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;
    const { factId } = req.params;
    if (!UUID_RE.test(factId)) return res.status(400).json({ success: false, error: 'Invalid ask id' });

    const { data: ask } = await supabaseAdmin.from('presence_facts')
      .select('id, question')
      .eq('id', factId).eq('presence_id', owned.id).eq('confidence', 'ask').eq('status', 'active')
      .maybeSingle();
    if (!ask) return res.status(404).json({ success: false, error: 'Ask not found' });

    const action = req.body?.action === 'dismiss' ? 'dismiss' : 'add';
    if (action === 'dismiss') {
      await supabaseAdmin.from('presence_facts')
        .update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', ask.id);
      return res.json({ success: true, dismissed: true });
    }

    const parsedName = (ask.question.match(/Who is "(.+?)"\?/) || [])[1] || '';
    const name = clip(req.body?.name || parsedName, 120).trim();
    const relation = clip(req.body?.relation, 80).trim();
    const calledBy = clip(req.body?.called_by, 120).trim();
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const { data: allPeople } = await supabaseAdmin.from('presence_people')
      .select('id, name, relation, called_by').eq('presence_id', owned.id).eq('status', 'active');
    const existing = findSamePerson(allPeople || [], name);
    if (!existing) {
      await supabaseAdmin.from('presence_people').insert({ presence_id: owned.id, name, relation, called_by: calledBy });
    } else if (relation || calledBy) {
      await supabaseAdmin.from('presence_people')
        .update({ ...(relation ? { relation } : {}), ...(calledBy ? { called_by: calledBy } : {}), updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    await supabaseAdmin.from('presence_facts')
      .update({ status: 'superseded', updated_at: new Date().toISOString() }).eq('id', ask.id);
    if (relation) {
      await supabaseAdmin.from('presence_facts').insert({
        presence_id: owned.id, kind: 'biography', question: `Who ${name} is`,
        answer: `${name} is her ${relation}${calledBy ? ` — she calls them "${calledBy}"` : ''}.`,
        source: 'family_app', confidence: 'committed',
      });
    }
    res.json({ success: true, person: { name, relation, called_by: calledBy } });
  } catch (err) {
    log.error('POST asks failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to save the answer' });
  }
});

// ====================================================================
// GET /:id/conversations/:conversationId — the real transcript
// ====================================================================
// The dashboard shows a summary; a family member almost always wants to read what she
// actually said, in her words.
router.get('/:id/conversations/:conversationId', authenticateUser, async (req, res) => {
  try {
    const owned = await loadOwned(req, res);
    if (!owned) return;
    const { conversationId } = req.params;
    if (!UUID_RE.test(conversationId)) return res.status(400).json({ success: false, error: 'Invalid conversation id' });

    const { data, error } = await supabaseAdmin
      .from('presence_conversations')
      .select('id, started_at, duration_seconds, turn_count, transcript, summary, needs_family')
      .eq('id', conversationId).eq('presence_id', owned.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Conversation not found' });

    res.json({ success: true, conversation: data });
  } catch (err) {
    log.error('GET conversation failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load the conversation' });
  }
});

export default router;
