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
import { withPerson, currentPerson } from './scope.js';

export const LEDGER_TZ = process.env.MONEY_TZ || 'Europe/Madrid';

/*
 * Since 2026-09-23 every helper takes the person's zone as its last argument (profile.js
 * reads it from their row, else their country's, else LEDGER_TZ). A caller that passes
 * nothing gets the deployment's zone, so the module reads the same as before for the
 * students in Spain it was written for. Formatters are built once per zone.
 */
const DAY_FMTS = new Map();
const PARTS_FMTS = new Map();

/*
 * The person's zone for the whole of one request or one cron turn, without threading it
 * through every signature: an AsyncLocalStorage the entry point sets (the money router's
 * middleware, a cron's per-person loop, the WhatsApp inbound) and every helper here reads
 * when it is given no zone. Outside any such scope the deployment's zone stands.
 */
export function withZone(tz, fn) { return withPerson({ ...(currentPerson() || {}), timezone: knownZone(tz) ? tz : LEDGER_TZ }, fn); }
export function currentZone() { const tz = currentPerson()?.timezone; return knownZone(tz) ? tz : LEDGER_TZ; }
const zoneOf = (tz) => (typeof tz === 'string' && tz ? tz : currentZone());
/* en-CA gives YYYY-MM-DD, which is the shape every key in the ledger already has. */
function dayFmt(tz) {
  const zone = zoneOf(tz);
  let f = DAY_FMTS.get(zone);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch { f = dayFmt(LEDGER_TZ); }
    DAY_FMTS.set(zone, f);
  }
  return f;
}
function partsFmt(tz) {
  const zone = zoneOf(tz);
  let f = PARTS_FMTS.get(zone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
      });
    } catch { f = partsFmt(LEDGER_TZ); }
    PARTS_FMTS.set(zone, f);
  }
  return f;
}
/** Whether a zone name is one the runtime knows. */
export function knownZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; }
}
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const asDate = (at) => (at instanceof Date ? at : new Date(at));

/** The calendar day an instant falls on, where the person is: 'YYYY-MM-DD'. */
export function dayIn(at, tz) {
  const d = asDate(at);
  return Number.isNaN(d.getTime()) ? '' : dayFmt(tz).format(d);
}

/** The month an instant falls in: 'YYYY-MM'. */
export const monthIn = (at, tz) => dayIn(at, tz).slice(0, 7);

/** The first of that month, as the ledger writes a month: 'YYYY-MM-01'. */
export const firstOfMonthIn = (at, tz) => `${monthIn(at, tz)}-01`;

/** The pieces of a local time: year, month (1-12), day, weekday (0 Sunday), hour, minute. */
export function partsIn(at, tz) {
  const d = asDate(at);
  if (Number.isNaN(d.getTime())) return null;
  const out = {};
  for (const p of partsFmt(tz).formatToParts(d)) {
    if (p.type === 'weekday') out.weekday = WEEKDAY_INDEX[p.value] ?? 0;
    else if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, weekday: out.weekday, hour: out.hour, minute: out.minute };
}

/** The day of the month, where the person is. */
export const dayOfMonthIn = (at, tz) => partsIn(at, tz)?.day ?? null;
/** The weekday, 0 Sunday, where the person is. */
export const weekdayIn = (at, tz) => partsIn(at, tz)?.weekday ?? null;

/**
 * The instant a local day begins, as a Date. Found by asking what the zone's offset is at
 * noon of that day, which is never inside a daylight-saving change.
 */
export function startOfDayIn(day, tz) {
  const key = String(day).slice(0, 10);
  const noon = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return new Date(NaN);
  const offsetMs = offsetAt(noon, tz);
  return new Date(new Date(`${key}T00:00:00Z`).getTime() - offsetMs);
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
export function offsetAt(at, tz) {
  const d = asDate(at);
  const p = partsIn(d, tz);
  if (!p) return 0;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, d.getUTCSeconds(), d.getUTCMilliseconds());
  return asUtc - d.getTime();
}

/** Whole days between two instants, counted as calendar days where the person is. */
export function daysBetweenIn(from, to, tz) {
  const a = startOfDayIn(dayIn(from, tz), tz);
  const b = startOfDayIn(dayIn(to, tz), tz);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
