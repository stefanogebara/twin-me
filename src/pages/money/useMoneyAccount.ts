/**
 * What the money page knows and can do, in three hooks and one that composes them.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale, useT } from '@/lib/i18n';
import { moneyAPI, shortDay, BANKS, type MoneyAccount as MoneyBankAccount, type MoneyCalendar, type MoneyCategories, type MoneyFact, type MoneyForecast, type MoneyPattern, type MoneyQuestions, type MoneyToday, type MoneyMonth, type MoneyPage, type MoneyReading, type MoneyRecurring, type MoneyTransaction, type MoneyUsage } from '../../services/api/moneyAPI';
import { moneyRevision, MONEY_CHANGED } from '../../services/api/moneyChanges';
import { todayHere, localDay } from './readingWords';
import type { MoneyView } from './navLinks';
import { stillToCome, monthName, lastDay, type T } from './words';
import { CHANGE_BOUNDARY, readingRank, readingStake } from './readingOrder';

/* The last read, kept across mounts. Today, Month and You share this component, but Ask is
   another route: Today, then Ask, then Today unmounted it, and it came back with nothing,
   showed the waiting orb and read nine endpoints again. A page that mounts with a recent
   read paints from it at once and reads again quietly only when it is older than half a
   minute (Stefano, 2026-09-16: "it loads all over again"). */
type Snapshot = {
  userId: string | null; revision: number; at: number; forecast: MoneyForecast | null; today: MoneyToday | null; ledger: MoneyTransaction[]; recurring: MoneyRecurring[];
  accounts: MoneyBankAccount[]; months: MoneyMonth[]; readings: MoneyReading[]; categories: MoneyCategories | null; usage: MoneyUsage | null; unread: boolean;
  capabilities: { bank: boolean; capture: boolean }; inbox: { address: string; receiving: boolean } | null;
};
let SNAPSHOT: Snapshot | null = null;
const SNAPSHOT_FRESH_MS = 30000;
/* The tab keeps the last read too (M2-3, 2026-09-19): a reload, or a return from the bank's
   site, paints the page at once from what it showed a moment ago and reads again quietly.
   The tab and not the browser: it goes when the tab closes, and it is keyed by the person, so
   a change of account on the same tab never paints another person's month. */
const STORE_KEY = (userId: string) => `twinme:money:page:${userId}`;
function storedSnapshot(userId: string | null): Snapshot | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(STORE_KEY(userId));
    if (!raw) return null;
    const kept = JSON.parse(raw) as Snapshot;
    /* A read the tab kept before a chat edit or a bank read moved the ledger is not painted:
       its revision is the one it was read at, and only the current one counts. On a reload
       the counter starts again at zero, which is the revision every stored read carries. */
    return kept && kept.userId === userId && Array.isArray(kept.ledger) && kept.revision === moneyRevision() ? kept : null;
  } catch { return null; }
}
function storeSnapshot(snapshot: Snapshot) {
  try { sessionStorage.setItem(STORE_KEY(snapshot.userId as string), JSON.stringify(snapshot)); } catch { /* a full or absent store means the next reload waits, as before */ }
}

