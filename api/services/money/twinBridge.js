/**
 * The bridge from money to the twin.
 * ==================================
 * The twin already reads a memory stream: observations, facts, reflections, conversations,
 * each with an importance and an embedding, retrieved by relevance and recency (see
 * CLAUDE.md, "Twin Architecture"). Money was outside it, so the twin knew a person's music
 * and not the fact that five charges take 114 EUR from them every month.
 *
 * Four things cross the bridge, and between them they are the whole of what the ledger
 * knows about a person (2026-09-16):
 *
 *   readings   what the analyst found this week, one fact per finding
 *   patterns   what it worked out on its own: a price that never moves, a place that
 *              belongs to a weekday, where in the month the money goes
 *   said       what the person told it: what comes in, what they want kept, who somebody is
 *   asked      the conversation on Ask, so the twin remembers being asked about money
 *
 * The sentences are computed, never written by a model, so no number can be invented on the
 * way across. Importance is passed in rather than rated (`skipImportance`), so a refresh
 * costs one embedding per new sentence and no completion at all.
 */

import { addMemory } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('money-twin-bridge');

/**
 * How much each kind of finding matters to knowing a person. A charge that comes back
 * every month says more about a life than a single large purchase, and a rhythm says
 * more than a total.
 */
export const IMPORTANCE = {
  /* What comes back every month says more about a life than one large purchase, and a
     rhythm says more than a total. */
  subscriptions: 8,
  weekday_shape: 8,
  keep_month: 8,
  cap_month: 7,
  dormant_charge: 7,
  income_late: 7,
  charge_ahead: 7,
  delta_silence: 7,
  delta_category: 6,
  delta_pace: 6,
  delta_weekday: 6,
  month_pace: 6,
  small_payments: 6,
  split_open: 6,
  named_expense: 5,
  new_merchant: 5,
  biggest_line: 5,
  category_shape: 5,
  own_score: 4,
  /* What it worked out on its own, from the payments alone (brain.js). A price that never
     moves is a habit; an outlier is one evening. */
  price_point: 7,
  weekday_habit: 7,
  month_shape: 6,
  place_habit: 6,
  category_rhythm: 6,
  pairing: 5,
  amount_outlier: 4,
};

/** How much what a person told the ledger matters to knowing them. */
export const FACT_IMPORTANCE = {
  income: 9, keep: 8, commitment: 8, cap: 7, shared_cost: 7, person: 6,
  home_area: 7, study_place: 6, work_place: 6, goal: 7, note: 6, merchant_kind: 4, spending: 5, split: 5,
};

/** Fact kinds that are the lens's own working memory and never describe the person. */
const INTERNAL_KINDS = new Set(['event_spend', 'event_spend_meta', 'calendar_feed', 'home_point', 'inbox_address']);

/**
 * One finding as a sentence the twin can retrieve, with the money words spelled out
 * so a search for "spending" or "subscription" reaches it. Pure, exported for tests.
 */
export function memoryFor(finding) {
  if (!finding?.sentence) return null;
  const detail = finding.detail ? ` ${finding.detail}` : '';
  const receipts = (finding.receipts || [])
    .map((r) => `${r.merchant_raw || r.merchant_key}`)
    .filter(Boolean)
    .slice(0, 4);
  const where = receipts.length ? ` The payments behind it: ${receipts.join(', ')}.` : '';
  return {
    content: `Money: ${finding.sentence}${detail}${where}`,
    memoryType: 'fact',
    importance: IMPORTANCE[finding.kind] ?? 5,
    metadata: {
      source: 'money',
      domain: 'money',
      finding_kind: finding.kind,
      month: finding.month || null,
      numbers: finding.numbers || {},
      receipt_ids: (finding.receipts || []).map((r) => r.id).filter(Boolean),
      evidence_count: finding.evidence_count || 0,
    },
  };
}

/**
 * What the person told the ledger, as a sentence the twin can retrieve. Their own words are
 * kept as they wrote them; the frame around them says what kind of claim it is, and that it
 * was said rather than observed, because the twin must never quote a typed number as a
 * reading. Pure, exported for tests.
 */
