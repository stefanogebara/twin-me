/**
 * The plan: a month as days, what each one cost and what the coming ones are expected to.
 * =======================================================================================
 * Everything on the Today page is a sentence or a strip; the planner's dated knowledge
 * (a charge due on the 22nd, a transfer that comes on the 24th, the week of exams, the
 * range given for tomorrow) has nowhere to be seen as a calendar. This lays one month out
 * as cells:
 *
 *   a past day     what it cost, how many payments, the range it was given the night
 *                  before and whether it held (from the strip the band already keeps)
 *   today          what it has cost so far
 *   a coming day   what is expected on it: a recurring charge, a commitment such as rent,
 *                  money that comes in, a calendar day with a cost the diary has learned,
 *                  and for tomorrow the range the band gives
 *   any day        the note the person wrote on it, in their words
 *
 * Nothing here predicts: every figure is the projection's, the strip's or the ledger's.
 * Pure: the forecast, the rows and the facts in, cells out. The page phrases nothing but
 * the cells; the one sentence this offers (planLine) is computed.
 */
import { dayIn, partsIn } from './zone.js';
import { calendarFromFacts } from './calendar.js';
import { money } from './currency.js';

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const iso = (d) => dayIn(d);
const euro = (n) => money(Math.abs(Number(n) || 0)).replace(/\u20ac/g, 'EUR').replace(/[\u00a0\u202f]/g, ' ');

/** The subject a note on a day is kept under: `day-2026-09-22`. Pure. */
export const NOTE_SUBJECT = (day) => `day-${String(day).slice(0, 10)}`;
export const isDayNote = (fact) => Boolean(fact && fact.kind === 'note' && /^day-\d{4}-\d{2}-\d{2}$/.test(String(fact.subject || '')));

/** The first of the month asked for, or of now; always UTC noon-safe. */
function monthStart(month, now) {
  const m = /^(\d{4})-(\d{2})/.exec(String(month || ''));
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const here = partsIn(now);
  return new Date(Date.UTC(here.year, here.month - 1, 1));
}

/**
 * One month as cells.
 *
 * @param forecast   the month projection (store.forecast), for its dated items and the strip
 * @param transactions   the ledger rows that fall in the month (any extra rows are ignored)
 * @param facts      the person's facts; only day notes are read
 * @param month      'YYYY-MM' to lay out; the forecast's items only apply to their own month
 * @param isSpending which rows count as spending; by default money out
 */
