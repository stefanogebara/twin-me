/**
 * Presence store: the only Presence file that talks to Supabase for the
 * family routes (api/routes/presence.js) and the elder call routes
 * (api/routes/presence-call.js).
 *
 * Every function resolves to the raw Supabase response ({ data, error, count })
 * and never throws on a query error; the routes branch on `error`. The parallel
 * reads resolve to one response per query plus `error`, the first query error
 * among them (or null). Ownership checks, validation and payload decisions stay
 * in the routes; this file only applies them.
 *
 * Tables: presences, presence_people, presence_facts, presence_notes,
 * presence_conversations, presence_voice, presence_consents
 * (20260831_create_presence_tables.sql). Functions: presence_replace_people,
 * presence_save_fact (20260911_presence_atomic_writes.sql).
 */

import { supabaseAdmin } from './database.js';

const VOICE_CONSENT_KINDS = ['own_voice', 'own_voice_revoked'];
const PERSON_COLUMNS = 'id, name, relation, called_by';

/** The first error among parallel query responses, or null. */
function firstError(...responses) {
  return responses.find((response) => response.error)?.error ?? null;
}

// ====================================================================
// presences
// ====================================================================

/** A non-deleted presence by id, with the fields the ownership check and the routes need. */
export async function findLivePresenceById(presenceId) {
  return supabaseAdmin
    .from('presences')
    .select('id, owner_user_id, status, cared_for_name, caller_name, tone')
    .eq('id', presenceId)
    .neq('status', 'deleted')
    .maybeSingle();
}

