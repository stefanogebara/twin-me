/**
 * The calendar lens.
 * ==================
 * A ledger knows what was paid; a calendar knows what the person was doing. Read together,
 * the two say what a kind of day costs: the Thursday dinner, the Saturday match, the weekly
 * shop after the last lecture. This module joins events to payments, learns a typical spend
 * per kind of event, and reads the week ahead with those numbers under it.
 *
 * What it keeps: a shape key made from the first words of the title, counts and medians, a
 * short snapshot of upcoming events (label, day, expected amount). What it never keeps: who
 * was invited, or what the description said. The money tables hold money facts.
 *
 * Deterministic throughout. No model touches this; the chat only phrases what is here.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { createCalendarClient } from '../calendar/client.js';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { listTransactions, listFacts } from './store.js';

const log = createLogger('MoneyCalendar');

/* ------------------------------------------------------------------------ constants */

/** A payment counts for an event when it falls inside the event, or this close to it. */
export const JOIN_MARGIN_MS = 90 * 60 * 1000;
/** How far back the learning looks. */
export const LEARN_DAYS = 90;
/** A shape is learned once it has happened this often, and paid for this often. */
export const MIN_OCCURRENCES = 3;
export const MIN_PAID = 2;
/** Learn again when the last pass is older than this. */
export const LEARN_STALE_MS = 12 * 60 * 60 * 1000;
/** How far ahead the snapshot kept for the forecast reaches. */
export const SNAPSHOT_DAYS = 31;
/** Facts kinds this module owns. */
export const FACT_KIND = 'event_spend';
export const META_KIND = 'event_spend_meta';

const CHANNELS_NOT_SPENDING = new Set(['transfer', 'bizum']);

/* ------------------------------------------------------------------------ pure: events */

const DAY_MS = 86400000;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n) => Math.round(n * 100) / 100;

/** A raw Google event, reduced to what money needs. Attendees become a count; the description is dropped. */
export function normaliseEvent(raw) {
  if (!raw || raw.status === 'cancelled') return null;
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);
  const start = raw.start?.dateTime || (raw.start?.date ? `${raw.start.date}T00:00:00Z` : null);
  const end = raw.end?.dateTime || (raw.end?.date ? `${raw.end.date}T00:00:00Z` : null);
  if (!start) return null;
  return {
    id: String(raw.id || ''),
    title: String(raw.summary || '').trim() || 'Untitled',
    start,
    end: end || start,
    location: raw.location ? String(raw.location).trim() : null,
    attendees_count: Array.isArray(raw.attendees) ? raw.attendees.length : 0,
    recurring: raw.recurringEventId ? String(raw.recurringEventId) : null,
    all_day: allDay,
  };
}

/**
 * The key two events share when they are the same kind of thing: the first three words of
 * the title, lowercased, with dates, times, numbers and symbols stripped. A recurring series
 * carries its own id so "Weekly sync" on Mondays and "Weekly sync" on Fridays stay apart.
 */
export function shapeKey(event) {
  const words = String(event?.title || '')
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/\b\d{1,2}[:.h]\d{2}\b/g, ' ')
    .replace(/\b\d{1,4}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\u00e0-\u00ff\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const base = words.join(' ') || 'untitled';
  return event?.recurring ? `${base}#${event.recurring}` : base;
}

/** The words of a shape key, for saying it back. */
export function shapeLabel(key) {
  return String(key || '').split('#')[0];
}

const ms = (iso) => new Date(iso).getTime();
const dayOf = (iso) => String(iso).slice(0, 10);

/** How far a moment is from an event's window: 0 inside it, otherwise the gap in ms. */
function distance(event, when) {
  if (event.all_day) {
    return dayOf(new Date(when).toISOString()) === dayOf(event.start) ? 0 : Infinity;
  }
  const s = ms(event.start) - JOIN_MARGIN_MS;
  const e = ms(event.end) + JOIN_MARGIN_MS;
  if (when >= s && when <= e) return 0;
  return when < s ? s - when : when - e;
}