export function monthPlan({ forecast = null, transactions = [], facts = [], month = null, now = new Date(), isSpending = null } = {}) {
  const spending = isSpending || ((t) => Number(t.amount) < 0);
  const start = monthStart(month, now);
  const monthKey = iso(start).slice(0, 7);
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const today = iso(now);
  /* Monday first, as a Spanish calendar reads. */
  const firstWeekday = (start.getUTCDay() + 6) % 7;

  const cells = new Map();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const day = `${monthKey}-${String(d).padStart(2, '0')}`;
    cells.set(day, {
      day, dom: d, weekday: (firstWeekday + d - 1) % 7,
      past: day < today, today: day === today,
      spent: 0, count: 0, received: 0,
      said: null, hit: null,
      expected: 0, items: [], events: 0,
      rows: [],
      note: null,
    });
  }
  /* The first ten characters of a timestamp are its UTC day, so a payment at half past
     midnight landed on the square before (2026-09-16). A plain day string is unchanged:
     read as midnight UTC it is still the same day where the person is. */
  const cellOf = (when) => (when ? cells.get(iso(when)) || null : null);

  /* What the days cost: the ledger's own rows, spending only, money in kept aside. */
  for (const t of transactions || []) {
    const c = t && t.occurred_at ? cellOf(t.occurred_at) : null;
    if (!c) continue;
    const amount = Number(t.amount) || 0;
    if (amount < 0 && spending(t)) { c.spent = r2(c.spent + Math.abs(amount)); c.count += 1; } else if (amount > 0) c.received = r2(c.received + amount);
    /* The day's own rows, biggest first, so the page can show what the figure was. */
    if (amount < 0 ? spending(t) : amount > 0) {
      c.rows.push({ id: t.id, merchant: t.merchant_raw || t.merchant_key || null, amount: r2(amount), occurred_at: t.occurred_at });
      c.rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      if (c.rows.length > 20) c.rows.length = 20;
    }
  }

  /* The range each past day was given the night before, and whether it held. */
  for (const m of (forecast && forecast.days && forecast.days.days) || []) {
    const c = cellOf(m.day);
    if (!c || !m.said) continue;
    c.said = { low: r2(m.said.low), high: r2(m.said.high) };
    c.hit = m.hit === true ? true : m.hit === false ? false : null;
  }
  if (forecast && forecast.tomorrow && forecast.tomorrow.day) {
    const c = cellOf(forecast.tomorrow.day);
    if (c && !c.past) c.said = { low: r2(forecast.tomorrow.low), high: r2(forecast.tomorrow.high) };
  }

  /* What the coming days carry, from the projection: its items apply to their own month only. */
  const fcMonth = forecast && forecast.month ? String(forecast.month).slice(0, 7) : null;
  if (forecast && fcMonth === monthKey) {
    const put = (when, item) => {
      const c = cellOf(when);
      if (!c || c.past) return;
      c.items.push(item);
      if (item.kind === 'income') return;
      c.expected = r2(c.expected + (Number(item.amount) || 0));
    };
    for (const it of forecast.committed_items || []) put(it.next_expected, { kind: 'charge', label: it.merchant_name || it.merchant_key || 'A charge', amount: r2(Math.abs(Number(it.typical_amount) || 0)), cadence: it.cadence || null });
    for (const it of forecast.commitment_items || []) put(it.due_on, { kind: 'commitment', label: it.subject || 'A commitment', amount: r2(Math.abs(Number(it.amount) || 0)) });
    for (const it of forecast.income_items || []) put(it.due_on, { kind: 'income', label: it.subject || it.source || 'Money in', amount: r2(Math.abs(Number(it.amount) || 0)), said: it.said !== false, confidence: it.confidence == null ? null : Number(it.confidence) });
    /* The calendar's own shape is { title, day, amount } (calendar.js calendarForecast). This
       read `it.on` and `it.expected.amount`, which those items never carry, so a priced day in
       the diary never reached a square and the calendar looked like it was doing nothing
       (2026-09-16). Both shapes are accepted now, because the forecast is passed in from
       several places and being tolerant here costs nothing. */
    for (const it of forecast.calendar_items || []) {
      const amount = r2(Math.abs(Number(it.amount ?? it.expected?.amount) || 0));
      put(it.day || it.on, { kind: 'calendar', label: it.title || it.label || 'A day in the diary', amount });
    }
  }

  /* How many events the diary held on each day, past days included (calendar.js dayCounts). */
  try {
    const counts = calendarFromFacts(facts || [], { now }).days || {};
    for (const [day, n] of Object.entries(counts)) { const c = cellOf(day); if (c) c.events = Number(n) || 0; }
  } catch { /* a diary that cannot be read leaves every day at zero */ }

  /* Every coming event of the month from the diary, priced or not: the feed had 191 events
     read and nothing on this page unless a kind of day had learned a cost, so the sync looked
     dead (2026-09-21). A day that already carries a priced item keeps that one. */
  try {
    const diary = calendarFromFacts(facts || [], { now });
    for (const e of diary.snapshot || []) {
      if (!e || !e.start || e.noted) continue;
      const day = dayIn(e.start);
      if (!day || day.slice(0, 7) !== monthKey) continue;
      const c = cellOf(day);
      if (!c || c.past) continue;
      const title = String(e.title || '').trim().slice(0, 80);
      if (!title || c.items.some((i) => i.kind === 'calendar' && String(i.label).toLowerCase() === title.toLowerCase())) continue;
      c.items.push({ kind: 'calendar', label: title, amount: 0 });
    }
  } catch { /* a diary that cannot be read is no diary, not a broken plan */ }

  /* The person's own words on a day. */
  for (const f of facts || []) {
    if (!isDayNote(f)) continue;
    const c = cellOf(String(f.subject).slice(4));
    if (c) c.note = { id: f.id || null, text: String(f.value || f.note || '').slice(0, 240) };
  }

  const list = [...cells.values()];
  const spentToDay = r2(list.reduce((s, c) => s + c.spent, 0));
  const expectedRest = r2(list.filter((c) => !c.past).reduce((s, c) => s + c.expected, 0));
  const incomeAhead = r2(list.filter((c) => !c.past).reduce((s, c) => s + c.items.filter((i) => i.kind === 'income').reduce((a, i) => a + i.amount, 0), 0));
  const daysAhead = list.filter((c) => !c.past && c.items.some((i) => i.kind !== 'income')).length;
  const peak = list.reduce((m, c) => (c.spent > (m ? m.spent : 0) ? c : m), null);
  return {
    month: `${monthKey}-01`,
    days_in_month: daysInMonth,
    first_weekday: firstWeekday,
    today: cells.has(today) ? today : null,
    cells: list,
    totals: { spent_to_day: spentToDay, expected_rest: expectedRest, income_ahead: incomeAhead, days_ahead: daysAhead },
    peak: peak && peak.spent > 0 ? { day: peak.day, amount: peak.spent } : null,
  };
}

/** One computed sentence for the month: what it has cost and what is still expected. Pure. */
export function planLine(plan, { now = new Date() } = {}) {
  if (!plan) return '';
  const label = new Date(`${plan.month}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long' });
  const t = plan.totals;
  const current = plan.month.slice(0, 7) === now.toISOString().slice(0, 7);
  if (!current) return `${label}: ${euro(t.spent_to_day)}.`;
  const ahead = t.days_ahead ? ` ${euro(t.expected_rest)} expected on ${t.days_ahead} ${t.days_ahead === 1 ? 'day' : 'days'} ahead` : '';
  const income = t.income_ahead ? `${ahead ? ',' : ''} ${euro(t.income_ahead)} coming in` : '';
  return `${label}: ${euro(t.spent_to_day)} so far${ahead || income ? `;${ahead}${income}` : ''}.`;
}
