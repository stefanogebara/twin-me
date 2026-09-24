/**
 * What the figure over the list of standing charges is actually counting.
 *
 * The line said "114,12 EUR of it leaves every month" over six rows, and the six rows added
 * up to 134,12 EUR, because Facebook comes back every two weeks and the figure only sums the
 * monthly ones (2026-09-24). "Of it" was carrying the whole difference. Anyone who added the
 * card up got a different number from the one above it and had no way to tell which was
 * wrong. The figure stays as it is, and the line says how many of the rows it covers.
 * Pure: the series in, the parts of the sentence out.
 */
import type { MoneyRecurring } from '../../services/api/moneyAPI';

export type MonthlyLoad = { amount: number; monthly: number; total: number; all: boolean };

export function monthlyLoad(recurring: MoneyRecurring[]): MonthlyLoad {
  const monthlyOnes = recurring.filter((r) => r.cadence === 'monthly');
  const amount = Math.round(monthlyOnes.reduce((sum, r) => sum + Math.abs(Number(r.typical_amount) || 0), 0) * 100) / 100;
  return { amount, monthly: monthlyOnes.length, total: recurring.length, all: monthlyOnes.length === recurring.length };
}
