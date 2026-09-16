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
import { studentMonth } from './priors.js';
import { keepAmount } from './intention.js';
import { dayIn, weekdayIn } from './zone.js';

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

/** How far the day's share may move from an even split, either way. */
export const SHAPE_LIMIT = 0.3;

/**
 * Today's share of what is left, from the person's own week.
 *
 * `baseline` is the median spent on each weekday, Sunday first (projection.js). Returns
 * `{ share, ratio, weekday }` where share is today's part of the whole, and ratio is how it
 * compares with an even split; null when there is no shape to read.
 */
export function weekdayShare(baseline, now = new Date(), daysIncludingToday = 1) {
  if (!Array.isArray(baseline) || baseline.length !== 7) return null;
  const weights = baseline.map((x) => Math.max(0, Number(x) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const from = weekdayIn(now);
  let sum = 0;
  for (let i = 0; i < daysIncludingToday; i += 1) sum += weights[(from + i) % 7];
  if (!(sum > 0)) return null;
  const share = weights[from] / sum;
  const even = 1 / daysIncludingToday;
  return { share, ratio: r2(share / even), weekday: from };
}

/** The events today that the calendar already expects to cost something. */
export function eventsToday(items = [], now = new Date()) {
  const today = dayIn(now);
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
    days_left: cast ? cast.days_left : null, spent: null, committed: null, calendar_ahead: null, shape: null, today_events: [], sentence: null, why,
  });

  if (!cast) return none('There is no month to read yet.');

  const income = statedIncome(facts);
  const typical = income === null ? typicalMonth(segments) : null;
  /* Before two full months and without a stated income, a student whose rent is known can
     still be read against a typical student month on top of that rent (priors.js). The
     sentence names it as typical, never as theirs. */
  const student = income === null && typical === null ? studentMonth(facts) : null;
  /* What they said they want left comes off the top: a budget is what may go, not what comes in. */
  const keep = keepAmount(facts);
  const base = income ?? typical ?? (student ? student.amount : null);
  const budget = base === null ? null : r2(base - (keep ?? 0));
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
  /* The days left are not worth the same to this person. Their own week, from the projection,
     gives today its share: a Friday carries more than a Tuesday, because theirs does. The
     shape is held inside a third either way, so the number stays a number a person can act
     on and never swings on one loud weekend (2026-09-16). */
  const shape = weekdayShare(cast.weekday_baseline, now, daysIncludingToday);
  const shaped = shape ? free * shape.share : perDay;
  const bounded = Math.max(perDay * (1 - SHAPE_LIMIT), Math.min(perDay * (1 + SHAPE_LIMIT), shaped));
  /* Today's own events are already inside `free`; what is left for anything else today is
     the day's share minus what the diary expects of it. */
  const amount = r2(Math.max(0, bounded - todaysCost));
  const over = free < 0;

  const keepWord = keep ? `, keeping ${money(keep)}` : '';
  const basisWord = income !== null
    ? `the ${money(base)} you said comes in${keepWord}`
    : typical !== null
      ? `your usual month of ${money(base)}${keepWord}`
      : `${student.label}, ${money(base)}${keepWord}`;
  const spoken = [];
  if (committed > 0) spoken.push(`${money(committed)} still to be charged`);
  if (calendarAhead > 0) spoken.push(`${money(calendarAhead)} the diary expects`);

  let sentence;
  if (over) {
    sentence = `That is ${money(Math.abs(free))} past ${basisWord}, with ${daysText(daysIncludingToday)} to go.`;
  } else {
    sentence = `From ${basisWord}, after ${money(spent)} spent${spoken.length ? ` and ${spoken.join(' and ')}` : ''}, over ${daysText(daysIncludingToday)}.`;
  }
  /* What the diary expects today used to be appended here in English. It is data the screen
     already has (today_events), and the screen says it in the reader's own language, so the
     sentence keeps to the basis and stops being two languages at once (2026-09-16). */

  return {
    amount: over ? 0 : amount,
    basis: income !== null ? 'income' : typical !== null ? 'typical' : 'student_prior',
    /* The month the budget rests on, before the keep comes off: what they said comes in, or
       their typical month, or the student prior. The screen draws the month against it. */
    base: r2(base),
    keep: keep ?? null,
    budget,
    free,
    over,
    days_left: Number(cast.days_left) || 0,
    /* What the screen needs to say this line itself: the numbers behind it, the word for a
       basis that is not theirs, and the shape of the week when it moved today's share. */
    basis_label: student ? student.label : null,
    /* the numbers behind the line */
    spent: r2(spent),
    committed: r2(committed),
    calendar_ahead: r2(calendarAhead),
    shape: shape && Math.abs(shape.ratio - 1) >= 0.1 ? { weekday: shape.weekday, ratio: shape.ratio } : null,
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
