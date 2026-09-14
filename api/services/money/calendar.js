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
import { awayWindows, weekWord, AWAY_WORDS, EXAM_WORDS, DEADLINE_WORDS, AWAY_MIN_DAYS } from './covariates.js';
import { parseIcs, feedKind, isFeedUrl, looksLikeIcs, FEED_LABELS } from './ics.js';
import crypto from 'node:crypto';
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
/** A calendar link the person pasted (Canvas, Blackboard, any .ics): one fact per link. */
export const FEED_KIND = 'calendar_feed';
export const MAX_FEEDS = 4;
/** A feed larger than this is not a student's calendar. */
export const FEED_MAX_BYTES = 2 * 1024 * 1024;
export const FEED_TIMEOUT_MS = 10000;

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
/** Sources whose events are a timetable, not a plan: they never learn a cost. */
export const LMS_SOURCES = new Set(['canvas', 'blackboard', 'moodle']);
/** Titles that are a class, whatever calendar they sit in. */
export const TIMETABLE_WORDS = /(\(ses\.?\s*\d|\bses\.\s*\d|live in-person|asynchronous|\blecture\b|\bseminar\b|\bclase\b|\bclass\b|\btutorial\b|\bworkshop\b)/i;

/**
 * Whether an event is the kind of thing that costs money. A class is not: the first
 * Blackboard link joined a coffee and a taxi to "DATA ANALYSIS FOR ECONOMICS (Ses. 27)"
 * and read 412 EUR of lectures into the month. Exams, deadlines and trips from a timetable
 * still count as covariates; they just do not learn a price.
 */
export function spendable(event) {
  if (!event) return false;
  if (event.source && LMS_SOURCES.has(event.source)) return false;
  return !TIMETABLE_WORDS.test(String(event.title || ''));
}

export function joinEventsToPayments(events, transactions) {
  const pairs = [];
  const evs = (events || []).filter(spendable);
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
  /* Windows and week words are read from the slim past plus everything ahead. */
  const past = Array.isArray(meta?.past) ? meta.past : [];
  const events = past.concat(meta?.snapshot || []);
  return {
    connected: Boolean(meta),
    learned_at: meta?.learned_at || null,
    routine: meta?.routine || null,
    learned,
    snapshot,
    away: awayWindows(events),
    week: weekWord(events, now),
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

/* ------------------------------------------------------------------------ feeds: pasted links */

/** The links the person pasted, from their facts. Pure. */
export function feedsFromFacts(facts) {
  return (Array.isArray(facts) ? facts : [])
    .filter((f) => f.kind === FEED_KIND && f.value)
    .map((f) => ({ id: f.subject, kind: f.subject_label || feedKind(f.value), label: FEED_LABELS[f.subject_label || feedKind(f.value)] || FEED_LABELS.ics, url: f.value, added_at: f.answered_at || null }));
}

export async function listFeeds(userId) {
  return feedsFromFacts(await listFacts(userId, { includeInternal: true }));
}

/** One link, fetched with a size cap and a timeout, parsed. Throws with a plain message. */
export async function fetchFeed(url, { fetchImpl = fetch } = {}) {
  if (!isFeedUrl(url)) throw new Error('That is not a link this can read. It has to start with https.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  let text;
  try {
    const r = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', headers: { accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1' } });
    if (!r.ok) throw new Error(`The link answered ${r.status}.`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > FEED_MAX_BYTES) throw new Error('That calendar is too large to be a person\'s.');
    text = await r.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The link did not answer in time.' : e.message);
  } finally { clearTimeout(timer); }
  if (text.length > FEED_MAX_BYTES) throw new Error('That calendar is too large to be a person\'s.');
  if (!looksLikeIcs(text)) throw new Error('The link did not return a calendar. In Canvas it is under Calendar, Calendar feed; in Blackboard under Calendar, Get external calendar link.');
  const kind = feedKind(url);
  return { kind, events: parseIcs(text, { source: kind }) };
}

/** Add a link: fetched once to prove it reads, then kept as one fact. */
export async function addFeed(userId, url, { fetchImpl = fetch } = {}) {
  const existing = await listFeeds(userId);
  if (existing.some((f) => f.url === url)) return { ...existing.find((f) => f.url === url), events: null, already: true };
  if (existing.length >= MAX_FEEDS) throw new Error(`Four links is the most; remove one first.`);
  const { kind, events } = await fetchFeed(url, { fetchImpl });
  const id = crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 16);
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin.from('money_facts').upsert(
    { user_id: userId, kind: FEED_KIND, subject: id, subject_label: kind, value: url, amount: null, source: 'asked', answered_at: nowIso },
    { onConflict: 'user_id,kind,subject' },
  );
  if (error) throw new Error(error.message);
  return { id, kind, label: FEED_LABELS[kind], url, added_at: nowIso, events: events.length, already: false };
}

