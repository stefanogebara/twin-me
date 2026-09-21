/**
 * What a day with something in the diary costs, against a day with nothing (2026-09-21).
 * The diary now keeps how many events each day held (calendar.js dayCounts), so this is
 * arithmetic on the plan's own squares. Pure, and silent until both sides have enough days
 * to mean anything.
 */
import type { MoneyPlanCell } from '../../services/api/moneyAPI';

export const MIN_DAYS_EACH = 4;
export type ClassSplit = { withClass: number; free: number; withDays: number; freeDays: number; ratio: number } | null;

export function classSplit(cells: MoneyPlanCell[], { min = MIN_DAYS_EACH } = {}): ClassSplit {
  const done = (cells || []).filter((c) => (c.past || c.today) && Number.isFinite(c.events as number));
  const busy = done.filter((c) => (c.events || 0) > 0);
  const free = done.filter((c) => (c.events || 0) === 0);
  if (busy.length < min || free.length < min) return null;
  const mean = (xs: MoneyPlanCell[]) => Math.round((xs.reduce((s, c) => s + (c.spent || 0), 0) / xs.length) * 100) / 100;
  const a = mean(busy); const b = mean(free);
  if (a <= 0 && b <= 0) return null;
  return { withClass: a, free: b, withDays: busy.length, freeDays: free.length, ratio: a > 0 ? Math.round((b / a) * 10) / 10 : 0 };
}
