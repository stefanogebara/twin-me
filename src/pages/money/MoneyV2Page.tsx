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
import { ChevronRight, FileText, Landmark, Plus, Smartphone } from 'lucide-react';
import '../../styles/money-v2.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { moneyAPI, euro, shortDay, type MoneyAccount, type MoneyCategories, type MoneyForecast, type MoneyMonth, type MoneyReading, type MoneyRecurring, type MoneySighting, type MoneyTransaction, type MoneyUsage } from '../../services/api/moneyAPI';

const CADENCE: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
const SOURCE: Record<string, string> = { phone: 'Your phone', bizum: 'Bizum', bankfeed: 'Santander', gmail: 'Gmail', statement: 'Statement' };

const NAV: MoneyNavLink[] = [
  { to: '/money', label: 'This month', current: true },
  { to: '#where', label: 'Where it went', sub: true },
  { to: '#ledger', label: 'Every euro', sub: true },
  { to: '#recurring', label: 'What comes back', sub: true },
  { to: '#sources', label: 'Sources', sub: true },
  { to: '/money/setup', label: 'Questions' },
  { to: '/money/chat', label: 'Ask' },
];

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

export default function MoneyV2Page() {
  /* The tab said "Discover Your Soul Signature" over a page of euros, which is the front
     door's old promise showing through the new product. */
  useDocumentTitle('Money');
  const [forecast, setForecast] = useState<MoneyForecast | null>(null);
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
  const [categories, setCategories] = useState<MoneyCategories | null>(null);
  const [usage, setUsage] = useState<MoneyUsage | null>(null);
  const [bankReady, setBankReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, MoneySighting[]>>({});
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* Two ways to learn the connection has ended, and the page must not depend on the luckier
     one. The refresh call says so when it is the call that hits the dead session; the accounts
     row says so from the last recorded read, which survives a day when the read budget is
     already spent and no call is made at all. */
  const reconnect = needsReconnect || accounts.some((a) => a.needs_reconnect);

  const load = useCallback(async () => {
    const [f, l, r, a, m, rd, c, u] = await Promise.allSettled([
      moneyAPI.forecast(), moneyAPI.ledger(), moneyAPI.recurring(), moneyAPI.accounts(), moneyAPI.months(), moneyAPI.readings(),
      moneyAPI.categories(`${new Date().toISOString().slice(0, 7)}-01`), moneyAPI.usage(),
    ]);
    if (f.status === 'fulfilled') setForecast(f.value);
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
    const outcome = new URLSearchParams(window.location.search).get('bank');
    if (!outcome) return;
    setNote(outcome === 'connected' ? 'Santander is connected. The first read is on its way.' : 'The bank connection did not go through. Try it again.');
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (outcome === 'connected') void moneyAPI.pull().then(() => load()).catch(() => { /* the note already says where we are */ });
  }, [load]);

  const empty = loaded && ledger.length === 0;
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
  async function connect() {
    setBusy('connect'); setNote(null);
    try { const { url } = await moneyAPI.connect(); window.location.assign(url); }
    catch (e) { const err = e as Error & { status?: number }; if (err.status === 503) setBankReady(false); setNote(err.status === 503 ? 'The bank feed is not switched on yet.' : 'The bank did not answer. Try again in a moment.'); }
    finally { setBusy(null); }
  }
  async function pull() {
    setBusy('pull'); setNote(null);
    try { const r = await moneyAPI.pull(); setNote(r.length ? `${r.reduce((n, x) => n + x.seen, 0)} rows read, ${r.reduce((n, x) => n + x.created, 0)} new.` : 'No account to pull from yet.'); await load(); }
    catch { setNote('The pull did not go through.'); }
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
        <MoneyNav links={NAV} />
        <div className="mv-col">

          {/* This month: one figure, one grey line, the band */}
          <section className="mv-hero" id="month">
            <p className="mv-eyebrow">{monthLabel}</p>
            {empty ? (
              <>
                <h1>Nothing read yet.</h1>
                <p className="mv-sub">Connect Santander, or let your phone send each purchase as it happens.</p>
                <div className="mv-ctas">
                  <button type="button" className="mv-pill" onClick={connect} disabled={busy === 'connect' || !bankReady}>Connect Santander</button>
                  <a href="#sources" className="mv-pill mv-pill--ghost">Set up the phone</a>
                </div>
              </>
            ) : (
              <>
                <h1>{forecast ? euro(forecast.spent) : '…'} so far.</h1>
                {forecast ? (
                  <p className="mv-sub">
                    {projectable
                      ? `Likely ${euro(forecast.projected_p50)} by the ${last}${ordinalSuffix(last)}, somewhere from ${euro(forecast.projected_p10)} to ${euro(forecast.projected_p90)}.`
                      : 'Too early to say where the month lands.'}
                  </p>
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
                  <span>
                    {forecast.committed_items.length
                      ? `${nameList(forecast.committed_items.map((c) => merchantLabel(c)))} still to come`
                      : `Likely ${euro(Math.max(forecast.projected_p50, forecast.spent + forecast.committed))}`}
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          {/* What the ledger says, with the payments that say it one press away */}
          {readings.length ? (
            <section className="mv-section" id="readings">
              <h2>What the money says.</h2>
              <ul className="mv-list">
                {readings.map((r) => {
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
              </ul>
            </section>
          ) : null}

          {/* Where it went, by kind of place */}
          {categories && categories.groups.length ? (
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
          {months.length > 1 ? (
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
                                      {t.is_recurring ? ', recurring' : ''}
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

          {/* Recurring */}
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

          {/* Whether a subscription was used, and the honest gap where nothing can look */}
          {usage && (usage.findings.length || unmeasured.length) ? (
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
          <section className="mv-section" id="sources">
            <div className="mv-head">
              <h2>Read from two places.</h2>
              {accounts.length ? (
                <button type="button" className="mv-icon-btn" aria-label="Connect another account" onClick={connect} disabled={busy === 'connect' || !bankReady}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <p className="mv-sub">Counts and amounts only. Remove a source and what it read goes too.</p>
            <ul className="mv-list">
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true"><Landmark size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">Santander</span>
                    <span className="mv-item-sub">{bankReady ? 'Read four times a day. You confirm it every six months.' : 'The bank feed is not switched on yet.'}</span>
                  </span>
                  {/* Only once the accounts are in: before that the row offered a black Connect
                      that turned into Read now a moment later. */}
                  <span className="mv-item-end">
                    {!loaded ? null : accounts.length ? (
                      <button key="read" type="button" className="mv-pill mv-pill--ghost" onClick={pull} disabled={busy === 'pull'}>Read now</button>
                    ) : (
                      <button key="connect" type="button" className={`mv-pill ${empty ? 'mv-pill--ghost' : ''}`} onClick={connect} disabled={busy === 'connect' || !bankReady}>Connect</button>
                    )}
                  </span>
                </div>
                {accounts.length ? (
                  <ul className="mv-sublist">
                    {accounts.map((a) => (
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
            {note ? <p className="mv-note" role="status">{note}</p> : null}
          </section>

          <footer className="mv-foot">
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}

/** Where a euro amount falls on the band, 0..100, with the projected p90 as the right edge. */
function pct(v: number, f: MoneyForecast) {
  const max = Math.max(f.projected_p90, f.spent + f.committed, 1) * 1.08;
  return Math.max(0, Math.min(100, (v / max) * 100));
}
