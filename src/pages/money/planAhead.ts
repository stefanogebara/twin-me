/**
 * The days ahead on Plan, as a list (2026-09-21): the diary's events and the standing charges
 * sat inside a square and showed only when that day was opened, so a feed that had read 191
 * events looked like it did nothing. Pure.
 */
import type { MoneyPlanCell, MoneyPlanItem } from '../../services/api/moneyAPI';

export type AheadRow = { day: string; item: MoneyPlanItem };

/** Every item on a coming day of the month, soonest first, at most `max` rows. */
export function daysAhead(cells: MoneyPlanCell[], max = 12): AheadRow[] {
  const out: AheadRow[] = [];
  for (const c of cells) {
    if (c.past || c.today) continue;
    for (const item of c.items) out.push({ day: c.day, item });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day)).slice(0, max);
}