/**
 * Which payment belongs to which event. Only money going out counts, and only money that is
 * spending (a transfer to a flatmate during dinner is not the dinner). A payment near two
 * events goes to the closer one; a payment near none goes to none.
 */
export function joinEventsToPayments(events, transactions) {
  const pairs = [];
  const evs = (events || []).filter(Boolean);
  for (const t of transactions || []) {
    if (!(num(t.amount) < 0)) continue;
    if (CHANNELS_NOT_SPENDING.has(t.channel)) continue;
    if (t.verdict === 'not_me') continue;
    const when = ms(t.occurred_at);
    /* The margin is already in the window; a payment outside it belongs to no event.
       Inside two windows, the event that started closer to the payment wins. */
    let best = null;
    for (const ev of evs) {
      if (distance(ev, when) !== 0) continue;
      if (!best || Math.abs(ms(ev.start) - when) < Math.abs(ms(best.start) - when)) best = ev;
    }
    if (best) pairs.push({ event: best, transaction: t });
  }
  return pairs;
}

/* ------------------------------------------------------------------------ pure: learning */

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function quantile(values, q) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/**
 * From events and payments, what each kind of event tends to cost. Returns only the shapes
 * that clear the floors: seen at least MIN_OCCURRENCES times, paid for at least MIN_PAID.
 * `categoryOf(transaction)` names the kind of place, when known.
 */