/** The nine reads that make the page, kept fresh and kept across mounts. */
export function useMoneyRead(userId: string | null, view: MoneyView) {
  if (SNAPSHOT?.userId !== userId || SNAPSHOT?.revision !== moneyRevision()) SNAPSHOT = storedSnapshot(userId);
  const [forecast, setForecast] = useState<MoneyForecast | null>(SNAPSHOT?.forecast ?? null);
  /* The one number a person opens the app for. It leads Today; the month sits under it. */
  const [today, setToday] = useState<MoneyToday | null>(SNAPSHOT?.today ?? null);
  const [unread, setUnread] = useState(SNAPSHOT?.unread ?? false);
  const [ledger, setLedger] = useState<MoneyTransaction[]>(SNAPSHOT?.ledger ?? []);
  const [recurring, setRecurring] = useState<MoneyRecurring[]>(SNAPSHOT?.recurring ?? []);
  const [accounts, setAccounts] = useState<MoneyBankAccount[]>(SNAPSHOT?.accounts ?? []);
  const [months, setMonths] = useState<MoneyMonth[]>(SNAPSHOT?.months ?? []);
  const [readings, setReadings] = useState<MoneyReading[]>(SNAPSHOT?.readings ?? []);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [categories, setCategories] = useState<MoneyCategories | null>(SNAPSHOT?.categories ?? null);
  const [usage, setUsage] = useState<MoneyUsage | null>(SNAPSHOT?.usage ?? null);
  const [capabilities, setCapabilities] = useState(SNAPSHOT?.capabilities ?? { bank: false, capture: false });
  const [inbox, setInbox] = useState<{ address: string; receiving: boolean } | null>(SNAPSHOT?.inbox ?? null);
  const [loaded, setLoaded] = useState(Boolean(SNAPSHOT));
  const seq = useRef(0);
  /* A read in the air, so a view change during one does not send nine requests after it. It
     is cleared by the unmount that cancels the read, because a cancelled read leaves nothing
     behind and the mount that follows has to ask again. */
  const reading = useRef(false);
  useEffect(() => () => { seq.current++; reading.current = false; }, []);
  const lastLoad = useRef(SNAPSHOT?.at ?? 0);
  /* The view the read is for, without making the read a new function on every view change:
     every effect that hangs off load (the stale check, the change listener) would run again
     on each switch, and the stale check is a request. */
  const viewRef = useRef(view);
  viewRef.current = view;
  const load = useCallback(async () => {
    const mine = ++seq.current;
    reading.current = true;
    /* One request for the page (M2-3, 2026-09-19): nine reads under one authentication on
       the server, and the names of the parts that could not be read. Nine requests over a
       browser's six connections painted in rounds. */
    let page: MoneyPage | null = null;
    try { page = await moneyAPI.page(viewRef.current); } catch { page = null; }
    if (mine !== seq.current) return;
    /* Marked when the read lands, not when it leaves. Stamped on departure, a read cancelled
       by an unmount still counted as "just loaded", so the mount that replaced it read
       nothing and waited on an answer nobody was going to give. Every StrictMode mount does
       exactly this, which is why Today never left "Reading your month" in development
       (2026-09-18). */
    reading.current = false;
    lastLoad.current = Date.now();
    const failed = new Set(page ? page.failed : []);
    const got = <K extends keyof MoneyPage>(k: K): MoneyPage[K] | undefined => (page && !failed.has(k) && page[k] !== null ? page[k] : undefined);
    const f = got('forecast'); if (f !== undefined) setForecast(f);
    const td = got('today'); if (page && !failed.has('today')) setToday(page.today);
    const l = got('ledger'); if (l !== undefined) setLedger(l);
    const r = got('recurring'); if (r !== undefined) setRecurring(r);
    const a = got('accounts'); if (a !== undefined) setAccounts(a);
    const m = got('months'); if (m !== undefined) setMonths(m);
    const rd = got('readings'); if (rd !== undefined) setReadings(rd);
    const c = got('categories'); if (c !== undefined) setCategories(c);
    const u = got('usage'); if (u !== undefined) setUsage(u);
    const cap = got('capabilities'); if (cap !== undefined) setCapabilities(cap);
    const ib = got('inbox'); if (ib !== undefined) setInbox(ib); else if (page && failed.has('inbox')) setInbox(null);
    /* A month that could not be read is not an empty month. Every rejection was dropped, so a
       server that was down told the person their ledger was empty and offered to connect the
       bank they already have (2026-09-16). */
    const unreadNow = !page || (failed.has('forecast') && failed.has('ledger') && failed.has('today'));
    setUnread(unreadNow);
    setLoaded(true);
    /* Kept for the next mount. A read that failed outright is not kept: the next page should
       try again rather than paint a failure it has not seen. */
    if (!unreadNow) {
      SNAPSHOT = {
        userId, revision: moneyRevision(), at: Date.now(),
        forecast: f !== undefined ? f : SNAPSHOT?.forecast ?? null,
        today: td !== undefined ? td : SNAPSHOT?.today ?? null,
        ledger: l !== undefined ? l : SNAPSHOT?.ledger ?? [],
        recurring: r !== undefined ? r : SNAPSHOT?.recurring ?? [],
        accounts: a !== undefined ? a : SNAPSHOT?.accounts ?? [],
        months: m !== undefined ? m : SNAPSHOT?.months ?? [],
        readings: rd !== undefined ? rd : SNAPSHOT?.readings ?? [],
        categories: c !== undefined ? c : SNAPSHOT?.categories ?? null,
        usage: u !== undefined ? u : SNAPSHOT?.usage ?? null,
        capabilities: cap !== undefined ? cap : SNAPSHOT?.capabilities ?? { bank: false, capture: false },
        inbox: ib !== undefined ? ib : SNAPSHOT?.inbox ?? null,
        unread: false,
      };
      storeSnapshot(SNAPSHOT);
    }
  }, [userId]);
  /* Read again on every page (the three views share one mounted component, so a switch
     alone reloaded nothing) and when the tab comes back after a minute away: a bank read
     from the phone or another tab was showing on one page and not the next. */
  /* A page the person has just been on is not read again: the switch is theirs, the data is
     seconds old, and the bank has not moved. Anything older than half a minute is read. */
  useEffect(() => {
    if (reading.current || Date.now() - lastLoad.current < SNAPSHOT_FRESH_MS) return;
    void load();
  }, [load, view]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(MONEY_CHANGED, refresh);
    return () => window.removeEventListener(MONEY_CHANGED, refresh);
  }, [load]);
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
  return { forecast, today, unread, ledger, setLedger, recurring, accounts, months, readings, categories, setCategories, usage, capabilities, inbox, loaded, needsReconnect, setNeedsReconnect, load };
}