export async function removeFeed(userId, id) {
  const { error } = await supabaseAdmin.from('money_facts').delete().eq('user_id', userId).eq('kind', FEED_KIND).eq('subject', String(id));
  if (error) throw new Error(error.message);
}

/** Every feed's events inside a window; a feed that fails is skipped and named in the log. */
export async function feedEvents(feeds, fromISO, toISO, { fetchImpl = fetch } = {}) {
  const from = ms(fromISO); const to = ms(toISO);
  const out = [];
  for (const f of feeds || []) {
    try {
      const { events } = await fetchFeed(f.url, { fetchImpl });
      for (const e of events) if (ms(e.end || e.start) >= from && ms(e.start) <= to) out.push(e);
    } catch (e) {
      log.warn(`calendar feed skipped: ${f.label}: ${e.message}`);
    }
  }
  return out;
}

/** Whether any calendar source exists: Google, or a pasted link. */
export async function calendarStatus(userId) {
  const [t, feeds] = await Promise.all([token(userId), listFeeds(userId).catch(() => [])]);
  return { connected: Boolean(t.accessToken) || feeds.length > 0, google: Boolean(t.accessToken), needsReconnect: t.needsReconnect, feeds };
}

/**
 * Events between two moments, from every source: Google's primary calendar (one request)
 * and each pasted link, normalised to one shape and sorted.
 */
export async function eventsFor(userId, fromISO, toISO, { accessToken = null, feeds = null } = {}) {
  const tok = accessToken || (await token(userId)).accessToken;
  let google = [];
  if (tok) {
    const client = createCalendarClient({ accessToken: tok });
    const params = new URLSearchParams({
      timeMin: new Date(fromISO).toISOString(),
      timeMax: new Date(toISO).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });
    const data = await client.get(`/calendars/primary/events?${params.toString()}`);
    google = (data?.items || []).map(normaliseEvent).filter(Boolean);
  }
  const links = feeds || (await listFeeds(userId).catch(() => []));
  const fromFeeds = links.length ? await feedEvents(links, fromISO, toISO) : [];
  return google.concat(fromFeeds).sort((a, b) => ms(a.start) - ms(b.start));
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
    .map((e) => ({ id: e.id, label: shapeLabel(shapeKey(e)), title: e.title, start: e.start, end: e.end, all_day: e.all_day, expected: spendable(e) ? expectFor(byKey.get(shapeKey(e)) || null) : null }));
  /* The past kept slim, for the covariates: only events that are windows or name a kind
     of week (covariates.js), as title and dates. The ninety days of the rest are not stored. */
  const past = evs
    .filter((e) => ms(e.start) < now.getTime() && (AWAY_WORDS.test(String(e.title).toLowerCase()) || EXAM_WORDS.test(String(e.title).toLowerCase()) || DEADLINE_WORDS.test(String(e.title).toLowerCase()) || (e.all_day && (ms(e.end) - ms(e.start)) / DAY_MS >= AWAY_MIN_DAYS)))
    .map((e) => ({ title: e.title, start: e.start, end: e.end, all_day: e.all_day }));
  const meta = { learned_at: now.toISOString(), routine: routineSummary(evs, { now }), events_seen: evs.length, snapshot, past };
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
    return { connected: false, google: false, feeds: [], needsReconnect: status.needsReconnect, ahead: [], free_days: [], routine: stored.routine, learned: stored.learned, total_expected: 0 };
  }
  const from = new Date(now.getTime() - LEARN_DAYS * DAY_MS).toISOString();
  const to = new Date(now.getTime() + Math.max(days, SNAPSHOT_DAYS) * DAY_MS).toISOString();
  const events = await eventsFor(userId, from, to, { feeds: status.feeds });
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
  return { connected: true, google: status.google, feeds: status.feeds, needsReconnect: false, ...window, routine, learned: learned.slice(0, 8) };
}

/**
 * The daily pass for the cron: learn again from every source when the last pass is older
 * than the stale window, so the covariates move for a person who never opens the calendar.
 * Silent when nothing is connected.
 */
export async function refreshIfStale(userId, { now = new Date() } = {}) {
  const status = await calendarStatus(userId);
  if (!status.connected) return { refreshed: false, reason: 'not connected' };
  const stored = calendarFromFacts(await listFacts(userId, { includeInternal: true }), { now });
  if (stored.learned_at && now.getTime() - ms(stored.learned_at) <= LEARN_STALE_MS) return { refreshed: false, reason: 'fresh' };
  const r = await learnEventSpend(userId, { now });
  return { refreshed: true, ...r };
}
