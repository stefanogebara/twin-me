/**
 * What counts as spending.
 * ========================
 * One rule, asked by everyone who adds up the month: the forecast, the categories, the
 * month segments, the readings, the chat and the twin's context. It lived inside the
 * forecast alone for a day, and that day the hero said 372,95 EUR while the reading two
 * inches under it said 422,20 EUR for the same September. Same euros, two answers, which
 * is the one thing this product cannot afford.
 *
 * The rule itself: money handed to a flatmate, a parent, a friend or a partner moved
 * between people; it is not a purchase, and a friend paid back is the same. A landlord
 * or an employer is a real cost and stays. Everything that is not a transfer is spending.
 * Pure, so the tests hand it rows.
 */
import { ours } from './currency.js';

export const NOT_SPENDING = new Set(['flatmate', 'family', 'friend', 'partner']);
const PERSON_CHANNELS = new Set(['transfer', 'bizum']);

/** Who each transfer counterparty is, from what the person said. */
export function personRoles(facts = []) {
  const roles = new Map(
    (facts || [])
      .filter((f) => f && f.kind === 'person' && f.value)
      .map((f) => [String(f.subject || '').toLowerCase(), String(f.value).toLowerCase()]),
  );
  /* The person the rent goes to is the landlord as far as the money is concerned, whoever
     else they are: a flatmate who collects the rent is not paid back, they are paid. The
     rent question's "rent" answer says so (idea 4, 2026-09-21). */
  for (const f of facts || []) {
    if (f && f.kind === 'commitment' && String(f.value || '').toLowerCase() === 'rent' && f.subject) roles.set(String(f.subject).toLowerCase(), 'landlord');
  }
  return roles;
}

/**
 * The role of a counterparty, by the name the bank wrote. A Bizum arrives as "Mauad G." while
 * the person was named "Mauad Gebara Christian" (2026-09-23): the short form is the same
 * person when every word of it is the start of the matching word of the long one, in order,
 * the first word whole. Exact keys win; a one-letter first word never matches.
 */
export function roleOf(roles, merchantKey) {
  const key = String(merchantKey || '').toLowerCase().trim();
  if (!key) return null;
  if (roles.has(key)) return roles.get(key);
  const short = key.split(/\s+/);
  if (short[0].length < 3) return null;
  for (const [name, role] of roles) {
    const long = name.split(/\s+/);
    if (short.length > long.length || short[0] !== long[0]) continue;
    if (short.every((w, i) => long[i].startsWith(w.replace(/\.$/, '')))) return role;
  }
  return null;
}

/** The predicate, bound to what the person said. */
export function spendingRule(facts = []) {
  const roles = personRoles(facts);
  return (t) => {
    if (t?.verdict === 'not_me') return false;
    if (!ours(t?.currency)) return false;
    if (!t || !PERSON_CHANNELS.has(t.channel)) return true;
    const role = roleOf(roles, t.merchant_key);
    return !(role && NOT_SPENDING.has(role));
  };
}

/**
 * The same rows, each told whether it counts. Consumers that walk rows many times read the
 * flag rather than re-deriving it, and a row nobody has judged (no facts at hand) counts.
 */
export function markCounted(transactions = [], facts = []) {
  const counts = spendingRule(facts);
  return (transactions || []).map((t) => ({ ...t, counts: counts(t) }));
}

/** An outflow that counts: the test every sum of "spent" must use. */
export function isOutflow(t) {
  return t?.verdict !== 'not_me' && ours(t?.currency) && Number(t?.amount) < 0 && t?.counts !== false;
}