export function memoryForFact(fact) {
  if (!fact || !fact.kind || INTERNAL_KINDS.has(fact.kind)) return null;
  const amount = Number(fact.amount);
  const money = Number.isFinite(amount) && amount !== 0 ? `${Math.abs(amount).toFixed(2).replace('.', ',')} EUR` : null;
  const day = fact.day ? ` around the ${fact.day} of the month` : null;
  const who = fact.subject_label || fact.subject || null;
  const said = {
    income: () => `Money: they said ${money || 'money'} comes in${who ? ` from ${who}` : ''}${day || ''}.`,
    commitment: () => `Money: they said ${who || 'something'} takes ${money || 'a fixed amount'} every month${day || ''}.`,
    keep: () => `Money: they want ${money} left at the end of the month.`,
    cap: () => `Money: they want to keep ${who || 'that'} under ${money} a month.`,
    shared_cost: () => `Money: ${who || 'something'} is shared${fact.value ? ` (${fact.value})` : ''}.`,
    split: () => `Money: ${who || 'a payment'} is split${fact.share ? `, ${Math.round(Number(fact.share) * 100)}% theirs` : ''}.`,
    person: () => `Money: ${who || 'somebody'} on their statement is ${fact.value || 'somebody they know'}${fact.note ? ` (${fact.note})` : ''}.`,
    home_area: () => `Money: they live in ${fact.value || who}.`,
    study_place: () => `Money: they study at ${fact.value || who}.`,
    work_place: () => `Money: they work at ${fact.value || who}.`,
    goal: () => `Money: this term is for ${fact.value || who}.`,
    merchant_kind: () => `Money: ${who || 'a place'} is ${fact.value || 'a kind of place'} to them.`,
    spending: () => `Money: they count ${fact.value || who} as spending.`,
    note: () => `Money, in their words: ${fact.value || ''}`,
  }[fact.kind];
  const content = said ? said() : null;
  if (!content || content.length < 12) return null;
  return {
    content,
    memoryType: 'fact',
    importance: FACT_IMPORTANCE[fact.kind] ?? 5,
    metadata: {
      source: 'money', domain: 'money', claim: 'said', fact_kind: fact.kind, fact_id: fact.id || null,
      subject: fact.subject || null, amount: Number.isFinite(amount) ? amount : null, day: fact.day || null,
    },
  };
}

/** A turn of the money conversation, as the twin's own memory of being asked. */
export function memoryForTurn({ role, text } = {}) {
  const words = String(text || '').trim();
  if (!words || words.length < 4) return null;
  return {
    content: role === 'twin' ? `Money, the twin answered: ${words}`.slice(0, 2000) : `Money, they asked: ${words}`.slice(0, 2000),
    memoryType: 'conversation',
    importance: role === 'twin' ? 4 : 6,
    metadata: { source: 'money', domain: 'money', role: role === 'twin' ? 'twin' : 'person' },
  };
}

/** One write, with the stream's own dedupe and no model call. */
async function write(userId, memory, label) {
  if (!memory) return false;
  try {
    const row = await addMemory(userId, memory.content, memory.memoryType, memory.metadata, {
      skipImportance: true,
      importanceScore: memory.importance,
    });
    return Boolean(row);
  } catch (error) {
    log.warn(`money memory failed (${label})`, { error: error.message });
    return false;
  }
}

/**
 * What the person said, in the twin's stream. Called with the whole list: the stream skips
 * a duplicate of the same sentence within a day, so a fact that has not changed writes
 * nothing, and one they edited is written as the new claim it is.
 */
export async function tellTwinFacts(userId, facts = []) {
  if (!userId || !facts.length) return { written: 0 };
  let written = 0;
  for (const fact of facts) {
    if (await write(userId, memoryForFact(fact), fact.kind)) written += 1;
  }
  return { written };
}

/** What it worked out on its own, in the twin's stream. */
export async function tellTwinPatterns(userId, patterns = []) {
  return tellTwin(userId, patterns);
}

/** One turn of the money conversation, in the twin's stream. */
export async function tellTwinTurn(userId, turn) {
  if (!userId) return { written: 0 };
  const written = await write(userId, memoryForTurn(turn), 'turn');
  return { written: written ? 1 : 0 };
}

/**
 * Write the findings the twin does not already hold. `addMemory` skips a duplicate of
 * the same content within a day, so a refresh that changes nothing writes nothing, and
 * a sentence whose numbers moved is written as the new fact it is.
 */
export async function tellTwin(userId, findings = []) {
  if (!userId || !findings.length) return { written: 0 };
  let written = 0;
  for (const finding of findings) {
    const memory = memoryFor(finding);
    if (!memory) continue;
    try {
      const row = await addMemory(userId, memory.content, memory.memoryType, memory.metadata, {
        skipImportance: true,
        importanceScore: memory.importance,
      });
      if (row) written += 1;
    } catch (error) {
      log.warn(`money memory failed (${finding.kind})`, { error: error.message });
    }
  }
  return { written };
}
