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
import { CalendarDays, ChevronRight, FileText, Landmark, Mail, Smartphone } from 'lucide-react';
import '../../styles/money-v2.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { moneyAPI, euro, shortDay, bankLabel, BANKS, type MoneyAccount, type MoneyCalendar, type MoneyCategories, type MoneyDayStrip, type MoneyForecast, type MoneyToday, type MoneyMonth, type MoneyReading, type MoneyRecurring, type MoneySighting, type MoneyTransaction, type MoneyUsage } from '../../services/api/moneyAPI';

const CADENCE: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
const SOURCE: Record<string, string> = { phone: 'Your phone', bizum: 'Bizum', bankfeed: 'Santander', gmail: 'Gmail', statement: 'Statement' };

/* Three pages and Ask, the shape the phone already has. The month page was one scroll of
   eight sections and a thousand words; the sidebar pretended to be pages. Now it is. */
export type MoneyView = 'today' | 'month' | 'you';
export const MONEY_NAV = (current: string): MoneyNavLink[] => [
  { to: '/money', label: 'Today', current: current === 'today' },
  { to: '/money/month', label: 'Month', current: current === 'month' },
  { to: '/money/you', label: 'You', current: current === 'you' },
  { to: '/money/setup', label: 'Questions', current: current === 'questions' },
  { to: '/money/chat', label: 'Ask', current: current === 'ask' },
];

/* What is still to come this month, as dated rows: detected charges, stated commitments,
   income, and diary events with a learned cost. A band without the rows under it is a
   range nobody can act on; with them the month reads as a calendar of money. */
type Ahead = { on: string; name: string; amount: number; kind: 'charge' | 'stated' | 'income' | 'diary' };
function stillToCome(f: MoneyForecast): Ahead[] {
  const rows: Ahead[] = [];
  for (const c of f.committed_items || []) rows.push({ on: c.next_expected.slice(0, 10), name: merchantLabel(c), amount: -Math.abs(Number(c.typical_amount)), kind: 'charge' });
  for (const c of f.commitment_items || []) rows.push({ on: c.due_on, name: c.subject || 'A standing charge', amount: -Math.abs(Number(c.amount)), kind: 'stated' });
  for (const i of f.income_items || []) rows.push({ on: i.due_on, name: i.subject || i.source || 'Comes in', amount: Math.abs(Number(i.amount)), kind: 'income' });
  for (const e of f.calendar_items || []) if (e.expected && Number(e.expected.amount) > 0) rows.push({ on: e.on.slice(0, 10), name: e.label || e.title || 'In the diary', amount: -Math.abs(Number(e.expected.amount)), kind: 'diary' });
  return rows.filter((r) => Number.isFinite(r.amount) && r.on).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : Math.abs(b.amount) - Math.abs(a.amount))).slice(0, 8);
}

