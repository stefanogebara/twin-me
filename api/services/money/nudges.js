/**
 * The two lines with evidence behind them, and the rule that retires a line people mute.
 * ====================================================================================
 * Of everything a money app could say unprompted, only two kinds have a controlled trial
 * showing they help, and the rest have trials showing they annoy:
 *
 *   1. A charge ahead that the month cannot carry. Auto-enrolling 1.5 million people into
 *      pre-charge alerts cut unarranged overdraft charges by about a quarter (FCA
 *      Occasional Paper 36, 2018). Here: the standing charges landing in the next week,
 *      when they come to more than what is left of the month.
 *   2. A named expense on its way. Reminders that name the specific thing raised saving
 *      by 3 percentage points across three banks; framing and timing did not (Karlan,
 *      McConnell, Mullainathan, Zinman 2016). Here: the single largest charge due in the
 *      next three days, by name, amount and day.
 *
 * What is refused: commentary on spending ("your spending is weird"), anything with a
 * mood, and any "pay now" line, since this system holds no balance and cannot know what
 * paying now would push under (Medina 2021: card reminders raised overdraft fees 9%).
 * Saying nothing is the default option (Nahum-Shani et al. 2018, JITAI).
 *
 * Muting is a cost, not noise (Damgaard and Gravert 2018). A kind of line that people mark
 * "not me" more often than they act on, over at least thirty deliveries, is retired for
 * that person: it stops being computed, and the record that retired it is kept.
 *
 * Pure: the forecast, the allowance and the readings in; findings in the analyst's shape
 * out, so they pour into the same list as everything else the money says.
 */
import { dayIn } from './zone.js';

export const CHARGE_AHEAD = 'charge_ahead';
export const NAMED_EXPENSE = 'named_expense';
export const NUDGE_KINDS = Object.freeze([CHARGE_AHEAD, NAMED_EXPENSE]);

/** How far ahead a charge counts as ahead. */
export const AHEAD_DAYS = 7;
/** How close a named expense has to be to be worth naming. */
export const NAMED_DAYS = 3;
/** Below this a named expense is not worth an interruption. */
export const NAMED_MIN = 20;
/** Deliveries before a kind can be judged. */
export const RETIRE_AFTER = 30;

const DAY = 86400000;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
/* The formatter puts a narrow no-break space before the sign; a sentence wants a plain one. */
/* The same form the analyst uses on the screen: Intl's own, sign and no-break space kept. */
const euro = (n) => EUR.format(Math.abs(Number(n) || 0));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
/* The day a person is living, not the day in UTC: see zone.js. */
const dayOf = (d) => dayIn(d);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dayWord(iso, now) {
  const d = new Date(`${iso}T12:00:00Z`);
  const today = new Date(`${dayOf(now)}T12:00:00Z`);
  const diff = Math.round((d.getTime() - today.getTime()) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return WEEKDAYS[d.getUTCDay()];
  return `the ${d.getUTCDate()}${['th', 'st', 'nd', 'rd'][(d.getUTCDate() % 10 > 3 || [11, 12, 13].includes(d.getUTCDate() % 100)) ? 0 : d.getUTCDate() % 10]}`;
}

/**
 * Every standing charge the forecast expects, dated, named and amounted, in one shape:
 * detected series, stated commitments, and diary events with a learned cost.
 */
export function upcoming(cast, now = new Date()) {
  if (!cast) return [];
  const today = dayOf(now);
  const items = [];
  for (const c of cast.committed_items || []) {
    items.push({ name: c.merchant_name || c.merchant_key, amount: r2(c.typical_amount), on: dayOf(c.next_expected), source: 'series' });
  }
  for (const c of cast.commitment_items || []) {
    items.push({ name: c.subject || 'A standing charge', amount: r2(c.amount), on: c.due_on, source: 'stated' });
  }
  /* The calendar's own shape is { title, day, amount } (calendarForecast in calendar.js).
     Reading only e.expected.amount and e.on meant a priced day in the diary never became a
     charge ahead, the same mismatch that kept it off the plan's squares (2026-09-16). */
  for (const e of cast.calendar_items || []) {
    const amount = Number(e.amount ?? e.expected?.amount) || 0;
    if (amount > 0) items.push({ name: e.title || e.label, amount: r2(amount), on: dayOf(e.day || e.on), source: 'calendar' });
  }
  return items.filter((i) => i.on && i.on >= today && Number.isFinite(i.amount) && i.amount > 0).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : b.amount - a.amount));
}

