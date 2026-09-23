/**
 * The twin grades its own homework.
 * =================================
 * It says four kinds of thing about the future: where the month lands, when each recurring
 * charge comes back and for how much, what is safe to spend today, and what tomorrow will
 * cost (the day is the one figure scored often enough for the band to learn from; see
 * calibration.js). The charges were
 * already written down and scored (money_predictions, store.js, since the 8th). The two
 * figures were said and forgotten. Every figure is now written down with the day it is
 * about, and when that day has passed the actual is written beside it. That is the learning
 * signal: nothing can get better at reading a person without knowing when it was wrong.
 *
 * Pure functions decide what to record and how to score; the async functions only read and
 * write rows. One row per person, kind, target day and day of making, so three scheduled
 * reads a day leave one line, not three.
 *
 * Table: money_figure_scores (database/supabase/migrations/20260913_money_figure_scores.sql).
 * A database without it makes the write and the score no-ops, logged once.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { spendingRule } from './spending.js';
import { forecast, months, scorePredictions as scoreCharges } from './forecastService.js';
import { listTransactions } from './transactionRepository.js';
import { listFacts } from './factsRepository.js';
import { safeToSpend } from './allowance.js';
import { TWIN_PREDICTION_CONFIDENCE } from './brain.js';
import { dayForecast, calibrate, carriedWiden } from './calibration.js';
import { dayIn } from './zone.js';
import { currentFigureScores } from './figureScoreStore.js';
import { ledgerCurrency, money } from './currency.js';

const log = createLogger('MoneyPredictions');
/** A charge counts as on the day if it lands within this many days of when it was expected. */
export const ON_DAY_DAYS = 1;

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const day = (d) => dayIn(d);
const endOfMonth = (iso) => {
  const d = new Date(iso);
  return day(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};
const daysBetween = (a, b) => Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000);
const isAmount = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/* ------------------------------------------------------------------ what to record */

/**
 * The figures worth keeping from one reading of the month.
 * @param {object} p
 * @param {object|null} p.cast        forecast(): month, projected_p10/p50/p90
 * @param {object|null} p.allowance   safeToSpend(): amount for today
 * @param {object|null} p.day         dayForecast(): tomorrow's discretionary spending with its band
 * @param {Date} p.now
 */
export function predictionsFrom({ cast = null, allowance = null, day: dayCast = null, now = new Date() } = {}) {
  const madeOn = day(now);
  const rows = [];
  if (cast && isAmount(cast.projected_p50)) {
    rows.push({
      kind: 'month_total', predicted_for: endOfMonth(cast.month || now), predicted_on: madeOn,
      value: r2(cast.projected_p50), low: r2(cast.projected_p10 ?? cast.projected_p50), high: r2(cast.projected_p90 ?? cast.projected_p50),
    });
  }
  if (allowance && isAmount(allowance.amount)) {
    rows.push({ kind: 'safe_today', predicted_for: madeOn, predicted_on: madeOn, value: r2(allowance.amount), low: null, high: null });
  }
  if (dayCast && isAmount(dayCast.value) && dayCast.predicted_for > madeOn) {
    rows.push({ kind: 'day_total', predicted_for: dayCast.predicted_for, predicted_on: madeOn, value: r2(dayCast.value), low: r2(dayCast.low ?? dayCast.value), high: r2(dayCast.high ?? dayCast.value) });
  }
  return rows;
}

/* ------------------------------------------------------------------ how to score */

/**
 * The actual behind one figure whose day has passed, from the ledger itself.
 * Returns null when it cannot be scored yet (the month is still running), or for a kind
 * this module does not score.
 * @param {object} prediction   a money_figure_scores row
 * @param {object[]} transactions  ledger rows; the spending rule is applied here
 * @param {(t: object) => boolean} counts  the spending rule
 * @param {Date} now
 */
export { scoreOne } from './figureScoring.js';

/**
 * What the scored rows say, in numbers a sentence can carry.
 * @param {object[]} figures   money_figure_scores rows (month_total, safe_today)
 * @param {object[]} charges   money_predictions rows the store has scored: expected_on,
 *                             typical_amount, happened, happened_on, happened_amount
 */
