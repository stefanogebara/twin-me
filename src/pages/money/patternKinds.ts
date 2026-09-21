/**
 * The patterns You shows, of the seven the ledger works out. Kept: the ones that would change
 * what a person does (a habit by weekday, a payment far off its usual, where the card is
 * used, a kind of place with a rhythm). Dropped (2026-09-21): two payments booked together
 * ("0 minutes apart"), a charge that stays at its price, and which third of the month
 * costs most. Pure, so the choice is tested.
 */
export const PATTERN_KINDS_SHOWN = ['weekday_habit', 'amount_outlier', 'place_habit', 'category_rhythm'] as const;
export function worthShowing(kind: string): boolean {
  return (PATTERN_KINDS_SHOWN as readonly string[]).includes(kind);
}
