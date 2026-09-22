/**
 * Presence call summarizer
 * ========================
 * After a call: the family digest (summary, what needs a person, urgency), her
 * own recap, what she said about her life (provisional facts), people we could
 * not place (ask cards), and, on her first phone call, whether she said yes.
 * Called by the post-call webhook and by the web channel's /complete. Routed
 * through llmGateway (analysis tier). Reads and writes through presenceStore.
 */

import { saveConversationSummary, addFacts, recordElderAssent, saveFact, listActivePeople } from './presenceStore.js';
import { createLogger } from './logger.js';
import { distressTripwire } from './presenceTripwire.js';
import { escalationInstruction } from './presenceAutonomy.js';

const log = createLogger('PresenceSummarizer');

// The spoken assent on her first phone call; the web channel's screen records 'elder-assent-v1'.
export const ELDER_ASSENT_CALL_VERSION = 'elder-assent-call-v1';
export const PREFERRED_NAME_QUESTION = 'Como ela gosta de ser chamada';

const BASE_FIELDS = '{"summary": "2-3 warm, specific sentences em português do Brasil about how she was and what she shared", "her_recap": "ONE short warm sentence addressed to HER, in the same language she spoke, naming what you talked about — e.g. "Falamos do seu passeio e do kebab em Madri." Never mention worries, health, or anything you are reporting to her family.", "needs_family": ["each item that needs a real person, em português do Brasil; empty array if none"], "urgency": "high if she mentioned pain, a fall, being unwell, confusion, or asked for help; otherwise normal", "learned_facts": [{"question": "short topic label, em português do Brasil", "answer": "one specific autobiographical fact SHE stated about her own life, em português do Brasil, worth remembering for future conversations"}], "unknown_people": ["names of people she mentioned whose relationship to her is unclear from the conversation"]';

const FIRST_CALL_FIELDS = ', "assent": "yes if she clearly agreed to talk with the presence again; no if she declined; unclear otherwise", "preferred_name": "what she said she likes to be called, or empty", "preferred_time": "the time of day she said is good to call, in her words, or empty"';

/**
 * She calls people by the names she has always used — "a Rê", "o tio Zé", "a
 * dona Cida" — while the map holds Renata, José, Aparecida. Comparing the two
 * needs the honorific and the accents gone, or every call files a familiar
 * person as a stranger and the family gets the same question card forever.
 */
const HONORIFICS = /^(a|o|as|os|seu|sr|sra|senhor|senhora|dona|dom|tia|tio|vo|vov|vovo|vovô|vovó|prima|primo|meu|minha)\s+/;