export function learnShapes(events, transactions, { categoryOf = () => null, now = new Date() } = {}) {
  const since = now.getTime() - LEARN_DAYS * DAY_MS;
  const past = (events || []).filter((e) => e && ms(e.start) <= now.getTime() && ms(e.start) >= since);
  const pairs = joinEventsToPayments(past, transactions);
  const spendByEvent = new Map();
  const categoriesByEvent = new Map();
  for (const { event, transaction } of pairs) {
    spendByEvent.set(event.id, (spendByEvent.get(event.id) || 0) + Math.abs(num(transaction.amount)));
    const cat = categoryOf(transaction);
    if (cat) {
      const bag = categoriesByEvent.get(event.id) || new Map();
      bag.set(cat, (bag.get(cat) || 0) + Math.abs(num(transaction.amount)));
      categoriesByEvent.set(event.id, bag);
    }
  }

  const byShape = new Map();
  for (const ev of past) {
    const key = shapeKey(ev);
    const s = byShape.get(key) || { key, label: shapeLabel(key), occurrences: 0, paid: 0, spends: [], categories: new Map(), weekdays: new Map(), last: null };
    s.occurrences += 1;
    const spent = spendByEvent.get(ev.id) || 0;
    if (spent > 0) { s.paid += 1; s.spends.push(round2(spent)); }
    for (const [cat, amt] of categoriesByEvent.get(ev.id) || []) s.categories.set(cat, (s.categories.get(cat) || 0) + amt);
    const wd = new Date(ev.start).getUTCDay();
    s.weekdays.set(wd, (s.weekdays.get(wd) || 0) + 1);
    if (!s.last || ms(ev.start) > ms(s.last)) s.last = ev.start;
    byShape.set(key, s);
  }

  const learned = [];
  for (const s of byShape.values()) {
    if (s.occurrences < MIN_OCCURRENCES || s.paid < MIN_PAID) continue;
    const cats = [...s.categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    learned.push({
      key: s.key,
      label: s.label,
      occurrences: s.occurrences,
      paid: s.paid,
      median: round2(median(s.spends)),
      p25: round2(quantile(s.spends, 0.25)),
      p75: round2(quantile(s.spends, 0.75)),
      categories: cats,
      usual_weekday: [...s.weekdays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      last_seen: s.last,
    });
  }
  return learned.sort((a, b) => b.paid * b.median - a.paid * a.median);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * One line about the shape of the person's weeks, from the events themselves: which days
 * carry the most, and when the day tends to start. Nothing about who or what.
 */
export function routineSummary(events, { now = new Date() } = {}) {
  const since = now.getTime() - LEARN_DAYS * DAY_MS;
  const past = (events || []).filter((e) => e && !e.all_day && ms(e.start) <= now.getTime() && ms(e.start) >= since);
  if (past.length < 5) return null;
  const perDay = new Map();
  const firstByDate = new Map();
  for (const e of past) {
    const d = new Date(e.start);
    perDay.set(d.getUTCDay(), (perDay.get(d.getUTCDay()) || 0) + 1);
    const key = dayOf(e.start);
    const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (!firstByDate.has(key) || minutes < firstByDate.get(key)) firstByDate.set(key, minutes);
  }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([wd]) => WEEKDAYS[wd]);
  const firstMinutes = median([...firstByDate.values()]);
  const hh = String(Math.floor(firstMinutes / 60)).padStart(2, '0');
  const mm = String(Math.round(firstMinutes % 60)).padStart(2, '0');
  const weeks = Math.max(1, Math.round(LEARN_DAYS / 7));
  const perWeek = Math.round(past.length / weeks);
  return `About ${perWeek} events a week, most on ${busiest.join(' and ')}, the first usually around ${hh}:${mm}.`;
}

/** What a coming event is expected to cost, from its learned shape, or null when nothing is known. */
export function expectFor(shape) {
  if (!shape || !shape.median) return null;
  const few = shape.paid < 4 || shape.p25 === shape.p75;
  const low = few ? round2(shape.median * 0.6) : shape.p25;
  const high = few ? round2(shape.median * 1.4) : shape.p75;
  const noun = shape.paid === 1 ? 'time' : 'times';
  return {
    amount: shape.median,
    low,
    high,
    basis: `${shape.paid} similar ${noun} before, usually around ${shape.median.toFixed(2).replace('.', ',')} EUR.`,
  };
}

/** The window ahead, read with what was learned. */
export function aheadFrom(events, learned, { now = new Date(), days = 7 } = {}) {
  const from = now.getTime();
  const to = from + days * DAY_MS;
  const byKey = new Map((learned || []).map((s) => [s.key, s]));
  const upcoming = (events || [])
    .filter((e) => e && ms(e.start) >= from && ms(e.start) < to)
    .sort((a, b) => ms(a.start) - ms(b.start));
  const items = upcoming.map((e) => {
    const shape = byKey.get(shapeKey(e)) || null;
    return {
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      all_day: e.all_day,
      location: e.location,
      expected: expectFor(shape),
    };
  });
  const busy = new Set(upcoming.map((e) => dayOf(e.start)));
  const free_days = [];
  for (let d = 0; d < days; d += 1) {
    const day = dayOf(new Date(from + d * DAY_MS).toISOString());
    if (!busy.has(day)) free_days.push(day);
  }
  const total_expected = round2(items.reduce((s, i) => s + (i.expected?.amount || 0), 0));
  return { ahead: items, free_days, total_expected };
}

/* ------------------------------------------------------------------------ persisted form */

/** The learned shapes and the snapshot, read back out of money_facts rows. Pure. */
export function calendarFromFacts(facts, { now = new Date() } = {}) {
  const rows = Array.isArray(facts) ? facts : [];
  const learned = rows
    .filter((f) => f.kind === FACT_KIND)
    .map((f) => {
      try { return { key: f.subject, ...JSON.parse(f.value || '{}') }; } catch { return null; }
    })
    .filter((s) => s && s.median)
    .sort((a, b) => (b.paid || 0) * (b.median || 0) - (a.paid || 0) * (a.median || 0));
  const metaRow = rows.find((f) => f.kind === META_KIND);
  let meta = null;
  if (metaRow) { try { meta = JSON.parse(metaRow.value || 'null'); } catch { meta = null; } }
  const snapshot = (meta?.snapshot || []).filter((i) => i && ms(i.start) >= now.getTime());
  return {
    connected: Boolean(meta),
    learned_at: meta?.learned_at || null,
    routine: meta?.routine || null,
    learned,
    snapshot,
  };
}

/**
 * What the forecast adds from the calendar: expected spend for events before the month ends,
 * from the snapshot kept at the last read. No network.
 */
export function calendarForecast(facts, { now = new Date() } = {}) {
  const { snapshot } = calendarFromFacts(facts, { now });
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime();
  const items = snapshot
    .filter((i) => i.expected?.amount && ms(i.start) < monthEnd)
    .map((i) => ({ title: i.label || i.title, day: dayOf(i.start), amount: i.expected.amount }));
  return { calendar_ahead: round2(items.reduce((s, i) => s + i.amount, 0)), calendar_items: items };
}

/** Short lines for a prompt: the week ahead with numbers, and the shapes learned. */
export function calendarLines(facts, { now = new Date() } = {}) {
  const { learned, snapshot, routine } = calendarFromFacts(facts, { now });
  const lines = [];
  const week = snapshot.filter((i) => ms(i.start) < now.getTime() + 7 * DAY_MS).slice(0, 7);
  const fmt = (n) => `${Number(n).toFixed(2).replace('.', ',')} EUR`;
  const day = (iso) => { const d = new Date(iso); return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}`; };
  if (week.length) {
    lines.push('Calendar, next 7 days: ' + week.map((i) => `${day(i.start)} "${i.label || i.title}"${i.expected ? ` usually about ${fmt(i.expected.amount)} (${i.expected.basis.split(',')[0]})` : ' (no spend learned)'}`).join('; ') + '.');
  }
  if (learned.length) {
    lines.push('Kinds of event and what they cost: ' + learned.slice(0, 8).map((s) => `"${s.label}" ${s.occurrences} times, paid ${s.paid}, usually ${fmt(s.median)}${s.categories?.length ? ` (${s.categories.join(', ')})` : ''}`).join('; ') + '.');
  }
  if (routine) lines.push(`Routine: ${routine}`);
  return lines;
}

/* ------------------------------------------------------------------------ async: the real thing */

async function token(userId) {
  const r = await getValidAccessToken(userId, 'google_calendar');
  if (!r?.success || !r.accessToken) return { accessToken: null, needsReconnect: Boolean(r?.requiresReauth), error: r?.error || 'not connected' };
  return { accessToken: r.accessToken, needsReconnect: false, error: null };
}

/** Whether a usable Google Calendar connection exists. */
export async function calendarStatus(userId) {
  const t = await token(userId);
  return { connected: Boolean(t.accessToken), needsReconnect: t.needsReconnect };
}

/**
 * Events between two moments, from the primary calendar, normalised. One request to Google.
 */
export async function eventsFor(userId, fromISO, toISO, { accessToken = null } = {}) {
  const tok = accessToken || (await token(userId)).accessToken;
  if (!tok) return [];
  const client = createCalendarClient({ accessToken: tok });
  const params = new URLSearchParams({
    timeMin: new Date(fromISO).toISOString(),
    timeMax: new Date(toISO).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });
  const data = await client.get(`/calendars/primary/events?${params.toString()}`);
  return (data?.items || []).map(normaliseEvent).filter(Boolean);
}

async function categoryLookup(transactions) {
  const keys = [...new Set((transactions || []).map((t) => t.merchant_key).filter(Boolean))];
  if (!keys.length) return () => null;
  const { data } = await supabaseAdmin.from('money_places').select('merchant_key, category, category_override').in('merchant_key', keys);
  const map = new Map((data || []).map((p) => [p.merchant_key, p.category_override || p.category || null]));
  return (t) => map.get(t.merchant_key) || null;
}

async function persist(userId, learned, meta) {
  const nowIso = new Date().toISOString();
  const rows = learned.map((s) => ({
    user_id: userId, kind: FACT_KIND, subject: s.key, subject_label: s.label,
    value: JSON.stringify({ label: s.label, occurrences: s.occurrences, paid: s.paid, median: s.median, p25: s.p25, p75: s.p75, categories: s.categories, usual_weekday: s.usual_weekday, last_seen: s.last_seen, updated_at: nowIso }),
    amount: s.median, source: 'inferred', answered_at: nowIso,
  }));
  rows.push({ user_id: userId, kind: META_KIND, subject: '', subject_label: null, value: JSON.stringify(meta), amount: null, source: 'inferred', answered_at: nowIso });
  const { error } = await supabaseAdmin.from('money_facts').upsert(rows, { onConflict: 'user_id,kind,subject' });
  if (error) throw new Error(error.message);
  /* Shapes that no longer clear the floors leave, so the twin does not quote last season. */
  const keep = learned.map((s) => s.key);
  let stale = supabaseAdmin.from('money_facts').delete().eq('user_id', userId).eq('kind', FACT_KIND);
  if (keep.length) stale = stale.not('subject', 'in', `(${keep.map((k) => `"${k.replace(/"/g, '')}"`).join(',')})`);
  await stale.then(({ error: e }) => { if (e) log.warn(`stale shapes not removed: ${e.message}`); });
}

/**
 * Learn from the last LEARN_DAYS of events and payments, and keep a snapshot of the next
 * SNAPSHOT_DAYS so the forecast and the twin can read the calendar without calling Google.
 * `events` may be handed in to save the request.
 */
export async function learnEventSpend(userId, { now = new Date(), events = null } = {}) {
  const from = new Date(now.getTime() - LEARN_DAYS * DAY_MS).toISOString();
  const to = new Date(now.getTime() + SNAPSHOT_DAYS * DAY_MS).toISOString();
  const evs = events || (await eventsFor(userId, from, to));
  const transactions = await listTransactions(userId, { since: from, limit: 5000 });
  const categoryOf = await categoryLookup(transactions);
  const learned = learnShapes(evs, transactions, { categoryOf, now });
  const byKey = new Map(learned.map((s) => [s.key, s]));
  const snapshot = evs
    .filter((e) => ms(e.start) >= now.getTime())
    .sort((a, b) => ms(a.start) - ms(b.start))
    .slice(0, 60)
    .map((e) => ({ id: e.id, label: shapeLabel(shapeKey(e)), title: e.title, start: e.start, end: e.end, all_day: e.all_day, expected: expectFor(byKey.get(shapeKey(e)) || null) }));
  const meta = { learned_at: now.toISOString(), routine: routineSummary(evs, { now }), events_seen: evs.length, snapshot };
  await persist(userId, learned, meta);
  return { learned: learned.length, events: evs.length, snapshot: snapshot.length };
}

/**
 * The week ahead. Reads Google once; learns again on the same events when the last pass is
 * stale, so this one request serves both.
 */
export async function ahead(userId, days = 7, { now = new Date() } = {}) {
  const status = await calendarStatus(userId);
  const facts = await listFacts(userId, { includeInternal: true });
  const stored = calendarFromFacts(facts, { now });
  if (!status.connected) {
    return { connected: false, needsReconnect: status.needsReconnect, ahead: [], free_days: [], routine: stored.routine, learned: stored.learned, total_expected: 0 };
  }
  const from = new Date(now.getTime() - LEARN_DAYS * DAY_MS).toISOString();
  const to = new Date(now.getTime() + Math.max(days, SNAPSHOT_DAYS) * DAY_MS).toISOString();
  const events = await eventsFor(userId, from, to);
  let learned = stored.learned;
  const stale = !stored.learned_at || now.getTime() - ms(stored.learned_at) > LEARN_STALE_MS;
  if (stale) {
    try {
      await learnEventSpend(userId, { now, events });
      learned = calendarFromFacts(await listFacts(userId, { includeInternal: true }), { now }).learned;
    } catch (e) {
      log.warn(`calendar learn failed: ${e.message}`);
    }
  }
  const window = aheadFrom(events, learned, { now, days });
  const routine = stale ? routineSummary(events, { now }) : stored.routine;
  return { connected: true, needsReconnect: false, ...window, routine, learned: learned.slice(0, 8) };
}
