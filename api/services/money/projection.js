/**
 * Projection: this month, with a band.
 * ====================================
 *   projected = spent so far
 *             + recurring charges still due this month
 *             + Σ remaining days · baseline(weekday)
 *             + calendar-expected spends
 *   band      = bootstrap of the last twelve weeks' daily discretionary totals
 * Pure and deterministic (seeded RNG) so it can be tested and called on every
 * ledger write without cost. No LLM.
 */

const DAY = 86400000;

/** Small seeded RNG so bands are reproducible in tests. */
export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }
function weekdayOf(d) { return new Date(d).getUTCDay(); }
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
 */
export function projectMonth(p) {
  const now = new Date(p.now);
  const year = now.getUTCFullYear(); const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const today = new Date(Date.UTC(year, month, now.getUTCDate()));
  const daysLeft = Math.round((monthEnd.getTime() - today.getTime()) / DAY); // days after today

  const spent = p.transactions
    .filter((t) => Number(t.amount) < 0 && new Date(t.occurred_at) >= monthStart && new Date(t.occurred_at) <= now)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // Recurring still due: next_expected inside the rest of this month and not already seen this month.
  const seenThisMonth = new Set(p.transactions.filter((t) => new Date(t.occurred_at) >= monthStart && t.is_recurring).map((t) => t.merchant_key));
  const committedItems = (p.recurring || []).filter((r) => {
    const d = new Date(r.next_expected);
    return d > today && d <= monthEnd && !seenThisMonth.has(r.merchant_key);
  });
  const committed = committedItems.reduce((s, r) => s + Number(r.typical_amount), 0);

  const expectedItems = (p.expected || []).filter((e) => new Date(e.date) > today && new Date(e.date) <= monthEnd);
  const expected = expectedItems.reduce((s, e) => s + Number(e.amount), 0);

  // Baselines by weekday from the history window ending yesterday.
  const weeks = p.historyWeeks ?? 12;
  const histFrom = new Date(today.getTime() - weeks * 7 * DAY);
  const histTo = new Date(today.getTime() - DAY);
  const history = dailyTotals(p.transactions, histFrom, histTo);
  const byWeekday = Array.from({ length: 7 }, (_, w) => history.filter((d) => d.weekday === w).map((d) => d.total));
  const baseline = byWeekday.map((xs) => (xs.length ? median(xs) : median(history.map((d) => d.total))));

  let baselineRest = 0;
  const remainingDays = [];
  for (let i = 1; i <= daysLeft; i += 1) { const d = new Date(today.getTime() + i * DAY); remainingDays.push(d); baselineRest += baseline[d.getUTCDay()]; }

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
  const fixed = spent + committed + expected;
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    month: monthStart.toISOString().slice(0, 10),
    as_of: now.toISOString(),
    days_left: daysLeft,
    spent: r2(spent),
    committed: r2(committed),
    committed_items: committedItems,
    expected: r2(expected),
    expected_items: expectedItems,
    baseline_rest: r2(baselineRest),
    projected_p10: r2(fixed + (sums.length ? quantile(sums, 0.1) : baselineRest)),
    projected_p50: r2(fixed + (sums.length ? quantile(sums, 0.5) : baselineRest)),
    projected_p90: r2(fixed + (sums.length ? quantile(sums, 0.9) : baselineRest)),
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
