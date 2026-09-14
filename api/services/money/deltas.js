/**
 * What changed: the person measured against their own past.
 * ==========================================================
 * "Renfe is always 1,70, eight times since June" is true and dull the third time it is
 * said. The sentence worth reading is the change: eating out cost 96 this week and
 * usually costs 40; no Cercanias in nine days when it is usually every three; Friday
 * cost 12 when the six before cost 40. Every one of those is a comparison of a recent
 * window against the same person's baseline, never against anyone else, and each one
 * carries the rows that make it so.
 *
 * Four kinds, all computed, none phrased by a model:
 *   delta_category  this week's spend in a kind of place against the median of the
 *                   previous four weeks
 *   delta_silence   a habitual merchant not seen for well over its usual gap
 *   delta_weekday   the latest occurrence of a weekday against the previous six
 *   delta_pace      this week's discretionary total against the previous four weeks
 *
 * The same three rules as analyst.js: minimum evidence (four weeks of baseline, at least
 * three of them with something in them), numbers never adjectives, silence when the
 * change is inside the noise. A change has to be both large in ratio and large in euros
 * before it is said, so a 3 EUR week never becomes "up 200 percent". At most three lines
 * a refresh, largest change first.
 *
 * Pure: rows and profiles in, findings out, no clock except the `now` passed in.
 */

export const DELTA_KINDS = Object.freeze(['delta_category', 'delta_silence', 'delta_weekday', 'delta_pace']);
/** Weeks of baseline behind a comparison, and how many of them must have something in them. */
export const BASELINE_WEEKS = 4;
export const MIN_BASELINE_WEEKS = 3;
/** A change is said when it is at least this many times the baseline, or at most its inverse. */
export const RATIO_UP = 1.5;
export const RATIO_DOWN = 0.5;
/** And when it moves at least this many euros, whatever the ratio. */
export const MIN_EUROS = 15;
/** A merchant is silent once this many of its usual gaps have passed, and at least this many days. */
export const SILENCE_GAPS = 2;
export const SILENCE_MIN_DAYS = 5;
/** Only merchants with this rhythm or tighter, seen this often, count as habits. */
export const HABIT_MAX_GAP_DAYS = 10;
export const HABIT_MIN_TIMES = 6;
/** Weekday comparisons need this many previous same weekdays. */
export const WEEKDAY_MIN_PREVIOUS = 4;
export const MAX_DELTAS = 3;