/**
 * The charges landing in the next week, when they come to more than what is left of the
 * month before them. Null when the month can carry them, or when there is no basis to
 * measure against: a line about a shortfall with no budget behind it is a guess.
 */
export function chargeAhead({ cast = null, allowance = null, now = new Date() } = {}) {
  if (!cast || !allowance || allowance.free === null || allowance.free === undefined) return null;
  const horizon = dayOf(new Date(now.getTime() + AHEAD_DAYS * DAY));
  const ahead = upcoming(cast, now).filter((i) => i.on <= horizon);
  if (!ahead.length) return null;
  const total = r2(ahead.reduce((s, i) => s + i.amount, 0));
  /* `free` already has the month's committed charges taken off; what is left before these
     land is free plus what they will take. */
  const leftBefore = r2(Number(allowance.free) + Number(cast.committed || 0));
  if (total <= leftBefore) return null;
  const last = ahead[ahead.length - 1];
  const names = ahead.slice(0, 3).map((i) => `${i.name} ${euro(i.amount)}`).join(', ');
  return {
    kind: CHARGE_AHEAD,
    month: last.on,
    sentence: `${euro(total)} of charges land by ${dayWord(last.on, now)}. That is more than the ${euro(Math.max(0, leftBefore))} left of your month.`,
    detail: `${names}${ahead.length > 3 ? ` and ${ahead.length - 3} more` : ''}.`,
    numbers: { total, left_before: leftBefore, count: ahead.length, by: last.on, items: ahead },
    receipts: [],
    evidence_count: ahead.length,
  };
}

/**
 * The single largest charge due in the next three days, named. Null under the floor, and
 * null when it is the same charge the shortfall line already names, so a person is never
 * told the same thing twice on one screen.
 */
export function namedExpense({ cast = null, now = new Date(), except = null } = {}) {
  if (!cast) return null;
  const horizon = dayOf(new Date(now.getTime() + NAMED_DAYS * DAY));
  const soon = upcoming(cast, now).filter((i) => i.on <= horizon && i.amount >= NAMED_MIN);
  if (!soon.length) return null;
  const top = [...soon].sort((a, b) => b.amount - a.amount)[0];
  if (except && except.numbers && (except.numbers.items || []).some((i) => i.name === top.name && i.on === top.on)) return null;
  return {
    kind: NAMED_EXPENSE,
    month: top.on,
    sentence: `${top.name}, ${euro(top.amount)}, leaves ${dayWord(top.on, now)}.`,
    detail: null,
    numbers: { name: top.name, amount: top.amount, on: top.on, source: top.source },
    receipts: [],
    evidence_count: 1,
  };
}

/**
 * Kinds this person has muted more than acted on, over at least RETIRE_AFTER deliveries.
 * A delivery is a stored reading of that kind; a mute is the verdict "not_me"; an act is
 * the verdict "true".
 * @param {object[]} readings  money_readings rows { kind, verdict }
 * @returns {Set<string>}
 */
export function retiredKinds(readings = [], { after = RETIRE_AFTER } = {}) {
  const tally = new Map();
  for (const r of readings || []) {
    if (!r || !r.kind) continue;
    if (!tally.has(r.kind)) tally.set(r.kind, { delivered: 0, muted: 0, acted: 0 });
    const t = tally.get(r.kind);
    t.delivered += 1;
    if (r.verdict === 'not_me') t.muted += 1;
    if (r.verdict === 'true') t.acted += 1;
  }
  const out = new Set();
  for (const [kind, t] of tally) if (t.delivered >= after && t.muted > t.acted) out.add(kind);
  return out;
}

/** The lines worth saying today, in the analyst's shape, or none. */
export function nudgeFindings({ cast = null, allowance = null, now = new Date() } = {}) {
  const out = [];
  const shortfall = chargeAhead({ cast, allowance, now });
  if (shortfall) out.push(shortfall);
  const named = namedExpense({ cast, now, except: shortfall });
  if (named) out.push(named);
  return out;
}
