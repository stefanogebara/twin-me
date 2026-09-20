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
/* "unknown" read as a place called unknown (2026-09-20, "the largest was 22,36 EUR at unknown"). */
export const NO_NAME = 'a payment without a name';
const name = (t) => t.merchant_name || t.merchant_raw || t.merchant_key || NO_NAME;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The key n days after a day key, through noon so a daylight-saving change never shifts it. */
export const shiftDay = (key, n) => dayIn(new Date(startOfDayIn(key).getTime() + n * DAY_MS + 12 * 3600000));

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

/** A window's spending by a key (a kind of place, a place), largest first: [{ key, total, count }]. */
export function breakdown(rows, keyOf, max = 4) {
  const by = new Map();
  for (const t of rows) { const k = keyOf(t) || 'not read yet'; const b = by.get(k) || { key: k, total: 0, count: 0 }; b.total = r2(b.total + Math.abs(Number(t.amount))); b.count += 1; by.set(k, b); }
  return [...by.values()].sort((a, b) => b.total - a.total).slice(0, max);
}

/**
 * One stretch as a line the model can quote: its total, count and largest payment, and with
 * a categoryOf its kinds of place and its places, so the model never adds.
 */
export function stretchLine(label, transactions = [], from, to, { categoryOf = null, nameOf = null } = {}) {
  const inWindow = (transactions || []).filter(spending).filter((t) => at(t) >= from && at(t) < to);
  const w = sum(inWindow);
  if (!w.count) return `${label}: nothing spent.`;
  let line = `${label}: spent ${eur(w.total)} in ${w.count} payment${w.count === 1 ? '' : 's'}${w.biggest ? `, the largest ${w.biggest.name} ${eur(w.biggest.amount)}` : ''}.`;
  if (categoryOf && inWindow.length > 1) {
    const kinds = breakdown(inWindow, categoryOf).map((b) => `${b.key} ${eur(b.total)} (${b.count})`).join('; ');
    const places = breakdown(inWindow, nameOf || name, 3).map((b) => `${b.key} ${eur(b.total)} (${b.count})`).join('; ');
    line += ` By kind: ${kinds}. By place: ${places}.`;
  }
  return line;
}

/**
 * The same, as lines for the model: totals it may quote and never has to add. With a
 * categoryOf, each window also says its kinds of place and its places, so "how much on food
 * yesterday" and "how much at that bar this week" are answered from a line, not a sum.
 */
export function windowLines(transactions = [], now = new Date(), opts = {}) {
  const { windows, days } = spendWindows(transactions, now);
  const lines = windows.map((w) => stretchLine(w.label, transactions, w.from, w.to, opts));
  lines.push('Spent per day, last 7 days: ' + days.map((d) => `${d.weekday} ${d.day.slice(5)} ${d.count ? `${eur(d.total)} (${d.count})` : 'nothing'}`).join('; ') + '.');
  return lines;
}

/**
 * What a week usually costs: the mean of the last four full weeks, Monday to Sunday, each
 * named. "Per week on average" was answered with the last seven days (2026-09-20).
 */
export function weekAverageLine(transactions = [], now = new Date(), weeks = 4) {
  const rows = (transactions || []).filter(spending);
  const today = dayIn(now);
  const weekday = partsIn(now)?.weekday ?? new Date(now).getUTCDay();
  const monday = shiftDay(today, -((weekday + 6) % 7));
  const parts = [];
  let total = 0;
  for (let k = weeks; k >= 1; k -= 1) {
    const startKey = shiftDay(monday, -7 * k);
    const from = startOfDayIn(startKey).getTime();
    const to = startOfDayIn(shiftDay(startKey, 7)).getTime();
    const week = sum(rows.filter((t) => at(t) >= from && at(t) < to));
    total += week.total;
    const p = partsIn(new Date(from + 12 * 3600000));
    parts.push(`${p.day} ${MONTH_SHORT[p.month - 1]} ${week.count ? eur(week.total) : 'nothing'}`);
  }
  return `Average week, last ${weeks} full weeks (Monday to Sunday): ${eur(r2(total / weeks))}; the weeks: ${parts.join('; ')}.`;
}
