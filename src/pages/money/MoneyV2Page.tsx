/**
 * Money, in the Instinct app register with Cosmos headings: a warm page, rows under an ink
 * rule instead of cards, 13px type with weight for hierarchy, and little text. This month
 * with a band; what the ledger says; where it went; every euro with its receipts and a
 * verdict; what comes back on its own; the two sources (Santander through Enable Banking,
 * and the phone).
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 * Register: .claude/plans/2026-09-11-instinct-register/README.md
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale, useT } from '@/lib/i18n';
import { ChevronRight, FileText, Landmark, Mail, Smartphone } from 'lucide-react';
import '../../styles/money-v2.css';
import MoneyNav from './MoneyNav';
import Wait from '../../components/Wait';
import { MONEY_NAV, type MoneyView } from './navLinks';
import { factRank, factTitle, factWord } from './factWords';
import Mark from './Mark';
import { KindTile, Stamp } from './Carved';
import { markFor } from './carvedKinds';
import { readingWords, todayHere, localDay } from './readingWords';
import { MARK_FOR, hasMark } from './markPaths';
import { moneyAPI, euro, shortDay, bankLabel, BANKS, type MoneyAccount, type MoneyCalendar, type MoneyCategories, type MoneyDayStrip, type MoneyFact, type MoneyForecast, type MoneyQuestions, type MoneyToday, type MoneyMonth, type MoneyReading, type MoneyRecurring, type MoneySighting, type MoneyTransaction, type MoneyUsage } from '../../services/api/moneyAPI';
import LedgerOrb from '../../components/LedgerOrb';
import DayGlobe from './figures/DayGlobe';
import Fortnight from './figures/Fortnight';
import MonthOrbits from './figures/MonthOrbits';
import { APK_URL } from '@/lib/downloads';
import TotalRow from './figures/TotalRow';

/* The English source strings; the page says them through t(), so the dictionaries hold them. */
type T = (source: string, holes?: Record<string, string | number>) => string;
const CADENCE: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
const SOURCE: Record<string, string> = { phone: 'Your phone', bizum: 'Bizum', bankfeed: 'Santander', gmail: 'Gmail', statement: 'Statement' };


/* What is still to come this month, as dated rows: detected charges, stated commitments,
   income, and diary events with a learned cost. A band without the rows under it is a
   range nobody can act on; with them the month reads as a calendar of money. */
type Ahead = { on: string; name: string; amount: number; kind: 'charge' | 'stated' | 'income' | 'diary'; why: string };
/* Each row says why the ledger expects it: a charge that has come back so many times, a
   commitment they stated, an income seen or said, a diary event with a learned cost. A date
   and a name alone read as random; the reason is what makes it a forecast. */
function stillToCome(t: T, locale: string, f: MoneyForecast): Ahead[] {
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
    why: i.basis ? t('Comes in, {basis}', { basis: i.basis }) : t('Comes in, as you said') });
  /* { title, day, amount } is what the calendar sends; asking for e.expected.amount and e.on
     meant a day in the diary never appeared here at all (2026-09-16). */
  for (const e of f.calendar_items || []) {
    const amount = Number(e.amount ?? e.expected?.amount) || 0;
    const on = String(e.day || e.on || '').slice(0, 10);
    if (amount > 0 && on) rows.push({ on, name: e.title || e.label || t('In the diary'), amount: -Math.abs(amount), kind: 'diary', why: t('In the diary; this kind of day usually costs about this') });
  }
  return rows.filter((r) => Number.isFinite(r.amount) && r.on).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : Math.abs(b.amount) - Math.abs(a.amount))).slice(0, 8);
}