function nameKey(value) {
  let key = String(value || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let stripped = true;
  while (stripped) {
    const next = key.replace(HONORIFICS, '');
    stripped = next !== key;
    key = next;
  }
  return key;
}

/** Every way the family map lets her name one of its people. */
function knownNameKeys(people) {
  const keys = new Set();
  for (const person of people) {
    for (const value of [person.name, person.called_by]) {
      const key = nameKey(value);
      if (!key) continue;
      keys.add(key);
      // "tio Zé" also answers to "Zé"; a first name also answers on its own.
      for (const word of key.split(' ')) if (word.length > 2) keys.add(word);
    }
  }
  return keys;
}

/** The map as the summarizer reads it, or '' when there is nobody on it. */
function familyMapForPrompt(people) {
  if (people.length === 0) return '';
  const lines = people
    .map((p) => `- ${p.name}${p.relation ? ` (${p.relation})` : ''}${p.called_by ? `, que ela chama de "${p.called_by}"` : ''}`)
    .join('\n');
  return `\nThe family map — these people are KNOWN. Never list any of them in unknown_people, however she said the name (a nickname, an honorific such as "tia" or "dona", or a first name alone):\n${lines}\n`;
}

/**
 * @param {string} conversationId
 * @param {object} presence  id, owner_user_id, cared_for_name
 * @param {Array<{role: 'user'|'assistant', content: string}>} transcript
 * @param {{ firstCall?: boolean }} [options]
 * @returns {Promise<{ summary: string, needsFamily: string[], urgency: 'normal'|'high', assent: 'yes'|'no'|'unclear'|null, preferredName: string }>}
 */
export async function summarizeConversation(conversationId, presence, transcript, { firstCall = false } = {}) {
  const empty = { summary: '', needsFamily: [], urgency: 'normal', assent: null, preferredName: '' };
  if (transcript.length === 0) {
    const summary = 'A ligação foi aberta, mas nenhuma conversa foi registrada.';
    const { error } = await saveConversationSummary(conversationId, { status: 'summarized', summary });
    if (error) log.error('Conversation summary not saved', { conversationId, error: error.message });
    return { ...empty, summary };
  }

  const { complete, TIER_ANALYSIS } = await import('./llmGateway.js');
  const caredFor = presence.cared_for_name?.trim() || 'She';

  // A failed read is logged, not thrown: the summary matters more than the
  // matching, and an unfiltered ask card is recoverable where a lost call is not.
  const { data: peopleRows, error: peopleError } = await listActivePeople(presence.id);
  if (peopleError) log.error('Family map not read; people she named may become ask cards again', { presenceId: presence.id, error: peopleError.message });
  const people = peopleRows || [];

  const text = transcript
    .map((t) => `${t.role === 'user' ? caredFor : 'AI presence'}: ${t.content}`)
    .join('\n')
    .slice(0, 24000);

  const completion = await complete({
    tier: TIER_ANALYSIS,
    serviceName: 'presence-call-summary',
    userId: presence.owner_user_id,
    system: `You process a voice conversation between an older adult and her family's AI presence. The family is Brazilian: everything they read must be em português do Brasil. Reply with STRICT JSON only: ${BASE_FIELDS}${firstCall ? FIRST_CALL_FIELDS : ''}}.

${escalationInstruction(presence.autonomy_escalation)}

Every needs_family entry is a plain sentence a family member reads on their phone. Never prefix a category label; never use capitals for emphasis. Write "Ela ficou quieta depois que a Presença falou da comida da mãe dela, e não falou mais." — not "RETRAIMENTO EMOCIONAL: ..."
${firstCall ? '\nThis was her FIRST call: the presence introduced itself and asked whether it may talk with her again. Report her answer in "assent" exactly as she gave it; never assume a yes.\n' : ''}
${familyMapForPrompt(people)}\nMax 6 learned_facts, max 3 unknown_people. Never invent content not in the transcript.`,
    messages: [{ role: 'user', content: text }],
    maxTokens: 450,
    temperature: 0.3,
  });

  let summary = '';
  let herRecap = '';
  let needsFamily = [];
  let urgency = 'normal';
  let learnedFacts = [];
  let unknownPeople = [];
  let assent = null;
  let preferredName = '';
  try {
    const content = completion?.content || '';
    const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    summary = String(parsed.summary || '').slice(0, 2000);
    herRecap = String(parsed.her_recap || '').slice(0, 400);
    needsFamily = Array.isArray(parsed.needs_family) ? parsed.needs_family.map((s) => String(s).slice(0, 500)).slice(0, 10) : [];
    urgency = parsed.urgency === 'high' ? 'high' : 'normal';
    learnedFacts = Array.isArray(parsed.learned_facts) ? parsed.learned_facts.slice(0, 6) : [];
    const known = knownNameKeys(people);
    unknownPeople = Array.isArray(parsed.unknown_people)
      ? parsed.unknown_people.map((s) => String(s).slice(0, 80)).filter((name) => { const key = nameKey(name); return key && !known.has(key); }).slice(0, 3)
      : [];
    if (firstCall) {
      assent = ['yes', 'no', 'unclear'].includes(parsed.assent) ? parsed.assent : 'unclear';
      preferredName = String(parsed.preferred_name || '').trim().slice(0, 120);
    }
  } catch {
    summary = 'Conversa guardada. O resumo não saiu desta vez.';
  }

  // The tripwire (Phase 2, T8): her own words about a fall, strong pain, or a cry
  // for help make the call urgent even when the model called it normal. It only
  // raises; when the model found nothing for the family, the phrase itself is the line.
  const tripped = distressTripwire(transcript);
  if (tripped.hit && urgency !== 'high') {
    urgency = 'high';
    if (needsFamily.length === 0) needsFamily = [`Ela falou "${tripped.phrase}" na ligação de hoje. Vale ligar para ela.`];
    log.warn('Distress tripwire raised the urgency', { conversationId, phrase: tripped.phrase });
  }

  const { error: summaryError } = await saveConversationSummary(
    conversationId,
    { summary, her_recap: herRecap, needs_family: needsFamily, urgency, status: 'summarized' },
  );
  // Logged, not thrown: what she said about her own life is still worth keeping below.
  if (summaryError) log.error('Conversation summary not saved', { conversationId, error: summaryError.message });

  // Her spoken yes on the first call is what the calls stand on: recorded with the
  // version of the script she heard. A no or an unclear answer records nothing; the
  // next call is a first call again, and the family sees it in the digest.
  if (firstCall && assent === 'yes') {
    const { error: assentError } = await recordElderAssent(presence.id, ELDER_ASSENT_CALL_VERSION);
    if (assentError) log.error('Her assent not recorded', { presenceId: presence.id, error: assentError.message });
    if (preferredName) {
      const { error: nameError } = await saveFact(presence.id, {
        kind: 'language', question: PREFERRED_NAME_QUESTION, answer: preferredName, source: 'elder_conversation',
      });
      if (nameError) log.error('Preferred name not saved', { presenceId: presence.id, error: nameError.message });
    }
  }

  // Learning loop (context architecture §3): what she said about her own life enters
  // the biography store as PROVISIONAL (30-day TTL, write gate) so the next call brief
  // remembers it; people we can't place become ASK items for the family.
  const thirtyDays = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const factRows = learnedFacts
    .filter((f) => f && typeof f.answer === 'string' && f.answer.trim())
    .map((f) => ({
      presence_id: presence.id,
      kind: 'biography',
      question: String(f.question || 'Da conversa').slice(0, 1000),
      answer: String(f.answer).slice(0, 4000),
      source: 'elder_conversation',
      confidence: 'provisional',
      expires_at: thirtyDays,
    }))
    .concat(unknownPeople.map((name) => ({
      presence_id: presence.id,
      kind: 'biography',
      // Parsed back by presence.js (/asks) and by PresenceHome: keep the `Quem é "<name>"?` shape.
      question: `Quem é "${name}"? Ela falou dessa pessoa na conversa.`,
      answer: 'Esperando a família: foi mencionada, mas não está no mapa da família.',
      source: 'elder_conversation',
      confidence: 'ask',
      expires_at: thirtyDays,
    })));
  if (factRows.length > 0) {
    const { error: factError } = await addFacts(factRows);
    if (factError) log.error('Learned-fact insert failed', { error: factError.message });
  }

  log.info('Conversation summarized', { conversationId, needsFamily: needsFamily.length, learned: factRows.length, urgency, assent });
  return { summary, needsFamily, urgency, assent, preferredName };
}