const DAY = 86400000;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const euro = (n) => EUR.format(Math.abs(Number(n) || 0)).replace(/[\u00a0\u202f]/g, ' ').replace('\u20ac', 'EUR');
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const at = (t) => new Date(t.occurred_at).getTime();
const abs = (t) => Math.abs(Number(t.amount) || 0);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CATEGORY_WORDS = { 'eating out': 'Eating out', coffee: 'Coffee', groceries: 'Groceries', transport: 'Transport', taxi: 'Taxis', entertainment: 'Going out', clothing: 'Clothes', health: 'Health', pharmacy: 'Pharmacy', sport: 'Sport', software: 'Software', travel: 'Travel', education: 'Education', home: 'Home', electronics: 'Electronics', fuel: 'Fuel', lodging: 'Lodging', cash: 'Cash', fees: 'Fees' };
const categoryWord = (c) => CATEGORY_WORDS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other');
const nameOf = (t) => t.merchant_name || t.merchant_raw || t.merchant_key || 'somewhere';
function median(xs) { const s = [...xs].sort((a, b) => a - b); if (!s.length) return 0; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Outgoing rows that count as spending, recurring charges left out: the discretionary day. */
function discretionary(transactions, isSpending) {
  return (transactions || []).filter((t) => t && t.occurred_at && Number(t.amount) < 0 && !t.is_recurring && (!isSpending || isSpending(t)));
}

/** The last seven days ending at `now`, and the four seven-day windows before them. */
export function windows(now) {
  const end = now.getTime();
  const out = [];
  for (let i = 0; i <= BASELINE_WEEKS; i += 1) out.push({ from: end - (i + 1) * 7 * DAY, to: end - i * 7 * DAY });
  return { current: out[0], baseline: out.slice(1) };
}

const inWindow = (t, w) => at(t) > w.from && at(t) <= w.to;
const sum = (rows) => r2(rows.reduce((s, t) => s + abs(t), 0));
const receipts = (rows) => [...rows].sort((a, b) => abs(b) - abs(a)).slice(0, 3);

/** Whether a change is worth a sentence: large in ratio and large in euros. */
export function notable(current, usual) {
  const diff = Math.abs(current - usual);
  if (diff < MIN_EUROS) return false;
  if (usual === 0) return current >= MIN_EUROS;
  const ratio = current / usual;
  return ratio >= RATIO_UP || ratio <= RATIO_DOWN;
}

/* ------------------------------------------------------------------ the four kinds */

export function categoryDeltas(transactions, { categoryOf, now, isSpending } = {}) {
  const rows = discretionary(transactions, isSpending);
  const { current, baseline } = windows(now);
  const byCat = new Map();
  for (const t of rows) {
    const c = categoryOf ? categoryOf(t) : t.category;
    if (!c) continue;
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(t);
  }
  const out = [];
  for (const [cat, list] of byCat) {
    const nowRows = list.filter((t) => inWindow(t, current));
    const weekly = baseline.map((w) => sum(list.filter((t) => inWindow(t, w))));
    const filled = weekly.filter((x) => x > 0).length;
    if (filled < MIN_BASELINE_WEEKS) continue;
    const usual = r2(median(weekly));
    const here = sum(nowRows);
    if (!notable(here, usual)) continue;
    const usualCount = r2(median(baseline.map((w) => list.filter((t) => inWindow(t, w)).length)));
    out.push({
      kind: 'delta_category',
      month: dayOf(current.from + DAY),
      sentence: `${categoryWord(cat)}: ${euro(here)} this week, usually ${euro(usual)}.`,
      detail: `${nowRows.length} ${nowRows.length === 1 ? 'payment' : 'payments'} in seven days; usually ${Math.round(usualCount)}.`,
      numbers: { category: cat, current: here, usual, ratio: usual ? r2(here / usual) : null, count: nowRows.length, usual_count: usualCount },
      receipts: receipts(nowRows),
      evidence_count: nowRows.length + weekly.reduce((s, x) => s + (x > 0 ? 1 : 0), 0),
      change: Math.abs(here - usual),
    });
  }
  return out;
}

export function silenceDeltas(profiles, { now } = {}) {
  const out = [];
  for (const p of profiles || []) {
    if (!p || !p.median_gap_days || p.median_gap_days > HABIT_MAX_GAP_DAYS || (p.times || 0) < HABIT_MIN_TIMES) continue;
    const since = (now.getTime() - new Date(p.last_seen).getTime()) / DAY;
    if (since < SILENCE_MIN_DAYS || since < SILENCE_GAPS * p.median_gap_days) continue;
    const days = Math.floor(since);
    const gap = Math.round(p.median_gap_days);
    out.push({
      kind: 'delta_silence',
      month: dayOf(new Date(p.last_seen).getTime()),
      sentence: `No ${p.name} in ${days} days; usually every ${gap === 1 ? 'day' : `${gap} days`}.`,
      detail: `${p.times} times since ${new Date(p.first_seen).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}, about ${euro(p.typical_amount)} each.`,
      numbers: { merchant_key: p.merchant_key, days_since: days, usual_gap_days: p.median_gap_days, times: p.times, typical_amount: p.typical_amount },
      receipts: [],
      evidence_count: p.times,
      change: (p.typical_amount || 0) * Math.max(1, days / Math.max(1, p.median_gap_days)),
    });
  }
  return out;
}

export function weekdayDelta(transactions, { now, isSpending } = {}) {
  const rows = discretionary(transactions, isSpending);
  /* The most recent finished day, its weekday, and the same weekday in the previous six weeks. */
  const yesterday = new Date(new Date(now.toISOString().slice(0, 10)).getTime() - DAY);
  const wd = yesterday.getUTCDay();
  const key = dayOf(yesterday.getTime());
  const todayRows = rows.filter((t) => dayOf(at(t)) === key);
  const previous = [];
  for (let i = 1; i <= 6; i += 1) {
    const d = dayOf(yesterday.getTime() - i * 7 * DAY);
    previous.push(sum(rows.filter((t) => dayOf(at(t)) === d)));
  }
  const filled = previous.filter((x) => x > 0).length;
  if (filled < WEEKDAY_MIN_PREVIOUS) return null;
  const usual = r2(median(previous));
  const here = sum(todayRows);
  if (!notable(here, usual)) return null;
  return {
    kind: 'delta_weekday',
    month: key,
    sentence: `${WEEKDAYS[wd]} cost ${euro(here)}; the six before, ${euro(usual)} in the middle.`,
    detail: todayRows.length ? `${todayRows.length} ${todayRows.length === 1 ? 'payment' : 'payments'}: ${receipts(todayRows).map((t) => nameOf(t)).join(', ')}.` : 'Nothing paid that day.',
    numbers: { weekday: wd, current: here, usual, previous },
    receipts: receipts(todayRows),
    evidence_count: todayRows.length + filled,
    change: Math.abs(here - usual),
  };
}

export function paceDelta(transactions, { now, isSpending } = {}) {
  const rows = discretionary(transactions, isSpending);
  const { current, baseline } = windows(now);
  const weekly = baseline.map((w) => sum(rows.filter((t) => inWindow(t, w))));
  if (weekly.filter((x) => x > 0).length < MIN_BASELINE_WEEKS) return null;
  const usual = r2(median(weekly));
  const nowRows = rows.filter((t) => inWindow(t, current));
  const here = sum(nowRows);
  if (!notable(here, usual)) return null;
  return {
    kind: 'delta_pace',
    month: dayOf(current.from + DAY),
    sentence: `${euro(here)} in the last seven days; a usual week of yours is ${euro(usual)}.`,
    detail: `${nowRows.length} payments, recurring charges left out.`,
    numbers: { current: here, usual, ratio: usual ? r2(here / usual) : null, weekly },
    receipts: receipts(nowRows),
    evidence_count: nowRows.length,
    change: Math.abs(here - usual),
  };
}

/** The lines worth saying, largest change first, three at most. */
export function deltaFindings({ transactions = [], profiles = [], categoryOf = null, isSpending = null, now = new Date() } = {}) {
  const all = [
    ...categoryDeltas(transactions, { categoryOf, now, isSpending }),
    ...silenceDeltas(profiles, { now }),
    weekdayDelta(transactions, { now, isSpending }),
    paceDelta(transactions, { now, isSpending }),
  ].filter(Boolean);
  return all.sort((a, b) => b.change - a.change).slice(0, MAX_DELTAS).map(({ change, ...f }) => f);
}
