/**
 * A second opinion on a merchant nothing else can place.
 * ======================================================
 * A places provider knows addresses. It does not know that "Lidl Mad Mercad" is a
 * supermarket, and when it comes back empty `enrichPlaces` writes the row anyway so the same
 * question is never asked twice — which is right, and leaves the merchant reading "not read
 * yet" for good. On a ledger that has been running a while that is a handful of lines; on a
 * person's first week it is most of the page, because the provider budget is one lookup an
 * hour and a two-year import arrives with seventy merchants at once.
 *
 * So: when the provider and the brand table both have nothing, ask a judge. TypeSafe's Jev
 * through the OpenRouter key the project already holds — a model that returns a typed choice
 * with a probability instead of prose.
 *
 * Measured on Stefano's ledger, 2026-09-22, against the 46 card merchants the provider had
 * already placed:
 *
 *   every answer      24 of 46 agree (52%)
 *   at 80% or more    16 of 17 agree (94%)
 *   at 100%            6 of 6 agree
 *
 * Hence ACCEPT_AT: below it the answer is dropped, and the merchant stays honestly unread.
 * Most of its confident disagreements were the provider being wrong ("La Fruteria" as eating
 * out, a fruit shop) or a taxonomy quibble (UBER as transport rather than taxi), so the floor
 * is what makes this safe rather than the accuracy of any single answer.
 *
 * It never overrules a category the provider found, the brand table knows, or the person
 * themselves set: it only fills a hole. Every row it writes carries `provider: 'jev'` and its
 * own probability, so any of it can be found and undone.
 */
import { createLogger } from '../logger.js';

const log = createLogger('money-judge');

export const JUDGE_MODEL = '~typesafe/jev-latest';
export const JUDGE_URL = 'https://openrouter.ai/api/alpha/decisions';
/** Below this the judge is treated as having no opinion. Measured; see the note above. */
export const ACCEPT_AT = 0.8;
export const JUDGE_TIMEOUT_MS = 8000;

/** The kinds of place the product knows (moneyAPI.CATEGORIES). One of these, or nothing. */
export const JUDGE_CATEGORIES = Object.freeze([
  'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy',
  'sport', 'education', 'clothing', 'home', 'rent', 'electronics', 'entertainment',
  'software', 'advertising', 'travel', 'lodging', 'cash', 'fees', 'bills', 'other',
]);
/* "other" is a shrug, not an answer: accepting it would fill the hole with nothing and stop
   the merchant ever being asked about again. */
export const JUDGE_NOT_AN_ANSWER = Object.freeze(['other']);

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * What the ledger knows about a merchant, as a question. Pure.
 * The name alone is often a truncated bank string ("Empresa Municip"); what it costs and how
 * often say more than the letters do.
 */
export function placeQuestion({ name, city = null, amounts = [] } = {}) {
  const said = String(name || '').trim();
  if (!said) return null;
  const mid = median(amounts.map((a) => Math.abs(Number(a) || 0)).filter((a) => a > 0));
  return {
    model: JUDGE_MODEL,
    state: {
      name_on_the_bank_line: said,
      city: city || null,
      country: 'ES',
      the_person: 'a university student in Spain',
      payments_seen: amounts.length || null,
      typical_amount_eur: mid === null ? null : r2(mid),
    },
    questions: {
      kind: {
        type: 'choice',
        instructions: 'A line on a Spanish bank statement, often truncated by the bank. What kind of place took this payment? Answer "other" only when the line genuinely says nothing.',
        criteria: Object.fromEntries(JUDGE_CATEGORIES.map((c) => [c, `a payment at a place of this kind: ${c}`])),
      },
    },
  };
}

/**
 * The category an answer earns, or null. Pure, and strict: an unknown category, a shrug, or
 * anything under the floor is no opinion at all.
 */
export function acceptedCategory(answer, { floor = ACCEPT_AT } = {}) {
  const choice = answer?.kind?.choice ?? answer?.choice ?? null;
  if (!choice || !JUDGE_CATEGORIES.includes(choice) || JUDGE_NOT_AN_ANSWER.includes(choice)) return null;
  const probabilities = answer?.kind?.probabilities ?? answer?.probabilities ?? {};
  const p = Number(probabilities[choice]);
  if (!Number.isFinite(p) || p < floor) return null;
  return { category: choice, confidence: r2(p) };
}

/**
 * Ask about one merchant. Returns { category, confidence } or null — never throws, because a
 * judge that cannot be reached must leave the merchant unread rather than break the run that
 * was enriching it.
 */
export async function judgePlace(merchant, { fetchImpl = fetch, apiKey = process.env.OPENROUTER_API_KEY, floor = ACCEPT_AT, timeoutMs = JUDGE_TIMEOUT_MS } = {}) {
  const body = placeQuestion(merchant);
  if (!body || !apiKey) return null;
  try {
    const response = await fetchImpl(JUDGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) { log.warn('judge refused', { status: response.status }); return null; }
    const json = await response.json();
    return acceptedCategory(json?.answers, { floor });
  } catch (error) {
    log.warn('judge unreachable', { error: error.message });
    return null;
  }
}