function merchantLabel(t: { merchant_name?: string | null; merchant_raw?: string | null; merchant_key: string }) {
  const s = t.merchant_name || t.merchant_raw || t.merchant_key;
  const base = s.length > 2 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
/** Two names read with an "and"; more than three become a count, so the line stays a sentence. */
function nameList(t: T, names: string[]) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return t('{a} and {b}', { a: names[0], b: names[1] });
  if (names.length === 3) return t('{a}, {b} and {c}', { a: names[0], b: names[1], c: names[2] });
  return t('{a}, {b} and {n} more', { a: names[0], b: names[1], n: names.length - 2 });
}
/** The 30th in English; a language without the suffix writes the bare day in its dictionary. */
function ordinalDay(t: T, n: number) {
  if (n % 10 === 1 && n !== 11) return t('{n}st', { n });
  if (n % 10 === 2 && n !== 12) return t('{n}nd', { n });
  if (n % 10 === 3 && n !== 13) return t('{n}rd', { n });
  return t('{n}th', { n });
}
function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function monthName(locale: string, iso: string) { return new Date(iso).toLocaleDateString(locale, { month: 'long' }); }
function monthYear(locale: string, iso: string) { return new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
function lastDay(iso: string) { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }

function Chevron() { return <ChevronRight className="mv-chev" size={16} strokeWidth={1.75} aria-hidden="true" />; }

export default function MoneyV2Page({ view = 'today' }: { view?: MoneyView } = {}) {
  /* The tab said "Discover Your Soul Signature" over a page of euros, which is the front
     door's old promise showing through the new product. */
  const t = useT();
  const locale = useLocale();
  useDocumentTitle(view === 'today' ? t('Money') : view === 'month' ? t('Money, the month') : t('Money, you'));
  const { user } = useAuth();
  const [forecast, setForecast] = useState<MoneyForecast | null>(null);
  /* The one number a person opens the app for. It leads Today; the month sits under it. */
  const [today, setToday] = useState<MoneyToday | null>(null);
  const [unread, setUnread] = useState(false);
  const [ledger, setLedger] = useState<MoneyTransaction[]>([]);
  const [recurring, setRecurring] = useState<MoneyRecurring[]>([]);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [months, setMonths] = useState<MoneyMonth[]>([]);
  const [readings, setReadings] = useState<MoneyReading[]>([]);
  const [openReading, setOpenReading] = useState<string | null>(null);
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [monthOpen, setMonthOpen] = useState<Record<string, boolean>>({});
  /* Which phone recipe is open: the app on Android, the Shortcut on iPhone, or the raw
     request for anyone wiring their own tool. */
  const [openHow, setOpenHow] = useState<'android' | 'iphone' | 'other' | null>(null);
  const [inbox, setInbox] = useState<{ address: string; receiving: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  /* The calendar lens: Google, or links pasted from Canvas and Blackboard. */
  const [calendar, setCalendar] = useState<MoneyCalendar | null>(null);
  /* What it knows, in the person's words, and what it still wants to ask: the You page. */
  const [facts, setFacts] = useState<MoneyFact[] | null>(null);
  const [questions, setQuestions] = useState<MoneyQuestions | null>(null);
  const [feedUrl, setFeedUrl] = useState('');
  const [categories, setCategories] = useState<MoneyCategories | null>(null);
  const [usage, setUsage] = useState<MoneyUsage | null>(null);
  const [bankReady, setBankReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, MoneySighting[]>>({});
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* Which bank is being opened, so the connecting orb sits on that bank's row and no other. */
  const [connecting, setConnecting] = useState<string | null>(null);
  /* The globe opens the day's payments under the hero. */
  const [dayOpen, setDayOpen] = useState(false);
  /* What the last Read now brought back, said on the Santander row itself. The note at the
     foot of the section sat below the fold, so a read that found nothing looked like a
     button that did nothing. */
  const [read, setRead] = useState<{ seen: number; created: number } | null>(null);

  /* Two ways to learn the connection has ended, and the page must not depend on the luckier
     one. The refresh call says so when it is the call that hits the dead session; the accounts
     row says so from the last recorded read, which survives a day when the read budget is
     already spent and no call is made at all. */
  const reconnect = needsReconnect || accounts.some((a) => a.needs_reconnect);
  /* Days since the money last had something new to say: the newest first_seen_at. */
  const newestSaid = readings.reduce<number | null>((m, r) => { const t = r.first_seen_at ? new Date(r.first_seen_at).getTime() : null; return t !== null && (m === null || t > m) ? t : m; }, null);
  const quietDays = newestSaid === null ? null : Math.floor((Date.now() - newestSaid) / 86400000);
  /* How far the bank has booked, and what the phone or the inbox saw after that. The bank
     posts card payments on working days, so a weekend's spending is here before it is there. */
  const bookedTo = ledger.reduce<string | null>((m, t) => (t.posted_at && (!m || t.occurred_at > m) ? t.occurred_at : m), null);
  const sinceRows = bookedTo ? ledger.filter((t) => !t.posted_at && t.occurred_at > bookedTo) : [];
  const since = sinceRows.length;
  /* What the pending alerts add up to, signed: the bank's booked figure minus these is about
     what is really left, and the bank does not say it. */
  const pendingNet = sinceRows.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  /* "Booked to yesterday" on a working day is the bank's normal lag, not a stale read: today's
     card payments are here from the alerts and book tomorrow. Said as that. */
  const bookedDay = bookedTo ? shortDay(bookedTo, locale) : null;
  const bookedIsYesterday = bookedTo ? new Date(bookedTo).toDateString() === new Date(Date.now() - 86400000).toDateString() : false;
  const bookedLine = bookedTo
    ? bookedIsYesterday
      ? since
        ? t(since === 1 ? "Booked to yesterday; today's {n} payment is here from the alerts and book tomorrow." : "Booked to yesterday; today's {n} payments are here from the alerts and book tomorrow.", { n: since })
        : t('Booked to yesterday; nothing yet today.')
      : since
        ? t(since === 1 ? 'Booked to {day}, {n} alert since. Cards post on working days.' : 'Booked to {day}, {n} alerts since. Cards post on working days.', { day: bookedDay as string, n: since })
        : t('Booked to {day}. Cards post on working days.', { day: bookedDay as string })
    : t('Read four times a day. You confirm it every six months.');
  const bankLine = !bankReady ? t('The bank feed is not switched on yet.')
    : busy === 'connect' ? t('Opening the bank.')
    : busy === 'pull' ? t('Reading the bank.')
    : read ? (read.created ? t('{n} new just now.', { n: read.created }) : t('Nothing new just now. {line}', { line: bookedLine }))
    : bookedLine;

  const load = useCallback(async () => {
    const [f, l, r, a, m, rd, c, u, td] = await Promise.allSettled([
      moneyAPI.forecast(), moneyAPI.ledger(), moneyAPI.recurring(), moneyAPI.accounts(), moneyAPI.months(), moneyAPI.readings(),
      moneyAPI.categories(`${todayHere().slice(0, 7)}-01`), moneyAPI.usage(), moneyAPI.today(),
    ]);
    if (f.status === 'fulfilled') setForecast(f.value);
    if (td.status === 'fulfilled') setToday(td.value);
    if (l.status === 'fulfilled') setLedger(l.value);
    if (r.status === 'fulfilled') setRecurring(r.value);
    if (a.status === 'fulfilled') setAccounts(a.value);
    if (m.status === 'fulfilled') setMonths(m.value);
    if (rd.status === 'fulfilled') setReadings(rd.value);
    if (c.status === 'fulfilled') setCategories(c.value);
    if (u.status === 'fulfilled') setUsage(u.value);
    /* A month that could not be read is not an empty month. Every rejection was dropped, so a
       server that was down told the person their ledger was empty and offered to connect the
       bank they already have (2026-09-16). */
    setUnread(f.status === 'rejected' && l.status === 'rejected' && td.status === 'rejected');
    setLoaded(true);
  }, []);
  /* Read again on every page (the three views share one mounted component, so a switch
     alone reloaded nothing) and when the tab comes back after a minute away: a bank read
     from the phone or another tab was showing on one page and not the next. */
  useEffect(() => { void load(); }, [load, view]);
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 60000) void load();
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [load]);
  useEffect(() => { moneyAPI.inbox().then(setInbox).catch(() => setInbox(null)); }, []);
  /* A read that failed is not a calendar that was never connected: mapped to connected:false,
     one failed request offered Connect Google to somebody who had already connected it. */
  const [calendarFailed, setCalendarFailed] = useState(false);
  const loadCalendar = useCallback(
    () => moneyAPI.calendar().then((c) => { setCalendar(c); setCalendarFailed(false); }).catch(() => setCalendarFailed(true)),
    [],
  );
  /* Only You shows the calendar, and reading it fetches every pasted link: not on every page. */
  useEffect(() => { if (view === 'you') void loadCalendar(); }, [view, loadCalendar]);
  const [youFailed, setYouFailed] = useState(false);
  const loadYou = useCallback(async () => {
    const [f, q] = await Promise.allSettled([moneyAPI.facts(), moneyAPI.questions()]);
    /* Same rule as the calendar: nothing to show and nothing could be read are different
       lines, and the second one must not read as the first. */
    if (f.status === 'fulfilled') setFacts(f.value);
    if (q.status === 'fulfilled') setQuestions(q.value);
    setYouFailed(f.status === 'rejected');
  }, []);
  useEffect(() => { if (view === 'you') void loadYou(); }, [view, loadYou]);
  async function forget(f: MoneyFact) {
    setBusy(`forget:${f.id}`); setNote(null);
    try {
      const r = await moneyAPI.deleteFact(f.id);
      if (!r.deleted) setNote(t('That one is not yours to forget here.'));
      await loadYou(); await load();
    } catch { setNote(t('That could not be forgotten. Try again.')); }
    finally { setBusy(null); }
  }
  const copyInbox = useCallback(async () => {
    if (!inbox) return;
    try { await navigator.clipboard.writeText(inbox.address); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the address is on the page to select */ }
  }, [inbox]);

  /* The month should not be days old because nobody pressed anything. On open, ask the server
     whether a read is due; it spends one only when the last is old and the budget allows, and
     the page reloads only if that read brought something. */
  useEffect(() => {
    let live = true;
    moneyAPI.refreshIfStale()
      .then((r) => {
        if (!live) return;
        if (r.needs_reconnect) setNeedsReconnect(true);
        if (r.pulled && (r.created ?? 0) > 0) void load();
      })
      .catch(() => {});
    return () => { live = false; };
  }, [load]);

  /* The bank sends the person back here through the callback, which says how it went. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('bank');
    if (!outcome) return;
    /* The name comes back through the URL, so only a bank this page offers is said by name. */
    const known = BANKS.find((b) => b.name === params.get('name'));
    /* The bank's own word for a refusal, when it gave one: plain letters only, so the URL cannot put a sentence here. */
    const why = (params.get('why') || '').replace(/[^a-z0-9_ .-]/gi, '').replace(/_/g, ' ').trim().slice(0, 80);
    setNote(outcome === 'connected'
      ? t('{bank} is connected. The first read is on its way.', { bank: known ? known.label : t('The bank') })
      : why ? t('The bank connection did not go through (the bank said: {why}). Try it again.', { why }) : t('The bank connection did not go through. Try it again.'));
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (outcome === 'connected') void moneyAPI.pull().then(() => load()).catch(() => { /* the note already says where we are */ });
  }, [load, t]);

  const empty = loaded && ledger.length === 0;
  /* The month's payments, held still between renders. Built inline, they were a new array on
     every render, so any unrelated state change tore down the orbits and replayed their
     entrance; for the second and a half that took, nothing on the figure could be clicked. */
  const monthKey = (forecast?.month || new Date().toISOString()).slice(0, 7);
  const monthRows = useMemo(() => ledger.filter((tx) => localDay(tx.occurred_at).slice(0, 7) === monthKey), [ledger, monthKey]);
  /* What they said comes in each month is the band's right edge; the month is drawn against
     it, not against its own worst case. Without a stated income the band keeps its old edge. */
  const incomeEdge = today && today.basis === 'income' && today.base ? Number(today.base) : null;
  const edge = incomeEdge ? Math.max(incomeEdge, forecast ? forecast.projected_p90 : 0) : null;
  /* What the bank says is in each account, freshest read named. XPCD and ITAV include pending
     charges; a figure with a credit line in it is not shown as the person's. */
  const balanceLine = useMemo(() => {
    /* A balance older than two days is not "available": it is not shown at all. */
    const fresh = accounts.filter((a) => a.balance !== null && a.balance !== undefined && !(a.balance_type || '').includes('/credit') && a.balance_at && Date.now() - new Date(a.balance_at).getTime() < 48 * 3600000);
    if (!fresh.length) return null;
    /* A signed figure: an account in its overdraft is said as overdrawn, never as money in it. */
    const signed = (n: number) => (n < 0 ? t('{amount} overdrawn', { amount: euro(Math.abs(n)) }) : euro(n));
    const parts = fresh.map((a) => t('{amount} in {bank}', { amount: signed(Number(a.balance)), bank: `${bankLabel(a.bank_name)}${fresh.filter((b) => (b.bank_name || null) === (a.bank_name || null)).length > 1 && a.iban_mask ? ` ${a.iban_mask.slice(-4)}` : ''}` }));
    const newest = fresh.map((a) => a.balance_at as string).sort().pop() as string;
    const d = new Date(newest);
    const today = d.toDateString() === new Date().toDateString();
    const when = today ? t('read at {time}', { time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }) : t('read {day}', { day: shortDay(newest) });
    const pendingIn = fresh.some((a) => /^(XPCD|ITAV)/.test(a.balance_type || ''));
    const anyNegative = fresh.some((a) => Number(a.balance) < 0);
    /* A booked figure with pending alerts behind it: say about what is left once they land.
       Only when there is one account, since the alerts do not say which account they hit. */
    if (!pendingIn && since > 0 && fresh.length === 1) {
      const after = Number(fresh[0].balance) + pendingNet;
      return t("{amount} booked in {bank}, about {after} after today's {n} pending, {when}.", { amount: signed(Number(fresh[0].balance)), bank: bankLabel(fresh[0].bank_name), after: signed(after), n: since, when });
    }
    const holes = { parts: parts.join(', '), when };
    if (anyNegative) return pendingIn ? t('{parts}, {when}, pending charges included.', holes) : t('{parts}, {when}, pending charges not yet counted.', holes);
    return pendingIn ? t('{parts} available, {when}, pending charges included.', holes) : t('{parts} available, {when}, pending charges not yet counted.', holes);
  }, [accounts, since, pendingNet, t, locale]);
  /* The same days of every month, for the pair bars on the month rows. */
  const todayDay = new Date().getUTCDate();
  const pairMax = Math.max(0, ...months.map((m) => Number(m.spent_to_day) || 0));
  /* The readings that changed something today come first: a change against the person's own
     past, an income that has not come, a cap or a keep, a charge the month cannot carry, a
     split still open, then the twin's own score, then the standing shapes of the ledger. */
  const ranked = useMemo(() => [...readings].sort((a, b) => readingRank(a.kind) - readingRank(b.kind)), [readings]);
  /* Only a reading that moved belongs under "What changed", and among those the one that
     moved the most money comes first: a week 300 EUR over its usual outranks a kind of place
     30 EUR under. On a quiet week the heading says what the list is instead of promising a
     change it does not hold. */
  const changed = useMemo(() => ranked.filter((r) => readingRank(r.kind) < CHANGE_BOUNDARY).sort((a, b) => readingStake(b) - readingStake(a)), [ranked]);
  const shown = (changed.length ? changed : ranked).slice(0, 3);
  const lead = changed.length ? shown[0] : null;
  const rest = lead ? shown.slice(1) : shown;
  /* One purchase makes p10, p50 and p90 the same euro, and reading the same number three
     times looks broken rather than honest. Say nothing about the month until the band opens. */
  const projectable = Boolean(forecast && forecast.projected_p90 - forecast.projected_p10 > 0.5);
  const monthlyLoad = useMemo(
    () => Math.round(recurring.filter((r) => r.cadence === 'monthly').reduce((s, r) => s + Math.abs(Number(r.typical_amount) || 0), 0) * 100) / 100,
    [recurring],
  );
  const subscriptions = recurring.filter((r) => r.is_subscription);
  const bills = recurring.filter((r) => !r.is_subscription);

  /* The ledger is read a month at a time: the running month open, the finished ones folded. */
  const byMonth = useMemo(() => {
    const groups = new Map<string, MoneyTransaction[]>();
    for (const t of ledger) {
      const key = (t.occurred_at || '').slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()].map(([key, rows]) => ({
      key,
      rows,
      segment: months.find((m) => m.month.slice(0, 7) === key) || null,
    }));
  }, [ledger, months]);

  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!receipts[id]) { try { const s = await moneyAPI.sightings(id); setReceipts((m) => ({ ...m, [id]: s })); } catch { /* the row still opens */ } }
  }
  async function verdict(t: MoneyTransaction, v: 'worth_it' | 'not_me') {
    const next = t.verdict === v ? null : v;
    setLedger((rows) => rows.map((r) => (r.id === t.id ? { ...r, verdict: next } : r)));
    try { await moneyAPI.verdict(t.id, next); } catch { setLedger((rows) => rows.map((r) => (r.id === t.id ? { ...r, verdict: t.verdict } : r))); }
  }
  async function connect(bank: string = BANKS[0].name) {
    setBusy('connect'); setNote(null); setConnecting(bank);
    /* On success the page leaves for the bank; the orb stays on the row until it does. */
    try { const { url } = await moneyAPI.connect(bank); window.location.assign(url); }
    catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 503) setBankReady(false);
      setNote(err.status === 503 ? t('The bank feed is not switched on yet.') : t('The bank did not answer. Try again in a moment.'));
      setBusy(null); setConnecting(null);
    }
  }
  async function connectCalendar() {
    setBusy('calendar'); setNote(null);
    try { const { url } = await moneyAPI.calendarConnect(); window.location.assign(url); }
    catch { setNote(t('The calendar connection is not switched on yet.')); }
    finally { setBusy(null); }
  }
  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    const url = feedUrl.trim();
    if (!url) return;
    setBusy('feed'); setNote(null);
    try {
      const f = await moneyAPI.addCalendarFeed(url);
      setFeedUrl('');
      setNote(f.already ? t('That link is already here.') : t('{label} added: {n} events read.', { label: f.label, n: f.events ?? 0 }));
      await loadCalendar();
    } catch (err) { setNote((err as Error).message || t('That link could not be read.')); }
    finally { setBusy(null); }
  }
  async function removeFeed(id: string) {
    setBusy('feed'); setNote(null);
    try { await moneyAPI.removeCalendarFeed(id); await loadCalendar(); }
    catch { setNote(t('That link could not be removed. Try again.')); }
    finally { setBusy(null); }
  }
  async function pull() {
    setBusy('pull'); setNote(null);
    try {
      const r = await moneyAPI.pull();
      if (r.length) setRead({ seen: r.reduce((n, x) => n + x.seen, 0), created: r.reduce((n, x) => n + x.created, 0) });
      else setNote(t('No account to pull from yet.'));
      await load();
    } catch { setNote(t('The pull did not go through.')); }
    finally { setBusy(null); }
  }
  async function importStatement(file: File | null) {
    if (!file) return;
    setBusy('statement'); setNote(null);
    try {
      const r = await moneyAPI.importStatement(file);
      setNote(r.skipped ? t('{read} rows read, {created} new, {skipped} lines skipped.', { read: r.read, created: r.created, skipped: r.skipped }) : t('{read} rows read, {created} new.', { read: r.read, created: r.created }));
      await load();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  }
  /* The free provider allows one request a second, so the button comes back for the rest
     rather than holding a request open until it finishes. */
  async function placeAs(merchantKey: string, category: string, name: string) {
    if (!category) return;
    setBusy('category'); setNote(null);
    try {
      await moneyAPI.setPlaceCategory(merchantKey, category, name);
      setCategories(await moneyAPI.categories(`${todayHere().slice(0, 7)}-01`));
    } catch { setNote(t('That could not be saved. Try again.')); }
    finally { setBusy(null); }
  }
  async function lookupPlaces() {
    setBusy('places'); setNote(null);
    try {
      let placed = 0;
      let left = 1;
      for (let round = 0; round < 6 && left > 0; round += 1) {
        const r = await moneyAPI.lookupPlaces(12);
        placed += r.placed;
        left = r.left;
        if (r.provider === 'none') break;
      }
      setNote(left
        ? t(placed === 1 ? '{n} more merchant placed, {left} still to go.' : '{n} more merchants placed, {left} still to go.', { n: placed, left })
        : t(placed === 1 ? '{n} more merchant placed.' : '{n} more merchants placed.', { n: placed }));
      await load();
    } catch { setNote(t('The place lookup did not answer.')); } finally { setBusy(null); }
  }
  async function makeKey() {
    setBusy('key'); setNote(null);
    try { setKey(await moneyAPI.createCaptureKey()); } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  }

  const monthLabel = forecast ? monthName(locale, forecast.month) : new Date().toLocaleDateString(locale, { month: 'long' });
  const last = forecast ? lastDay(forecast.month) : 30;
  const unmeasured = usage?.unmeasurable || [];
  const ahead = forecast ? stillToCome(t, locale, forecast) : [];

  /* What the ledger says, with the payments that say it one press away. Today carries the
     three that changed something today, the one that moved most as the heading; the month
     carries all of them, last, after where the money went. */
  const readingsSection = readings.length ? (
            <section className="mv-section" id="readings">
              {view === 'today' && lead ? (
                <>
                  {/* The reading that moved the most money is the heading, not a row among rows: it is
                      the one sentence to read on the way out. Its receipts open under it. */}
                  <p className="mv-eyebrow">{t('What changed')}</p>
                  <button type="button" className="mv-lead" aria-expanded={openReading === lead.id} onClick={() => setOpenReading(openReading === lead.id ? null : lead.id)}>
                    {/* The ledger keeps the English sentence for the twin; the page says the same
                        numbers in the reader's own language (readingWords.ts, 2026-09-16). */}
                    {(() => { const said = readingWords(lead, t, locale); return (<>
                      <h2>{said.sentence}</h2>
                      {said.detail ? <p className="mv-sub">{said.detail}</p> : null}
                    </>); })()}
                  </button>
                  {openReading === lead.id ? <ReadingBody r={lead} /> : null}
                </>
              ) : (
                <h2>{t('What the money says.')}</h2>
              )}
              {/* Quiet is a feature. Every other app manufactures a daily line; this one says how
                  long it has had nothing new to say, from the day each reading was first said. */}
              {quietDays !== null && quietDays >= 2 && !lead ? <p className="mv-sub">{t('Nothing new for {n} days.', { n: quietDays })}</p> : null}
              <ul className="mv-list">
                {(view === 'today' ? rest : readings).map((r) => {
                  const isOpen = openReading === r.id;
                  return (
                    <li key={r.id}>
                      <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setOpenReading(isOpen ? null : r.id)}>
                        <span className="mv-item-text">
                          {(() => { const said = readingWords(r, t, locale); return (<>
                            <span className="mv-item-title">{said.sentence}</span>
                            {said.detail ? <span className="mv-item-sub">{said.detail}</span> : null}
                          </>); })()}
                        </span>
                        <span className="mv-item-end"><Chevron /></span>
                      </button>
                      {isOpen ? <ReadingBody r={r} /> : null}
                    </li>
                  );
                })}
                {view === 'today' && readings.length > shown.length ? (
                  <li>
                    <Link to="/money/month#readings" className="mv-item">
                      <span className="mv-item-text"><span className="mv-item-title">{t('All {n} readings', { n: readings.length })}</span></span>
                      <span className="mv-item-end"><Chevron /></span>
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>
  ) : null;

  return (
    <main className="mv">
      <div className="mv-shell">
        <MoneyNav links={MONEY_NAV(view)} />
        <div className="mv-col">

          {/* This month: one figure, one grey line, the band */}
          {view === 'today' ? (
          <section className={`mv-hero${loaded && !empty && today && today.amount !== null ? ' mv-hero--orb' : ''}`} id="month">
            {/* the globe stands where the stamp stood */}
            <p className="mv-eyebrow">{monthLabel}</p>
            {!loaded ? (
              /* The first seconds of a new account are the month being read; an ellipsis
                 where the number goes read as a broken figure to a stranger. */
              <Wait inline state="searching" line="Reading your month." />
            ) : unread ? (
              <>
                <h1>{t('Your month could not be read.')}</h1>
                <p className="mv-sub">{t('Nothing is lost. Try again in a moment.')}</p>
                <div className="mv-ctas">
                  <button type="button" className="mv-pill" onClick={() => void load()}>{t('Try again')}</button>
                </div>
              </>
            ) : empty ? (
              <>
                <h1>{t('Nothing read yet.')}</h1>
                <p className="mv-sub">{t('Connect Santander or Revolut, or let your phone send each purchase as it happens.')}</p>
                <div className="mv-ctas">
                  <button type="button" className="mv-pill" onClick={() => void connect(BANKS[0].name)} disabled={busy === 'connect' || !bankReady}>{t('Connect Santander')}</button>
                  <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void connect(BANKS[1].name)} disabled={busy === 'connect' || !bankReady}>{t('Or Revolut')}</button>
                  <Link to="/money/you#sources" className="mv-pill mv-pill--ghost">{t('Set up the phone')}</Link>
                </div>
              </>
            ) : (
              <>
                {/* Safe to spend today leads, with the basis it rests on; the month is the line
                    under it. Until a month can be read, the month figure leads as before. */}
                {today && today.amount !== null ? (
                  <>
                    {/* The day as a globe: the number inside it, ember filling from the bottom as
                        the day is spent. Tapping it opens today's payments under the hero. */}
                    {(() => {
                      const mark = forecast?.days?.days.find((d) => d.today);
                      const spentToday = mark ? mark.total : 0;
                      return (
                        <div className="mv-globe-slot">
                          <DayGlobe
                            size={typeof window !== 'undefined' && window.innerWidth < 768 ? 280 : 360}
                            left={today.over ? -(today.free ?? 0) : today.amount}
                            spent={spentToday}
                            over={Boolean(today.over)}
                            label={today.over
                              ? t('Over today, {spent} spent. Tap to see the payments.', { spent: euro(spentToday) })
                              : t('{left} left today, {spent} spent. Tap to see the payments.', { left: euro(today.amount), spent: euro(spentToday) })}
                            onTap={() => setDayOpen((o) => !o)}
                            open={dayOpen}
                          />
                        </div>
                      );
                    })()}
                    <h1>{today.over ? t('Nothing today.') : t('{amount} today.', { amount: euro(today.amount) })}</h1>
                    {/* One line: the basis. The month lives in the band's two labels below. */}
                    {today.sentence ? <p className="mv-sub">{today.sentence}</p> : null}
                    {/* The real thing under it: what the bank says is in the account, read with you
                        present, named as available and never as safe to spend. */}
                    {balanceLine ? <p className="mv-sub">{balanceLine}</p> : null}
                    {/* What the diary already expects today. The allowance has taken it off the
                        number above; without this line it is taken off for no visible reason. */}
                    {today.today_events?.length ? (
                      <p className="mv-sub">{t('The diary expects {what} today.', { what: today.today_events.map((e) => `${e.title}, ${euro(e.amount)}`).join('; ') })}</p>
                    ) : null}
                    {dayOpen ? (() => {
                      const todayKey = todayHere();
                      const rows = ledger.filter((t) => localDay(t.occurred_at) === todayKey && Number(t.amount) < 0);
                      return rows.length ? (
                        <ul className="mv-list mv-day-rows" aria-label={t("Today's payments")}>
                          {rows.map((row) => (
                            <li key={row.id} className="mv-item mv-item--tight">
                              <span className="mv-item-text">
                                <span className="mv-item-title">{row.merchant_name || row.merchant_raw || t('Unknown')}</span>
                                <span className="mv-item-sub">{new Date(row.occurred_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                              <span className="mv-item-end">{euro(Math.abs(Number(row.amount)))}</span>
                            </li>
                          ))}
                          <TotalRow count={rows.length} total={rows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0)} />
                        </ul>
                      ) : <p className="mv-sub">{t('Nothing paid yet today.')}</p>;
                    })() : null}
                  </>
                ) : (
                  <>
                    <h1>{t('{amount} so far.', { amount: forecast ? euro(forecast.spent) : '\u2026' })}</h1>
                    {forecast ? (
                      <p className="mv-sub">
                        {projectable
                          ? t('Likely {amount} by the {day}, somewhere from {low} to {high}.', { amount: euro(forecast.projected_p50), day: ordinalDay(t, last), low: euro(forecast.projected_p10), high: euro(forecast.projected_p90) })
                          : t('Too early to say where the month lands.')}
                      </p>
                    ) : null}
                    {today && today.why ? <p className="mv-sub">{today.why}</p> : null}
                  </>
                )}
                {/* The band's own record, once it has one: how many days it has been checked
                    against, and how many it held. A range nobody scores is a range nobody
                    should trust, so the number is printed as soon as there is one. */}
                {forecast?.band_calibration && forecast.band_calibration.days >= 14 && forecast.band_calibration.coverage !== null ? (
                  <p className="mv-sub">{t('The range has held on {held} of the last {days} days.', { held: Math.round(forecast.band_calibration.coverage * forecast.band_calibration.days), days: forecast.band_calibration.days })}</p>
                ) : null}
                {/* A month that stopped moving must say why: the bank ends its session on its
                    own schedule, and nothing can be read until it is authorised again. */}
                {reconnect ? <p className="mv-sub">{t('The bank connection has ended. Reconnect it under Sources.')}</p> : null}
              </>
            )}
            {forecast && !empty ? (
              <div className="mv-band">
                {/* Ink for what has gone, grey to where the month lands. The spread stays in the
                    line above: drawn as a third layer it left a hole that read as a fault. */}
                <div className="mv-band-track">
                  <div className="mv-band-likely" style={{ width: `${pct(Math.max(forecast.projected_p50, forecast.spent + forecast.committed), forecast, edge)}%` }} />
                  <div className="mv-band-spent" style={{ width: `${pct(forecast.spent, forecast, edge)}%` }} />
                  {/* Where what they want left begins, when they said so: the month has a wall
                      before the end of the track. */}
                  {incomeEdge && today?.keep ? <i className="mv-band-mark" style={{ left: `${pct(incomeEdge - today.keep, forecast, edge)}%` }} title={t('Keeping {amount}', { amount: euro(today.keep) })} /> : null}
                </div>
                <div className="mv-band-labels">
                  <span>{t('Spent {amount}', { amount: euro(forecast.spent) })}</span>
                  {/* The track ends at what comes in when they said it; the likely figure and its
                      reach stay in the label so the band reads as spent, likely, and the wall. */}
                  <span>
                    {(() => {
                      const likely = { amount: euro(Math.max(forecast.projected_p50, forecast.spent + forecast.committed)), high: euro(forecast.projected_p90), day: ordinalDay(t, last), income: euro(incomeEdge || 0) };
                      if (incomeEdge) return projectable ? t('Likely {amount}, up to {high}; {income} comes in', likely) : t('Likely {amount}; {income} comes in', likely);
                      return projectable ? t('Likely {amount} by the {day}, up to {high}', likely) : t('Likely {amount} by the {day}', likely);
                    })()}
                  </span>
                </div>
                {forecast.days && forecast.days.days.length ? <Fortnight strip={forecast.days} tomorrow={forecast.tomorrow ?? null} ledger={ledger} /> : null}
                {ahead.length ? (
                  <>
                  <p className="mv-sub mv-ahead-head">{t('Still to come this month')}</p>
                  <ul className="mv-list mv-ahead" aria-label={t('Still to come this month')}>
                    {ahead.map((r) => (
                      <li key={`${r.kind}-${r.on}-${r.name}`} className="mv-item mv-item--tight">
                        <span className="mv-ahead-day">{shortDay(r.on, locale)}</span>
                        <KindTile kind={r.kind === 'income' ? 'income' : r.kind === 'stated' ? 'commitment' : r.kind === 'diary' ? 'diary' : 'software'} label={r.name} />
                        <span className="mv-item-text"><span className="mv-item-title">{r.name}</span><span className="mv-item-sub">{r.why}</span></span>
                        <span className={`mv-item-end mv-figures${r.amount > 0 ? ' mv-ahead-in' : ''}`}>{r.amount > 0 ? '+' : ''}{euro(Math.abs(r.amount))}</span>
                      </li>
                    ))}
                  </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>
          ) : null}

          {view === 'today' ? readingsSection : null}

          {/* The month opens on its figure, with the one drawing that says how it compares:
              this month to today's date against the same days of last month. */}
          {view === 'month' ? (
          <section className="mv-hero mv-hero--orb" id="month-title">
            <p className="mv-eyebrow">{t('Month')}</p>
            {/* The day says it is reading; the month printed an ellipsis where its figure goes,
                which reads as a broken number to anyone who has not seen it work. */}
            {!loaded ? <Wait inline state="searching" line="Reading your month." /> : null}
            {/* The month as a constellation: a hub per kind of place, a dot per payee. It
                says nothing until tapped; the list it opens ends in the total. */}
            {categories && categories.groups.some((g) => g.spent > 0) ? (() => {
              const key = monthKey;
              return (
                <MonthOrbits
                  groups={categories.groups}
                  rows={monthRows}
                  recurring={recurring}
                  today={new Date().getDate()}
                  daysInMonth={last}
                  monthKey={key}
                  label={t('{month} as orbits: a ring per kind of place, a mark per payment', { month: monthLabel })}
                />
              );
            })() : null}
            {loaded ? <h1>{(() => {
              const amount = forecast ? euro(forecast.spent) : (months[0] ? euro(months[0].spent) : '\u2026');
              return incomeEdge ? t('{month}, {amount} of {income}.', { month: monthLabel, amount, income: euro(incomeEdge) }) : t('{month}, {amount}.', { month: monthLabel, amount });
            })()}</h1> : null}
            {incomeEdge ? <p className="mv-sub">{today?.keep
              ? t('{income} is what you said comes in, {keep} of it to keep.', { income: euro(incomeEdge), keep: euro(today.keep) })
              : t('{income} is what you said comes in.', { income: euro(incomeEdge) })}</p> : null}
            {months[0] && months[1] && typeof months[1].spent_to_day === 'number' ? (
              <>
                <p className="mv-sub">{t('By the {day}: {amount}; by the {day} of {month}, {other}.', { day: ordinalDay(t, todayDay), amount: euro(months[0].spent_to_day ?? months[0].spent), month: monthName(locale, months[1].month), other: euro(months[1].spent_to_day) })}</p>
                <div className="mv-pairs" aria-hidden="true">
                  {[months[0], months[1]].map((m) => (
                    <div key={m.month} className="mv-pairs-row">
                      <span className="mv-pairs-label">{monthName(locale, m.month)}</span>
                      <span className="mv-pair mv-pair--wide"><i style={{ width: `${pairMax > 0 ? ((Number(m.spent_to_day) || 0) / pairMax) * 100 : 0}%` }} /></span>
                      <span className="mv-pairs-end mv-figures">{euro(m.spent_to_day ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
          ) : null}
          {view === 'you' ? (
          <section className="mv-hero" id="you-title">
            <Stamp mark="rent" />
            <p className="mv-eyebrow">{t('You')}</p>
            <h1>{user?.firstName ? t('{name}.', { name: user.firstName }) : t('You.')}</h1>
            <p className="mv-sub">{t('What it knows in your words, and where it reads from.')}</p>
            {facts === null && !youFailed ? <Wait inline state="searching" line="Reading what it knows." /> : null}
          </section>
          ) : null}

          {/* Where it went, by kind of place */}
          {view === 'month' && categories && categories.groups.length ? (
            <section className="mv-section" id="where">
              <div className="mv-head">
                <h2>{t('Where it went this month.')}</h2>
                {categories.read < categories.total ? (
                  <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void lookupPlaces()} disabled={busy === 'places'}>
                    {busy === 'places' ? t('Looking up\u2026') : t('Look up the rest')}
                  </button>
                ) : null}
              </div>
              <p className="mv-sub">
                {categories.read < categories.total
                  ? t('{read} of {total} placed so far.', { read: euro(categories.read), total: euro(categories.total) })
                  : t('Every payment this month is placed.')}
              </p>
              <ol className="mv-list mv-where">
                {categories.groups.map((g) => (
                  <li key={g.category} className={g.known ? '' : 'is-unknown'}>
                    <div className="mv-item">
                      <KindTile kind={g.known ? g.category : null} label={g.category} />
                      <span className="mv-item-text">
                        <span className="mv-item-title">{cap(t(g.category))}</span>
                        <span className="mv-item-sub">{g.share}%{g.merchants.length ? `, ${g.merchants.map((m) => m.name).slice(0, 3).join(', ')}` : ''}</span>
                        {/* Two pixels of ink for the share: the number above it, drawn. */}
                        <span className="mv-share" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, Number(g.share) || 0))}%` }} /></span>
                      </span>
                      <span className="mv-item-end">{euro(g.spent)}</span>
                    </div>
                    {/* What no provider could place, the person can: one word per merchant, kept
                        as their own and never overwritten by a lookup. */}
                    {!g.known && g.merchants.length ? (
                      <ul className="mv-sublist">
                        {g.merchants.filter((m) => m.merchant_key && m.merchant_key !== 'unknown').map((m) => (
                          <li key={m.merchant_key || m.name} className="mv-item mv-item--sub">
                            <span className="mv-item-text">
                              <span className="mv-item-title">{m.name}</span>
                              <span className="mv-item-sub">{euro(m.spent)}</span>
                            </span>
                            <span className="mv-item-end">
                              <label className="mv-sr" htmlFor={`cat-${m.merchant_key || m.name}`}>{t('What kind of place is {name}?', { name: m.name })}</label>
                              <select id={`cat-${m.merchant_key || m.name}`} className="mv-field mv-field--select" defaultValue="" disabled={busy === 'category'} onChange={(e) => void placeAs(m.merchant_key || m.name, e.target.value, m.name)}>
                                <option value="" disabled>{t('Kind of place')}</option>
                                {moneyAPI.CATEGORIES.map((c) => <option key={c} value={c}>{cap(t(c))}</option>)}
                              </select>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Ledger */}
          {view === 'month' ? (
          <section className="mv-section" id="ledger">
            <h2>{t('Every euro, with its receipts.')}</h2>
            {ledger.length === 0 ? (
              <div className="mv-list"><p className="mv-empty">{t('Fills as the bank and the phone send what they saw.')}</p></div>
            ) : (
              <>
                <p className="mv-sub">{t('Open a month, then a payment, to see what the bank and the phone saw.')}</p>
                <ol className="mv-list">
                  {byMonth.map((group) => {
                    /* Closed until opened: the month page is for reading the month, and sixty
                       rows of it open by default were 4 400 px before the next heading. */
                    const isOpen = monthOpen[group.key] ?? false;
                    const seg = group.segment;
                    /* One sentence: how many payments, over how many days when the month is still
                       running, and what came in. */
                    let countLine = t(group.rows.length === 1 ? '{n} payment' : '{n} payments', { n: group.rows.length });
                    if (seg && !seg.complete && seg.days_covered) countLine = t('{payments} in {covered} of {total} days', { payments: countLine, covered: seg.days_covered, total: seg.days_in_month });
                    if (seg && seg.received) countLine = t('{line}, {amount} in', { line: countLine, amount: euro(seg.received) });
                    return (
                      <li key={group.key}>
                        <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setMonthOpen((all) => ({ ...all, [group.key]: !isOpen }))}>
                          <span className="mv-item-text">
                            <span className="mv-item-title">{monthYear(locale, `${group.key}-01T12:00:00Z`)}</span>
                            <span className="mv-item-sub">{countLine}</span>
                            {/* Two short bars: this month to today's date, and the same days of that
                                month, against the largest of them. What "By the 14th you had spent"
                                says, drawn, on every month at once. */}
                            {seg && typeof seg.spent_to_day === 'number' && pairMax > 0 ? (
                              <span className="mv-pair" aria-hidden="true" title={t('{amount} by the {day}', { amount: euro(seg.spent_to_day), day: ordinalDay(t, todayDay) })}>
                                <i style={{ width: `${(seg.spent_to_day / pairMax) * 100}%` }} />
                              </span>
                            ) : null}
                          </span>
                          <span className="mv-item-end mv-figures">{seg ? euro(seg.spent) : ''}<Chevron /></span>
                        </button>
                        {isOpen ? (
                          <ol className="mv-sublist">
                            {group.rows.map((row) => (
                              <li key={row.id} className={Number(row.amount) > 0 ? 'is-in' : undefined}>
                                <button type="button" className="mv-item mv-item--sub" onClick={() => void toggle(row.id)} aria-expanded={open === row.id}>
                                  <span className="mv-item-text">
                                    <span className="mv-item-title">{merchantLabel(row)}</span>
                                    <span className="mv-item-sub">
                                      {[shortDay(row.occurred_at, locale), row.posted_at ? '' : t('pending'), row.is_recurring ? t('recurring') : '', row.verdict ? t(row.verdict === 'worth_it' ? 'worth it' : 'not me') : ''].filter(Boolean).join(', ')}
                                    </span>
                                  </span>
                                  <span className="mv-item-end mv-amount">{Number(row.amount) > 0 ? '+' : ''}{euro(row.amount)}</span>
                                </button>
                                {open === row.id ? (
                                  <div className="mv-body mv-body--sub">
                                    <ul className="mv-receipts">
                                      {(receipts[row.id] || []).map((s) => (
                                        <li key={s.id}>
                                          <span className="mv-quiet">{t('{source}, read {day}', { source: SOURCE[s.source] ? t(SOURCE[s.source]) : s.source, day: shortDay(s.seen_at) })}</span>
                                          <p>{s.raw_text || `${euro(s.amount)} ${s.currency || ''}`}</p>
                                        </li>
                                      ))}
                                      {receipts[row.id] && receipts[row.id].length === 0 ? <li><p>{t('No receipt kept for this one.')}</p></li> : null}
                                    </ul>
                                    {Number(row.amount) < 0 ? (
                                      <div className="mv-verdicts">
                                        <button type="button" className="mv-pill mv-pill--ghost" aria-pressed={row.verdict === 'worth_it'} onClick={() => void verdict(row, 'worth_it')}>{t('Worth it')}</button>
                                        <button type="button" className="mv-pill mv-pill--ghost" aria-pressed={row.verdict === 'not_me'} onClick={() => void verdict(row, 'not_me')}>{t('Not me')}</button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </section>
          ) : null}

          {/* Recurring */}
          {view === 'month' ? (
          <section className="mv-section" id="recurring">
            <h2>{t('What comes back on its own.')}</h2>
            {recurring.length === 0 ? (
              <div className="mv-list"><p className="mv-empty">{t('A charge counts once it has come back three times at the same rhythm.')}</p></div>
            ) : (
              <>
                {monthlyLoad ? <p className="mv-sub">{t('{amount} of it leaves every month.', { amount: euro(monthlyLoad) })}</p> : null}
                <ul className="mv-list">
                  {[...subscriptions, ...bills].map((r) => {
                    const isOpen = openSeries === r.merchant_key;
                    const name = merchantLabel({ merchant_name: r.merchant_name, merchant_key: r.merchant_key });
                    const more = [
                      r.day_of_month ? t('Lands on the {day}.', { day: ordinalDay(t, r.day_of_month) }) : '',
                      typeof r.total_paid === 'number' ? t(r.occurrences === 1 ? '{amount} so far, over {n} charge.' : '{amount} so far, over {n} charges.', { amount: euro(r.total_paid), n: r.occurrences }) : '',
                      typeof r.uses === 'number'
                        ? r.cost_per_use
                          ? t(r.uses === 1 ? 'Used {n} time this month, {amount} a use.' : 'Used {n} times this month, {amount} a use.', { n: r.uses, amount: euro(r.cost_per_use) })
                          : t(r.uses === 1 ? 'Used {n} time this month.' : 'Used {n} times this month.', { n: r.uses })
                        : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <li key={r.merchant_key}>
                        <button type="button" className="mv-item mv-item--icon" aria-expanded={isOpen} onClick={() => setOpenSeries(isOpen ? null : r.merchant_key)}>
                          <span className="mv-icon" aria-hidden="true">{name.charAt(0)}</span>
                          <span className="mv-item-text">
                            <span className="mv-item-title">{name}</span>
                            <span className="mv-item-sub">
                              {[t(r.is_subscription ? 'Subscription' : 'Recurring'), CADENCE[r.cadence] ? t(CADENCE[r.cadence]) : r.cadence, r.next_expected ? t('next around {day}', { day: shortDay(r.next_expected) }) : ''].filter(Boolean).join(', ')}
                            </span>
                          </span>
                          <span className="mv-item-end">{euro(r.typical_amount)}<Chevron /></span>
                        </button>
                        {isOpen ? (
                          <div className="mv-body mv-body--icon">
                            {more ? <p className="mv-quiet">{more}</p> : null}
                            {r.charges?.length ? (
                              <ul className="mv-sublist">
                                {r.charges.map((c) => (
                                  <li key={c.id} className="mv-item mv-item--tight">
                                    <span className="mv-item-sub">{shortDay(c.occurred_at)}</span>
                                    <span className="mv-item-end">{euro(c.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {/* Whether a subscription was used, and the honest gap where nothing can look: the
                same section, one grey line further down, not a heading of its own. */}
            {usage && (usage.findings.length || unmeasured.length) ? (
              <>
              <p className="mv-sub mv-more" id="usage">
                {unmeasured.length
                  ? t('Whether it gets used: {amount} a month goes where nothing here can look.', { amount: euro(unmeasured.reduce((sum, x) => sum + Number(x.typical_amount || 0), 0)) })
                  : t('Whether it gets used, read from the accounts it can see.')}
              </p>
              <ul className="mv-list">
                {usage.findings.map((f) => (
                  <li key={f.kind + f.sentence} className="mv-item">
                    <span className="mv-item-text">
                      {(() => { const said = readingWords(f, t, locale); return (<>
                        <span className="mv-item-title">{said.sentence}</span>
                        {said.detail ? <span className="mv-item-sub">{said.detail}</span> : null}
                      </>); })()}
                    </span>
                  </li>
                ))}
                {unmeasured.length ? (
                  <li className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">{nameList(t, unmeasured.map((x) => x.name))}</span>
                      <span className="mv-item-sub">{t('No connected account shows their use, so nothing is guessed.')}</span>
                    </span>
                  </li>
                ) : null}
              </ul>
              </>
            ) : null}
          </section>
          ) : null}

          {view === 'month' ? readingsSection : null}

          {/* What it knows: the person's own words, each one forgettable; then what it still
              wants to ask. The facts are claims the ledger checks, so the grey word under each
              is the ledger's verdict when it has one. */}
          {view === 'you' ? (
          <section className="mv-section" id="knows">
            <h2>{t('What it knows.')}</h2>
            <p className="mv-sub">{t('Forget one and it asks again.')}</p>
            <ul className="mv-list">
              {facts === null && !youFailed ? null : youFailed && !facts?.length ? (
                <li><p className="mv-empty">{t('That could not be read right now.')}</p></li>
              ) : facts && facts.length === 0 ? (
                <li><p className="mv-empty">{t('Nothing yet. The questions are where this fills.')}</p></li>
              ) : [...facts].sort((a, b) => factRank(a) - factRank(b)).map((f) => {
                /* A row of fifteen identical buttons is a form, not a list: the fact opens, and
                   Forget waits inside it with the ledger's note. */
                const isOpen = open === `fact:${f.id}`;
                return (
                  <li key={f.id}>
                    <button type="button" className="mv-item mv-item--icon" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `fact:${f.id}`)}>
                      <KindTile kind={f.kind === 'commitment' && f.value !== 'rent' ? 'cash' : f.kind} label={f.kind} />
                      <span className="mv-item-text">
                        <span className="mv-item-title">{factTitle(f, t)}</span>
                        <span className="mv-item-sub">{factWord(f, t)}</span>
                      </span>
                      <span className="mv-item-end mv-figures">{f.amount ? euro(f.amount) : ''}<Chevron /></span>
                    </button>
                    {isOpen ? (
                      <div className="mv-body">
                        <div className="mv-body-foot">
                          <span className="mv-quiet">{f.check_status ? t('The ledger has it as {status}.', { status: f.check_status }) : t('Said, not yet seen in the ledger.')}</span>
                          <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void forget(f)} disabled={busy === `forget:${f.id}`}>{t('Forget')}</button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {questions ? (
                <li>
                  <Link to="/money/setup" className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">
                        {questions.opening.length + questions.fromLedger.length
                          ? t(questions.opening.length + questions.fromLedger.length === 1 ? '{n} question it still has' : '{n} questions it still has', { n: questions.opening.length + questions.fromLedger.length })
                          : t('Nothing to ask right now')}
                      </span>
                      <span className="mv-item-sub">{(questions.opening[0] || questions.fromLedger[0])?.ask || t('When a payment arrives that it cannot read, it asks.')}</span>
                    </span>
                    <span className="mv-item-end"><Chevron /></span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
          ) : null}

          {/* Sources */}
          {view === 'you' ? (
          <section className="mv-section" id="sources">
            <div className="mv-head">
              <h2>{t('Read from a few places.')}</h2>
            </div>
            <p className="mv-sub">{t('Counts and amounts only. Remove a source and what it read goes too.')}</p>
            <ul className="mv-list">
              {BANKS.map((bank, i) => {
                /* Rows from before the second bank carry no name; they were all Santander. */
                const mine = accounts.filter((a) => (a.bank_name || BANKS[0].name) === bank.name);
                const first = i === 0;
                /* One row owns Read now, and only that row turns while it reads. Every connected
                   bank used to show its own orb and its own "Reading the bank." for one press. */
                const owns = mine.length > 0 && (first || !accounts.some((a) => (a.bank_name || BANKS[0].name) === BANKS[0].name));
                return (
                  <li key={bank.name}>
                    <div className="mv-item mv-item--icon">
                      <span className="mv-icon" aria-hidden="true">{hasMark(MARK_FOR[bank.label]) ? <Mark name={MARK_FOR[bank.label]} /> : <Landmark size={16} />}</span>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{bank.label}</span>
                        {/* The booked line describes the accounts under this row, not the other bank's. */}
                        <span className="mv-item-sub mv-item-sub--live" aria-live="polite">
                          {(owns && busy === 'pull') || (busy === 'connect' && connecting === bank.name) ? <LedgerOrb state={busy === 'pull' ? 'searching' : 'connecting'} size={20} label="" /> : null}
                          {mine.length ? (owns || busy !== 'pull' ? bankLine : bookedLine) : first ? t('Read four times a day. You confirm it every six months.') : t('Read four times a day, like the other.')}
                        </span>
                      </span>
                      {/* Only once the accounts are in: before that the row offered a black Connect
                          that turned into Read now a moment later. */}
                      <span className="mv-item-end">
                        {!loaded ? null : mine.length ? (
                          owns
                            ? <button key="read" type="button" className="mv-pill mv-pill--ghost" onClick={pull} disabled={busy === 'pull'}>{t('Read now')}</button>
                            : null
                        ) : (
                          /* With nothing read yet, connecting the first bank is the one thing to do
                             on this page, so it is the page's one ink button. */
                          <button key="connect" type="button" className={empty && first ? 'mv-pill' : 'mv-pill mv-pill--ghost'} onClick={() => void connect(bank.name)} disabled={busy === 'connect' || !bankReady}>{t('Connect')}</button>
                        )}
                      </span>
                    </div>
                    {mine.length ? (
                      <ul className="mv-sublist">
                        {mine.map((a) => (
                          <li key={a.id} className="mv-item mv-item--sub">
                            <span className="mv-item-text">
                              <span className="mv-item-title">{a.name || t('Account')} {a.iban_mask || ''}</span>
                              <span className="mv-item-sub">
                                {[a.consent_expires_at ? t('Confirmed to {day}', { day: shortDay(a.consent_expires_at) }) : '', a.last_pulled_at ? t('last read {day}', { day: shortDay(a.last_pulled_at) }) : ''].filter(Boolean).join(', ')}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true">{calendar?.google ? <Mark name="google_calendar" /> : <img className="mv-carved" src={`/images/money/carved/${markFor('diary')}.png`} alt="" width={26} height={26} />}</span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Your calendar')}</span>
                    <span className="mv-item-sub">
                      {calendarFailed ? t('That could not be read right now.') : calendar?.events_seen
                        ? (calendar.learned_at
                            ? t('{n} events read, last {day}.', { n: calendar.events_seen, day: shortDay(calendar.learned_at, locale) })
                            : t('{n} events read.', { n: calendar.events_seen }))
                        : calendar?.google ? t('Google connected. The diary says what a week usually costs.') : t('What a week costs, and when a quiet habit is only a trip.')}
                    </span>
                  </span>
                  <span className="mv-item-end">
                    {calendar && !calendar.google ? <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void connectCalendar()} disabled={busy === 'calendar'}>{t('Connect Google')}</button> : null}
                  </span>
                </div>
                <ul className="mv-sublist">
                  {(calendar?.feeds || []).map((f) => (
                    <li key={f.id} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{hasMark(f.kind) ? <span className="mv-mark-small" aria-hidden="true"><Mark name={f.kind} size={12} /></span> : null}{f.label}</span>
                        <span className="mv-item-sub">{f.added_at ? t('Added {day}, read once a day.', { day: shortDay(f.added_at) }) : t('Read once a day.')}</span>
                      </span>
                      <span className="mv-item-end"><button type="button" className="mv-pill mv-pill--ghost" onClick={() => void removeFeed(f.id)} disabled={busy === 'feed'}>{t('Remove')}</button></span>
                    </li>
                  ))}
                  {(calendar?.learned || []).map((l, i) => (
                    <li key={l.key || l.label || i} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{l.label}</span>
                        <span className="mv-item-sub">{t('about {amount}, on {n} of {m} days like it', { amount: euro(l.median || 0), n: l.paid ?? 0, m: l.occurrences ?? 0 })}</span>
                      </span>
                    </li>
                  ))}
                  {Boolean(calendar?.events_seen) && !(calendar?.learned || []).length ? (
                    <li className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-sub">{t('No kind of day has a price yet. It learns from the days you pay on.')}</span>
                      </span>
                    </li>
                  ) : null}
                  <li className="mv-item mv-item--sub">
                    <form className="mv-feed" onSubmit={(e) => void addFeed(e)}>
                      <label className="mv-label" htmlFor="mv-feed-url">{t('A Canvas or Blackboard link')}</label>
                      <div className="mv-feed-row">
                        <input id="mv-feed-url" className="mv-field" type="url" inputMode="url" placeholder="https://" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} disabled={busy === 'feed'} />
                        <button type="submit" className="mv-pill mv-pill--ghost" disabled={busy === 'feed' || !feedUrl.trim()}>{busy === 'feed' ? t('Reading') : t('Add')}</button>
                      </div>
                      <p className="mv-quiet">{t('Canvas: Calendar, Calendar feed. Blackboard: Calendar, Get external calendar link. Read once a day; nothing goes out.')}</p>
                    </form>
                  </li>
                </ul>
              </li>
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true"><FileText size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Older months')}</span>
                    <span className="mv-item-sub">{t('The bank opens 90 days. A Santander Excel or CSV adds the rest.')}</span>
                  </span>
                  <span className="mv-item-end">
                    <label className="mv-pill mv-pill--ghost mv-pill--file">
                      {busy === 'statement' ? t('Reading\u2026') : t('Add a statement')}
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv,.txt,.tsv"
                        onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; void importStatement(f); }}
                        disabled={busy === 'statement'}
                      />
                    </label>
                  </span>
                </div>
              </li>
              {inbox ? (
                <li>
                  <div className="mv-item mv-item--icon">
                    <span className="mv-icon" aria-hidden="true"><Mail size={16} /></span>
                    <span className="mv-item-text">
                      <span className="mv-item-title">{t('Receipts by email')}</span>
                      <span className="mv-item-sub">{inbox.receiving ? t('Forward a receipt or invoice; the line items join the ledger.') : t('Forward receipts here once the domain is switched on.')}</span>
                    </span>
                    <span className="mv-item-end">
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void copyInbox()}>{copied ? t('Copied') : t('Copy address')}</button>
                    </span>
                  </div>
                  <div className="mv-body mv-body--icon"><code className="mv-code">{inbox.address}</code></div>
                </li>
              ) : null}
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true"><Smartphone size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Your phone')}</span>
                    <span className="mv-item-sub">{t('Every payment reaches the ledger the moment the bank announces it.')}</span>
                  </span>
                  <span className="mv-item-end">
                    {key ? null : <button type="button" className="mv-pill mv-pill--ghost" onClick={makeKey} disabled={busy === 'key'}>{t('Make a key')}</button>}
                  </span>
                </div>
                {key ? (
                  <div className="mv-body mv-body--icon">
                    <code className="mv-code">{key}</code>
                    <p className="mv-quiet">{t('Shown once. The iPhone shortcut asks for it; the Android app makes its own.')}</p>
                  </div>
                ) : null}
                <ul className="mv-sublist">
                  {/* Android reads the bank's own notifications, which is one switch and then
                      nothing to think about. iPhone cannot: no app may read another app's
                      notifications, so it is a Shortcut on Apple Pay. The two are not equal and
                      the page says so rather than implying they are. */}
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={openHow === 'android'} onClick={() => setOpenHow((o) => (o === 'android' ? null : 'android'))}>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t('Android: the TwinMe app')}</span>
                        <span className="mv-item-sub">{t('It reads your bank app and sends each payment on.')}</span>
                      </span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {openHow === 'android' ? (
                      <ol className="mv-steps">
                        <li>
                          {APK_URL
                            ? <a className="mv-link" href={APK_URL}>{t('Download the app')}</a>
                            : t('The app is not out yet; ask for it and it comes by email.')}
                        </li>
                        <li>{t('Open it and sign in with this email.')}</li>
                        <li>{t('Allow notification access when it asks. Android shows a long list; TwinMe is in it.')}</li>
                        <li>{t('Nothing else. Each bank alert is read and sent, and it keeps any it could not send.')}</li>
                      </ol>
                    ) : null}
                  </li>
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={openHow === 'iphone'} onClick={() => setOpenHow((o) => (o === 'iphone' ? null : 'iphone'))}>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t('iPhone: a Shortcut')}</span>
                        <span className="mv-item-sub">{t('Apple Pay only. No app on iPhone may read notifications.')}</span>
                      </span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {openHow === 'iphone' ? (
                      <ol className="mv-steps">
                        <li>{t('Make a key above and copy it.')}</li>
                        <li><a className="mv-link" href="/downloads/TwinMe-payments.shortcut">{t('Add the shortcut')}</a>{t(', and paste the key when it asks.')}</li>
                        <li>{t('Open Shortcuts, tap Automation at the bottom, then New Automation. Search for Wallet, the one that says when I tap a Wallet card or pass.')}</li>
                        <li>{t('Pick your card, choose Run Immediately, and tap Next.')}</li>
                        <li>{t('Choose the TwinMe payments shortcut. The first time it runs, tap Allow.')}</li>
                      </ol>
                    ) : null}
                  </li>
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={openHow === 'other'} onClick={() => setOpenHow((o) => (o === 'other' ? null : 'other'))}>
                      <span className="mv-item-text"><span className="mv-item-title">{t('Any other tool')}</span></span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {openHow === 'other' ? (
                      <ol className="mv-steps">
                        <li>
                          {/* The sentence is one line in the dictionary; its three holes are code, so the
                              translated line is split on them and each hole rendered as <code>. */}
                          {t('Action: HTTP request, POST to {url}, header {header} with the key, body {body}.').split(/(\{url\}|\{header\}|\{body\})/).map((piece, i) => (
                            piece === '{url}' ? <code key={i}>{`${window.location.origin}/api/money/capture`}</code>
                            : piece === '{header}' ? <code key={i}>X-TwinMe-Key</code>
                            : piece === '{body}' ? <code key={i}>{'{"text": "[notification]"}'}</code>
                            : piece
                          ))}
                        </li>
                        <li>{t('Bizum and SMS alerts work the same way. They are read in Spanish: amount, shop, card, and whether it went out or came in.')}</li>
                      </ol>
                    ) : null}
                  </li>
                </ul>
              </li>
            </ul>
          </section>
          ) : null}
          {/* What a press just did or failed to do, on whichever page the press was made. */}
          {note ? <p className="mv-note" role="status">{note}</p> : null}

          <footer className="mv-foot">
            <Link to="/privacy-policy">{t('Privacy')}</Link>
            <Link to="/terms">{t('Terms')}</Link>
            {/* The one door back to the rest of TwinMe, so Money is not a room without an exit. */}
            <Link to="/today">{t('Your twin')}</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}


/** The payments a reading stands on, and how many: shared by the lead and the rows. */
function ReadingBody({ r }: { r: MoneyReading }) {
  const t = useT();
  return (
    <div className="mv-body">
      {r.receipts.length ? (
        <ul className="mv-sublist">
          {r.receipts.map((t) => (
            <li key={t.id} className="mv-item mv-item--tight">
              <span className="mv-item-text">
                <span className="mv-item-title">{t.merchant_raw || t.merchant_key}</span>
                <span className="mv-item-sub">{shortDay(t.occurred_at)}</span>
              </span>
              <span className="mv-item-end">{euro(t.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mv-body-foot">
        <span className="mv-quiet">{t(r.evidence_count === 1 ? 'From {n} payment' : 'From {n} payments', { n: r.evidence_count })}</span>
      </div>
    </div>
  );
}

/** The order readings take on Today: what moved first, what stands last. */
const READING_ORDER = ['delta_category', 'delta_silence', 'delta_weekday', 'delta_pace', 'income_late', 'cap_month', 'keep_month', 'charge_ahead', 'named_expense', 'split_open', 'own_score', 'month_pace', 'new_merchant', 'biggest_line', 'dormant_charge', 'subscriptions', 'small_payments', 'category_shape', 'weekday_shape'];
function readingRank(kind: string) {
  const i = READING_ORDER.indexOf(kind);
  return i === -1 ? READING_ORDER.length : i;
}
/** Everything ranked before the twin's own score is a change; from there on it is a standing shape. */
const CHANGE_BOUNDARY = READING_ORDER.indexOf('own_score');
/** The euros a reading moved, from the numbers it carries, so what changed most is said first. */
function readingStake(r: MoneyReading): number {
  const n = (k: string) => Math.abs(Number(r.numbers?.[k]) || 0);
  switch (r.kind) {
    case 'delta_category': case 'delta_pace': case 'delta_weekday': return Math.abs(n('current') - n('usual'));
    case 'delta_silence': return n('typical_amount') * Math.max(1, n('days_since') / Math.max(1, n('usual_gap_days')));
    case 'income_late': return n('typical_amount');
    case 'cap_month': return r.numbers?.over ? Math.abs(n('spent') - n('cap')) : 0;
    case 'keep_month': return n('gap');
    case 'charge_ahead': return n('total');
    case 'named_expense': return n('amount');
    case 'split_open': return n('open');
    default: return 0;
  }
}

/** Where a euro amount falls on the band, 0..100, with the projected p90 as the right edge. */
function pct(v: number, f: MoneyForecast, edge: number | null = null) {
  const max = edge ? Math.max(edge, f.spent + f.committed, 1) : Math.max(f.projected_p90, f.spent + f.committed, 1) * 1.08;
  return Math.max(0, Math.min(100, (v / max) * 100));
}
