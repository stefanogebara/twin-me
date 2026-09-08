/**
 * The money brain: what the ledger learns from money alone.
 * =========================================================
 * Until now this system learned about a person by joining money to other connected
 * platforms -- Spotify plays, Whoop recovery, calendar events. That join is gone.
 * A ledger already carries a life in it: which places, which prices, which days,
 * which rhythms, what is normal for this person and what is not. This module is the
 * learning engine that reads all of that out of transactions and nothing else.
 *
 * Three structures come out of it, in order of how much they compound:
 *   1. `merchantProfile` / `learnMerchants` -- everything the ledger knows about one
 *      place: its price, its day, its gap, whether it is late.
 *   2. `predictNext` -- what the ledger expects next, from cadence alone.
 *   3. `learnPatterns` -- the claims worth saying out loud, each with an evidence
 *      rule that can refuse, each carrying receipts.
 *   4. `describeForTwin` -- the same knowledge as plain lines a model can be handed
 *      as context. This is the memorization surface: what has been learned, written
 *      so it can be recalled.
 *
 * Same three rules as analyst.js, because the findings pour into the same reader:
 *   1. Minimum evidence. A price is not a price point before three of them, a day is
 *      not a habit before four visits, a shape of the month needs two whole months
 *      and a permutation test.
 *   2. Numbers, never adjectives. "1,70 EUR, 8 times", never "cheap" or "often".
 *   3. Silence over softening. A rule not met returns null, not a hedge.
 *
 * Pure: rows in, learned structures out. No Supabase, no LLM, no network, and no
 * clock except the `now` passed in.
 */

import { median, cadenceOf } from './recurring.js';

const DAY = 86400000;
const HOUR = 3600000;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
/* The twin block is prompt text, so it spells EUR instead of carrying a currency
   glyph and a non-breaking space through a tokenizer. */
const DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const THIRD_NAME = ['the first third of the month', 'the middle of the month', 'the last third of the month'];

/* ------------------------------------------------------------------ thresholds */

/** A price is "always" when its whole range sits inside 5% of the middle price.
 *  That is the width of a subscription, not of a supermarket: it separates
 *  "Spotify is 11,99" from "the shop was 22, then 41, then 18". */
export const FIXED_SPREAD = 0.05;
/** Four visits before a weekday is a habit, and the day must hold half of them.
 *  Three visits can all land on a Sunday by accident; four that do, mostly, cannot. */
export const MIN_WEEKDAY_VISITS = 4;
export const WEEKDAY_SHARE = 0.5;
/** A monthly charge that drifts more than three days off its date is not on a date. */
export const DAY_OF_MONTH_DRIFT = 3;
/** Half again past the usual gap. Under that, a merchant is merely between visits. */
export const OVERDUE_MULTIPLE = 1.5;
/** Three visits give two gaps, which is the fewest that can have a middle at all. */
export const MIN_GAP_VISITS = 3;
/** The same interval spread recurring.js uses, for the same reason: past 40% the
 *  gaps are not a rhythm and a date computed from them is a guess. */
export const PREDICT_SPREAD = 0.4;

/* A prediction reaches the twin's ears only above this. Below it the date is a guess with
   a number attached, and the twin has no way to convey the difference in conversation. */
export const TWIN_PREDICTION_CONFIDENCE = 0.3;
/** Eight expectations. A ninth is read as a calendar, and a calendar is not a claim. */
export const MAX_PREDICTIONS = 8;
/** Three payments at the same price before the price is a fact about the place. */
export const MIN_PRICE_POINT_VISITS = 3;
/** Two whole months, and a part of the month holding more than 45% of the spending
 *  -- a third of the month holds a third of it by construction, so the claim starts
 *  where the excess starts. */
export const MIN_SHAPE_MONTHS = 2;
export const MONTH_SHAPE_SHARE = 0.45;
/** Ten placed card payments before a city is a home rather than a trip. */
export const MIN_PLACED_PAYMENTS = 10;
export const PLACE_SHARE = 0.5;
/** Three hours: long enough to hold a commute and the coffee at the end of it,
 *  short enough that two unrelated errands on one day are not called a pairing. */
export const PAIRING_HOURS = 3;
/** Three separate days. Twice is a coincidence. */
export const MIN_PAIRINGS = 3;
/** Three times the merchant's own middle price, after four visits have established
 *  what that middle price is. The comparison is always to the same place, never to
 *  the ledger as a whole -- 116 EUR is ordinary at a furniture shop. */
