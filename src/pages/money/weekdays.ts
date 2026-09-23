/**
 * Spending by day of the week over the last full weeks, computed on the page from the ledger
 * rows it already holds: the same shape the chat draws, now on Month (2026-09-21). Pure.
 */
import { ownCurrency } from '../../services/api/moneyAPI';
export type WeekdayPoint = { label: string; value: number; current?: boolean };

const DAY_MS = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The last `weeks` full weeks, Monday to Sunday, in the browser's own days; today's weekday marked. */
export function weekdayTotals(rows: { occurred_at: string; amount: number | string; verdict?: string | null; currency?: string | null; counts?: boolean }[], now: Date, locale: string, weeks = 8): WeekdayPoint[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (today.getDay() + 6) % 7;
  const monday = new Date(today.getTime() - sinceMonday * DAY_MS);
  const from = monday.getTime() - weeks * 7 * DAY_MS;
  const to = monday.getTime();
  const totals = [0, 0, 0, 0, 0, 0, 0];
  let any = false;
  for (const t of rows || []) {
    const amount = Number(t.amount);
    if (!(amount < 0) || t.verdict === 'not_me' || t.counts === false || !ownCurrency(t.currency)) continue;
    const at = new Date(t.occurred_at).getTime();
    if (Number.isNaN(at) || at < from || at >= to) continue;
    totals[new Date(at).getDay()] += Math.abs(amount);
    any = true;
  }
  if (!any) return [];
  const labelOf = (dow: number) => new Date(2026, 8, 6 + dow).toLocaleDateString(locale, { weekday: 'short' }); // 6 Sep 2026 is a Sunday, so 6 + dow lands on that weekday
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ label: labelOf(dow), value: r2(totals[dow]), current: dow === today.getDay() }));
}
