/**
 * The band learns from its misses.
 * ================================
 * The month band was a bootstrap of the last twelve weeks of daily totals, and it never
 * saw whether it was right. This closes that loop at the only cadence that gives enough
 * samples to learn from: the day. Each day the system writes down what tomorrow's
 * discretionary spending will be, with a p10/p90 band from that weekday's history, and the
 * next day scores it. From the record of hits and misses it keeps one number per person,
 * a widening in euros, and applies it to every band it draws.
 *
 * The rule is conformal quantile tracking (Angelopoulos, Candes, Tibshirani 2023, arXiv
 * 2307.16895; Gibbs and Candes 2021, arXiv 2106.00170): after each scored day,
 *
 *   widen <- max(0, widen + eta * (miss - alpha))
 *
 * where miss is 1 if the day fell outside the widened band, alpha is the miscoverage the
 * band is meant to have (0.2 for p10..p90), and eta is a tenth of the largest residual seen
 * in the last sixty days, so the step is in this person's euros. A miss widens, a hit
 * narrows, and the long-run coverage tends to 1 - alpha whatever the spending does. The
 * guarantee is loose before about sixty scored days, and the accuracy summary says how many
 * days it rests on, so nobody reads a two-week coverage as a fact.
 *
 * Pure: rows in, numbers out. No Supabase, no clock except the `now` passed in.
 */

import { dailyTotals } from './projection.js';
import { dayIn, weekdayIn } from './zone.js';

/** The miscoverage a p10..p90 band is meant to have. */
export const ALPHA = 0.2;
/** The step is this share of the largest recent residual: small enough not to flap. */
export const ETA_SHARE = 0.1;
/** How far back the step size looks. */
export const ETA_WINDOW_DAYS = 60;
/** Below this many scored days the widening is applied but the coverage is not quoted. */
export const MIN_DAYS_TO_TRUST = 60;
/** Weeks of history a day's forecast rests on. */
export const HISTORY_WEEKS = 12;

const DAY = 86400000;
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const dayOf = (d) => dayIn(d);
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function median(xs) { const s = [...xs].sort((a, b) => a - b); return quantile(s, 0.5); }

/**
 * What one day's discretionary spending is expected to be, from that weekday's history.
 * The point is the weekday median, the band the weekday's p10 and p90; a weekday with no
 * history borrows every day's. Null before there is a fortnight to read.
 * @param {object[]} transactions  ledger rows { amount, occurred_at, is_recurring }
 * @param {Date|string} forDay     the day being forecast
 * @param {object} [opts]          { weeks = 12, isSpending }
 */
export function dayForecast(transactions, forDay, opts = {}) {
  const target = new Date(`${dayOf(forDay)}T00:00:00Z`);
  const weeks = opts.weeks ?? HISTORY_WEEKS;
  const rows = opts.isSpending ? (transactions || []).filter((t) => Number(t.amount) >= 0 || opts.isSpending(t)) : (transactions || []);
  const to = new Date(target.getTime() - DAY);
  const from = new Date(to.getTime() - (weeks * 7 - 1) * DAY);
  const history = dailyTotals(rows, from, to);
  /* Zero-filled days are not history. A fortnight of days that had a payment is the least. */
  const seen = new Set(rows.filter((t) => { const d = new Date(t.occurred_at); return d >= from && d <= new Date(to.getTime() + DAY - 1); }).map((t) => dayOf(t.occurred_at)));
  if (seen.size < 14) return null;
  const same = history.filter((d) => d.weekday === weekdayIn(target)).map((d) => d.total);
  const pool = (same.length >= 4 ? same : history.map((d) => d.total)).sort((a, b) => a - b);
  return {
    kind: 'day_total',
    predicted_for: dayOf(target),
    value: r2(median(pool)),
    low: r2(quantile(pool, ALPHA / 2)),
    high: r2(quantile(pool, 1 - ALPHA / 2)),
  };
}

/** What one day actually cost, on the same definition the forecast used. */
export function dayActual(transactions, day, opts = {}) {
  const d = new Date(`${dayOf(day)}T00:00:00Z`);
  const rows = opts.isSpending ? (transactions || []).filter((t) => Number(t.amount) >= 0 || opts.isSpending(t)) : (transactions || []);
  const [row] = dailyTotals(rows, d, d);
  return row ? row.total : 0;
}

/**
 * The interval score of Bracher et al. 2021: width plus a penalty, scaled by 2/alpha, for
 * every euro the actual lands outside. Proper, so a band cannot game it by being wide.
 */
export function intervalScore(low, high, actual, alpha = ALPHA) {
  const l = Number(low); const h = Number(high); const y = Number(actual);
  return r2((h - l) + (2 / alpha) * Math.max(0, l - y) + (2 / alpha) * Math.max(0, y - h));
}

