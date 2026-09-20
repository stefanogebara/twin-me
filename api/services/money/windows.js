/**
 * What a stretch of time cost, computed for the chat (2026-09-20).
 *
 * Asked "how much did I spend last night" and "how much yesterday", the chat gave the lines
 * one by one and no total, because its rules forbid it adding up and its context held only
 * the month. These are the totals a person means, worked out here in the person's own days
 * (Europe/Madrid) so the model can quote them and never sum: today so far, yesterday, last
 * night, this week, last week, the last seven days, and each of those days on its own.
 * Spending only: money out, not a line they said is not theirs.
 */
import { dayIn, startOfDayIn, partsIn } from './zone.js';

const DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n) => `${DECIMAL.format(Math.abs(Number(n) || 0))} EUR`;
const r2 = (n) => Math.round(n * 100) / 100;
const DAY_MS = 86400000;
const spending = (t) => Number(t.amount) < 0 && t.counts !== false && t.verdict !== 'not_me' && (!t.currency || t.currency === 'EUR');
const at = (t) => new Date(t.occurred_at).getTime();
const name = (t) => t.merchant_name || t.merchant_raw || t.merchant_key || 'unknown';
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function sum(rows) {
  const total = r2(rows.reduce((s, t) => s + Math.abs(Number(t.amount)), 0));
  const biggest = rows.reduce((b, t) => (!b || Math.abs(Number(t.amount)) > Math.abs(Number(b.amount)) ? t : b), null);
  return { total, count: rows.length, biggest: biggest ? { name: name(biggest), amount: r2(Math.abs(Number(biggest.amount))) } : null };
}

/** The windows, as numbers: { key, label, from, to, total, count, biggest }. */
export function spendWindows(transactions = [], now = new Date()) {
  const rows = (transactions || []).filter(spending);
  const today = dayIn(now);
  const dayStart = startOfDayIn(today).getTime();
  const yStart = dayStart - DAY_MS;
  const parts = partsIn(now);
  const weekday = parts?.weekday ?? new Date(now).getUTCDay(); // 0 Sunday
  const sinceMonday = (weekday + 6) % 7;
  const weekStart = dayStart - sinceMonday * DAY_MS;
  const lastWeekStart = weekStart - 7 * DAY_MS;
  const within = (from, to) => rows.filter((t) => at(t) >= from && at(t) < to);
  const windows = [
    { key: 'today', label: 'Today so far', from: dayStart, to: now.getTime() + 60000 },
    { key: 'yesterday', label: 'Yesterday', from: yStart, to: dayStart },
    { key: 'last_night', label: 'Last night (yesterday 18:00 to 06:00 today)', from: yStart + 18 * 3600000, to: dayStart + 6 * 3600000 },
    { key: 'this_week', label: 'This week (since Monday)', from: weekStart, to: now.getTime() + 60000 },
    { key: 'last_week', label: 'Last week (Monday to Sunday)', from: lastWeekStart, to: weekStart },
    { key: 'last_7_days', label: 'Last 7 days', from: dayStart - 6 * DAY_MS, to: now.getTime() + 60000 },
  ].map((w) => ({ ...w, ...sum(within(w.from, w.to)) }));
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const from = dayStart - i * DAY_MS;
    const key = dayIn(new Date(from + 12 * 3600000));
    days.push({ day: key, weekday: WEEKDAY[partsIn(new Date(from + 12 * 3600000))?.weekday ?? 0], ...sum(within(from, from + DAY_MS)) });
  }
  return { windows, days };
}

/** The same, as lines for the model: totals it may quote and never has to add. */
export function windowLines(transactions = [], now = new Date()) {
  const { windows, days } = spendWindows(transactions, now);
  const lines = [];
  for (const w of windows) {
    if (!w.count) { lines.push(`${w.label}: nothing spent.`); continue; }
    lines.push(`${w.label}: spent ${eur(w.total)} in ${w.count} payment${w.count === 1 ? '' : 's'}${w.biggest ? `, the largest ${w.biggest.name} ${eur(w.biggest.amount)}` : ''}.`);
  }
  lines.push('Spent per day, last 7 days: ' + days.map((d) => `${d.weekday} ${d.day.slice(5)} ${d.count ? `${eur(d.total)} (${d.count})` : 'nothing'}`).join('; ') + '.');
  return lines;
}
