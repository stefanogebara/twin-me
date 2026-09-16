/**
 * What day it is, where the person is.
 *
 * Everything here computed its days in UTC, and the product is for students in Spain, which
 * is an hour ahead in winter and two in summer. So between local midnight and two in the
 * morning the ledger still thought it was yesterday: a payment at 00:30 landed on the day
 * before on the plan's squares and counted against the day before's allowance, and the day's
 * number did not reset until the small hours (2026-09-16).
 *
 * One zone for the whole ledger, overridable with MONEY_TZ. A per-person zone belongs on the
 * person's own row, and when it exists it should be passed in here; until then the product's
 * own scope is the honest answer, and it is stated in one place instead of assumed in twenty.
 */
export const LEDGER_TZ = process.env.MONEY_TZ || 'Europe/Madrid';

/* en-CA gives YYYY-MM-DD, which is the shape every key in the ledger already has. */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: LEDGER_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const PARTS_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: LEDGER_TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
});
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const asDate = (at) => (at instanceof Date ? at : new Date(at));

/** The calendar day an instant falls on, where the person is: 'YYYY-MM-DD'. */
export function dayIn(at) {
  const d = asDate(at);
  return Number.isNaN(d.getTime()) ? '' : DAY_FMT.format(d);
}

/** The month an instant falls in: 'YYYY-MM'. */
export const monthIn = (at) => dayIn(at).slice(0, 7);

/** The first of that month, as the ledger writes a month: 'YYYY-MM-01'. */
export const firstOfMonthIn = (at) => `${monthIn(at)}-01`;

/** The pieces of a local time: year, month (1-12), day, weekday (0 Sunday), hour, minute. */
export function partsIn(at) {
  const d = asDate(at);
  if (Number.isNaN(d.getTime())) return null;
  const out = {};
  for (const p of PARTS_FMT.formatToParts(d)) {
    if (p.type === 'weekday') out.weekday = WEEKDAY_INDEX[p.value] ?? 0;
    else if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, weekday: out.weekday, hour: out.hour, minute: out.minute };
}

/** The day of the month, where the person is. */
export const dayOfMonthIn = (at) => partsIn(at)?.day ?? null;
/** The weekday, 0 Sunday, where the person is. */
export const weekdayIn = (at) => partsIn(at)?.weekday ?? null;

/**
 * The instant a local day begins, as a Date. Found by asking what the zone's offset is at
 * noon of that day, which is never inside a daylight-saving change.
 */
export function startOfDayIn(day) {
  const key = String(day).slice(0, 10);
  const noon = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return new Date(NaN);
  const offsetMs = offsetAt(noon);
  return new Date(new Date(`${key}T00:00:00Z`).getTime() - offsetMs);
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
export function offsetAt(at) {
  const d = asDate(at);
  const p = partsIn(d);
  if (!p) return 0;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, d.getUTCSeconds(), d.getUTCMilliseconds());
  return asUtc - d.getTime();
}

/** Whole days between two instants, counted as calendar days where the person is. */
export function daysBetweenIn(from, to) {
  const a = startOfDayIn(dayIn(from));
  const b = startOfDayIn(dayIn(to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
