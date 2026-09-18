/**
 * Is the day's estimate better than saying "what you usually spend on a Thursday"?
 *
 * Nobody could answer that. The band prints its own miss rate on the home screen, which is
 * honest, but a miss rate says the band is wrong without saying whether anything simpler
 * would be right. This walks the ledger day by day, and for each day forecasts it using only
 * the payments that happened before it, then scores every method against what the day cost.
 *
 * Rolling origin, past only: for each day D the window ends at D-1, so nothing a method sees
 * was known after the forecast was made.
 *
 *   node --env-file=.env scripts/money/evaluate-day-forecast.mjs --user <uuid> [--days 60]
 *
 * One honest limitation, stated because it flatters the result: the ledger is read as it
 * stands today, so a payment the bank had not yet booked when the day was forecast is
 * nevertheless in its history here. Real forecasts see less. This measures the model, not
 * the pipeline around it.
 */
import { dayForecast, dayActual, intervalScore } from '../../api/services/money/calibration.js';
import { spendingRule } from '../../api/services/money/spending.js';
import { dayIn, weekdayIn } from '../../api/services/money/zone.js';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const DAYS = Number(arg('days', '60'));
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!USER || !URL || !KEY) { console.error('Need --user <uuid>, VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function all(path, page = 1000) {
  const rows = [];
  for (let at = 0; ; at += page) {
    const res = await fetch(`${URL}/rest/v1/${path}&limit=${page}&offset=${at}`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const got = await res.json();
    rows.push(...got);
    if (got.length < page) return rows;
  }
}

const [transactions, facts] = await Promise.all([
  all(`money_transactions?user_id=eq.${USER}&select=occurred_at,amount,currency,merchant_key,channel,verdict,is_recurring`),
  all(`money_facts?user_id=eq.${USER}&select=kind,subject,value`),
]);
const counts = spendingRule(facts);
const opts = { isSpending: counts };
const DAY = 86400000;

/** Every day that a payment could be forecast for, newest last. */
const days = [];
const last = new Date(`${dayIn(new Date())}T00:00:00Z`);
for (let i = DAYS; i >= 1; i -= 1) days.push(new Date(last.getTime() - i * DAY));

/** Only what had happened before the day being forecast. */
const before = (target) => transactions.filter((t) => Date.parse(t.occurred_at) < target.getTime());

/** The simplest thing a person would say: what the last four weeks cost, per day. */
function recentAverage(rows, target, windowDays = 28) {
  const from = target.getTime() - windowDays * DAY;
  const spent = rows.filter((t) => Date.parse(t.occurred_at) >= from && Number(t.amount) < 0 && counts(t))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  return spent / windowDays;
}

/** The same, but only this weekday: "a Thursday of yours". */
function weekdayAverage(rows, target, weeks = 12) {
  const from = target.getTime() - weeks * 7 * DAY;
  const wanted = weekdayIn(target);
  const perDay = new Map();
  for (const t of rows) {
    const at = Date.parse(t.occurred_at);
    if (at < from || at >= target.getTime()) continue;
    if (Number(t.amount) >= 0 || !counts(t)) continue;
    const key = dayIn(t.occurred_at);
    if (weekdayIn(new Date(`${key}T12:00:00Z`)) !== wanted) continue;
    perDay.set(key, (perDay.get(key) || 0) + Math.abs(Number(t.amount)));
  }
  /* Every one of that weekday in the window, including the ones that cost nothing. */
  let seen = 0;
  for (let at = target.getTime() - 7 * DAY; at >= from; at -= 7 * DAY) seen += 1;
  if (!seen) return null;
  return [...perDay.values()].reduce((a, b) => a + b, 0) / seen;
}

const methods = {
  'the model (weekday median)': (rows, target) => dayForecast(rows, target, opts)?.value ?? null,
  'what four weeks cost, per day': (rows, target) => recentAverage(rows, target),
  'this weekday, averaged': (rows, target) => weekdayAverage(rows, target),
  'nothing at all': () => 0,
};

const scored = Object.fromEntries(Object.keys(methods).map((k) => [k, []]));
const band = [];
for (const target of days) {
  const rows = before(target);
  const actual = dayActual(transactions, target, opts);
  const cast = dayForecast(rows, target, opts);
  if (!cast) continue;
  for (const [name, fn] of Object.entries(methods)) {
    const said = fn(rows, target);
    if (said === null || said === undefined) continue;
    scored[name].push({ said, actual, error: said - actual });
  }
  band.push({ day: dayIn(target), low: cast.low, high: cast.high, actual, held: actual >= cast.low && actual <= cast.high, score: intervalScore(cast.low, cast.high, actual) });
}

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} EUR`;
if (!band.length) { console.log('Not enough history to forecast a single day.'); process.exit(0); }

console.log(`${band.length} days forecast from what was known the day before.\n`);
console.log('method                            typical miss      leans        worst day');
for (const [name, rows] of Object.entries(scored)) {
  if (!rows.length) continue;
  const mae = rows.reduce((s, r) => s + Math.abs(r.error), 0) / rows.length;
  const bias = rows.reduce((s, r) => s + r.error, 0) / rows.length;
  const worst = rows.reduce((a, b) => (Math.abs(b.error) > Math.abs(a.error) ? b : a));
  console.log(`${name.padEnd(32)} ${euros(mae).padStart(12)}  ${(bias < 0 ? 'under by ' : 'over by  ') + euros(Math.abs(bias))}  ${euros(Math.abs(worst.error))}`);
}

const held = band.filter((b) => b.held).length;
const width = band.reduce((s, b) => s + (b.high - b.low), 0) / band.length;
/* The band the month is shown with is widened by what calibrate() has earned from its scored
   days (projection.js applies it to the month, not to a single day), so this is the raw band
   the model proposes, before any widening. */
console.log(`\nThe band the model proposes held on ${held} of ${band.length} days (${Math.round((held / band.length) * 100)}%), and it is meant to hold on 80%.`);
console.log(`It is ${euros(width)} wide on an average day, and its interval score is ${euros(band.reduce((s, b) => s + b.score, 0) / band.length)} (lower is better).`);

const spentDays = scored['nothing at all'].filter((r) => r.actual > 0).length;
console.log(`\n${spentDays} of ${band.length} days cost anything at all; the rest cost nothing.`);
const actuals = band.map((b) => b.actual).sort((a, b) => a - b);
console.log(`A day costs ${euros(actuals[Math.floor(actuals.length / 2)])} in the middle, ${euros(actuals[actuals.length - 1])} at its worst.`);