export const OUTLIER_MULTIPLE = 3;
export const MIN_OUTLIER_HISTORY = 4;
/** A surprise from last winter is not news; a surprise from last month is. */
export const OUTLIER_WINDOW_DAYS = 120;
/** Eight payments in a category before its week has a shape. */
export const MIN_CATEGORY_PAYMENTS = 8;
export const CATEGORY_RHYTHM_RATIO = 1.5;
/** Four months of days, so a permutation has something to permute. */
export const RHYTHM_WINDOW_DAYS = 120;
/** One in twenty. Above it, chance reaches the same number often enough to keep quiet. */
export const MAX_P = 0.05;
/** Five patterns. A sixth is a list, and a list is not a reading. */
export const MAX_PATTERNS = 5;
/** Twelve lines, which is what fits in a prompt beside everything else the twin holds. */
export const MAX_TWIN_LINES = 12;

/**
 * Strongest first, and "strongest" is how hard the claim would be to make by chance
 * and how much of a life it describes: a weekday habit and the shape of a month are
 * rhythms, a pairing and a fixed price are repetitions, a city is a fact, and a single
 * large payment is the weakest thing here because it happened once.
 */
const PATTERN_RANK = {
  weekday_habit: 0,
  month_shape: 1,
  category_rhythm: 2,
  pairing: 3,
  price_point: 4,
  place_habit: 5,
  amount_outlier: 6,
};

/* ---------------------------------------------------------------------- basics */

function euro(n) { return EUR.format(Math.abs(Number(n) || 0)); }
function round2(n) { return Math.round(n * 100) / 100; }
function out(t) { return Number(t.amount) < 0; }
function abs(t) { return Math.abs(Number(t.amount) || 0); }
function monthKey(iso) { return String(iso).slice(0, 7); }
function firstOfMonth(iso) { return `${monthKey(iso)}-01`; }
function at(t) { return new Date(t.occurred_at).getTime(); }
function dayMonth(iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }); }
function monthName(iso) { return new Date(iso).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }); }
function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysInMonth(key) { return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate(); }

/** The value that appears most often, which is the right answer for a name or a city:
 *  a bank prints the same merchant three ways and only one of them is what it is called. */
function mode(values) {
  const counts = new Map();
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = null;
  for (const [value, n] of counts) if (!best || n > best.n) best = { value, n };
  return best ? best.value : null;
}

/** Coefficient of variation: the spread of a series against its own size, so a gap of
 *  30 days that wobbles by 3 and a gap of 7 that wobbles by 3 are not called equal. */
