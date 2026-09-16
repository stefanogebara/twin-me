/**
 * Intention: what the person said they want, and the month read against it.
 * ==========================================================================
 * Until now the product read the month against the person's own past. That is a reader.
 * A planner needs one more thing, an intention, and it needs it as facts, not a screen:
 *
 *   keep   what they want to have left at the end of the month, one number
 *   cap    what a kind of place, or one place, should stay under this month
 *
 * Both are asked once (context.js), stored as facts, and read here. Nothing here guesses
 * an intention: with no fact there is no line, because a budget nobody set is a number
 * wearing a suit. With a fact, the month is measured against it every refresh, with the
 * rows that say so, and the day's allowance shrinks by what they want to keep.
 *
 * Pure: facts, rows and the forecast in, findings out.
 */

export const KEEP_KIND = 'keep';
export const CAP_KIND = 'cap';
export const INTENTION_KINDS = Object.freeze(['keep_month', 'cap_month']);

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
/* The same form the analyst uses on the screen: Intl's own, sign and no-break space kept. */
const euro = (n) => EUR.format(Math.abs(Number(n) || 0));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const abs = (t) => Math.abs(Number(t.amount) || 0);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const CATEGORY_WORDS = { 'eating out': 'Eating out', coffee: 'Coffee', groceries: 'Groceries', transport: 'Transport', taxi: 'Taxis', entertainment: 'Going out', clothing: 'Clothes', software: 'Software', travel: 'Travel', sport: 'Sport', health: 'Health' };
const ALIASES = { restaurants: 'eating out', restaurant: 'eating out', food: 'eating out', dinners: 'eating out', bars: 'eating out', drinks: 'eating out', 'going out': 'entertainment', nights: 'entertainment', nightlife: 'entertainment', supermarket: 'groceries', shopping: 'clothing', clothes: 'clothing', cabs: 'taxi', taxis: 'taxi', metro: 'transport', train: 'transport', gym: 'sport', subscriptions: 'software', apps: 'software' };

/** What they want left at the end of the month, or null. */
export function keepAmount(facts = []) {
  const f = (facts || []).find((x) => x && x.kind === KEEP_KIND && Number(x.amount) > 0);
  return f ? r2(f.amount) : null;
}

/** The caps they set: [{ subject, label, amount }], subject normalised to a category or a place. */
export function caps(facts = []) {
  return (facts || [])
    .filter((x) => x && x.kind === CAP_KIND && Number(x.amount) > 0 && x.subject)
    .map((x) => {
      const key = norm(x.subject);
      const category = ALIASES[key] || key;
      /* Their own words win; the product's word for the category is the fallback, and only
         that one is the product's to translate. */
      const own = x.subject_label || null;
      return { subject: category, label: own || CATEGORY_WORDS[category] || String(x.subject), label_is_category: !own && Boolean(CATEGORY_WORDS[category]), amount: r2(x.amount) };
    });
}

/** Whether a row belongs to a cap: its category, or its merchant key when the cap names a place. */
function underCap(t, cap, categoryOf) {
  const c = categoryOf ? categoryOf(t) : t.category;
  if (c && norm(c) === cap.subject) return true;
  const key = norm(t.merchant_key || t.merchant_raw || '');
  return Boolean(key) && (key === cap.subject || key.includes(cap.subject) || cap.subject.includes(key));
}

/* ------------------------------------------------------------------ the readings */

/**
 * Each cap against the month so far. Said every refresh while a cap exists, because a
 * person who set a line wants to see where they stand against it, not only when it breaks.
 */
export function capFindings({ facts = [], transactions = [], categoryOf = null, cast = null, now = new Date(), isSpending = null } = {}) {
  const month = (cast && cast.month ? String(cast.month) : now.toISOString()).slice(0, 7);
  const daysLeft = cast ? Number(cast.days_left) || 0 : 0;
  const out = [];
  for (const cap of caps(facts)) {
    const rows = (transactions || []).filter((t) => t && t.occurred_at && Number(t.amount) < 0 && String(t.occurred_at).startsWith(month) && (!isSpending || isSpending(t)) && underCap(t, cap, categoryOf));
    const spent = r2(rows.reduce((s, t) => s + abs(t), 0));
    const left = r2(cap.amount - spent);
    const over = left < 0;
    const perDay = daysLeft > 0 && !over ? r2(left / (daysLeft + 1)) : null;
    out.push({
      kind: 'cap_month',
      month: `${month}-01`,
      sentence: over
        ? `${cap.label}: ${euro(spent)}, past the ${euro(cap.amount)} you said by ${euro(-left)}.`
        : `${cap.label}: ${euro(spent)} of the ${euro(cap.amount)} you said, ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left.`,
      detail: over
        ? `${rows.length} ${rows.length === 1 ? 'payment' : 'payments'} this month.`
        : (perDay !== null ? `That leaves ${euro(left)}, ${euro(perDay)} a day.` : `That leaves ${euro(left)}.`),
      /* The label is either the person's own words or a category the product named; the page
         translates only the second, so the flag travels with it (2026-09-16). */
      numbers: { subject: cap.subject, label: cap.label, label_is_category: cap.label_is_category === true, cap: cap.amount, spent, left, over, count: rows.length, days_left: daysLeft },
      receipts: [...rows].sort((a, b) => abs(b) - abs(a)).slice(0, 3),
      evidence_count: rows.length,
    });
  }
  return out;
}

/**
 * What they want left against where the month is heading: the stated income less the
 * forecast's middle. Silent without a keep, or without an income to keep it from.
 */
export function keepFinding({ facts = [], cast = null, income = null } = {}) {
  const keep = keepAmount(facts);
  if (keep === null || !cast || income === null || !Number.isFinite(Number(cast.projected_p50))) return null;
  const ending = r2(Number(income) - Number(cast.projected_p50));
  const gap = r2(ending - keep);
  return {
    kind: 'keep_month',
    month: `${String(cast.month).slice(0, 7)}-01`,
    sentence: gap >= 0
      ? `You wanted ${euro(keep)} left; at this pace the month ends with ${euro(ending)}.`
      : `You wanted ${euro(keep)} left; at this pace the month ends with ${euro(Math.max(0, ending))}, ${euro(-gap)} short.`,
    detail: `From ${euro(income)} coming in and about ${euro(cast.projected_p50)} going out.`,
    numbers: { keep, income: r2(income), projected: r2(cast.projected_p50), ending, gap },
    receipts: [],
    evidence_count: 1,
  };
}

export function intentionFindings(input = {}) {
  const k = keepFinding(input);
  return [...(k ? [k] : []), ...capFindings(input)];
}
