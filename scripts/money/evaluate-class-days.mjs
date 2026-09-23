/**
 * Does the diary make the day's figure better?
 *
 * The diary now keeps how many events each day held (calendar.js dayCounts), and the Plan
 * page says what a day with class costs against a day without. That is a description. This
 * asks the question that decides whether the forecast should use it: walking the ledger day
 * by day, past only, does conditioning the day's figure on "is there anything in the diary
 * today" beat the same figure without it?
 *
 *   node --env-file=.env scripts/money/evaluate-class-days.mjs --user <uuid> [--days 60]
 *
 * Reads the calendar live and writes nothing. The diary is legitimately known in advance -
 * unlike a payment, tomorrow's classes are on the screen today - so using the target day's
 * own event count is not leakage. Everything else is strictly what happened before the day.
 *
 * The same honest limitation as evaluate-day-forecast.mjs: the ledger is read as it stands
 * now, so a payment the bank booked late is in its own day's history here.
 */
import { dayForecast, dayActual } from '../../api/_app/services/money/calibration.js';
import { spendingRule } from '../../api/_app/services/money/spending.js';
import { dayIn } from '../../api/_app/services/money/zone.js';
import { eventsFor, dayCounts, coveredDays } from '../../api/_app/services/money/calendar.js';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const DAYS = Number(arg('days', '60'));
const MIN_EACH = Number(arg('min', '6'));
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

const DAY = 86400000;
const now = new Date();
const from = new Date(now.getTime() - (DAYS + 12 * 7) * DAY).toISOString();
const to = new Date(now.getTime() + 31 * DAY).toISOString();

const [transactions, facts, events] = await Promise.all([
  all(`money_transactions?user_id=eq.${USER}&select=occurred_at,amount,currency,merchant_key,channel,verdict,is_recurring`),
  all(`money_facts?user_id=eq.${USER}&select=kind,subject,value`),
  eventsFor(USER, from, to),
]);
const counts = spendingRule(facts);
const opts = { isSpending: counts };
/* One integer a day, zeros for the days the read covered and found empty. */
const diary = dayCounts(events, coveredDays(from, now.toISOString()));
const known = Object.keys(diary).length;
console.log(`${events.length} events read, ${known} days counted (${Object.keys(diary).sort()[0]} to ${Object.keys(diary).sort().pop()}).`);
if (!known) { console.log('No diary to test.'); process.exit(0); }

const days = [];
const last = new Date(`${dayIn(now)}T00:00:00Z`);
for (let i = DAYS; i >= 1; i -= 1) days.push(new Date(last.getTime() - i * DAY));
const before = (target) => transactions.filter((t) => Date.parse(t.occurred_at) < target.getTime());
const busy = (day) => (diary[day] === undefined ? null : diary[day] > 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Every day of the window as a total, zeros included, with what the diary held. */
function pool(rows, target, weeks = 12) {
  const start = target.getTime() - weeks * 7 * DAY;
  const perDay = new Map();
  for (let at = start; at < target.getTime(); at += DAY) perDay.set(dayIn(new Date(at)), 0);
  for (const t of rows) {
    const at = Date.parse(t.occurred_at);
    if (at < start || at >= target.getTime()) continue;
    if (Number(t.amount) >= 0 || !counts(t)) continue;
    const key = dayIn(t.occurred_at);
    if (perDay.has(key)) perDay.set(key, perDay.get(key) + Math.abs(Number(t.amount)));
  }
  return [...perDay.entries()].map(([day, spent]) => ({ day, spent, busy: busy(day) }));
}

const methods = {
  'the model, as it ships': (rows, target) => dayForecast(rows, target, opts)?.value ?? null,
  'twelve weeks, every day': (rows, target) => mean(pool(rows, target).map((d) => d.spent)),
  'twelve weeks, split by the diary': (rows, target) => {
    const kind = busy(dayIn(target));
    const p = pool(rows, target).filter((d) => d.busy !== null);
    if (kind === null) return mean(p.map((d) => d.spent));
    const mine = p.filter((d) => d.busy === kind);
    const other = p.filter((d) => d.busy !== kind);
    if (mine.length < MIN_EACH || other.length < MIN_EACH) return mean(p.map((d) => d.spent));
    return mean(mine.map((d) => d.spent));
  },
  'three weeks, every day': (rows, target) => mean(pool(rows, target, 3).map((d) => d.spent)),
  'three weeks, split by the diary': (rows, target) => {
    const kind = busy(dayIn(target));
    const p = pool(rows, target, 6).filter((d) => d.busy !== null);
    if (kind === null) return mean(p.map((d) => d.spent));
    const mine = p.filter((d) => d.busy === kind);
    const other = p.filter((d) => d.busy !== kind);
    if (mine.length < MIN_EACH || other.length < MIN_EACH) return mean(p.map((d) => d.spent));
    return mean(mine.map((d) => d.spent));
  },
};

const scored = Object.fromEntries(Object.keys(methods).map((k) => [k, []]));
const split = { busy: [], free: [] };
for (const target of days) {
  const rows = before(target);
  const actual = dayActual(transactions, target, opts);
  const kind = busy(dayIn(target));
  if (kind === true) split.busy.push(actual);
  if (kind === false) split.free.push(actual);
  for (const [name, fn] of Object.entries(methods)) {
    const said = fn(rows, target);
    if (said === null || said === undefined) continue;
    scored[name].push({ said, actual, error: said - actual, kind });
  }
}

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} EUR`;
const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
console.log(`\nOf the last ${DAYS} days, ${split.busy.length} had something in the diary and ${split.free.length} had nothing.`);
if (split.busy.length && split.free.length) {
  const zero = (xs) => `${xs.filter((x) => x <= 0).length} of ${xs.length} cost nothing`;
  const top = (xs) => euros(Math.max(...xs));
  console.log(`A day with something: ${euros(mean(split.busy))} on average, ${euros(med(split.busy))} in the middle, ${zero(split.busy)}, worst ${top(split.busy)}.`);
  console.log(`A day with nothing:   ${euros(mean(split.free))} on average, ${euros(med(split.free))} in the middle, ${zero(split.free)}, worst ${top(split.free)}.`);
}
console.log('\nmethod                                typical miss   leans');
for (const [name, rows] of Object.entries(scored)) {
  if (!rows.length) continue;
  const mae = rows.reduce((s, r) => s + Math.abs(r.error), 0) / rows.length;
  const bias = rows.reduce((s, r) => s + r.error, 0) / rows.length;
  console.log(`${name.padEnd(36)} ${euros(mae).padStart(12)}   ${(bias < 0 ? 'under by ' : 'over by  ') + euros(Math.abs(bias))}`);
}
process.exit(0);
