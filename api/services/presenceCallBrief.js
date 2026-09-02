/**
 * Presence call brief compiler
 * ============================
 * Assembles the per-call system prompt for the elder channel from the presence
 * data model (context architecture §5: pinned stores 1+2+3+6 plus selected anchors).
 *
 * v1 delivery: the brief is fetched by the elder call page and injected as an
 * ElevenLabs conversation override at session start. When the custom-LLM flip
 * happens (deployed shim), this same compiler feeds that endpoint instead.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { renderCallBrief } from './presenceBriefRender.js';

const log = createLogger('PresenceCallBrief');

/**
 * Compile the call brief for one presence.
 * @returns {Promise<null | {
 *   presence: object, prompt: string, firstMessage: string,
 *   voiceId: string|null, queuedNoteIds: string[]
 * }>}
 */
export async function compileCallBrief(presence) {
  const [peopleRes, factsRes, notesRes, voiceRes, convRes] = await Promise.all([
    supabaseAdmin.from('presence_people')
      .select('name, relation, called_by')
      .eq('presence_id', presence.id).eq('status', 'active').order('created_at'),
    supabaseAdmin.from('presence_facts')
      .select('kind, question, answer, confidence, expires_at')
      .eq('presence_id', presence.id).eq('status', 'active')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at'),
    supabaseAdmin.from('presence_notes')
      .select('id, body')
      .eq('presence_id', presence.id).eq('status', 'queued')
      .order('created_at').limit(5),
    supabaseAdmin.from('presence_voice')
      .select('status, elevenlabs_voice_id')
      .eq('presence_id', presence.id).maybeSingle(),
    supabaseAdmin.from('presence_conversations')
      .select('started_at, summary')
      .eq('presence_id', presence.id).eq('status', 'summarized')
      .neq('summary', '')
      .order('started_at', { ascending: false }).limit(3),
  ]);

  const people = peopleRes.data || [];
  const facts = factsRes.data || [];
  const notes = notesRes.data || [];
  const voice = voiceRes.data;
  const recentConversations = convRes.data || [];

  const { prompt, firstMessage } = renderCallBrief({ presence, people, facts, notes, recentConversations });

  log.info('Call brief compiled', {
    presenceId: presence.id,
    people: people.length,
    facts: facts.length,
    notes: notes.length,
    promptChars: prompt.length,
  });

  return {
    presence,
    prompt,
    firstMessage,
    voiceId: voice?.status === 'ready' && voice?.elevenlabs_voice_id ? voice.elevenlabs_voice_id : null,
    queuedNoteIds: notes.map((n) => n.id),
  };
}