/** What only You shows, read only there: the calendar, the facts, the patterns, the inbox. */
export function useYouReads(view: MoneyView, inbox: { address: string; receiving: boolean } | null) {
  const [copied, setCopied] = useState(false);
  /* The calendar lens: Google, or links pasted from Canvas and Blackboard. */
  const [calendar, setCalendar] = useState<MoneyCalendar | null>(null);
  /* What it knows, in the person's words, and what it still wants to ask: the You page. */
  const [facts, setFacts] = useState<MoneyFact[] | null>(null);
  const [questions, setQuestions] = useState<MoneyQuestions | null>(null);
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
  const [patterns, setPatterns] = useState<MoneyPattern[] | null>(null);
  const loadYou = useCallback(async () => {
    const [f, q] = await Promise.allSettled([moneyAPI.facts(), moneyAPI.questions()]);
    /* Same rule as the calendar: nothing to show and nothing could be read are different
       lines, and the second one must not read as the first. */
    if (f.status === 'fulfilled') setFacts(f.value);
    if (q.status === 'fulfilled') setQuestions(q.value);
    setYouFailed(f.status === 'rejected');
  }, []);
  /* What it worked out on its own, only on the page that shows it: it is a read of the whole
     ledger and nothing else needs it. */
  useEffect(() => { if (view === 'you' && patterns === null) void moneyAPI.patterns().then(setPatterns).catch(() => setPatterns([])); }, [view, patterns]);
  useEffect(() => { if (view === 'you') void loadYou(); }, [view, loadYou]);
  const copyInbox = useCallback(async () => {
    if (!inbox) return;
    try { await navigator.clipboard.writeText(inbox.address); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the address is on the page to select */ }
  }, [inbox]);
  return { calendar, calendarFailed, loadCalendar, facts, questions, youFailed, loadYou, patterns, copied, copyInbox };
}