export function summarise(figures = [], charges = []) {
  /* Only the charges the twin would have said count against it. A guess it kept to itself,
     below the confidence it speaks at, is scored for learning and not held as a miss. */
  const scoredCharges = (charges || []).filter((p) => p.happened !== null && p.happened !== undefined
    && (p.confidence === undefined || p.confidence === null || Number(p.confidence) >= TWIN_PREDICTION_CONFIDENCE));
  const arrived = scoredCharges.filter((p) => p.happened === true);
  const onDay = arrived.filter((p) => p.happened_on && Math.abs(daysBetween(p.happened_on, p.expected_on)) <= ON_DAY_DAYS);
  const onAmount = arrived.filter((p) => isAmount(p.happened_amount) && Math.abs(Number(p.happened_amount) - Number(p.typical_amount)) <= Math.max(1, Number(p.typical_amount) * 0.1));
  const scored = (figures || []).filter((p) => p.scored_at);
  const monthsScored = scored.filter((p) => p.kind === 'month_total').sort((a, b) => (a.predicted_for < b.predicted_for ? 1 : -1));
  const days = scored.filter((p) => p.kind === 'safe_today');
  const band = calibrate(scored.filter((p) => p.kind === 'day_total'));
  const carried = band.days === 0 ? carriedWiden(figures) : null;
  if (carried) { band.widen = carried.widen; band.carried_from = carried.from; }
  const m = monthsScored[0];
  return {
    charges: { expected: scoredCharges.length, arrived: arrived.length, on_day: onDay.length, on_amount: onAmount.length },
    last_month: m ? { month: m.predicted_for.slice(0, 7), said: Number(m.value), actual: Number(m.actual), low: Number(m.low), high: Number(m.high), within_band: Boolean(m.hit) } : null,
    days: { counted: days.length, kept: days.filter((p) => p.hit).length },
    band: { days: band.days, coverage: band.coverage, widen: band.widen, trusted: band.trusted, carried_from: band.carried_from || null },
  };
}

/* ------------------------------------------------------------------ saying it out loud */

export const OWN_SCORE = 'own_score';
/* The same form the analyst uses on the screen: Intl's own, sign and no-break space kept. */
const euro = (n) => money(Math.abs(Number(n) || 0));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * What the twin got wrong, in its own numbers: the last month it forecast against what
 * happened, the charges it expected against the ones that came, the range against the
 * days. Every product in the market hides this record; this one keeps it and says it.
 * Null until there is something scored worth a sentence: a finished month, or at least
 * five charges the person would have heard about. Pure.
 * @param {object|null} summary  from summarise()
 */
export function ownScoreFinding(summary) {
  if (!summary) return null;
  const m = summary.last_month;
  const c = summary.charges || { expected: 0, arrived: 0, on_day: 0 };
  const band = summary.band || { days: 0, coverage: null };
  if (!m && c.expected < 5) return null;
  const parts = [];
  let sentence;
  if (m) {
    const diff = r2(m.actual - m.said);
    const monthName = MONTHS[Number(m.month.slice(5, 7)) - 1];
    sentence = `In ${monthName} it said ${euro(m.said)}; it was ${euro(m.actual)}, ${euro(Math.abs(diff))} ${diff >= 0 ? 'over' : 'under'}, ${m.within_band ? 'inside' : 'outside'} the range it gave.`;
  } else {
    sentence = `Of ${c.expected} charges it expected, ${c.arrived} came${c.on_day ? `, ${c.on_day} on the day` : ''}.`;
  }
  if (m && c.expected) parts.push(`Of ${c.expected} charges it expected, ${c.arrived} came${c.on_day ? `, ${c.on_day} on the day` : ''}.`);
  if (band.days >= 14 && band.coverage !== null) parts.push(`The day range held on ${Math.round(band.coverage * band.days)} of ${band.days} days.`);
  return {
    kind: OWN_SCORE,
    month: m ? `${m.month}-01` : null,
    sentence,
    detail: parts.join(' ') || null,
    numbers: { last_month: m, charges: c, band },
    receipts: [],
    evidence_count: (m ? 1 : 0) + c.expected + band.days,
  };
}

