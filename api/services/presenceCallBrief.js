/**
 * Presence call brief compiler
 * ============================
 * Assembles the per-call system prompt for the elder channel from the presence
 * data model (context architecture §5: pinned stores 1+2+3+6 plus selected anchors).
 *
 * v1 delivery: the brief is fetched by the elder call page and injected as an
 * ElevenLabs conversation override at session start. When the custom-LLM flip
 * happens (deployed shim), this same compiler feeds that endpoint instead.
 *
 * Reads go through api/services/presenceStore.js.
 */

import { getCallBriefSources } from './presenceStore.js';
import { createLogger } from './logger.js';
import { renderCallBrief } from './presenceBriefRender.js';

const log = createLogger('PresenceCallBrief');

/**
 * Compile the call brief for one presence.
 *
 * Rejects with the query error when the family map, the facts or the queued notes
 * cannot be read: without them the call could speak of someone who has died as
 * living, cross a boundary the family set, or have its notes marked delivered by
 * /complete without ever being read to her. A failed voice or recent-conversation
 * read is logged, and the call starts without it (standard voice, no recent memory).
 *
 * @returns {Promise<{
 *   presence: object, prompt: string, firstMessage: string,
 *   voiceId: string|null, queuedNoteIds: string[]
 * }>}
 */
export async function compileCallBrief(presence) {
  const { people: peopleRes, facts: factsRes, notes: notesRes, voice: voiceRes, conversations: convRes } =
    await getCallBriefSources(presence.id);

  const requiredError = peopleRes.error || factsRes.error || notesRes.error;
  if (requiredError) throw requiredError;
  if (voiceRes.error) {
    log.error('Voice not read; the call starts with the standard voice', { presenceId: presence.id, error: voiceRes.error.message });
  }
  if (convRes.error) {
    log.error('Recent conversations not read; the call starts without them', { presenceId: presence.id, error: convRes.error.message });
  }

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
