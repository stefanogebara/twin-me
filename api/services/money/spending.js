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

export const NOT_SPENDING = new Set(['flatmate', 'family', 'friend', 'partner']);
const PERSON_CHANNELS = new Set(['transfer', 'bizum']);

/** Who each transfer counterparty is, from what the person said. */
export function personRoles(facts = []) {
  return new Map(
    (facts || [])
      .filter((f) => f && f.kind === 'person' && f.value)
      .map((f) => [String(f.subject || '').toLowerCase(), String(f.value).toLowerCase()]),
  );
}

/** The predicate, bound to what the person said. */
export function spendingRule(facts = []) {
  const roles = personRoles(facts);
  return (t) => {
    if (!t || !PERSON_CHANNELS.has(t.channel)) return true;
    const role = roles.get(String(t.merchant_key || '').toLowerCase());
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
  return Number(t?.amount) < 0 && t?.counts !== false;
}