/* ------------------------------------------------------------------ rows */

/* A table that is not there yet is a deployment state, not an error to raise on every call:
   the first one is logged and the rest go quiet. Two things this must not do, and used to:
   latch on any error whose text merely names the table (a timeout carrying the table name in
   its message disabled scoring for the life of the instance), and stay latched forever after
   a migration lands. The test is the postgres code, and the quiet lasts an hour (2026-09-16). */
const MISSING_QUIET_MS = 60 * 60 * 1000;
let missingUntil = 0;
const tableGone = (now = Date.now()) => missingUntil > now;
const missing = (error) => {
  const text = String(error?.message || '');
  const code = String(error?.code || '');
  if (!error || !(code === '42P01' || /42P01/.test(text) || /schema cache/i.test(text) || /relation .*money_figure_scores.* does not exist/i.test(text))) return false;
  if (!tableGone()) log.warn('money_figure_scores is not there yet; the month and the day are not scored');
  missingUntil = Date.now() + MISSING_QUIET_MS;
  return true;
};

/** Write today's figures for one person. Idempotent per day. */
export async function recordPredictions(userId, { cast, allowance, day = null, now = new Date() }) {
  if (tableGone()) return { recorded: 0 };
  const rows = predictionsFrom({ cast, allowance, day, now });
  if (!rows.length) return { recorded: 0 };
  const widen = cast?.band_calibration?.widen || 0;
  const recorded = rows.map((r) => ({
    user_id: userId, ...r, predicted_at: now.toISOString(),
    ...(r.kind === 'day_total' ? {
      issued_low: Math.max(0, r.low - widen), issued_high: r.high + widen,
    } : {}),
  }));
  const { error } = await supabaseAdmin
    .from('money_figure_scores')
    .upsert(recorded, { onConflict: 'user_id,kind,predicted_for,predicted_on', ignoreDuplicates: true });
  if (error) { if (missing(error)) return { recorded: 0 }; throw new Error(`figure scores upsert failed: ${error.message}`); }
  return { recorded: rows.length };
}

/** Reconcile mature outcomes, including ones scored before their evidence changed. */
export async function scoreFigures(userId, { now = new Date() } = {}) {
  const result = await currentFigureScores(userId, { now });
  return { scored: result.changed };
}

/** The scored record, summarised, for a sentence on the page. Null until something is scored. */
export async function accuracy(userId) {
  const { data: charges } = await supabaseAdmin
    .from('money_predictions')
    .select('expected_on, typical_amount, confidence, happened, happened_on, happened_amount')
    .eq('user_id', userId).not('happened', 'is', null)
    .order('expected_on', { ascending: false }).limit(200);
  const { figures } = await currentFigureScores(userId);
  if (!(charges || []).length && !figures.length) return null;
  return summarise(figures, charges || []);
}

/**
 * One person, once a run: score the charges the store predicted, write today's figures,
 * reconcile mature outcomes. Called after the scheduled read whether or not it brought rows,
 * because a day passing is itself news.
 */
export async function learnFromLedger(userId, now = new Date()) {
  const charges = await scoreCharges(userId, now).catch((e) => { log.warn('charge scoring failed', { error: e.message }); return { scored: 0, hit: 0 }; });
  if (tableGone()) return { recorded: 0, scored: 0, charges };
  const [cast, transactions, facts, segments] = await Promise.all([
    forecast(userId, now),
    listTransactions(userId, { currency: ledgerCurrency(), limit: 5000 }),
    listFacts(userId),
    months(userId, now),
  ]);
  const allowance = cast ? safeToSpend({ cast, segments, facts, now }) : null;
  const tomorrow = new Date(now.getTime() + 86400000);
  const dayCast = dayForecast(transactions, tomorrow, { isSpending: spendingRule(facts) });
  const recorded = await recordPredictions(userId, { cast, allowance, day: dayCast, now });
  const scored = await scoreFigures(userId, { now });
  return { recorded: recorded.recorded, scored: scored.scored, charges };
}
