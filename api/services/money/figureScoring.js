/** Financial outcomes mature after the local day closes plus four elapsed days.
 * Late evidence can still revise them; maturity is not a claim of source coverage. */
import { MATCH_WINDOW_MS } from './ledger.js';
import { dayIn } from './zone.js';
import { dayActual } from './calibration.js';
export const SETTLEMENT_DELAY_MS = MATCH_WINDOW_MS;
const day = dayIn;
const r2 = n => Math.round(Number(n)*100)/100;
export function scoringCutoff(now = new Date()) {
  const dayAtHorizon = dayIn(new Date(now.getTime()-SETTLEMENT_DELAY_MS));
  return new Date(Date.parse(`${dayAtHorizon}T12:00:00Z`)-86400000).toISOString().slice(0,10);
}
export function scoreOne(prediction, transactions, counts, now = new Date()) {
  if (prediction.predicted_for > scoringCutoff(now)) return null;
  const out = (t) => Number(t.amount) < 0 && counts(t);
  if (prediction.kind === 'month_total') {
    const month = prediction.predicted_for.slice(0, 7);
    const actual = r2(transactions.filter((t) => out(t) && day(t.occurred_at).startsWith(month)).reduce((s, t) => s + Math.abs(Number(t.amount)), 0));
    return { actual, error: r2(actual - prediction.value), hit: actual >= prediction.low && actual <= prediction.high };
  }
  if (prediction.kind === 'safe_today') {
    const actual = r2(transactions.filter((t) => out(t) && day(t.occurred_at) === prediction.predicted_for).reduce((s, t) => s + Math.abs(Number(t.amount)), 0));
    return { actual, error: r2(actual - prediction.value), hit: actual <= prediction.value };
  }
  if (prediction.kind === 'day_total') {
    /* The same definition the forecast used: discretionary, recurring charges left out. */
    const actual = r2(dayActual(transactions, prediction.predicted_for, { isSpending: counts }));
    const low = Number(prediction.issued_low ?? prediction.low ?? prediction.value); const high = Number(prediction.issued_high ?? prediction.high ?? prediction.value);
    return { actual, error: r2(actual - prediction.value), hit: actual >= low && actual <= high };
  }
  return null;
}

