/**
 * What a day with something in the diary costs, against a day with nothing.
 *
 * The first cut of this averaged the two kinds of day (2026-09-21). Measured against
 * Stefano's own ledger the next day, the average lies: half of every kind of day costs
 * nothing at all and two days of the ninety carry 263 and 146 EUR, so the mean says "a day
 * with class costs 27 EUR and a free day 15" when the middle day of each costs 0,70 and
 * nothing. It reads as a pattern and there is none - the same measurement showed that
 * splitting the day's forecast by the diary makes it worse, not better
 * (scripts/money/evaluate-class-days.mjs).
 *
 * So: the middle day of each kind, never the average, and silence unless the two are
 * genuinely far apart in a person's own euros. Pure.
 */
import type { MoneyPlanCell } from '../../services/api/moneyAPI';

export const MIN_DAYS_EACH = 4;
/* Below this the difference is one coffee, and a screen should not make a claim of it. */
export const MIN_MIDDLE = 5;
/* The bigger middle has to be half as big again as the smaller before it means anything. */
export const MIN_RATIO = 1.5;

export type ClassSplit = {
  withClass: number; free: number; withDays: number; freeDays: number;
  withFree: number; freeFree: number; ratio: number;
} | null;

const middle = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function classSplit(cells: MoneyPlanCell[], { min = MIN_DAYS_EACH } = {}): ClassSplit {
  const done = (cells || []).filter((c) => (c.past || c.today) && Number.isFinite(c.events as number));
  const busy = done.filter((c) => (c.events || 0) > 0);
  const free = done.filter((c) => (c.events || 0) === 0);
  if (busy.length < min || free.length < min) return null;
  const a = r2(middle(busy.map((c) => c.spent || 0)));
  const b = r2(middle(free.map((c) => c.spent || 0)));
  const top = Math.max(a, b); const bottom = Math.min(a, b);
  if (top < MIN_MIDDLE) return null;
  if (bottom > 0 && top / bottom < MIN_RATIO) return null;
  return {
    withClass: a, free: b, withDays: busy.length, freeDays: free.length,
    /* How many of each cost nothing at all: the fact behind the middle. */
    withFree: busy.filter((c) => !(c.spent > 0)).length,
    freeFree: free.filter((c) => !(c.spent > 0)).length,
    ratio: bottom > 0 ? Math.round((top / bottom) * 10) / 10 : 0,
  };
}