function merchantLabel(t: { merchant_name?: string | null; merchant_raw?: string | null; merchant_key: string }) {
  const s = t.merchant_name || t.merchant_raw || t.merchant_key;
  const base = s.length > 2 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
/** Two names read with an "and"; more than three become a count, so the line stays a sentence. */
function nameList(names: string[]) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
function ordinalSuffix(n: number) {
  if (n % 10 === 1 && n !== 11) return 'st';
  if (n % 10 === 2 && n !== 12) return 'nd';
  if (n % 10 === 3 && n !== 13) return 'rd';
  return 'th';
}
function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function monthName(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { month: 'long' }); }
function monthYear(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
function lastDay(iso: string) { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }

function Chevron() { return <ChevronRight className="mv-chev" size={16} strokeWidth={1.75} aria-hidden="true" />; }

export default function MoneyV2Page({ view = 'today' }: { view?: MoneyView } = {}) {
  /* The tab said "Discover Your Soul Signature" over a page of euros, which is the front
     door's old promise showing through the new product. */
  useDocumentTitle(view === 'today' ? 'Money' : view === 'month' ? 'Money, the month' : 'Money, you');
  const [forecast, setForecast] = useState<MoneyForecast | null>(null);
  /* The one number a person opens the app for. It leads Today; the month sits under it. */
  const [today, setToday] = useState<MoneyToday | null>(null);
  const [ledger, setLedger] = useState<MoneyTransaction[]>([]);
  const [recurring, setRecurring] = useState<MoneyRecurring[]>([]);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [months, setMonths] = useState<MoneyMonth[]>([]);
  const [readings, setReadings] = useState<MoneyReading[]>([]);
  const [openReading, setOpenReading] = useState<string | null>(null);
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [monthOpen, setMonthOpen] = useState<Record<string, boolean>>({});
  const [showSteps, setShowSteps] = useState(false);
  const [inbox, setInbox] = useState<{ address: string; receiving: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  /* The calendar lens: Google, or links pasted from Canvas and Blackboard. */
  const [calendar, setCalendar] = useState<MoneyCalendar | null>(null);
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
  const since = bookedTo ? ledger.filter((t) => !t.posted_at && t.occurred_at > bookedTo).length : 0;
  const bookedLine = bookedTo
    ? `Booked to ${shortDay(bookedTo)}${since ? `, ${since} ${since === 1 ? 'alert' : 'alerts'} since` : ''}. Cards post on working days.`
    : 'Read four times a day. You confirm it every six months.';
  const bankLine = !bankReady ? 'The bank feed is not switched on yet.'
    : busy === 'connect' ? 'Opening the bank.'
    : busy === 'pull' ? 'Reading the bank.'
    : read ? (read.created ? `${read.created} new just now.` : `Nothing new just now. ${bookedLine}`)
    : bookedLine;

  const load = useCallback(async () => {
    const [f, l, r, a, m, rd, c, u, td] = await Promise.allSettled([
      moneyAPI.forecast(), moneyAPI.ledger(), moneyAPI.recurring(), moneyAPI.accounts(), moneyAPI.months(), moneyAPI.readings(),
      moneyAPI.categories(`${new Date().toISOString().slice(0, 7)}-01`), moneyAPI.usage(), moneyAPI.today(),
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
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { moneyAPI.inbox().then(setInbox).catch(() => setInbox(null)); }, []);
  const loadCalendar = useCallback(() => moneyAPI.calendar().then(setCalendar).catch(() => setCalendar({ connected: false })), []);
  useEffect(() => { void loadCalendar(); }, [loadCalendar]);
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
    setNote(outcome === 'connected' ? `${bankLabel(params.get('name'))} is connected. The first read is on its way.` : 'The bank connection did not go through. Try it again.');
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (outcome === 'connected') void moneyAPI.pull().then(() => load()).catch(() => { /* the note already says where we are */ });
  }, [load]);

  const empty = loaded && ledger.length === 0;
  /* The readings that changed something today come first: a change against the person's own
     past, an income that has not come, a cap or a keep, a charge the month cannot carry, a
     split still open, then the twin's own score, then the standing shapes of the ledger. */
  const shown = useMemo(() => [...readings].sort((a, b) => readingRank(a.kind) - readingRank(b.kind)).slice(0, 3), [readings]);
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
    setBusy('connect'); setNote(null);
    try { const { url } = await moneyAPI.connect(bank); window.location.assign(url); }
    catch (e) { const err = e as Error & { status?: number }; if (err.status === 503) setBankReady(false); setNote(err.status === 503 ? 'The bank feed is not switched on yet.' : 'The bank did not answer. Try again in a moment.'); }
    finally { setBusy(null); }
  }
  async function connectCalendar() {
    setBusy('calendar'); setNote(null);
    try { const { url } = await moneyAPI.calendarConnect(); window.location.assign(url); }
    catch { setNote('The calendar connection is not switched on yet.'); }
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
      setNote(f.already ? 'That link is already here.' : `${f.label} added: ${f.events ?? 0} events read.`);
      await loadCalendar();
    } catch (err) { setNote((err as Error).message || 'That link could not be read.'); }
    finally { setBusy(null); }
  }
  async function removeFeed(id: string) {
    setBusy('feed'); setNote(null);
    try { await moneyAPI.removeCalendarFeed(id); await loadCalendar(); }
    catch { setNote('That link could not be removed. Try again.'); }
    finally { setBusy(null); }
  }
  async function pull() {
    setBusy('pull'); setNote(null);
    try {
      const r = await moneyAPI.pull();
      if (r.length) setRead({ seen: r.reduce((n, x) => n + x.seen, 0), created: r.reduce((n, x) => n + x.created, 0) });
      else setNote('No account to pull from yet.');
      await load();
    } catch { setNote('The pull did not go through.'); }
    finally { setBusy(null); }
  }
  async function importStatement(file: File | null) {
    if (!file) return;
    setBusy('statement'); setNote(null);
    try {
      const r = await moneyAPI.importStatement(file);
      setNote(`${r.read} rows read, ${r.created} new${r.skipped ? `, ${r.skipped} lines skipped` : ''}.`);
      await load();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  }
  /* The free provider allows one request a second, so the button comes back for the rest
     rather than holding a request open until it finishes. */
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
      setNote(`${placed} more ${placed === 1 ? 'merchant' : 'merchants'} placed${left ? `, ${left} still to go` : ''}.`);
      await load();
    } catch { setNote('The place lookup did not answer.'); } finally { setBusy(null); }
  }
  async function makeKey() {
    setBusy('key'); setNote(null);
    try { setKey(await moneyAPI.createCaptureKey()); } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  }

  const monthLabel = forecast ? monthName(forecast.month) : new Date().toLocaleDateString('en-GB', { month: 'long' });
  const last = forecast ? lastDay(forecast.month) : 30;
  const unmeasured = usage?.unmeasurable || [];

  return (
    <main className="mv">
      <div className="mv-shell">
        <MoneyNav links={MONEY_NAV(view)} />
        <div className="mv-col">

          {/* This month: one figure, one grey line, the band */}
          {view === 'today' ? (
          <section className="mv-hero" id="month">
            <p className="mv-eyebrow">{monthLabel}</p>
            {!loaded ? (
              /* The first seconds of a new account are the month being read; an ellipsis
                 where the number goes read as a broken figure to a stranger. */
              <h1>Reading your month.</h1>
            ) : empty ? (
              <>
                <h1>Nothing read yet.</h1>
                <p className="mv-sub">Connect Santander or Revolut, or let your phone send each purchase as it happens.</p>
                <div className="mv-ctas">
                  <button type="button" className="mv-pill" onClick={() => void connect(BANKS[0].name)} disabled={busy === 'connect' || !bankReady}>Connect Santander</button>
                  <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void connect(BANKS[1].name)} disabled={busy === 'connect' || !bankReady}>Or Revolut</button>
                  <Link to="/money/you#sources" className="mv-pill mv-pill--ghost">Set up the phone</Link>
                </div>
              </>
            ) : (
              <>
                {/* Safe to spend today leads, with the basis it rests on; the month is the line
                    under it. Until a month can be read, the month figure leads as before. */}
                {today && today.amount !== null ? (
                  <>
                    <h1>{today.over ? 'Nothing today.' : `${euro(today.amount)} today.`}</h1>
                    {today.sentence ? <p className="mv-sub">{today.sentence}</p> : null}
                    {forecast ? (
                      <p className="mv-sub">
                        {`${euro(forecast.spent)} so far this month${projectable ? `; likely ${euro(forecast.projected_p50)} by the ${last}${ordinalSuffix(last)}, from ${euro(forecast.projected_p10)} to ${euro(forecast.projected_p90)}.` : '.'}`}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h1>{forecast ? euro(forecast.spent) : '\u2026'} so far.</h1>
                    {forecast ? (
                      <p className="mv-sub">
                        {projectable
                          ? `Likely ${euro(forecast.projected_p50)} by the ${last}${ordinalSuffix(last)}, somewhere from ${euro(forecast.projected_p10)} to ${euro(forecast.projected_p90)}.`
                          : 'Too early to say where the month lands.'}
                      </p>
                    ) : null}
                    {today && today.why ? <p className="mv-sub">{today.why}</p> : null}
                  </>
                )}
                {/* The band's own record, once it has one: how many days it has been checked
                    against, and how many it held. A range nobody scores is a range nobody
                    should trust, so the number is printed as soon as there is one. */}
                {forecast?.band_calibration && forecast.band_calibration.days >= 14 && forecast.band_calibration.coverage !== null ? (
                  <p className="mv-sub">{`The range has held on ${Math.round(forecast.band_calibration.coverage * forecast.band_calibration.days)} of the last ${forecast.band_calibration.days} days.`}</p>
                ) : null}
                {/* A month that stopped moving must say why: the bank ends its session on its
                    own schedule, and nothing can be read until it is authorised again. */}
                {reconnect ? <p className="mv-sub">The bank connection has ended. Reconnect it under Sources.</p> : null}
              </>
            )}
            {forecast && !empty ? (
              <div className="mv-band">
                {/* Ink for what has gone, grey to where the month lands. The spread stays in the
                    line above: drawn as a third layer it left a hole that read as a fault. */}
                <div className="mv-band-track">
                  <div className="mv-band-likely" style={{ width: `${pct(Math.max(forecast.projected_p50, forecast.spent + forecast.committed), forecast)}%` }} />
                  <div className="mv-band-spent" style={{ width: `${pct(forecast.spent, forecast)}%` }} />
                </div>
                <div className="mv-band-labels">
                  <span>Spent {euro(forecast.spent)}</span>
                  {/* The charges still to come are named in the rows below; the label keeps the figure. */}
                  <span>{`Likely ${euro(Math.max(forecast.projected_p50, forecast.spent + forecast.committed))}`}</span>
                </div>
                {forecast.days && forecast.days.days.length ? <DayStrip strip={forecast.days} tomorrow={forecast.tomorrow ?? null} /> : null}
                {stillToCome(forecast).length ? (
                  <ul className="mv-list mv-ahead" aria-label="Still to come this month">
                    {stillToCome(forecast).map((r) => (
                      <li key={`${r.kind}-${r.on}-${r.name}`} className="mv-item mv-item--tight">
                        <span className="mv-ahead-day">{shortDay(r.on)}</span>
                        <span className="mv-item-text"><span className="mv-item-title">{r.name}</span></span>
                        <span className={`mv-item-end mv-figures${r.amount > 0 ? ' mv-ahead-in' : ''}`}>{r.amount > 0 ? '+' : ''}{euro(Math.abs(r.amount))}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
          ) : null}

          {/* What the ledger says, with the payments that say it one press away. Today carries
              the three that changed something today; the month carries all of them. */}
          {(view === 'today' || view === 'month') && readings.length ? (
            <section className="mv-section" id="readings">
              <h2>{view === 'today' ? 'What changed.' : 'What the money says.'}</h2>
              {/* Quiet is a feature. Every other app manufactures a daily line; this one says how
                  long it has had nothing new to say, from the day each reading was first said. */}
              {quietDays !== null && quietDays >= 2 ? <p className="mv-sub">{`Nothing new for ${quietDays} days.`}</p> : null}
              <ul className="mv-list">
                {(view === 'today' ? shown : readings).map((r) => {
                  const isOpen = openReading === r.id;
                  return (
                    <li key={r.id}>
                      <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setOpenReading(isOpen ? null : r.id)}>
                        <span className="mv-item-text">
                          <span className="mv-item-title">{r.sentence}</span>
                          {r.detail ? <span className="mv-item-sub">{r.detail}</span> : null}
                        </span>
                        <span className="mv-item-end"><Chevron /></span>
                      </button>
                      {isOpen ? (
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
                            <span className="mv-quiet">From {r.evidence_count} {r.evidence_count === 1 ? 'payment' : 'payments'}</span>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {view === 'today' && readings.length > shown.length ? (
                  <li>
                    <Link to="/money/month#readings" className="mv-item">
                      <span className="mv-item-text"><span className="mv-item-title">{`All ${readings.length} readings`}</span></span>
                      <span className="mv-item-end"><Chevron /></span>
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {/* Where it went, by kind of place */}
          {view === 'month' && categories && categories.groups.length ? (
            <section className="mv-section" id="where">
              <div className="mv-head">
                <h2>Where it went this month.</h2>
                {categories.read < categories.total ? (
                  <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void lookupPlaces()} disabled={busy === 'places'}>
                    {busy === 'places' ? 'Looking up…' : 'Look up the rest'}
                  </button>
                ) : null}
              </div>
              <p className="mv-sub">
                {categories.read < categories.total
                  ? `${euro(categories.read)} of ${euro(categories.total)} placed so far.`
                  : 'Every payment this month is placed.'}
              </p>
              <ol className="mv-list">
                {categories.groups.map((g) => (
                  <li key={g.category} className={`mv-item ${g.known ? '' : 'is-unknown'}`}>
                    <span className="mv-item-text">
                      <span className="mv-item-title">{cap(g.category)}</span>
                      <span className="mv-item-sub">{g.share}%{g.merchants.length ? `, ${g.merchants.map((m) => m.name).slice(0, 3).join(', ')}` : ''}</span>
                    </span>
                    <span className="mv-item-end">{euro(g.spent)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Month by month */}
          {view === 'month' && months.length > 1 ? (
            <section className="mv-section" id="months">
              <h2>Month by month.</h2>
              <ol className="mv-list">
                {months.map((m) => (
                  <li key={m.month} className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">{monthYear(m.month)}</span>
                      <span className="mv-item-sub">
                        {m.complete ? `${m.lines} payments` : `${m.lines} payments in ${m.days_covered} of ${m.days_in_month} days`}
                        {m.received ? `, ${euro(m.received)} in` : ''}
                      </span>
                    </span>
                    <span className="mv-item-end">{euro(m.spent)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Ledger */}
          {view === 'month' ? (
          <section className="mv-section" id="ledger">
            <h2>Every euro, with its receipts.</h2>
            {ledger.length === 0 ? (
              <div className="mv-list"><p className="mv-empty">Fills as the bank and the phone send what they saw.</p></div>
            ) : (
              <>
                <p className="mv-sub">Press a payment to see what the bank and the phone saw.</p>
                <ol className="mv-list">
                  {byMonth.map((group, i) => {
                    const isOpen = monthOpen[group.key] ?? i === 0;
                    return (
                      <li key={group.key}>
                        <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setMonthOpen((all) => ({ ...all, [group.key]: !isOpen }))}>
                          <span className="mv-item-text">
                            <span className="mv-item-title">{monthYear(`${group.key}-01T12:00:00Z`)}</span>
                            <span className="mv-item-sub">
                              {group.rows.length} {group.rows.length === 1 ? 'payment' : 'payments'}
                              {group.segment ? `, ${euro(group.segment.spent)} out${group.segment.received ? `, ${euro(group.segment.received)} in` : ''}` : ''}
                            </span>
                          </span>
                          <span className="mv-item-end"><Chevron /></span>
                        </button>
                        {isOpen ? (
                          <ol className="mv-sublist">
                            {group.rows.map((t) => (
                              <li key={t.id} className={Number(t.amount) > 0 ? 'is-in' : undefined}>
                                <button type="button" className="mv-item mv-item--sub" onClick={() => void toggle(t.id)} aria-expanded={open === t.id}>
                                  <span className="mv-item-text">
                                    <span className="mv-item-title">{merchantLabel(t)}</span>
                                    <span className="mv-item-sub">
                                      {shortDay(t.occurred_at)}
                                      {t.posted_at ? '' : ', pending'}{t.is_recurring ? ', recurring' : ''}
                                      {t.verdict ? `, ${t.verdict === 'worth_it' ? 'worth it' : 'not me'}` : ''}
                                    </span>
                                  </span>
                                  <span className="mv-item-end mv-amount">{Number(t.amount) > 0 ? '+' : ''}{euro(t.amount)}</span>
                                </button>
                                {open === t.id ? (
                                  <div className="mv-body mv-body--sub">
                                    <ul className="mv-receipts">
                                      {(receipts[t.id] || []).map((s) => (
                                        <li key={s.id}>
                                          <span className="mv-quiet">{SOURCE[s.source] || s.source}, read {shortDay(s.seen_at)}</span>
                                          <p>{s.raw_text || `${euro(s.amount)} ${s.currency || ''}`}</p>
                                        </li>
                                      ))}
                                      {receipts[t.id] && receipts[t.id].length === 0 ? <li><p>No receipt kept for this one.</p></li> : null}
                                    </ul>
                                    {Number(t.amount) < 0 ? (
                                      <div className="mv-verdicts">
                                        <button type="button" className="mv-pill mv-pill--ghost" aria-pressed={t.verdict === 'worth_it'} onClick={() => void verdict(t, 'worth_it')}>Worth it</button>
                                        <button type="button" className="mv-pill mv-pill--ghost" aria-pressed={t.verdict === 'not_me'} onClick={() => void verdict(t, 'not_me')}>Not me</button>
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
            <h2>What comes back on its own.</h2>
            {recurring.length === 0 ? (
              <div className="mv-list"><p className="mv-empty">A charge counts once it has come back three times at the same rhythm.</p></div>
            ) : (
              <>
                {monthlyLoad ? <p className="mv-sub">{`${euro(monthlyLoad)} of it leaves every month.`}</p> : null}
                <ul className="mv-list">
                  {[...subscriptions, ...bills].map((r) => {
                    const isOpen = openSeries === r.merchant_key;
                    const name = merchantLabel({ merchant_name: r.merchant_name, merchant_key: r.merchant_key });
                    const more = [
                      r.day_of_month ? `Lands on the ${r.day_of_month}${ordinalSuffix(r.day_of_month)}.` : '',
                      typeof r.total_paid === 'number' ? `${euro(r.total_paid)} so far, over ${r.occurrences} ${r.occurrences === 1 ? 'charge' : 'charges'}.` : '',
                      typeof r.uses === 'number' ? `Used ${r.uses} time${r.uses === 1 ? '' : 's'} this month${r.cost_per_use ? `, ${euro(r.cost_per_use)} a use` : ''}.` : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <li key={r.merchant_key}>
                        <button type="button" className="mv-item mv-item--icon" aria-expanded={isOpen} onClick={() => setOpenSeries(isOpen ? null : r.merchant_key)}>
                          <span className="mv-icon" aria-hidden="true">{name.charAt(0)}</span>
                          <span className="mv-item-text">
                            <span className="mv-item-title">{name}</span>
                            <span className="mv-item-sub">
                              {r.is_subscription ? 'Subscription' : 'Recurring'}, {CADENCE[r.cadence] || r.cadence}
                              {r.next_expected ? `, next around ${shortDay(r.next_expected)}` : ''}
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
          </section>
          ) : null}

          {/* Whether a subscription was used, and the honest gap where nothing can look */}
          {view === 'month' && usage && (usage.findings.length || unmeasured.length) ? (
            <section className="mv-section" id="usage">
              <h2>Whether it gets used.</h2>
              <p className="mv-sub">
                {unmeasured.length
                  ? `${euro(unmeasured.reduce((sum, x) => sum + Number(x.typical_amount || 0), 0))} a month goes where nothing here can look.`
                  : 'Read from the accounts it can see.'}
              </p>
              <ul className="mv-list">
                {usage.findings.map((f) => (
                  <li key={f.kind + f.sentence} className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">{f.sentence}</span>
                      {f.detail ? <span className="mv-item-sub">{f.detail}</span> : null}
                    </span>
                  </li>
                ))}
                {unmeasured.length ? (
                  <li className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">{nameList(unmeasured.map((x) => x.name))}</span>
                      <span className="mv-item-sub">No connected account shows their use, so nothing is guessed.</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {/* Sources */}
          {view === 'you' ? (
          <section className="mv-section" id="sources">
            <div className="mv-head">
              <h2>Read from a few places.</h2>
            </div>
            <p className="mv-sub">Counts and amounts only. Remove a source and what it read goes too.</p>
            <ul className="mv-list">
              {BANKS.map((bank, i) => {
                /* Rows from before the second bank carry no name; they were all Santander. */
                const mine = accounts.filter((a) => (a.bank_name || BANKS[0].name) === bank.name);
                const first = i === 0;
                return (
                  <li key={bank.name}>
                    <div className="mv-item mv-item--icon">
                      <span className="mv-icon" aria-hidden="true"><Landmark size={16} /></span>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{bank.label}</span>
                        <span className="mv-item-sub" aria-live="polite">{mine.length || first ? bankLine : 'Read four times a day, like the other.'}</span>
                      </span>
                      {/* Only once the accounts are in: before that the row offered a black Connect
                          that turned into Read now a moment later. */}
                      <span className="mv-item-end">
                        {!loaded ? null : mine.length ? (
                          first || !accounts.some((a) => (a.bank_name || BANKS[0].name) === BANKS[0].name)
                            ? <button key="read" type="button" className="mv-pill mv-pill--ghost" onClick={pull} disabled={busy === 'pull'}>Read now</button>
                            : null
                        ) : (
                          <button key="connect" type="button" className={`mv-pill ${empty && first ? 'mv-pill--ghost' : 'mv-pill--ghost'}`} onClick={() => void connect(bank.name)} disabled={busy === 'connect' || !bankReady}>Connect</button>
                        )}
                      </span>
                    </div>
                    {mine.length ? (
                      <ul className="mv-sublist">
                        {mine.map((a) => (
                          <li key={a.id} className="mv-item mv-item--sub">
                            <span className="mv-item-text">
                              <span className="mv-item-title">{a.name || 'Account'} {a.iban_mask || ''}</span>
                              <span className="mv-item-sub">
                                {[a.consent_expires_at ? `Confirmed to ${shortDay(a.consent_expires_at)}` : '', a.last_pulled_at ? `last read ${shortDay(a.last_pulled_at)}` : ''].filter(Boolean).join(', ')}
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
                  <span className="mv-icon" aria-hidden="true"><CalendarDays size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">Your calendar</span>
                    <span className="mv-item-sub">
                      {calendar?.google ? 'Google connected. The diary says what a week usually costs.' : 'What a week costs, and when a quiet habit is only a trip.'}
                    </span>
                  </span>
                  <span className="mv-item-end">
                    {calendar && !calendar.google ? <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void connectCalendar()} disabled={busy === 'calendar'}>Connect Google</button> : null}
                  </span>
                </div>
                <ul className="mv-sublist">
                  {(calendar?.feeds || []).map((f) => (
                    <li key={f.id} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{f.label}</span>
                        <span className="mv-item-sub">{f.added_at ? `Added ${shortDay(f.added_at)}, read once a day.` : 'Read once a day.'}</span>
                      </span>
                      <span className="mv-item-end"><button type="button" className="mv-pill mv-pill--ghost" onClick={() => void removeFeed(f.id)} disabled={busy === 'feed'}>Remove</button></span>
                    </li>
                  ))}
                  <li className="mv-item mv-item--sub">
                    <form className="mv-feed" onSubmit={(e) => void addFeed(e)}>
                      <label className="mv-label" htmlFor="mv-feed-url">A Canvas or Blackboard link</label>
                      <div className="mv-feed-row">
                        <input id="mv-feed-url" className="mv-field" type="url" inputMode="url" placeholder="https://" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} disabled={busy === 'feed'} />
                        <button type="submit" className="mv-pill mv-pill--ghost" disabled={busy === 'feed' || !feedUrl.trim()}>{busy === 'feed' ? 'Reading' : 'Add'}</button>
                      </div>
                      <p className="mv-quiet">Canvas: Calendar, Calendar feed. Blackboard: Calendar, Get external calendar link. Read once a day; nothing goes out.</p>
                    </form>
                  </li>
                </ul>
              </li>
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true"><FileText size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">Older months</span>
                    <span className="mv-item-sub">The bank opens 90 days. A Santander Excel or CSV adds the rest.</span>
                  </span>
                  <span className="mv-item-end">
                    <label className="mv-pill mv-pill--ghost mv-pill--file">
                      {busy === 'statement' ? 'Reading…' : 'Add a statement'}
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
                      <span className="mv-item-title">Receipts by email</span>
                      <span className="mv-item-sub">{inbox.receiving ? 'Forward a receipt or invoice; the line items join the ledger.' : 'Forward receipts here once the domain is switched on.'}</span>
                    </span>
                    <span className="mv-item-end">
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void copyInbox()}>{copied ? 'Copied' : 'Copy address'}</button>
                    </span>
                  </div>
                  <div className="mv-body mv-body--icon"><code className="mv-code">{inbox.address}</code></div>
                </li>
              ) : null}
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true"><Smartphone size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">Your phone</span>
                    <span className="mv-item-sub">Each bank alert lands here in seconds, through a key.</span>
                  </span>
                  <span className="mv-item-end">
                    {key ? null : <button type="button" className="mv-pill mv-pill--ghost" onClick={makeKey} disabled={busy === 'key'}>Make a key</button>}
                  </span>
                </div>
                {key ? (
                  <div className="mv-body mv-body--icon">
                    <code className="mv-code">{key}</code>
                    <p className="mv-quiet">Shown once. Copy it into the macro.</p>
                  </div>
                ) : null}
                <ul className="mv-sublist">
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={showSteps} onClick={() => setShowSteps((s) => !s)}>
                      <span className="mv-item-text"><span className="mv-item-title">How to set it up</span></span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {showSteps ? (
                      <ol className="mv-steps">
                        <li>Install MacroDroid, or Tasker if you already use it.</li>
                        <li>New macro. Trigger: notification received, from the Santander app. Allow notification access.</li>
                        <li>Action: HTTP request, POST to <code>{`${window.location.origin}/api/money/capture`}</code>, header <code>X-TwinMe-Key</code> with the key, body <code>{'{"text": "[notification]"}'}</code>.</li>
                        <li>Bizum and SMS alerts work the same way. They are read in Spanish: amount, shop, card, and whether it went out or came in.</li>
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
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}

/**
 * The last thirty days as marks under the band: a bar for what each day cost, and behind
 * it, on the days the twin had said a range the night before, that range as a grey segment.
 * A day that broke its range is drawn in the danger ink. Every value is in the title of
 * its column and in the one grey line under the strip, so the figure is never the only
 * place a number lives. Built from elements, not SVG, so the register's tokens resolve.
 */
function DayStrip({ strip, tomorrow }: { strip: MoneyDayStrip; tomorrow: MoneyForecast['tomorrow'] }) {
  const max = Math.max(1, ...strip.days.map((d) => Math.max(d.total, d.said ? d.said.high : 0)));
  const h = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const line = [
    `${euro(strip.total)} over the last ${strip.days.length - 1} days, on ${strip.days_with_spend} of them.`,
    strip.said_days ? `The range was given on ${strip.said_days} ${strip.said_days === 1 ? 'day' : 'days'} and held on ${strip.held}.` : '',
    tomorrow ? (tomorrow.value > 0 ? `Tomorrow: usually ${euro(tomorrow.value)}, up to ${euro(tomorrow.high)}.` : `Tomorrow is usually quiet, up to ${euro(tomorrow.high)}.`) : '',
  ].filter(Boolean).join(' ');
  return (
    <figure className="mv-strip" aria-label="The last thirty days">
      <div className="mv-strip-days">
        {strip.days.map((d) => (
          <span
            key={d.day}
            className={`mv-strip-day${d.today ? ' mv-strip-day--today' : ''}${d.hit === false ? ' mv-strip-day--miss' : ''}`}
            title={`${dayName(d.day)}${d.today ? ', so far' : ''}: ${euro(d.total)}${d.count ? `, ${d.count} ${d.count === 1 ? 'payment' : 'payments'}` : ''}${d.said ? `. Said ${euro(d.said.low)} to ${euro(d.said.high)}, ${d.hit ? 'held' : 'broke'}.` : ''}`}
          >
            {d.said ? <i className="mv-strip-said" style={{ bottom: h(d.said.low), height: h(d.said.high - d.said.low) }} /> : null}
            <b className="mv-strip-bar" style={{ height: h(d.total) }} />
          </span>
        ))}
      </div>
      <div className="mv-band-labels"><span>{shortDay(strip.from)}</span><span>Today</span></div>
      <figcaption className="mv-sub">{line}</figcaption>
    </figure>
  );
}

/** The order readings take on Today: what moved first, what stands last. */
const READING_ORDER = ['delta_category', 'delta_silence', 'delta_weekday', 'delta_pace', 'income_late', 'cap_month', 'keep_month', 'charge_ahead', 'named_expense', 'split_open', 'own_score', 'month_pace', 'new_merchant', 'biggest_line', 'dormant_charge', 'subscriptions', 'small_payments', 'category_shape', 'weekday_shape'];
function readingRank(kind: string) {
  const i = READING_ORDER.indexOf(kind);
  return i === -1 ? READING_ORDER.length : i;
}

/** Where a euro amount falls on the band, 0..100, with the projected p90 as the right edge. */
function pct(v: number, f: MoneyForecast) {
  const max = Math.max(f.projected_p90, f.spent + f.committed, 1) * 1.08;
  return Math.max(0, Math.min(100, (v / max) * 100));
}
