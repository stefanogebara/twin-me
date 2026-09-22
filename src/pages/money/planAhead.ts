/**
 * The days ahead on Plan, as a list (2026-09-21): the standing charges and what is due sat
 * inside a square and showed only when that day was opened. Pure.
 *
 * A day in the diary that costs nothing is not on this list (2026-09-22). It was, and on a
 * real term that meant twenty-two rows of "STRATEGIES FOR COMPETING IN INDUSTRIES AND
 * MARKETS (Ses. 8) Live in-person" with no figure beside any of them, shouting down the
 * three rows that were actually about money. The diary's shape is the term strip's job and
 * the squares carry a dot an event; this list answers what is going to cost something.
 */
import type { MoneyPlanCell, MoneyPlanItem } from '../../services/api/moneyAPI';

export type AheadRow = { day: string; item: MoneyPlanItem };

/** Every item on a coming day of the month, soonest first, at most `max` rows. */
export function daysAhead(cells: MoneyPlanCell[], max = 12): AheadRow[] {
  const out: AheadRow[] = [];
  for (const c of cells) {
    if (c.past || c.today) continue;
    for (const item of c.items) {
      if (item.kind === 'calendar' && !(item.amount > 0)) continue;
      out.push({ day: c.day, item });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day)).slice(0, max);
}