/**
 * The widening a person's bands have earned, from their scored days in date order.
 * @param {object[]} scoredDays  money_figure_scores rows of kind day_total with actual set:
 *                               { predicted_for, value, low, high, actual }
 * @param {object} [opts]        { alpha = ALPHA, now }
 * @returns {{ widen: number, days: number, coverage: number|null, interval_score: number|null, trusted: boolean }}
 */
export function calibrate(scoredDays = [], opts = {}) {
  const alpha = opts.alpha ?? ALPHA;
  const rows = (scoredDays || [])
    .filter((r) => r && r.actual !== null && r.actual !== undefined && Number.isFinite(Number(r.value)))
    .sort((a, b) => (a.predicted_for < b.predicted_for ? -1 : 1));
  let widen = 0;
  let hits = 0;
  let scoreSum = 0;
  const residuals = [];
  const record = [];
  for (const r of rows) {
    const t = new Date(`${r.predicted_for}T00:00:00Z`).getTime();
    const low = Number(r.low ?? r.value) - widen;
    const high = Number(r.high ?? r.value) + widen;
    const y = Number(r.actual);
    const miss = y < low || y > high ? 1 : 0;
    // Training replays against corrected outcomes; displayed history keeps the band
    // actually issued. Older rows have no such snapshot and remain reconstructed.
    const issuedLow = Number(r.issued_low ?? low);
    const issuedHigh = Number(r.issued_high ?? high);
    const held = y >= issuedLow && y <= issuedHigh;
    if (held) hits += 1;
    /* The day as it was judged: the band it was given plus the widening it had earned by then. */
    record.push({ predicted_for: r.predicted_for, value: r2(Number(r.value)), low: r2(Math.max(0, issuedLow)), high: r2(issuedHigh), actual: r2(y), hit: held });
    scoreSum += intervalScore(issuedLow, issuedHigh, y, alpha);
    residuals.push({ t, abs: Math.abs(y - Number(r.value)) });
    const recent = residuals.filter((x) => t - x.t <= ETA_WINDOW_DAYS * DAY).map((x) => x.abs);
    const eta = ETA_SHARE * Math.max(...recent, 0);
    widen = Math.max(0, widen + eta * (miss - alpha));
  }
  const days = rows.length;
  return {
    widen: r2(widen),
    days,
    coverage: days ? r2(hits / days) : null,
    interval_score: days ? r2(scoreSum / days) : null,
    trusted: days >= MIN_DAYS_TO_TRUST,
    record,
  };
}

/** How many days the strip shows, today included. */
export const STRIP_DAYS = 30;

/**
 * The last thirty days, one mark each: what the day cost on the forecast's own definition,
 * how many payments made it, and where the twin had said a range the night before, that
 * range and whether it held. The band's record is a number on the hero; this is the same
 * record laid out so a person can see which days broke it. Today is partial and says so.
 * @param {object[]} transactions  ledger rows
 * @param {object[]} record        calibrate().record, the scored days as they were judged
 * @param {object} [opts]          { now, isSpending, days = STRIP_DAYS }
 */
export function dayStrip(transactions, record = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const n = opts.days ?? STRIP_DAYS;
  const today = new Date(`${dayOf(now)}T00:00:00Z`);
  const from = new Date(today.getTime() - (n - 1) * DAY);
  const rows = opts.isSpending ? (transactions || []).filter((t) => Number(t.amount) >= 0 || opts.isSpending(t)) : (transactions || []);
  const counts = new Map();
  for (const t of rows) {
    if (Number(t.amount) >= 0 || t.is_recurring) continue;
    const k = dayOf(t.occurred_at);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const said = new Map((record || []).map((r) => [r.predicted_for, r]));
  const days = dailyTotals(rows, from, today).map((d) => {
    const s = said.get(d.date) || null;
    return {
      day: d.date,
      weekday: d.weekday,
      total: d.total,
      count: counts.get(d.date) || 0,
      today: d.date === dayOf(today),
      said: s ? { value: s.value, low: s.low, high: s.high } : null,
      hit: s ? s.hit : null,
    };
  });
  const finished = days.filter((d) => !d.today);
  const judged = finished.filter((d) => d.said);
  return {
    from: dayOf(from),
    to: dayOf(today),
    days,
    total: r2(finished.reduce((s, d) => s + d.total, 0)),
    days_with_spend: finished.filter((d) => d.total > 0).length,
    said_days: judged.length,
    held: judged.filter((d) => d.hit).length,
  };
}

/**
 * How much wider a band over `daysLeft` days gets from a per-day widening. The days'
 * errors are treated as independent, so the sum grows with the square root; the month
 * band is itself scored at month end, which is where that assumption gets checked.
 */
export function widenOver(widen, daysLeft) {
  return r2(Math.max(0, Number(widen) || 0) * Math.sqrt(Math.max(0, Number(daysLeft) || 0)));
}
