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
import { MATCH_WINDOW_MS } from './ledger.js';

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
 * The role of a counterparty, by the name the bank wrote. A Bizum arrives as "Ruiz M." while
 * the person was named "Ruiz Martin Carlos" (2026-09-23): the short form is the same
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

/* ------------------------------------------------------------------ money in, money out
   Spending is one reading of the ledger; the money that came in is the other side of it, and
   until 2026-09-26 it appeared only in passing (the owner: "we need to account for the money
   that comes in into the account, not all money is only spent"). The two rules below read a
   month from both sides; inflow.js adds them up. */

/**
 * Whether two counterparty keys name the same person: the same key, or the bank's short form
 * of the long one, each word of the shorter the start of the matching word of the longer, in
 * order, the first word whole and at least three letters long (roleOf's rule, both ways).
 */
function sameName(a, b) {
  const x = String(a || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const y = String(b || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short[0].length < 3 || short[0] !== long[0]) return false;
  return short.every((w, i) => long[i].startsWith(w.replace(/\.$/, '')));
}

/**
 * The moves between the person's own accounts the ledger can tell apart: money that left one
 * of their accounts by transfer and reached another of their accounts by transfer, the same
 * amount to the cent, within the window a bank books one payment in (ledger.js), under the
 * same name on both legs (the bank prints the holder's own name on each). Returns the ids of
 * both legs, each leg paired once, the nearest first. A top-up paid by card, or a leg the phone
 * saw without an account, cannot be told from a purchase or a gift and stays what it looks
 * like: it then counts on both sides, and what came in minus what went out is still true.
 */
export function ownTransferIds(transactions = []) {
  const at = (t) => new Date(t.occurred_at).getTime();
  const cents = (t) => Math.round(Math.abs(Number(t.amount)) * 100);
  const legs = (transactions || []).filter((t) => t && t.id && t.account_id && t.channel === 'transfer'
    && t.verdict !== 'not_me' && ours(t.currency) && Number(t.amount) && Number.isFinite(at(t)));
  const arriving = legs.filter((t) => Number(t.amount) > 0);
  const paired = new Set();
  for (const left of legs.filter((t) => Number(t.amount) < 0).sort((a, b) => at(a) - at(b))) {
    let best = null;
    for (const came of arriving) {
      if (paired.has(came.id) || came.account_id === left.account_id || cents(came) !== cents(left)) continue;
      const gap = Math.abs(at(came) - at(left));
      if (gap > MATCH_WINDOW_MS || !sameName(came.merchant_key, left.merchant_key)) continue;
      if (!best || gap < best.gap) best = { id: came.id, gap };
    }
    if (best) { paired.add(left.id); paired.add(best.id); }
  }
  return paired;
}

/** The same rows, each leg of a move between the person's own accounts marked own_transfer. */
export function markOwnTransfers(transactions = []) {
  const own = ownTransferIds(transactions);
  return (transactions || []).map((t) => (t && own.has(t.id) ? { ...t, own_transfer: true } : t));
}

/**
 * Money in that counts: the test every sum of "came in" must use. A row is money in when it
 * arrived (above zero), in the ledger's own currency, and is the person's: not marked not_me,
 * and not one leg of a move between their own accounts where the ledger can tell (rows marked
 * by markOwnTransfers; a row nobody marked counts, as with `counts` above).
 *
 * Refunds: a shop's refund is money in, counted here, once. It is never netted out of that
 * shop's spending, because no sum of spent in the ledger ever has been (isOutflow reads only
 * what left), so the purchase stays spent and the refund comes in, and a month's money in
 * minus its money out carries both and cancels them there, exactly once.
 *
 * Money from people counts: a parent's transfer is most of a student's money in. The Bizums
 * back for a split the person confirmed count too, because they arrived. Income, which the
 * forecast and the readings speak of, sets them aside (income.js, incomeRule), because the
 * forecast counts that payment by the person's share; money in does not.
 */
export function isInflow(t) {
  return Boolean(t) && t.verdict !== 'not_me' && ours(t.currency) && Number(t.amount) > 0 && t.own_transfer !== true;
}

/**
 * Money out, read the way money in is: every euro that left the person's own money, spending
 * or not. A Bizum to a flatmate is not spending (isOutflow sets it aside) but it left, and a
 * month's money in minus money out that forgot it would be a figure the bank contradicts. A
 * move between their own accounts left nothing.
 */
export function isMoneyOut(t) {
  return Boolean(t) && t.verdict !== 'not_me' && ours(t.currency) && Number(t.amount) < 0 && t.own_transfer !== true;
}
