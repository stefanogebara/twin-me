/**
 * The words and sums the money page shares: what is still to come, a merchant as a name, a day as an ordinal.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { euro, shortDay, type MoneyForecast } from '../../services/api/moneyAPI';

/* The English source strings; the page says them through t(), so the dictionaries hold them. */
export type T = (source: string, holes?: Record<string, string | number>) => string;
export const CADENCE: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
export const SOURCE: Record<string, string> = { phone: 'Your phone', bizum: 'Bizum', bankfeed: 'Santander', gmail: 'Gmail', statement: 'Statement' };

/* What is still to come this month, as dated rows: detected charges, stated commitments,
   income, and diary events with a learned cost. A band without the rows under it is a
   range nobody can act on; with them the month reads as a calendar of money. */
export type Ahead = { on: string; name: string; amount: number; kind: 'charge' | 'stated' | 'income' | 'diary'; why: string };
/* Each row says why the ledger expects it: a charge that has come back so many times, a
   commitment they stated, an income seen or said, a diary event with a learned cost. A date
   and a name alone read as random; the reason is what makes it a forecast. */
export function stillToCome(t: T, locale: string, f: MoneyForecast): Ahead[] {
  const rows: Ahead[] = [];
  for (const c of f.committed_items || []) {
    const times = Number(c.occurrences) || 0;
    rows.push({ on: c.next_expected.slice(0, 10), name: merchantLabel(c), amount: -Math.abs(Number(c.typical_amount)), kind: 'charge',
      why: [
        c.cadence ? cap(CADENCE[c.cadence] ? t(CADENCE[c.cadence]) : c.cadence) : t('Comes back'),
        times ? t(times === 1 ? '{n} time so far' : '{n} times so far', { n: times }) : '',
        c.last_seen ? t('last {day}', { day: shortDay(c.last_seen, locale) }) : '',
      ].filter(Boolean).join(', ') });
  }
  for (const c of f.commitment_items || []) rows.push({ on: c.due_on, name: c.subject || t('A standing charge'), amount: -Math.abs(Number(c.amount)), kind: 'stated', why: t('You said it leaves every month') });
  for (const i of f.income_items || []) rows.push({ on: i.due_on, name: i.subject || i.source || t('Comes in'), amount: Math.abs(Number(i.amount)), kind: 'income',
    /* The basis arrives as an English phrase; the same two numbers say it here. */
    why: i.said && i.basis === 'said' ? t('Comes in, as you said')
      : i.times ? t('Comes in, seen {n} times, usually the {day}', { n: i.times, day: ordinalDay(t, Number(i.day) || 1) })
        : t('Comes in, as you said') });
  /* { title, day, amount } is what the calendar sends; asking for e.expected.amount and e.on
     meant a day in the diary never appeared here at all (2026-09-16). */
  for (const e of f.calendar_items || []) {
    const amount = Number(e.amount ?? e.expected?.amount) || 0;
    const on = String(e.day || e.on || '').slice(0, 10);
    if (amount > 0 && on) rows.push({ on, name: e.title || e.label || t('In the diary'), amount: -Math.abs(amount), kind: 'diary', why: t('In the diary; this kind of day usually costs about this') });
  }
  return rows.filter((r) => Number.isFinite(r.amount) && r.on).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : Math.abs(b.amount) - Math.abs(a.amount))).slice(0, 8);
}

