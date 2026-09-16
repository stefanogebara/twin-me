/**
 * Income as dated events, with the confidence the ledger has earned for each.
 * ==========================================================================
 * The person says what comes in ("family, 400, around the 3rd") and until now that was
 * the whole story: a stated day, a stated amount, no memory of whether it happened. The
 * ledger has the arrivals. This reads them as series, one per sender, and turns each
 * stated income into an event with a date the series supports, an amount the series has
 * shown, and a confidence: how often it landed within a few days of its usual day. A
 * regular arrival nobody mentioned becomes an event too, marked as seen, not said, and a
 * stated income that has not come when it usually does becomes one reading, with the
 * arrivals that say so.
 *
 * Pure: facts and rows in, events and findings out.
 */

import { shortName } from './bizum.js';

export const INCOME_LATE = 'income_late';
/** An arrival within this many days of the usual day counts as on time. */
export const MATCH_DAYS = 3;
/** A sender needs this many arrivals before its rhythm is a rhythm. */
export const MIN_ARRIVALS = 2;
/** A sender nobody mentioned needs this many before it is said back. */
export const MIN_UNSAID_ARRIVALS = 3;
/** How far back the arrivals are read. */
export const LOOKBACK_DAYS = 120;
/** A stated income with no arrivals behind it is believed at this much. */
export const SAID_CONFIDENCE = 0.5;
export const HORIZON_DAYS = 45;

const DAY = 86400000;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
/* The same form the analyst uses on the screen: Intl's own, sign and no-break space kept. */
const euro = (n) => EUR.format(Math.abs(Number(n) || 0));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function median(xs) { const s = [...xs].sort((a, b) => a - b); if (!s.length) return 0; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const STOP = new Set(['the', 'my', 'a', 'from', 'de', 'del', 'la', 'el', 'mi', 'and', 'y']);
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
/** Kinds of income a person names that no sender's name will ever contain. */
const KIND_WORDS = { family: ['family', 'familia', 'parents', 'padres', 'mum', 'mom', 'dad', 'mama', 'papa', 'madre', 'padre'], grant: ['grant', 'beca', 'scholarship', 'erasmus'], salary: ['salary', 'job', 'work', 'nomina', 'sueldo', 'trabajo'] };

/**
 * The senders behind the money that came in, each with its rhythm.
 * @returns {{ key, name, times, typical_amount, typical_day, on_time, months, last_seen, arrivals }[]}
 */
export function incomeSeries(transactions = [], { isIncome = null, now = new Date(), days = LOOKBACK_DAYS } = {}) {
  const since = now.getTime() - days * DAY;
  const groups = new Map();
  for (const t of transactions || []) {
    if (!t || Number(t.amount) <= 0 || !t.occurred_at || new Date(t.occurred_at).getTime() < since) continue;
    if (isIncome && !isIncome(t)) continue;
    const key = t.merchant_key || norm(t.merchant_raw) || 'unknown';
    if (!groups.has(key)) groups.set(key, { key, name: t.merchant_raw || t.merchant_key || 'someone', arrivals: [] });
    groups.get(key).arrivals.push(t);
  }
  const out = [];
  for (const g of groups.values()) {
    g.arrivals.sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1));
    const daysOfMonth = g.arrivals.map((t) => new Date(t.occurred_at).getUTCDate());
    const typicalDay = Math.round(median(daysOfMonth));
    const onTime = g.arrivals.filter((t) => Math.abs(new Date(t.occurred_at).getUTCDate() - typicalDay) <= MATCH_DAYS).length;
    const months = new Set(g.arrivals.map((t) => String(t.occurred_at).slice(0, 7)));
    out.push({
      key: g.key,
      name: shortName(g.name),
      times: g.arrivals.length,
      typical_amount: r2(median(g.arrivals.map((t) => Number(t.amount)))),
      typical_day: typicalDay,
      on_time: g.arrivals.length ? r2(onTime / g.arrivals.length) : 0,
      months: months.size,
      last_seen: g.arrivals[g.arrivals.length - 1].occurred_at,
      arrivals: g.arrivals,
    });
  }
  return out.sort((a, b) => b.times * b.typical_amount - a.times * a.typical_amount);
}

/** Whether a series is the thing a stated income describes: by name, or by amount. */
function matches(fact, series) {
  const said = `${fact.subject || ''} ${fact.subject_label || ''} ${fact.value || ''}`;
  const saidWords = words(said);
  const nameWords = new Set(words(series.name).concat(words(series.key)));
  if (saidWords.some((w) => nameWords.has(w))) return true;
  const amount = Math.abs(Number(fact.amount) || 0);
  return amount > 0 && Math.abs(series.typical_amount - amount) <= Math.max(5, amount * 0.15);
}

