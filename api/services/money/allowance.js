/**
 * Safe to spend today.
 * ====================
 * The one number a person opens a money app for: whether tonight is affordable. Everything
 * else in this product looks backwards; this looks at the rest of the month.
 *
 * It is never "what is in your account". The bank feed carries no balance, so a number
 * claiming to be one would be a lie. It is what is left of a budget the person can
 * recognise, spread over the days that remain, with what today already owes taken off.
 *
 * The budget is what they told us comes in each month, and otherwise their own typical
 * month. The sentence under the number always names which, because a number whose basis is
 * hidden is a guess wearing a suit.
 *
 * Silence over softening: with neither a stated income nor two complete months behind them,
 * this says nothing, and says what would let it speak.
 */

import { forecast, months, listFacts } from './store.js';

/** Two complete months is the least that can stand for "a typical month" of this person. */
export const MIN_MONTHS_FOR_TYPICAL = 2;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function median(values) {
  const xs = [...values].sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** What the person said comes in each month, summed over everything they named. */
export function statedIncome(facts = []) {
  const amounts = facts
    .filter((f) => f && f.kind === 'income')
    .map((f) => Math.abs(Number(f.amount) || 0))
    .filter((n) => n > 0);
  return amounts.length ? r2(amounts.reduce((s, n) => s + n, 0)) : null;
}

/** Their own typical month: the middle of the complete months behind them. */
export function typicalMonth(segments = []) {
  const complete = segments.filter((m) => m && m.complete && Number(m.spent) > 0);
  if (complete.length < MIN_MONTHS_FOR_TYPICAL) return null;
  return r2(median(complete.map((m) => Number(m.spent))));
}

/** The events today that the calendar already expects to cost something. */
export function eventsToday(items = [], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return items
    .filter((i) => i && i.day === today && Number(i.amount) > 0)
    .map((i) => ({ title: String(i.title || 'Something on today'), amount: r2(i.amount) }));
}

/**
 * The number and the words for it. Pure: everything it needs is passed in, so the rules can
 * be read in one place and tested without a database.
 */
export function safeToSpend({ cast = null, segments = [], facts = [], now = new Date() } = {}) {
  const none = (why) => ({
    amount: null, basis: null, budget: null, free: null, over: false,
    days_left: cast ? cast.days_left : null, today_events: [], sentence: null, why,
  });

  if (!cast) return none('There is no month to read yet.');

  const income = statedIncome(facts);
  const typical = income === null ? typicalMonth(segments) : null;
  const budget = income ?? typical;
  if (budget === null) {
    return none('It does not know what a month of yours looks like yet. Tell it what comes in, or give it one more full month.');
  }

  const spent = Number(cast.spent) || 0;
  const committed = Number(cast.committed) || 0;
  const calendarAhead = Number(cast.calendar_ahead) || 0;
  const todays = eventsToday(cast.calendar_items || [], now);
  const todaysCost = r2(todays.reduce((s, e) => s + e.amount, 0));

  /* What is free for the rest of the month: the budget, less what has gone, less what is
     already spoken for, whether by a standing charge or by something in the diary. */
  const free = r2(budget - spent - committed - calendarAhead);
  /* Today counts: a person spending this evening has today, not only the days after it. */
  const daysIncludingToday = Math.max(1, (Number(cast.days_left) || 0) + 1);
  const perDay = free / daysIncludingToday;
  /* Today's own events are already inside `free`; what is left for anything else today is
     the day's share minus what the diary expects of it. */
  const amount = r2(Math.max(0, perDay - todaysCost));
  const over = free < 0;

  const basisWord = income !== null
    ? `the ${money(budget)} you said comes in`
    : `your usual month of ${money(budget)}`;
  const spoken = [];
  if (committed > 0) spoken.push(`${money(committed)} still to be charged`);
  if (calendarAhead > 0) spoken.push(`${money(calendarAhead)} the diary expects`);

  let sentence;
  if (over) {
    sentence = `That is ${money(Math.abs(free))} past ${basisWord}, with ${daysText(daysIncludingToday)} to go.`;
  } else {
    sentence = `From ${basisWord}, after ${money(spent)} spent${spoken.length ? ` and ${spoken.join(' and ')}` : ''}, over ${daysText(daysIncludingToday)}.`;
  }
  if (!over && todays.length) {
    sentence += ` ${todays.map((e) => `${e.title} usually costs about ${money(e.amount)}`).join(', and ')}, already taken off.`;
  }

  return {
    amount: over ? 0 : amount,
    basis: income !== null ? 'income' : 'typical',
    budget,
    free,
    over,
    days_left: Number(cast.days_left) || 0,
    today_events: todays,
    sentence,
    why: null,
  };
}

/* The sentence is written for the screen, so it carries the euro sign the rest of the app
   uses; the line that rides in a prompt trades it for the letters. */
function money(n) {
  const amount = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(Number(n) || 0));
  /* A narrow no-break space between the number and the sign. */
  return `${amount}\u202F\u20AC`;
}

function daysText(days) {
  return days === 1 ? 'today' : `${days} days`;
}

/** The same, for a person: three reads, no model, no network beyond the ledger. */
export async function todayAllowance(userId, now = new Date()) {
  const [cast, segments, facts] = await Promise.all([
    forecast(userId, now).catch(() => null),
    months(userId, now).catch(() => []),
    listFacts(userId).catch(() => []),
  ]);
  return safeToSpend({ cast, segments, facts, now });
}

/** One line for a prompt, so the twin can answer "can I afford tonight?" the same way. */
export function allowanceLine(a) {
  if (!a || a.amount === null) return null;
  const line = a.over
    ? `Safe to spend today: nothing. ${a.sentence}`
    : `Safe to spend today: ${money(a.amount)}. ${a.sentence}`;
  return line.replace(/\u20ac/gi, 'EUR');
}
