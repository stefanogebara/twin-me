/**
 * Projection: this month, with a band.
 * ====================================
 *   projected = spent so far
 *             + recurring charges still due this month
 *             + the rest of the month's discretionary spending
 *             + calendar-expected spends
 *   band      = bootstrap of the last twelve weeks' daily discretionary totals
 *
 * The rest of the month is the median of three cheap readings of the same history, never
 * a weighted blend: the weekday medians summed over the days left, the last four weeks'
 * daily mean times the days left, and what the same calendar days cost last month. With
 * a few hundred rows, estimating weights adds more error than it removes (Wang, Hyndman,
 * Li and Kang 2022, the forecast combination puzzle); the median is robust to one of the
 * three being wrong. All three are returned so the reader can see them disagree.
 * Pure and deterministic (seeded RNG) so it can be tested and called on every
 * ledger write without cost. No LLM.
 */
import { dayIn, weekdayIn, partsIn, dayOfMonthIn } from './zone.js';

/** How far from the day they said a payment can be and still be that commitment. */
const PAID_NEAR_DAYS = 6;
const DAY = 86400000;

/** Small seeded RNG so bands are reproducible in tests. */
export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function dayKey(d) { return dayIn(d); }
function weekdayOf(d) { return weekdayIn(d); }
function median(xs) { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function quantile(sorted, q) { if (!sorted.length) return 0; const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }

/** Daily discretionary outflow (recurring excluded) for every day in [from, to], zero-filled. */
export function dailyTotals(transactions, from, to) {
  const totals = new Map();
  for (let t = new Date(from).getTime(); t <= new Date(to).getTime(); t += DAY) totals.set(dayKey(t), 0);
  for (const tx of transactions) {
    if (Number(tx.amount) >= 0 || tx.is_recurring) continue;
    const k = dayKey(tx.occurred_at);
    if (totals.has(k)) totals.set(k, totals.get(k) + Math.abs(Number(tx.amount)));
  }
  return [...totals.entries()].map(([date, total]) => ({ date, total: Math.round(total * 100) / 100, weekday: weekdayOf(date) }));
}

/**
 * @param {object} p
 * @param {object[]} p.transactions   ledger rows { amount, occurred_at, is_recurring, merchant_key }
 * @param {object[]} p.recurring      series { merchant_key, typical_amount, next_expected, cadence }
 * @param {object[]} [p.expected]     calendar-expected spends this month { date, amount, label }
 * @param {Date|string} p.now
 * @param {number} [p.historyWeeks=12]
 * @param {number} [p.samples=500]
 * @param {number} [p.seed=42]
 * @param {number} [p.widen=0]     euros per remaining day the band has earned from its scored
 *                                 misses (calibration.js); the month band widens by the square root
 */
/** Match both identity and amount before merging a stated bill with a detected series. */
function sameMerchant(a, b) {
  const key = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return Boolean(key(a) && key(a) === key(b));
}

function sameThing(series, commitment) {
  const a = Math.abs(Number(series.typical_amount) || 0);
  const b = Math.abs(Number(commitment.amount) || 0);
  if (!a || !b) return false;
  const sameAmount = Math.abs(a - b) <= Math.max(2, b * 0.15);
  return sameAmount && sameMerchant(series.merchant_key, commitment.subject);
}

export function projectMonth(p) {
  const now = new Date(p.now);
  /* The month and the day the person is in, not the one UTC is in. */
  const here = partsIn(now); const year = here.year; const month = here.month - 1;
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const today = new Date(Date.UTC(year, month, here.day));
  const daysLeft = Math.round((monthEnd.getTime() - today.getTime()) / DAY); // days after today

  /* What a payment actually cost this person, which is not always what left the account.
     A shop split with flatmates is theirs only in part, and money handed to a flatmate or
     a parent is a transfer between people rather than spending — counting either in full
     makes every total wrong in a way the person can see and the system cannot explain. */
  const shareOf = p.shareOf || (() => 1);
  const isSpending = p.isSpending || (() => true);
  /* A Bizum back for a shared dinner is a settlement, not income; the caller says which. */
  const isIncome = p.isIncome || (() => true);
  const mine = (t) => Math.abs(Number(t.amount)) * shareOf(t);

  const spentRows = p.transactions
    .filter((t) => Number(t.amount) < 0 && new Date(t.occurred_at) >= monthStart && new Date(t.occurred_at) <= now)
    .filter((t) => isSpending(t));
  const spent = spentRows.reduce((s, t) => s + mine(t), 0);

  // Recurring still due: next_expected inside the rest of this month and not already seen this month.
  const seenThisMonth = new Set(p.transactions.filter((t) => new Date(t.occurred_at) >= monthStart && t.is_recurring).map((t) => t.merchant_key));
  const committedItems = (p.recurring || []).filter((r) => {
    const d = new Date(r.next_expected);
    return d > today && d <= monthEnd && !seenThisMonth.has(r.merchant_key);
  });
  const committed = committedItems.reduce((s, r) => s + Number(r.typical_amount), 0);

  const expectedItems = (p.expected || []).filter((e) => new Date(e.date) > today && new Date(e.date) <= monthEnd);
  const expected = expectedItems.reduce((s, e) => s + Number(e.amount), 0);

  /* What the person said leaves every month whatever happens. A commitment the ledger has
     already detected as recurring is not counted twice; one it has never seen still belongs
     in the month, because a projection that waits to be surprised by rent is not a
     projection. `check_status` travels with it so the page can say which is which. */
  const commitmentItems = (p.commitments || [])
    .map((c) => {
      const day = Math.min(Math.max(Number(c.day) || 1, 1), monthEnd.getUTCDate());
      return { ...c, due: new Date(Date.UTC(year, month, day)) };
    })
    .filter((c) => c.due > today && c.due <= monthEnd)
    .filter((c) => !(p.recurring || []).some((r) => sameThing(r, c)))
    /* Already paid, so it is not still to come. On size alone this was too eager: a 590 EUR
       card payment cancelled 600 EUR of stated rent, and the month lost its largest charge
       (2026-09-16). A payment counts as that commitment when it is close to the amount and
       either near the day they said or paid the way these are paid, by transfer. */
    .filter((c) => !p.transactions.some((t) => {
      if (!(Number(t.amount) < 0)) return false;
      if (!sameMerchant(t.merchant_key, c.subject)) return false;
      const at = new Date(t.occurred_at);
      if (!(at >= monthStart) || at > now) return false;
      const like = Math.abs(Math.abs(Number(t.amount)) - Math.abs(Number(c.amount))) <= Math.max(2, Math.abs(Number(c.amount)) * 0.08);
      if (!like) return false;
      const near = Math.abs(at.getTime() - c.due.getTime()) <= PAID_NEAR_DAYS * 86400000;
      const byHand = t.channel === 'transfer' || t.channel === 'bizum';
      return near || byHand;
    }));
  const commitmentTotal = commitmentItems.reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0);

  /* The other side of the month. Without it every reading is a warning, which is both
     untrue and, for somebody living on transfers from home, unkind. */
  const incomeItems = (p.income || [])
    .map((i) => {
      const day = Math.min(Math.max(Number(i.day) || 1, 1), monthEnd.getUTCDate());
      return { ...i, due: new Date(Date.UTC(year, month, day)) };
    })
    .filter((i) => i.due > today && i.due <= monthEnd);
  const incomeAhead = incomeItems.reduce((s, i) => s + Math.abs(Number(i.amount) || 0), 0);
  const receivedSoFar = p.transactions
    .filter((t) => Number(t.amount) > 0 && isIncome(t) && new Date(t.occurred_at) >= monthStart && new Date(t.occurred_at) <= now)
    .reduce((s, t) => s + Number(t.amount), 0);

  // Baselines by weekday from the history window ending yesterday.
  const weeks = p.historyWeeks ?? 12;
  const histFrom = new Date(today.getTime() - weeks * 7 * DAY);
  const histTo = new Date(today.getTime() - DAY);
  const personalHistory = p.transactions.filter((t) => t.verdict !== 'not_me' && isSpending(t))
    .map((t) => ({ ...t, amount: Number(t.amount) * shareOf(t) }));
  const history = dailyTotals(personalHistory, histFrom, histTo);
  const byWeekday = Array.from({ length: 7 }, (_, w) => history.filter((d) => d.weekday === w).map((d) => d.total));
  const baseline = byWeekday.map((xs) => (xs.length ? median(xs) : median(history.map((d) => d.total))));

  let weekdayRest = 0;
  const remainingDays = [];
  for (let i = 1; i <= daysLeft; i += 1) { const d = new Date(today.getTime() + i * DAY); remainingDays.push(d); weekdayRest += baseline[d.getUTCDay()]; }

  /* Two more readings of the same history. The recent level: the last four weeks' daily
     mean, times the days left. The same days last month: what the calendar days still to
     come cost a month ago, zero-filled, only when that month is in the history. */
  const recent = history.slice(-28);
  const recentRest = recent.length ? (recent.reduce((s, d) => s + d.total, 0) / recent.length) * daysLeft : null;
  const lastMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(year, month, 0));
  let sameDaysRest = null;
  if (lastMonthStart >= histFrom && daysLeft > 0) {
    const lastMonth = dailyTotals(personalHistory, lastMonthStart, lastMonthEnd);
    const wanted = new Set(remainingDays.map((d) => d.getUTCDate()));
    sameDaysRest = lastMonth.filter((d) => wanted.has(Number(d.date.slice(8, 10)))).reduce((s, d) => s + d.total, 0);
  }
  const readings = [weekdayRest, recentRest, sameDaysRest].filter((x) => x !== null && Number.isFinite(x));
  const baselineRest = readings.length ? median(readings) : weekdayRest;

  // Bootstrap: resample each remaining weekday's history to get a band around the rest of the month.
  const rand = rng(p.seed ?? 42);
  const samples = p.samples ?? 500;
  const sums = [];
  for (let s = 0; s < samples; s += 1) {
    let sum = 0;
    for (const d of remainingDays) {
      const pool = byWeekday[d.getUTCDay()].length ? byWeekday[d.getUTCDay()] : history.map((x) => x.total);
      sum += pool.length ? pool[Math.floor(rand() * pool.length)] : 0;
    }
    sums.push(sum);
  }
  sums.sort((a, b) => a - b);
  /* The bootstrap is drawn from the weekday pools, so its middle is the weekday reading;
     the band keeps its shape and moves with the median of the three. */
  const shift = sums.length ? baselineRest - quantile(sums, 0.5) : 0;
  const fixed = spent + committed + expected + commitmentTotal;
  const r2 = (x) => Math.round(x * 100) / 100;
  const widen = Math.max(0, Number(p.widen) || 0) * Math.sqrt(daysLeft);
  return {
    month: monthStart.toISOString().slice(0, 10),
    as_of: now.toISOString(),
    days_left: daysLeft,
    spent: r2(spent),
    committed: r2(committed),
    committed_items: committedItems,
    expected: r2(expected),
    /* What a week of theirs looks like: the median spent on each weekday over the history
       window, Sunday first. The day's allowance shapes itself with it, so a Friday is not
       told it is worth the same as a Tuesday (2026-09-16). */
    weekday_baseline: baseline.map((x) => r2(x)),
    expected_items: expectedItems,
    commitments: r2(commitmentTotal),
    commitment_items: commitmentItems.map(({ due, ...c }) => ({ ...c, due_on: due.toISOString().slice(0, 10) })),
    received: r2(receivedSoFar),
    income_ahead: r2(incomeAhead),
    income_items: incomeItems.map(({ due, ...i }) => ({ ...i, due_on: due.toISOString().slice(0, 10) })),
    baseline_rest: r2(baselineRest),
    baseline_readings: { weekday: r2(weekdayRest), recent: recentRest === null ? null : r2(recentRest), same_days_last_month: sameDaysRest === null ? null : r2(sameDaysRest) },
    projected_p10: r2(Math.max(fixed, fixed + (sums.length ? quantile(sums, 0.1) + shift : baselineRest) - widen)),
    projected_p50: r2(fixed + (sums.length ? quantile(sums, 0.5) + shift : baselineRest)),
    projected_p90: r2(fixed + (sums.length ? quantile(sums, 0.9) + shift : baselineRest) + widen),
    band_widened_by: r2(widen),
    history_days: history.length,
  };
}

/** The same projection with one more purchase in it. */
export function scenario(p, purchase) {
  const base = projectMonth(p);
  const extra = Math.abs(Number(purchase.amount) || 0);
  const r2 = (x) => Math.round(x * 100) / 100;
  return { ...base, scenario: purchase, projected_p10: r2(base.projected_p10 + extra), projected_p50: r2(base.projected_p50 + extra), projected_p90: r2(base.projected_p90 + extra) };
}