/** The next day-of-month occurrence on or after `now`, as an ISO day. */
function nextDue(dayOfMonth, now) {
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  const clamp = (yy, mm) => new Date(Date.UTC(yy, mm, Math.min(Math.max(dayOfMonth, 1), new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate())));
  const thisMonth = clamp(y, m);
  return dayOf(thisMonth.getTime() >= new Date(`${dayOf(now)}T00:00:00Z`).getTime() ? thisMonth : clamp(y, m + 1));
}

/** The person's word for a stated income, from what they typed. */
function labelOf(fact) {
  return fact.subject_label || fact.subject || fact.value || 'Comes in';
}

/**
 * What is coming in, as dated events: every stated income with the date and amount the
 * ledger supports, and every regular sender nobody mentioned. Confidence is the share of
 * arrivals that landed within a few days of the usual day, scaled by how many there are.
 * @returns {{ source, amount, due_on, day, confidence, basis, times, last_arrived_on, said }[]}
 */
export function incomeEvents({ facts = [], transactions = [], isIncome = null, now = new Date(), horizonDays = HORIZON_DAYS } = {}) {
  const series = incomeSeries(transactions, { isIncome, now });
  const claimed = new Set();
  const out = [];
  for (const f of (facts || []).filter((x) => x && x.kind === 'income')) {
    const s = series.find((x) => !claimed.has(x.key) && matches(f, x)) || null;
    if (s && s.times >= MIN_ARRIVALS) {
      claimed.add(s.key);
      const support = Math.min(s.times / 3, 1);
      out.push({
        source: labelOf(f), amount: s.typical_amount, due_on: nextDue(s.typical_day, now), day: s.typical_day,
        confidence: r2(Math.max(SAID_CONFIDENCE, s.on_time * support)),
        basis: `seen ${s.times} times, usually the ${ordinal(s.typical_day)}`, times: s.times, last_arrived_on: dayOf(s.last_seen), said: true, key: s.key,
      });
    } else {
      if (s) claimed.add(s.key);
      const amount = Math.abs(Number(f.amount) || 0);
      const day = Number(f.day) || 1;
      if (!amount) continue;
      out.push({ source: labelOf(f), amount: r2(amount), due_on: nextDue(day, now), day, confidence: SAID_CONFIDENCE, basis: 'said', times: s ? s.times : 0, last_arrived_on: s ? dayOf(s.last_seen) : null, said: true, key: s ? s.key : null });
    }
  }
  for (const s of series) {
    if (claimed.has(s.key) || s.times < MIN_UNSAID_ARRIVALS || s.months < MIN_UNSAID_ARRIVALS) continue;
    out.push({
      source: s.name, amount: s.typical_amount, due_on: nextDue(s.typical_day, now), day: s.typical_day,
      confidence: r2(s.on_time * Math.min(s.times / 3, 1)), basis: `seen ${s.times} times, not said`, times: s.times, last_arrived_on: dayOf(s.last_seen), said: false, key: s.key,
    });
  }
  const horizon = dayOf(now.getTime() + horizonDays * DAY);
  return out.filter((e) => e.due_on <= horizon).sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
}

/**
 * A stated income that usually comes by now and has not: said once, with the last
 * arrivals as receipts. Quiet until the usual day plus the margin has passed.
 */
export function incomeFindings({ facts = [], transactions = [], isIncome = null, now = new Date() } = {}) {
  const month = dayOf(now).slice(0, 7);
  const today = now.getUTCDate();
  const series = incomeSeries(transactions, { isIncome, now });
  const out = [];
  for (const f of (facts || []).filter((x) => x && x.kind === 'income')) {
    const s = series.find((x) => matches(f, x));
    if (!s || s.times < MIN_ARRIVALS || s.on_time < 0.5) continue;
    if (s.arrivals.some((t) => String(t.occurred_at).startsWith(month))) continue;
    if (today <= s.typical_day + MATCH_DAYS) continue;
    const last = s.arrivals.slice(-3).reverse();
    out.push({
      kind: INCOME_LATE,
      month: `${month}-01`,
      sentence: `${labelOf(f)}, usually about ${euro(s.typical_amount)} on the ${ordinal(s.typical_day)}, has not come this month.`,
      detail: `The last ${last.length === 1 ? 'one' : last.length} came on the ${last.map((t) => ordinal(new Date(t.occurred_at).getUTCDate())).join(', ')}.`,
      numbers: { source: labelOf(f), source_is_default: labelOf(f) === 'Comes in', typical_amount: s.typical_amount, typical_day: s.typical_day, times: s.times, days_late: today - s.typical_day },
      receipts: last,
      evidence_count: s.times,
    });
  }
  return out;
}