/** The owner's most recently updated non-deleted presence (full row), or null. */
export async function getLatestPresenceForOwner(userId) {
  return supabaseAdmin
    .from('presences')
    .select('*')
    .eq('owner_user_id', userId)
    .neq('status', 'deleted')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** A non-deleted presence (full row) by its elder call-link token. */
export async function findPresenceByCallToken(token) {
  return supabaseAdmin
    .from('presences')
    .select('*')
    .eq('call_token', token)
    .neq('status', 'deleted')
    .maybeSingle();
}

/** Create a draft presence and return the inserted row. */
export async function createPresence(row) {
  return supabaseAdmin
    .from('presences')
    .insert(row)
    .select()
    .single();
}

/** Apply a whitelisted patch and return the updated row. */
export async function updatePresence(presenceId, patch) {
  return supabaseAdmin
    .from('presences').update(patch).eq('id', presenceId).select().single();
}

/** Store a freshly generated call-link token (rotating any previous one). */
export async function setCallToken(presenceId, token) {
  return supabaseAdmin
    .from('presences')
    .update({ call_token: token, call_token_created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', presenceId);
}

/** Set the conversational tone. */
export async function setPresenceTone(presenceId, tone) {
  return supabaseAdmin.from('presences').update({ tone, updated_at: new Date().toISOString() }).eq('id', presenceId);
}

// ====================================================================
// Parallel reads (one Promise.all each; every query is dispatched at once)
// ====================================================================

/** Everything readiness is computed from: counts, fact kinds, voice status. */
export async function getReadinessSources(presenceId) {
  const [people, facts, notes, conversations, voice] = await Promise.all([
    supabaseAdmin.from('presence_people').select('id', { count: 'exact', head: true })
      .eq('presence_id', presenceId).eq('status', 'active'),
    supabaseAdmin.from('presence_facts').select('kind, confidence')
      .eq('presence_id', presenceId).eq('status', 'active'),
    supabaseAdmin.from('presence_notes').select('id', { count: 'exact', head: true })
      .eq('presence_id', presenceId).eq('status', 'queued'),
    supabaseAdmin.from('presence_conversations').select('id', { count: 'exact', head: true })
      .eq('presence_id', presenceId),
    supabaseAdmin.from('presence_voice').select('status').eq('presence_id', presenceId).maybeSingle(),
  ]);
  return { people, facts, notes, conversations, voice, error: firstError(people, facts, notes, conversations, voice) };
}

/** What the onboarding resume needs besides the presence: family map, voice, facts. */
export async function getResumeDetails(presenceId) {
  const [people, voice, facts] = await Promise.all([
    supabaseAdmin.from('presence_people').select(PERSON_COLUMNS)
      .eq('presence_id', presenceId).eq('status', 'active').order('created_at'),
    supabaseAdmin.from('presence_voice').select('status, sample_count, sample_seconds')
      .eq('presence_id', presenceId).maybeSingle(),
    supabaseAdmin.from('presence_facts').select('id, kind, question, answer')
      .eq('presence_id', presenceId).eq('status', 'active').order('created_at'),
  ]);
  return { people, voice, facts, error: firstError(people, voice, facts) };
}

/** Everything the family dashboard renders. */
export async function getOverview(presenceId) {
  const [presence, people, voice, facts, notes, conversations] = await Promise.all([
    supabaseAdmin.from('presences').select('*').eq('id', presenceId).single(),
    supabaseAdmin.from('presence_people').select(PERSON_COLUMNS)
      .eq('presence_id', presenceId).eq('status', 'active').order('created_at'),
    supabaseAdmin.from('presence_voice').select('status, sample_count, sample_seconds')
      .eq('presence_id', presenceId).maybeSingle(),
    supabaseAdmin.from('presence_facts').select('id, kind, question, answer, confidence, source')
      .eq('presence_id', presenceId).eq('status', 'active').order('created_at'),
    supabaseAdmin.from('presence_notes').select('id, body, status, created_at, delivered_at')
      .eq('presence_id', presenceId).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('presence_conversations')
      .select('id, started_at, ended_at, turn_count, duration_seconds, summary, needs_family, status')
      .eq('presence_id', presenceId).order('started_at', { ascending: false }).limit(10),
  ]);
  return {
    presence, people, voice, facts, notes, conversations,
    error: firstError(presence, people, voice, facts, notes, conversations),
  };
}

/** Her home screen: waiting notes (no bodies) and her own recaps (no family analysis). */
export async function getElderHome(presenceId) {
  const [notes, conversations] = await Promise.all([
    supabaseAdmin.from('presence_notes')
      .select('id, created_at')
      .eq('presence_id', presenceId).eq('status', 'queued')
      .order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('presence_conversations')
      .select('id, started_at, her_recap, turn_count')
      .eq('presence_id', presenceId).eq('status', 'summarized')
      .order('started_at', { ascending: false }).limit(4),
  ]);
  return { notes, conversations, error: firstError(notes, conversations) };
}

// ====================================================================
// presence_people
// ====================================================================

/** The active family map, unordered. */
export async function listActivePeople(presenceId) {
  return supabaseAdmin
    .from('presence_people').select(PERSON_COLUMNS).eq('presence_id', presenceId).eq('status', 'active');
}

/**
 * Replace the active family map with `people` ({ name, relation, called_by }[])
 * in one transaction: the old rows are retired only if every new row inserts,
 * and concurrent replaces of one map run in turn. Returns the new rows.
 */
export async function replaceActivePeople(presenceId, people) {
  return supabaseAdmin.rpc('presence_replace_people', { p_presence_id: presenceId, p_people: people });
}

/** Insert one person or many, without returning them. */
export async function addPeople(rowOrRows) {
  return supabaseAdmin.from('presence_people').insert(rowOrRows);
}

/** Fill in fields on an existing person. */
export async function enrichPerson(personId, fields) {
  return supabaseAdmin.from('presence_people').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', personId);
}

// ====================================================================
// presence_facts
// ====================================================================

/**
 * Update the active fact with this (kind, question), or insert it, under a lock
 * on (presence, kind, question) so two concurrent saves cannot both insert.
 * Returns { id, kind, question, answer }.
 */
export async function saveFact(presenceId, { kind, question, answer, source }) {
  return supabaseAdmin
    .rpc('presence_save_fact', {
      p_presence_id: presenceId, p_kind: kind, p_question: question, p_answer: answer, p_source: source,
    })
    .single();
}

/** Insert one fact or many; returns each row's created_at (one insert shares one timestamp). */
export async function addFacts(rowOrRows) {
  return supabaseAdmin.from('presence_facts').insert(rowOrRows).select('created_at');
}

/**
 * Retire the active "Family introduction" rows written before `before`, once a
 * newer one is stored, so a re-recording neither duplicates nor loses it.
 */
export async function supersedeFamilyIntroduction(presenceId, before) {
  return supabaseAdmin.from('presence_facts')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('presence_id', presenceId).eq('kind', 'biography').eq('question', 'Family introduction').eq('status', 'active')
    .lt('created_at', before);
}

/** An active "who is X?" ask card belonging to this presence. */
export async function findOpenAsk(presenceId, factId) {
  return supabaseAdmin.from('presence_facts')
    .select('id, question')
    .eq('id', factId).eq('presence_id', presenceId).eq('confidence', 'ask').eq('status', 'active')
    .maybeSingle();
}

/** Mark a fact deleted (a dismissed ask). */
export async function dismissFact(factId) {
  return supabaseAdmin.from('presence_facts')
    .update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', factId);
}

/** Mark a fact superseded (an answered ask). */
export async function supersedeFact(factId) {
  return supabaseAdmin.from('presence_facts')
    .update({ status: 'superseded', updated_at: new Date().toISOString() }).eq('id', factId);
}

// ====================================================================
// presence_notes
// ====================================================================

/** Queue a note for her next conversation and return it. */
export async function queueNote(row) {
  return supabaseAdmin
    .from('presence_notes')
    .insert(row)
    .select('id, body, status, created_at')
    .single();
}

/** Mark every queued note delivered (they were woven into the call that just ended). */
export async function markQueuedNotesDelivered(presenceId) {
  return supabaseAdmin
    .from('presence_notes')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('presence_id', presenceId)
    .eq('status', 'queued');
}

// ====================================================================
// presence_conversations
// ====================================================================

/** Store a finished call's transcript and return its id. */
export async function createConversation(row) {
  return supabaseAdmin
    .from('presence_conversations')
    .insert(row)
    .select('id')
    .single();
}

/** Write the summary fields onto a conversation. */
export async function saveConversationSummary(conversationId, fields) {
  return supabaseAdmin
    .from('presence_conversations')
    .update(fields)
    .eq('id', conversationId);
}

/** One conversation with its transcript, scoped to the presence. */
export async function getConversationTranscript(presenceId, conversationId) {
  return supabaseAdmin
    .from('presence_conversations')
    .select('id, started_at, duration_seconds, turn_count, transcript, summary, needs_family')
    .eq('id', conversationId).eq('presence_id', presenceId)
    .maybeSingle();
}

// ====================================================================
// presence_consents (append-only)
// ====================================================================

/** Append a consent record and return it. */
export async function recordConsent(row) {
  return supabaseAdmin
    .from('presence_consents')
    .insert(row)
    .select('id, kind, accepted_at')
    .single();
}

/** Append a consent record without returning it. */
export async function appendConsent(row) {
  return supabaseAdmin.from('presence_consents').insert(row);
}

/** The latest own_voice / own_voice_revoked record (kind + accepted_at), as a 0-1 row list. */
export async function getLatestVoiceConsent(presenceId) {
  return supabaseAdmin
    .from('presence_consents')
    .select('kind, accepted_at')
    .eq('presence_id', presenceId)
    .in('kind', VOICE_CONSENT_KINDS)
    .order('accepted_at', { ascending: false })
    .limit(1);
}

/** The latest own_voice / own_voice_revoked record (kind only), as a 0-1 row list. */
export async function getLatestVoiceConsentKind(presenceId) {
  return supabaseAdmin
    .from('presence_consents').select('kind')
    .eq('presence_id', presenceId).in('kind', VOICE_CONSENT_KINDS)
    .order('accepted_at', { ascending: false }).limit(1);
}

// ====================================================================
// presence_voice (one row per presence, upserted on presence_id)
// ====================================================================

/** Current voice state including the cloned voice id. */
export async function getVoiceState(presenceId) {
  return supabaseAdmin.from('presence_voice')
    .select('status, sample_count, sample_seconds, elevenlabs_voice_id')
    .eq('presence_id', presenceId).maybeSingle();
}

/** Just the cloned voice id. */
export async function getClonedVoiceId(presenceId) {
  return supabaseAdmin.from('presence_voice')
    .select('elevenlabs_voice_id').eq('presence_id', presenceId).maybeSingle();
}

/** Upsert sample/queue metadata; returns status and sample totals. */
export async function recordVoiceStatus(row) {
  return supabaseAdmin
    .from('presence_voice')
    .upsert(row, { onConflict: 'presence_id' })
    .select('status, sample_count, sample_seconds')
    .single();
}

/** Upsert the result of a sample upload; returns status, totals and the note. */
export async function recordVoiceSample(row) {
  return supabaseAdmin.from('presence_voice').upsert(row, { onConflict: 'presence_id' })
    .select('status, sample_count, sample_seconds, note').single();
}

/** Upsert the revoked state; returns the status. */
export async function recordVoiceRevoked(row) {
  return supabaseAdmin.from('presence_voice').upsert(row, { onConflict: 'presence_id' })
    .select('status').single();
}
