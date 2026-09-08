/**
 * The money analyst: what the ledger says, with the lines that say it.
 * =====================================================================
 * Every finding here is computed, not generated. A sentence about a person's money
 * is only worth reading if the transactions behind it can be laid on the table, so
 * each finding carries its receipts and the numbers it rests on. An LLM may later
 * rephrase a sentence; it never invents one, and it is never the source of a number.
 *
 * Three rules, from the plan (.claude/plans/2026-09-07-money-twin/README.md):
 *   1. Minimum evidence. No claim about a rhythm before there is a rhythm to see:
 *      a weekday needs six weeks, a comparison needs two months with the same days
 *      elapsed, a series needs three occurrences.
 *   2. Numbers, never adjectives. "39 payments under 5 €, 87,20 € together", not
 *      "you make a lot of small payments".
 *   3. Nothing about a mood. This file reads money. Sleep, strain and calendars join
 *      later as frames, and only through a test that could fail.
 *
 * Pure functions: rows in, findings out. No Supabase, no LLM, no clock except the
 * `now` passed in.
 */

const DAY = 86400000;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function euro(n) { return EUR.format(Math.abs(Number(n) || 0)); }
function monthKey(iso) { return String(iso).slice(0, 7); }
function firstOfMonth(iso) { return `${monthKey(iso)}-01`; }
function out(t) { return Number(t.amount) < 0; }
function abs(t) { return Math.abs(Number(t.amount) || 0); }
function ordinal(d) {
  const n = Number(d);
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * Money in and out per calendar month, newest first. The segment a person asks for
 * when they say "per month": what left, what came in, how many lines, and the days
 * covered so a half month is never compared with a whole one.
 */
export function monthSegments(transactions, now = new Date()) {
  const byMonth = new Map();
  for (const t of transactions) {
    if (!t.occurred_at) continue;
    const key = monthKey(t.occurred_at);
    if (!byMonth.has(key)) byMonth.set(key, { month: `${key}-01`, spent: 0, received: 0, lines: 0, biggest: null, days_covered: 0 });
    const m = byMonth.get(key);
    m.lines += 1;
    if (out(t)) {
      m.spent += abs(t);
      if (!m.biggest || abs(t) > abs(m.biggest)) m.biggest = t;
    } else m.received += abs(t);
  }
  const thisMonth = monthKey(now.toISOString());
  return [...byMonth.values()]
    .map((m) => {
      const key = monthKey(m.month);
      const daysInMonth = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
      const covered = key === thisMonth ? now.getUTCDate() : daysInMonth;
      return {
        ...m,
        spent: Math.round(m.spent * 100) / 100,
        received: Math.round(m.received * 100) / 100,
        days_covered: covered,
        days_in_month: daysInMonth,
        complete: key !== thisMonth,
        biggest: m.biggest ? { id: m.biggest.id, merchant: m.biggest.merchant_raw || m.biggest.merchant_key, amount: abs(m.biggest) } : null,
      };
    })
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** This month against the same days of last month, which is the only fair comparison. */
function monthPace(transactions, now, segments) {
  const here = segments[0];
  const previous = segments[1];
  if (!here || !previous) return null;
  const day = here.days_covered;
  const prevKey = monthKey(previous.month);
  const sameDays = transactions.filter((t) => out(t) && monthKey(t.occurred_at) === prevKey && new Date(t.occurred_at).getUTCDate() <= day);
  if (!sameDays.length) return null;
  const thenSpent = Math.round(sameDays.reduce((s, t) => s + abs(t), 0) * 100) / 100;
  const gap = Math.round((here.spent - thenSpent) * 100) / 100;
  const monthName = new Date(previous.month).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const receipts = transactions
    .filter((t) => out(t) && monthKey(t.occurred_at) === monthKey(here.month))
    .sort((a, b) => abs(b) - abs(a)).slice(0, 3);
  return {
    kind: 'month_pace',
    month: here.month,
    sentence: `By the ${ordinal(day)} you had spent ${euro(here.spent)}. By the ${ordinal(day)} of ${monthName} it was ${euro(thenSpent)}.`,
    detail: Math.abs(gap) < 1 ? 'The two months are level.' : `That is ${euro(gap)} ${gap > 0 ? 'more' : 'less'}.`,
    numbers: { spent: here.spent, previous_spent: thenSpent, gap, day },
    receipts,
    evidence_count: sameDays.length + here.lines,
  };
}

/** What comes back every month, added up, because the total is the part nobody knows. */
function subscriptionLoad(recurring, transactions) {
  const monthly = (recurring || []).filter((r) => r.cadence === 'monthly');
  if (monthly.length < 2) return null;
  const total = Math.round(monthly.reduce((s, r) => s + Math.abs(Number(r.typical_amount) || 0), 0) * 100) / 100;
  const names = monthly.map((r) => r.merchant_name || r.merchant_key);
  const keys = new Set(monthly.map((r) => r.merchant_key));
  const receipts = transactions.filter((t) => out(t) && keys.has(t.merchant_key)).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, monthly.length);
  return {
    kind: 'subscriptions',
    month: null,
    sentence: `${monthly.length} charges come back every month, ${euro(total)} together.`,
    detail: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.`,
    numbers: { count: monthly.length, monthly_total: total, yearly_total: Math.round(total * 12 * 100) / 100 },
    receipts,
    evidence_count: monthly.reduce((s, r) => s + (Number(r.occurrences) || 0), 0),
  };
}

/** The small payments nobody counts, counted. */
function smallPayments(transactions, segments, threshold = 5) {
  const here = segments[0];
  if (!here) return null;
  const key = monthKey(here.month);
  const small = transactions.filter((t) => out(t) && monthKey(t.occurred_at) === key && abs(t) <= threshold);
  if (small.length < 8) return null;
  const total = Math.round(small.reduce((s, t) => s + abs(t), 0) * 100) / 100;
  const share = here.spent > 0 ? Math.round((total / here.spent) * 100) : 0;
  return {
    kind: 'small_payments',
    month: here.month,
    sentence: `${small.length} payments under ${euro(threshold)} this month, ${euro(total)} together.`,
    detail: `That is ${share}% of the month, in lines you would not remember.`,
    numbers: { count: small.length, total, share_percent: share, threshold },
    receipts: small.sort((a, b) => abs(b) - abs(a)).slice(0, 4),
    evidence_count: small.length,
  };
}

/** The largest single line in the window, which is usually the one worth a verdict. */
function biggestLine(transactions, now, days = 90) {
  const from = now.getTime() - days * DAY;
  const spend = transactions.filter((t) => out(t) && new Date(t.occurred_at).getTime() >= from);
  if (spend.length < 10) return null;
  const top = spend.reduce((a, b) => (abs(b) > abs(a) ? b : a));
  const rest = spend.filter((t) => t.id !== top.id);
  const median = rest.length ? [...rest].map(abs).sort((a, b) => a - b)[Math.floor(rest.length / 2)] : 0;
  if (!median || abs(top) < median * 4) return null;
  return {
    kind: 'biggest_line',
    month: firstOfMonth(top.occurred_at),
    sentence: `${top.merchant_raw || top.merchant_key} at ${euro(abs(top))} is the largest single payment in ${days} days.`,
    detail: `The middle payment in that window is ${euro(median)}.`,
    numbers: { amount: abs(top), median, days, multiple: Math.round((abs(top) / median) * 10) / 10 },
    receipts: [top],
    evidence_count: spend.length,
  };
}

/**
 * A weekday that costs more than the others, and only when there is enough of it to
 * say so. Six weeks minimum, four visits to the day minimum, and a permutation test
 * so a run of chance does not become a claim.
 */
export function weekdayShape(transactions, now, weeks = 6, iterations = 600) {
  const from = now.getTime() - weeks * 7 * DAY;
  const spend = transactions.filter((t) => out(t) && new Date(t.occurred_at).getTime() >= from);
  if (spend.length < 30) return null;

  /* The unit is a day, not a payment: a day with four small payments is one day.
     Every day in the window counts, including the days nothing was spent. */
  const totalPerDate = new Map();
  for (let d = new Date(from); d <= now; d = new Date(d.getTime() + DAY)) totalPerDate.set(d.toISOString().slice(0, 10), 0);
  for (const t of spend) {
    const date = t.occurred_at.slice(0, 10);
    if (!totalPerDate.has(date)) continue;
    totalPerDate.set(date, totalPerDate.get(date) + abs(t));
  }
  const days = [...totalPerDate.entries()].map(([date, total]) => ({ weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), total }));
  if (days.length < 30) return null;

  const meanOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const byWeekday = (list, wd) => list.filter((x) => x.weekday === wd).map((x) => x.total);
  const ratioFor = (list, wd) => {
    const here = byWeekday(list, wd);
    const rest = list.filter((x) => x.weekday !== wd).map((x) => x.total);
    const restMean = meanOf(rest);
    return { here: meanOf(here), rest: restMean, ratio: restMean > 0 ? meanOf(here) / restMean : Infinity, n: here.length };
  };

  let top = null;
  for (let wd = 0; wd < 7; wd += 1) {
    const r = ratioFor(days, wd);
    if (r.n < 4) continue;
    if (!top || r.ratio > top.ratio) top = { weekday: wd, ...r };
  }
  if (!top || top.ratio < 1.4 || !Number.isFinite(top.ratio)) return null;

  /* Permutation: keep the daily totals, shuffle which weekday each day was.
     If a weekday label carries no real weight, chance reaches this ratio often. */
  let seed = 20260908;
  /* Math.imul, not `*`: seed * 1103515245 leaves the exact-integer range of a double and
     the low bits come back zero, which turns a shuffle into a rotation. */
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let beats = 0;
  for (let i = 0; i < iterations; i += 1) {
    const labels = days.map((d) => d.weekday);
    for (let j = labels.length - 1; j > 0; j -= 1) { const k = Math.floor(rand() * (j + 1)); [labels[j], labels[k]] = [labels[k], labels[j]]; }
    const shuffled = days.map((d, j) => ({ weekday: labels[j], total: d.total }));
    let best = 0;
    for (let wd = 0; wd < 7; wd += 1) {
      const r = ratioFor(shuffled, wd);
      if (r.n >= 4 && Number.isFinite(r.ratio) && r.ratio > best) best = r.ratio;
    }
    if (best >= top.ratio) beats += 1;
  }
  const p = Math.round((beats / iterations) * 1000) / 1000;
  if (p > 0.05) return null;
  return {
    kind: 'weekday_shape',
    month: null,
    sentence: `${WEEKDAY[top.weekday]}s cost you ${euro(top.here)} against ${euro(top.rest)} on other days.`,
    detail: `Read from ${weeks} weeks, ${spend.length} payments and ${top.n} ${WEEKDAY[top.weekday]}s.`,
    numbers: { weekday: top.weekday, per_day: Math.round(top.here * 100) / 100, other_per_day: Math.round(top.rest * 100) / 100, ratio: Math.round(top.ratio * 100) / 100, p, weeks },
    receipts: spend.filter((t) => new Date(t.occurred_at).getUTCDay() === top.weekday).sort((a, b) => abs(b) - abs(a)).slice(0, 3),
    evidence_count: spend.length,
  };
}

/** Somewhere the money went this month that it had not gone before. */
function newMerchant(transactions, segments) {
  const here = segments[0];
  if (!here || segments.length < 2) return null;
  const key = monthKey(here.month);
  const history = transactions.filter((t) => monthKey(t.occurred_at) < key);
  const before = new Set(history.map((t) => t.merchant_key));
  if (before.size < 20) return null;
  const thisMonth = transactions.filter((t) => out(t) && monthKey(t.occurred_at) === key);
  const fresh = thisMonth.filter((t) => !before.has(t.merchant_key));
  if (!fresh.length) return null;
  /* A thin history makes everything look new. If most of the month is unrecognised, the
     ledger does not know the person's places yet, and saying "new" would be an artefact. */
  const freshKeys = new Set(fresh.map((t) => t.merchant_key));
  const monthKeys = new Set(thisMonth.map((t) => t.merchant_key));
  if (freshKeys.size > monthKeys.size * 0.5) return null;
  const byMerchant = new Map();
  for (const t of fresh) {
    if (!byMerchant.has(t.merchant_key)) byMerchant.set(t.merchant_key, { name: t.merchant_raw || t.merchant_key, total: 0, rows: [] });
    const m = byMerchant.get(t.merchant_key);
    m.total += abs(t); m.rows.push(t);
  }
  const top = [...byMerchant.values()].sort((a, b) => b.total - a.total)[0];
  return {
    kind: 'new_merchant',
    month: here.month,
    sentence: `${byMerchant.size === 1 ? `${top.name} is` : `${byMerchant.size} places are`} new this month.`,
    detail: `${top.name} has taken ${euro(top.total)} across ${top.rows.length} ${top.rows.length === 1 ? 'payment' : 'payments'}.`,
    numbers: { new_merchants: byMerchant.size, top_total: Math.round(top.total * 100) / 100, top_count: top.rows.length },
    receipts: top.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
    evidence_count: fresh.length,
  };
}

/** A charge that used to come back and has stopped, which is money either saved or forgotten. */
function dormantCharge(recurring, transactions, now) {
  const late = (recurring || []).filter((r) => {
    if (r.cadence !== 'monthly' || !r.last_seen) return false;
    const days = (now.getTime() - new Date(r.last_seen).getTime()) / DAY;
    return days > 45 && days < 200 && Number(r.occurrences) >= 3;
  });
  if (!late.length) return null;
  const r = late.sort((a, b) => new Date(a.last_seen) - new Date(b.last_seen))[0];
  const days = Math.round((now.getTime() - new Date(r.last_seen).getTime()) / DAY);
  return {
    kind: 'dormant_charge',
    month: null,
    sentence: `${r.merchant_name || r.merchant_key} came back every month and has not for ${days} days.`,
    detail: `It was ${euro(r.typical_amount)} a time, ${Number(r.occurrences)} times.`,
    numbers: { days_since: days, typical_amount: Math.abs(Number(r.typical_amount) || 0), occurrences: Number(r.occurrences) },
    receipts: transactions.filter((t) => t.merchant_key === r.merchant_key).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, 2),
    evidence_count: Number(r.occurrences),
  };
}


/**
 * The kind of place that takes the most, when enough of the window has a kind at all.
 * Categories arrive from money_places (a brand table, then a geocoder), so this finding
 * refuses to speak until three fifths of the money has been placed: a share computed over
 * half-read data is a wrong number wearing a percentage sign.
 */
export function categoryShape(transactions, categoryOf, now, days = 120) {
  const from = now.getTime() - days * DAY;
  const spend = transactions.filter((t) => out(t) && new Date(t.occurred_at).getTime() >= from);
  if (spend.length < 20) return null;
  const total = spend.reduce((s, t) => s + abs(t), 0);
  if (total <= 0) return null;

  const byCategory = new Map();
  let placed = 0;
  for (const t of spend) {
    const category = categoryOf(t);
    if (!category) continue;
    placed += abs(t);
    if (!byCategory.has(category)) byCategory.set(category, { category, spent: 0, rows: [] });
    const c = byCategory.get(category);
    c.spent += abs(t);
    c.rows.push(t);
  }
  if (!byCategory.size || placed / total < 0.6) return null;

  const top = [...byCategory.values()].sort((a, b) => b.spent - a.spent)[0];
  const share = Math.round((top.spent / placed) * 100);
  if (share < 25) return null;
  return {
    kind: 'category_shape',
    month: null,
    sentence: `${share}% of what you have spent in ${days} days went to ${top.category}: ${euro(top.spent)}.`,
    detail: `Read from ${euro(placed)} of ${euro(total)}, which is what has a kind of place behind it so far.`,
    numbers: { category: top.category, spent: Math.round(top.spent * 100) / 100, share_percent: share, placed: Math.round(placed * 100) / 100, total: Math.round(total * 100) / 100, days },
    receipts: top.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 4),
    evidence_count: top.rows.length,
  };
}

/**
 * Everything the ledger will say today, strongest first. A finding that cannot meet
 * its evidence rule is absent, not softened: silence is the honest output when there
 * is nothing yet to see.
 */
export function readLedger({ transactions = [], recurring = [], categoryOf = null, now = new Date() } = {}) {
  const rows = transactions.filter((t) => t.occurred_at);
  const segments = monthSegments(rows, now);
  const findings = [
    monthPace(rows, now, segments),
    subscriptionLoad(recurring, rows),
    categoryOf ? categoryShape(rows, categoryOf, now) : null,
    weekdayShape(rows, now),
    smallPayments(rows, segments),
    biggestLine(rows, now),
    newMerchant(rows, segments),
    dormantCharge(recurring, rows, now),
  ].filter(Boolean);
  return { segments, findings };
}