type ActionDeps = {
  t: T; load: () => Promise<void>; loadCalendar: () => Promise<void>; loadYou: () => Promise<void>;
  setLedger: React.Dispatch<React.SetStateAction<MoneyTransaction[]>>; setCategories: (c: MoneyCategories) => void; setNeedsReconnect: (v: boolean) => void;
};
/** Every press on the page, and what it says afterwards. */
export function useMoneyActions({ t, load, loadCalendar, loadYou, setLedger, setCategories, setNeedsReconnect }: ActionDeps) {
  const [captureKey, setCaptureKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* Which bank is being opened, so the connecting orb sits on that bank's row and no other. */
  const [connecting, setConnecting] = useState<string | null>(null);
  /* What the last Read now brought back, said on the Santander row itself. The note at the
     foot of the section sat below the fold, so a read that found nothing looked like a
     button that did nothing. */
  const [read, setRead] = useState<{ seen: number; created: number } | null>(null);
  const [bankReady, setBankReady] = useState(true);
  async function forget(f: MoneyFact) {
    setBusy(`forget:${f.id}`); setNote(null);
    try {
      const r = await moneyAPI.deleteFact(f.id);
      if (!r.deleted) setNote(t('That one is not yours to forget here.'));
      await loadYou(); await load();
    } catch { setNote(t('That could not be forgotten. Try again.')); }
    finally { setBusy(null); }
  }
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
  /* Adds the link and says whether it took, so the field empties only on success. */
  async function addFeed(url: string): Promise<boolean> {
    setBusy('feed'); setNote(null);
    try {
      const f = await moneyAPI.addCalendarFeed(url);
      setNote(f.already ? t('That link is already here.') : t('{label} added: {n} events read.', { label: f.label, n: f.events ?? 0 }));
      await loadCalendar();
      return true;
    /* The server's own words are English, whoever is reading. The page says what happened. */
    } catch { setNote(t('That link could not be read.')); return false; }
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
    try { setCaptureKey(await moneyAPI.createCaptureKey()); } catch { setNote(t('That key could not be made. Try again.')); } finally { setBusy(null); }
  }
  return { captureKey, busy, note, connecting, read, bankReady, forget, verdict, connect, connectCalendar, addFeed, removeFeed, pull, placeAs, lookupPlaces, makeKey };
}

/** The whole page, as one object the views read from. */
export function useMoneyAccount(view: MoneyView, userId: string | null) {
  const t = useT();
  const locale = useLocale();
  const { user } = useAuth();
  const r = useMoneyRead(userId, view);
  const y = useYouReads(view, r.inbox);
  const a = useMoneyActions({ t, load: r.load, loadCalendar: y.loadCalendar, loadYou: y.loadYou, setLedger: r.setLedger, setCategories: r.setCategories, setNeedsReconnect: r.setNeedsReconnect });
  const { forecast, today, ledger, recurring, accounts, months, readings, usage, loaded, needsReconnect } = r;
  const { busy, read, bankReady } = a;
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
  const sinceRows = bookedTo ? ledger.filter((t) => t.verdict !== 'not_me' && (!t.currency || t.currency === 'EUR') && !t.posted_at && t.occurred_at > bookedTo) : [];
  const since = sinceRows.length;
  /* What the pending alerts add up to, signed: the bank's booked figure minus these is about
     what is really left, and the bank does not say it. */
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

  /* One read at a time, and only the newest one counts. Nine requests went out on every
     view change with nothing to cancel them, so a slow answer from the page before could
     land on top of a newer one, and Today to Month and back was twenty seven requests. */
  const empty = loaded && ledger.length === 0;
  /* The month's payments, held still between renders. Built inline, they were a new array on
     every render, so any unrelated state change tore down the orbits and replayed their
     entrance; for the second and a half that took, nothing on the figure could be clicked. */
  const monthKey = (forecast?.month || new Date().toISOString()).slice(0, 7);
  const monthRows = useMemo(() => ledger.filter((tx) => tx.verdict !== 'not_me' && (!tx.currency || tx.currency === 'EUR') && localDay(tx.occurred_at).slice(0, 7) === monthKey), [ledger, monthKey]);
  /* What they said comes in each month is the band's right edge; the month is drawn against
     it, not against its own worst case. Without a stated income the band keeps its old edge. */
  /* The month is framed by what they said comes in even when the day rests on the balance. */
  const incomeEdge = today && (today.income ?? (today.basis === 'income' ? today.base : null)) ? Number(today.income ?? today.base) : null;
  const edge = incomeEdge ? Math.max(incomeEdge, forecast ? forecast.projected_p90 : 0) : null;
  /* The server owns balance eligibility and pending adjustments. Never derive a second
     cash figure from whichever rows happen to be visible on this screen. */
  const balanceLine = today?.balance
    ? t('Bank snapshot from {day}.', { day: shortDay(today.balance.at, locale) })
    : null;
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
  const monthLabel = forecast ? monthName(locale, forecast.month) : new Date().toLocaleDateString(locale, { month: 'long' });
  const last = forecast ? lastDay(forecast.month) : 30;
  const unmeasured = usage?.unmeasurable || [];
  const ahead = forecast ? stillToCome(t, locale, forecast) : [];
  return {
    t, locale, user, ...r, ...y, ...a,
    reconnect, quietDays, bookedLine, bankLine, empty, monthKey, monthRows, incomeEdge, edge, balanceLine, todayDay, pairMax,
    ranked, changed, shown, lead, rest, projectable, monthlyLoad, subscriptions, bills, byMonth, monthLabel, last, unmeasured, ahead,
  };
}
export type MoneyAccount = ReturnType<typeof useMoneyAccount>;