function spread(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return Infinity;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Permutation test: keep the daily totals, shuffle which label each day carried.
 * If the label (a weekday, a third of the month) carries no real weight, chance
 * reaches the observed statistic often, and the finding stays unsaid.
 *
 * Math.imul, not `*`: seed * 1103515245 overflows the exact-integer range of a
 * double and the low bits go to zero, which is the difference between a shuffle
 * and a rotation.
 */
function permutationP(values, labels, statistic, observed, iterations = 600) {
  let seed = 20260908;
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let beats = 0;
  for (let i = 0; i < iterations; i += 1) {
    const shuffled = labels.slice();
    for (let j = shuffled.length - 1; j > 0; j -= 1) {
      const k = Math.floor(rand() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    if (statistic(values, shuffled) >= observed) beats += 1;
  }
  return Math.round((beats / iterations) * 1000) / 1000;
}

/** Every day in a window, including the days nothing was spent -- a rhythm read only
 *  from the days money moved would find a rhythm in any ledger. */
function dailyTotals(rows, fromMs, toMs) {
  const totals = new Map();
  for (let ms = fromMs; ms <= toMs; ms += DAY) totals.set(isoDate(ms), 0);
  for (const t of rows) {
    const date = String(t.occurred_at).slice(0, 10);
    if (!totals.has(date)) continue;
    totals.set(date, totals.get(date) + abs(t));
  }
  return [...totals.entries()].map(([date, total]) => ({ date, total, weekday: new Date(`${date}T12:00:00Z`).getUTCDay() }));
}

/* -------------------------------------------------------------------- merchants */

/**
 * One merchant, and everything the ledger knows about it.
 *
 * The typical amount is the MEDIAN, never the mean: one 116,76 EUR afternoon at El
 * Corte Ingles must not move what a coffee there costs, and the outlier finding below
 * depends on the middle staying where it is.
 *
 * @param {object[]} transactions  { id, occurred_at, amount (negative out), merchant_key, merchant_raw, merchant_city, channel, category?, is_recurring }
 * @param {string} merchantKey
 * @param {object} [opts] { now, categoryOf }
 */
export function merchantProfile(transactions, merchantKey, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const categoryOf = opts.categoryOf || ((t) => t.category || null);
  const rows = (transactions || [])
    .filter((t) => t && t.occurred_at && t.merchant_key === merchantKey && out(t))
    .sort((a, b) => at(a) - at(b));
  if (!rows.length) return null;

  const amounts = rows.map(abs);
  const typical = round2(median(amounts));
  const low = round2(Math.min(...amounts));
  const high = round2(Math.max(...amounts));

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const t of rows) weekdayCounts[new Date(t.occurred_at).getUTCDay()] += 1;
  const topWeekday = weekdayCounts.indexOf(Math.max(...weekdayCounts));
  const usualWeekday = rows.length >= MIN_WEEKDAY_VISITS && weekdayCounts[topWeekday] >= rows.length * WEEKDAY_SHARE
    ? topWeekday
    : null;

  /* A date in the month is only a date when the charges keep it. A charge that wanders
     between the 3rd and the 24th has a cadence, not a day. Month-end wrap (the 31st
     landing on the 1st) is not corrected here; it reads as drift and stays silent. */
  const daysOfMonth = rows.map((t) => new Date(t.occurred_at).getUTCDate());
  const middleDay = Math.round(median(daysOfMonth));
  const usualDayOfMonth = rows.length >= MIN_GAP_VISITS && daysOfMonth.every((d) => Math.abs(d - middleDay) <= DAY_OF_MONTH_DRIFT)
    ? middleDay
    : null;

  const gaps = rows.slice(1).map((t, i) => (at(t) - at(rows[i])) / DAY);
  const medianGap = gaps.length ? Math.round(median(gaps) * 10) / 10 : null;
  const lastGap = gaps.length ? Math.round(gaps[gaps.length - 1] * 10) / 10 : null;
  const lastSeen = rows[rows.length - 1].occurred_at;
  const daysSinceLast = Math.floor((now.getTime() - at(rows[rows.length - 1])) / DAY);

  return {
    merchant_key: merchantKey,
    name: mode(rows.map((t) => t.merchant_raw)) || merchantKey,
    city: mode(rows.map((t) => t.merchant_city)),
    category: mode(rows.map((t) => categoryOf(t))),
    channel: mode(rows.map((t) => t.channel)),
    times: rows.length,
    first_seen: rows[0].occurred_at,
    last_seen: lastSeen,
    total: round2(amounts.reduce((a, b) => a + b, 0)),
    typical_amount: typical,
    amount_low: low,
    amount_high: high,
    amount_is_fixed: rows.length >= 2 && typical > 0 && (high - low) <= typical * FIXED_SPREAD,
    weekday_counts: weekdayCounts,
    usual_weekday: usualWeekday,
    usual_day_of_month: usualDayOfMonth,
    median_gap_days: medianGap,
    /* Carried on the profile because predictNext works from profiles alone and a gap
       it cannot see the spread of is a date it must not print. */
    gap_spread: gaps.length >= 2 ? Math.round(spread(gaps) * 1000) / 1000 : null,
    cadence: medianGap ? cadenceOf(medianGap) : null,
    last_gap_days: lastGap,
    days_since_last: daysSinceLast,
    is_overdue: rows.length >= MIN_GAP_VISITS && medianGap > 0 && daysSinceLast > medianGap * OVERDUE_MULTIPLE,
  };
}

/** Every merchant in the ledger, dearest first -- the order a person reads their own
 *  money in, which is by what it cost them and not by how often it happened. */
export function learnMerchants(transactions = [], opts = {}) {
  const keys = [...new Set((transactions || []).filter((t) => t && t.occurred_at && out(t) && t.merchant_key).map((t) => t.merchant_key))];
  return keys
    .map((key) => merchantProfile(transactions, key, opts))
    .filter(Boolean)
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------ predictions */

/**
 * What the ledger expects to happen, learned from cadence alone. No model, no
 * calendar, no platform: the last date plus the middle gap, rolled forward until it
 * is ahead of today, and only for merchants whose gaps hold together.
 *
 * @param {object[]} profiles  from learnMerchants
 * @param {object} [opts] { now, days = 14 }
 * @returns {{merchant_key: string, name: string, expected_on: string, typical_amount: number, confidence: number}[]}
 */
export function predictNext(profiles = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const days = opts.days ?? 14;
  const horizon = now.getTime() + days * DAY;
  const today = now.getTime();

  const rows = [];
  for (const p of profiles || []) {
    if (!p || p.times < MIN_GAP_VISITS) continue;
    if (!p.median_gap_days || p.median_gap_days <= 0) continue;
    if (p.gap_spread === null || p.gap_spread >= PREDICT_SPREAD) continue;

    const gapMs = p.median_gap_days * DAY;
    let expected = new Date(p.last_seen).getTime() + gapMs;
    /* A merchant that is late still has a next date: roll the gap forward rather than
       print a day that has already passed. The loop is bounded so a gap of hours in a
       ledger years old cannot spin. */
    for (let i = 0; expected < today && i < 400; i += 1) expected += gapMs;
    if (expected > horizon) continue;

    /* Two halves, both computed: how tight the gaps are, and how many of them there
       are. Three visits with perfect gaps is still only three visits. */
    const stability = 1 - Math.min(p.gap_spread / PREDICT_SPREAD, 1);
    const support = Math.min((p.times - 2) / 6, 1);
    rows.push({
      merchant_key: p.merchant_key,
      name: p.name,
      expected_on: isoDate(expected),
      typical_amount: p.typical_amount,
      confidence: Math.round((0.6 * stability + 0.4 * support) * 100) / 100,
    });
  }

  return rows
    .sort((a, b) => (a.expected_on === b.expected_on ? b.confidence - a.confidence : (a.expected_on < b.expected_on ? -1 : 1)))
    .slice(0, MAX_PREDICTIONS);
}

/* --------------------------------------------------------------------- patterns */

/** A price that does not move, which is a fact about a place a person could not tell you. */
function pricePoint(profiles, transactions) {
  const fixed = (profiles || [])
    .filter((p) => p.amount_is_fixed && p.times >= MIN_PRICE_POINT_VISITS && p.typical_amount > 0)
    .sort((a, b) => (b.times === a.times ? b.total - a.total : b.times - a.times));
  const p = fixed[0];
  if (!p) return null;
  const rows = transactions.filter((t) => t.merchant_key === p.merchant_key && out(t));
  return {
    kind: 'price_point',
    month: null,
    /* "always" is a claim about every payment, so it is reserved for a price that never
       moved. A price inside the fixed band but not identical is "about", and the detail
       still prints the range either way. */
    sentence: `${p.name} is ${Number(p.amount_low) === Number(p.amount_high) ? 'always' : 'about'} ${euro(p.typical_amount)}, ${p.times} times since ${monthName(p.first_seen)}.`,
    detail: p.amount_low === p.amount_high
      ? 'Every one of them the same to the cent.'
      : `The lowest was ${euro(p.amount_low)} and the highest ${euro(p.amount_high)}.`,
    numbers: { typical_amount: p.typical_amount, times: p.times, amount_low: p.amount_low, amount_high: p.amount_high, total: p.total },
    receipts: rows.sort((a, b) => at(b) - at(a)).slice(0, 3),
    evidence_count: p.times,
  };
}

/** A place that belongs to a day of the week. */
function weekdayHabit(profiles, transactions) {
  const habits = (profiles || [])
    .filter((p) => p.usual_weekday !== null && p.times >= MIN_WEEKDAY_VISITS)
    .sort((a, b) => b.weekday_counts[b.usual_weekday] - a.weekday_counts[a.usual_weekday]);
  const p = habits[0];
  if (!p) return null;
  const onDay = p.weekday_counts[p.usual_weekday];
  const rows = transactions.filter((t) => t.merchant_key === p.merchant_key && out(t) && new Date(t.occurred_at).getUTCDay() === p.usual_weekday);
  return {
    kind: 'weekday_habit',
    month: null,
    sentence: `You pay ${p.name} on ${WEEKDAY[p.usual_weekday]}s, ${onDay} of ${p.times} times.`,
    detail: `Since ${dayMonth(p.first_seen)}, at ${euro(p.typical_amount)} a time.`,
    numbers: { weekday: p.usual_weekday, on_day: onDay, times: p.times, typical_amount: p.typical_amount, total: p.total },
    receipts: rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
    evidence_count: p.times,
  };
}

/** Which day-of-month third a total belongs to: 1-10, 11-20, the rest. */
function thirdOf(day) { return day <= 10 ? 0 : (day <= 20 ? 1 : 2); }

/** The whole months the ledger has actually seen, so a half month cannot tilt a share. */
function completeMonths(rows, now) {
  const current = monthKey(now.toISOString());
  const keys = [...new Set(rows.map((t) => monthKey(t.occurred_at)))].filter((k) => k < current).sort();
  if (!keys.length) return [];
  /* A first month the ledger joined halfway through has no first third to speak of,
     and keeping it would prove the last third is where the money goes. */
  const firstDay = Math.min(...rows.filter((t) => monthKey(t.occurred_at) === keys[0]).map((t) => new Date(t.occurred_at).getUTCDate()));
  return firstDay > 3 ? keys.slice(1) : keys;
}

/** Money that lands in one part of the month, tested against a shuffle of the dates. */
function monthShape(transactions, now) {
  const spend = transactions.filter(out);
  const months = completeMonths(spend, now);
  if (months.length < MIN_SHAPE_MONTHS) return null;

  const inMonths = spend.filter((t) => months.includes(monthKey(t.occurred_at)));
  if (!inMonths.length) return null;

  /* The unit is a day, not a payment: a day with four small payments is one day. */
  const days = [];
  for (const key of months) {
    const totals = new Map();
    for (let d = 1; d <= daysInMonth(key); d += 1) totals.set(`${key}-${String(d).padStart(2, '0')}`, 0);
    for (const t of inMonths) {
      const date = String(t.occurred_at).slice(0, 10);
      if (totals.has(date)) totals.set(date, totals.get(date) + abs(t));
    }
    for (const [date, total] of totals) days.push({ total, third: thirdOf(Number(date.slice(8, 10))) });
  }

  const values = days.map((d) => d.total);
  const labels = days.map((d) => d.third);
  const grand = values.reduce((a, b) => a + b, 0);
  if (grand <= 0) return null;

  const shareOf = (vals, labs) => {
    const sums = [0, 0, 0];
    for (let i = 0; i < vals.length; i += 1) sums[labs[i]] += vals[i];
    const total = sums.reduce((a, b) => a + b, 0);
    return total > 0 ? Math.max(...sums) / total : 0;
  };
  const observed = shareOf(values, labels);
  if (observed < MONTH_SHAPE_SHARE) return null;

  const sums = [0, 0, 0];
  for (let i = 0; i < values.length; i += 1) sums[labels[i]] += values[i];
  const winner = sums.indexOf(Math.max(...sums));

  const p = permutationP(values, labels, shareOf, observed);
  if (p > MAX_P) return null;

  const inThird = inMonths.filter((t) => thirdOf(new Date(t.occurred_at).getUTCDate()) === winner);
  return {
    kind: 'month_shape',
    month: null,
    sentence: `${Math.round(observed * 100)}% of what you spend lands in ${THIRD_NAME[winner]}.`,
    detail: `${euro(sums[winner])} of ${euro(grand)}, read from ${months.length} whole months and ${inMonths.length} payments.`,
    numbers: { third: winner, share_percent: Math.round(observed * 100), third_total: round2(sums[winner]), total: round2(grand), months: months.length, p },
    receipts: inThird.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
    evidence_count: inMonths.length,
  };
}

/** The city the card lives in, when the bank has printed enough cities to know. */
function placeHabit(transactions) {
  const placed = transactions.filter((t) => out(t) && t.channel === 'card' && t.merchant_city);
  if (placed.length < MIN_PLACED_PAYMENTS) return null;

  const byCity = new Map();
  for (const t of placed) {
    const key = String(t.merchant_city).trim().toLowerCase();
    if (!byCity.has(key)) byCity.set(key, { spellings: [], rows: [], spent: 0 });
    const c = byCity.get(key);
    c.spellings.push(String(t.merchant_city).trim());
    c.rows.push(t);
    c.spent += abs(t);
  }
  const top = [...byCity.values()].sort((a, b) => b.rows.length - a.rows.length)[0];
  const share = top.rows.length / placed.length;
  if (share <= PLACE_SHARE) return null;

  const allSpent = placed.reduce((s, t) => s + abs(t), 0);
  const city = mode(top.spellings);
  return {
    kind: 'place_habit',
    month: null,
    sentence: `${Math.round(share * 100)}% of your card payments happen in ${city}: ${top.rows.length} of ${placed.length}.`,
    detail: `${euro(top.spent)} of ${euro(allSpent)}, across ${byCity.size} ${byCity.size === 1 ? 'city' : 'cities'}.`,
    numbers: { city, count: top.rows.length, placed: placed.length, share_percent: Math.round(share * 100), spent: round2(top.spent), total: round2(allSpent), cities: byCity.size },
    receipts: top.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
    evidence_count: placed.length,
  };
}

/** Two places that keep happening within hours of each other: a commute, a routine. */
function pairing(transactions) {
  const spend = transactions.filter((t) => out(t) && t.merchant_key).sort((a, b) => at(a) - at(b));
  if (spend.length < MIN_PAIRINGS * 2) return null;

  const pairs = new Map();
  for (let i = 0; i < spend.length; i += 1) {
    for (let j = i + 1; j < spend.length; j += 1) {
      const gapMs = at(spend[j]) - at(spend[i]);
      if (gapMs > PAIRING_HOURS * HOUR) break;
      if (spend[j].merchant_key === spend[i].merchant_key) continue;
      const key = `${spend[i].merchant_key}|${spend[j].merchant_key}`;
      if (!pairs.has(key)) pairs.set(key, { first: spend[i], second: spend[j], dates: new Set(), gaps: [], rows: [] });
      const pair = pairs.get(key);
      /* One day contributes one occurrence. Three coffees beside one metro ride is
         one morning, not three pairings. */
      const date = String(spend[i].occurred_at).slice(0, 10);
      if (pair.dates.has(date)) continue;
      pair.dates.add(date);
      pair.gaps.push(gapMs / 60000);
      pair.rows.push(spend[i], spend[j]);
    }
  }

  const top = [...pairs.values()].sort((a, b) => b.dates.size - a.dates.size)[0];
  if (!top || top.dates.size < MIN_PAIRINGS) return null;
  const gapMinutes = Math.round(median(top.gaps));
  const firstName = top.first.merchant_raw || top.first.merchant_key;
  const secondName = top.second.merchant_raw || top.second.merchant_key;
  return {
    kind: 'pairing',
    month: null,
    sentence: `${firstName} and ${secondName} go together, ${top.dates.size} times.`,
    detail: `${secondName} follows ${firstName} by about ${gapMinutes} ${gapMinutes === 1 ? 'minute' : 'minutes'}.`,
    numbers: { first: top.first.merchant_key, second: top.second.merchant_key, times: top.dates.size, median_gap_minutes: gapMinutes },
    receipts: top.rows.slice(0, 4),
    evidence_count: top.dates.size,
  };
}

/** A payment a merchant's own history says should not have happened. */
function amountOutlier(profiles, transactions, now) {
  const from = now.getTime() - OUTLIER_WINDOW_DAYS * DAY;
  const byKey = new Map((profiles || []).map((p) => [p.merchant_key, p]));

  let best = null;
  for (const t of transactions) {
    if (!out(t) || at(t) < from) continue;
    const p = byKey.get(t.merchant_key);
    if (!p || p.typical_amount <= 0) continue;
    /* The history has to be behind the payment, not around it: four visits after the
       fact say nothing about whether it was a surprise at the time. */
    const before = transactions.filter((x) => x.merchant_key === t.merchant_key && out(x) && at(x) < at(t)).length;
    if (before < MIN_OUTLIER_HISTORY) continue;
    const multiple = abs(t) / p.typical_amount;
    if (multiple < OUTLIER_MULTIPLE) continue;
    if (!best || multiple > best.multiple) best = { t, p, multiple };
  }
  if (!best) return null;

  return {
    kind: 'amount_outlier',
    month: firstOfMonth(best.t.occurred_at),
    sentence: `${best.p.name} usually takes ${euro(best.p.typical_amount)}; on ${dayMonth(best.t.occurred_at)} it took ${euro(abs(best.t))}.`,
    detail: `That is ${Math.round(best.multiple * 10) / 10} times its usual, across ${best.p.times} payments there.`,
    numbers: { typical_amount: best.p.typical_amount, amount: round2(abs(best.t)), multiple: Math.round(best.multiple * 10) / 10, times: best.p.times },
    receipts: [best.t],
    evidence_count: best.p.times,
  };
}

/** A kind of place that belongs to the weekend, or to the working week. */
function categoryRhythm(transactions, categoryOf, now) {
  if (!categoryOf) return null;
  const from = now.getTime() - RHYTHM_WINDOW_DAYS * DAY;
  const spend = transactions.filter((t) => out(t) && at(t) >= from);
  if (!spend.length) return null;

  const byCategory = new Map();
  for (const t of spend) {
    const category = categoryOf(t);
    if (!category) continue;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(t);
  }

  const ratioOf = (vals, labs) => {
    let weekend = 0; let weekendDays = 0; let week = 0; let weekDays = 0;
    for (let i = 0; i < vals.length; i += 1) {
      if (labs[i]) { weekend += vals[i]; weekendDays += 1; } else { week += vals[i]; weekDays += 1; }
    }
    const a = weekendDays ? weekend / weekendDays : 0;
    const b = weekDays ? week / weekDays : 0;
    if (a <= 0 && b <= 0) return 0;
    if (a <= 0 || b <= 0) return Infinity;
    return Math.max(a / b, b / a);
  };

  let best = null;
  for (const [category, rows] of byCategory) {
    if (rows.length < MIN_CATEGORY_PAYMENTS) continue;
    const days = dailyTotals(rows, from, now.getTime());
    const values = days.map((d) => d.total);
    const labels = days.map((d) => (d.weekday === 0 || d.weekday === 6 ? 1 : 0));
    const observed = ratioOf(values, labels);
    /* An infinite ratio (a category that never happens on a weekday) is the strongest
       signal there is, not a NaN to discard: the permutation test still has to beat it.
       It reaches numbers.ratio as null, because Infinity is not a number to store. */
    if (observed < CATEGORY_RHYTHM_RATIO) continue;
    if (!best || observed > best.observed) best = { category, rows, values, labels, observed, days };
  }
  if (!best) return null;

  const p = permutationP(best.values, best.labels, ratioOf, best.observed);
  if (p > MAX_P) return null;

  const weekendDays = best.days.filter((d) => d.weekday === 0 || d.weekday === 6);
  const weekDays = best.days.filter((d) => d.weekday !== 0 && d.weekday !== 6);
  const weekendPerDay = weekendDays.reduce((s, d) => s + d.total, 0) / weekendDays.length;
  const weekPerDay = weekDays.reduce((s, d) => s + d.total, 0) / weekDays.length;
  const weekendLed = weekendPerDay > weekPerDay;

  return {
    kind: 'category_rhythm',
    month: null,
    sentence: weekendLed
      ? `Your ${best.category} spending lands at weekends: ${euro(weekendPerDay)} a weekend day against ${euro(weekPerDay)} a weekday.`
      : `Your ${best.category} spending lands on weekdays: ${euro(weekPerDay)} a weekday against ${euro(weekendPerDay)} a weekend day.`,
    detail: `Read from ${best.rows.length} payments in ${RHYTHM_WINDOW_DAYS} days.`,
    numbers: {
      category: best.category,
      weekend_per_day: round2(weekendPerDay),
      weekday_per_day: round2(weekPerDay),
      ratio: Number.isFinite(best.observed) ? Math.round(best.observed * 100) / 100 : null,
      p,
      days: RHYTHM_WINDOW_DAYS,
    },
    receipts: best.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
    evidence_count: best.rows.length,
  };
}

/**
 * Everything the ledger has learned that is worth saying, strongest first and at most
 * MAX_PATTERNS of them. Each kind has its own evidence rule and each rule can refuse:
 * a pattern that is absent here is a pattern that has not earned a sentence yet.
 *
 * @param {object} input
 * @param {object[]} input.transactions
 * @param {object[]} [input.profiles]  from learnMerchants; computed here if absent
 * @param {(t: object) => string|null} [input.categoryOf]
 * @param {Date|string} [input.now]
 * @returns {object[]} findings in analyst.js's shape
 */
export function learnPatterns({ transactions = [], profiles = null, categoryOf = null, now = new Date() } = {}) {
  const clock = now instanceof Date ? now : new Date(now);
  const rows = (transactions || []).filter((t) => t && t.occurred_at);
  const known = profiles || learnMerchants(rows, { now: clock, categoryOf: categoryOf || undefined });

  return [
    pricePoint(known, rows),
    weekdayHabit(known, rows),
    monthShape(rows, clock),
    placeHabit(rows),
    pairing(rows),
    amountOutlier(known, rows, clock),
    categoryRhythm(rows, categoryOf, clock),
  ]
    .filter(Boolean)
    .sort((a, b) => (PATTERN_RANK[a.kind] === PATTERN_RANK[b.kind]
      ? b.evidence_count - a.evidence_count
      : PATTERN_RANK[a.kind] - PATTERN_RANK[b.kind]))
    .slice(0, MAX_PATTERNS);
}

/* ------------------------------------------------------------------------ twin */

/** The amount as a prompt reads it: es-ES digits, the currency spelled, ASCII throughout. */
function amountText(n) { return `${DECIMAL.format(Math.abs(Number(n) || 0))} EUR`; }

/** A finding's sentence with the glyphs a tokenizer should not have to carry. */
function plainSentence(s) {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\u20ac/g, 'EUR');
}

/** The shape of a merchant's week in one word, or nothing when it has no shape. */
function rhythmWord(p) {
  if (p.usual_weekday !== null) return `mostly ${WEEKDAY[p.usual_weekday]}s`;
  if (p.times < MIN_WEEKDAY_VISITS) return null;
  const weekend = p.weekday_counts[0] + p.weekday_counts[6];
  if (weekend === 0) return 'weekdays';
  if (weekend === p.times) return 'weekends';
  return null;
}

/**
 * The learned ledger as plain lines a model can be handed as context. Facts only,
 * numbers not adjectives, no emoji, each line standing alone so retrieval can take
 * one without the rest. At most MAX_TWIN_LINES, because this sits in a prompt beside
 * everything else the twin already holds.
 *
 * @param {object} input { profiles, patterns, predictions, now }
 * @returns {string} newline-separated lines
 */
export function describeForTwin({ profiles = [], patterns = [], predictions = [], now = new Date() } = {}) {
  const clock = now instanceof Date ? now : new Date(now);
  const nextBy = new Map((predictions || []).map((p) => [p.merchant_key, p]));
  const lines = [];

  /* Merchants first: the places are what a person recognises themselves in, and the
     dearest ones are the ones a question is most likely to be about. */
  const top = (profiles || []).filter((p) => p && p.times >= 2).slice(0, 6);
  for (const p of top) {
    const parts = [`${p.times} times since ${dayMonth(p.first_seen)}`];
    parts.push(`${p.amount_is_fixed && Number(p.amount_low) === Number(p.amount_high) ? 'always' : 'usually'} ${amountText(p.typical_amount)}`);
    const rhythm = rhythmWord(p);
    if (rhythm) parts.push(rhythm);
    let line = `${p.name}: ${parts.join(', ')}.`;
    const next = nextBy.get(p.merchant_key);
    if (next) line += ` Next expected around ${dayMonth(`${next.expected_on}T12:00:00Z`)}.`;
    else if (p.is_overdue) line += ` Last seen ${p.days_since_last} days ago, past its usual ${p.median_gap_days} days.`;
    lines.push(line);
  }

  for (const finding of (patterns || []).slice(0, 4)) {
    lines.push(plainSentence(`${finding.sentence} ${finding.detail || ''}`).trim());
  }

  /* Anything expected that no merchant line above already carried, and only where the
     rhythm is steady enough to be worth stating: a date the ledger half-believes reads,
     to the person, exactly like a date it is sure of. */
  const named = new Set(top.map((p) => p.merchant_key));
  const worthSaying = (predictions || []).filter((p) => !named.has(p.merchant_key) && Number(p.confidence) >= TWIN_PREDICTION_CONFIDENCE);
  for (const next of worthSaying.slice(0, 2)) {
    lines.push(`${next.name}: next expected around ${dayMonth(`${next.expected_on}T12:00:00Z`)}, about ${amountText(next.typical_amount)}.`);
  }

  if (!lines.length) return '';
  const header = `Money, read on ${dayMonth(clock.toISOString())}.`;
  return [header, ...lines].slice(0, MAX_TWIN_LINES).join('\n');
}