export function merchantLabel(t: { merchant_name?: string | null; merchant_raw?: string | null; merchant_key: string }) {
  const s = t.merchant_name || t.merchant_raw || t.merchant_key;
  const base = s.length > 2 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
/** Two names read with an "and"; more than three become a count, so the line stays a sentence. */
export function nameList(t: T, names: string[]) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return t('{a} and {b}', { a: names[0], b: names[1] });
  if (names.length === 3) return t('{a}, {b} and {c}', { a: names[0], b: names[1], c: names[2] });
  return t('{a}, {b} and {n} more', { a: names[0], b: names[1], n: names.length - 2 });
}
/** The 30th in English; a language without the suffix writes the bare day in its dictionary. */
export function ordinalDay(t: T, n: number) {
  if (n % 10 === 1 && n !== 11) return t('{n}st', { n });
  if (n % 10 === 2 && n !== 12) return t('{n}nd', { n });
  if (n % 10 === 3 && n !== 13) return t('{n}rd', { n });
  return t('{n}th', { n });
}
export function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
export function monthName(locale: string, iso: string) { return new Date(iso).toLocaleDateString(locale, { month: 'long' }); }
export function monthYear(locale: string, iso: string) { return new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
export function lastDay(iso: string) { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }

/** Where a euro amount falls on the band, 0..100, with the projected p90 as the right edge. */
export function pct(v: number, f: MoneyForecast, edge: number | null = null) {
  const max = edge ? Math.max(edge, f.spent + f.committed, 1) : Math.max(f.projected_p90, f.spent + f.committed, 1) * 1.08;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

/**
 * What a row's sources say about its reconciliation, in one grey phrase. The bank's own
 * booking is the settled fact; a phone alert or a receipt alone is a payment nobody has
 * confirmed yet, and the line says so rather than hiding the difference.
 */
export function seenWords(t: T, sources: string[] | undefined, posted: boolean): string {
  const s = new Set(sources || []);
  /* The names the sightings carry: the feed writes bankfeed, a statement upload or statement,
     the phone phone or bizum, the receipts inbox email (measured 2026-09-20). */
  const bank = s.has('bankfeed') || s.has('statement') || s.has('upload');
  const phone = s.has('phone') || s.has('bizum');
  const receipt = s.has('email') || s.has('gmail') || s.has('inbox');
  if (bank && phone) return t('seen by the bank and your phone');
  if (bank && receipt) return t('seen by the bank and a receipt');
  if (bank) return t('bank only');
  if (phone) return posted ? t('phone, booked by the bank') : t('phone only, not booked yet');
  if (receipt) return posted ? t('receipt, booked by the bank') : t('receipt only, not booked yet');
  return '';
}

/** The return window on a receipt, said once near its end: the shop's own words made a date. */
export function returnsClosingWords(t: T, list: { merchant: string; amount: number; until: string; days_left: number }[] | undefined): string | null {
  const items = (list || []).filter((r) => r && r.merchant);
  if (!items.length) return null;
  const when = (d: number) => (d <= 0 ? t('today') : d === 1 ? t('tomorrow') : t('in {n} days', { n: d }));
  const name = (r: { merchant: string }) => merchantLabel({ merchant_key: r.merchant });
  if (items.length === 1) return t('The return window on {name}, {amount}, closes {when}.', { name: name(items[0]), amount: euro(items[0].amount), when: when(items[0].days_left) });
  const names = items.length === 2 ? t('{a} and {b}', { a: name(items[0]), b: name(items[1]) }) : t('{a}, {b} and {n} more', { a: name(items[0]), b: name(items[1]), n: items.length - 2 });
  return t('The return windows on {names} close {when}.', { names, when: when(items[items.length - 1].days_left) });
}

/** The charge before it lands, said once: named, dated, and already off today's number. */
export function chargesSoonWords(t: T, charges: { name: string | null; amount: number; when: 'today' | 'tomorrow' }[] | undefined): string | null {
  const list = (charges || []).filter((c) => c.amount > 0);
  if (!list.length) return null;
  const when = list.every((c) => c.when === 'today') ? t('today') : list.every((c) => c.when === 'tomorrow') ? t('tomorrow') : t('today and tomorrow');
  const name = (c: { name: string | null }) => (c.name ? merchantLabel({ merchant_key: c.name }) : t('A standing charge'));
  if (list.length === 1) return t("{name} lands {when}, {amount}, already off today's number.", { name: name(list[0]), when, amount: euro(list[0].amount) });
  const total = list.reduce((s, c) => s + c.amount, 0);
  const names = list.length === 2 ? t('{a} and {b}', { a: name(list[0]), b: name(list[1]) }) : t('{a}, {b} and {n} more', { a: name(list[0]), b: name(list[1]), n: list.length - 2 });
  return t("{names} land {when}, {amount} together, already off today's number.", { names, when, amount: euro(total) });
}
