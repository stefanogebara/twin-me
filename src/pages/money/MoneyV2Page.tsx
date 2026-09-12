/**
 * Money, in the Instinct register: a white page, warm panels, one ink at three strengths,
 * hairlines and no decoration. This month with a band; every euro with its receipts and a
 * verdict; what comes back on its own;
 * the two sources (Santander through Enable Banking, and the phone).
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import '../../styles/money-v2.css';
import { moneyAPI, euro, shortDay, type MoneyAccount, type MoneyCategories, type MoneyForecast, type MoneyMonth, type MoneyReading, type MoneyRecurring, type MoneySighting, type MoneyTransaction, type MoneyUsage } from '../../services/api/moneyAPI';

const CADENCE: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
const SOURCE: Record<string, string> = { phone: 'Your phone', bizum: 'Bizum', bankfeed: 'Santander', gmail: 'Gmail', statement: 'Statement' };

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
function monthName(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { month: 'long' }); }
function lastDay(iso: string) { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }

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
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
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

  /* The ledger is read a month at a time: a running month against finished ones. */
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

  return (
    <main className="mv">
      <header className="mv-nav">
        <Link to="/portrait" className="mv-mark" aria-label="TwinMe"><i /><i /><i /><i /><i /><i /></Link>
        <nav>
          <a href="#month">This month</a>
          <a href="#where">Where</a>
          <a href="#ledger">Ledger</a>
          <a href="#recurring">Subscriptions</a>
          <a href="#sources">Sources</a>
        </nav>
        <Link to="/portrait" className="mv-pill mv-pill--ghost">Portrait</Link>
      </header>

      {/* This month: one figure, one sentence about it */}
      <section className="mv-hero" id="month">
        <p className="mv-kicker">{monthLabel}</p>
        {empty ? (
          <>
            <h1>Nothing read yet.</h1>
            <p className="mv-lede">Connect Santander, or let your phone send each purchase the moment it happens. The first line arrives with the first receipt.</p>
            <div className="mv-ctas">
              <button type="button" className="mv-pill" onClick={connect} disabled={busy === 'connect' || !bankReady}>Connect Santander</button>
              <a href="#sources" className="mv-pill mv-pill--ghost">Set up the phone</a>
            </div>
          </>
        ) : (
          <>
            <h1>{forecast ? euro(forecast.spent) : '…'} so far.</h1>
            {forecast ? (
              <p className="mv-lede">
                {projectable ? (
                  <>Likely {euro(forecast.projected_p50)} by the {last}th, between {euro(forecast.projected_p10)} and {euro(forecast.projected_p90)}.</>
                ) : (
                  <>Too little read to say where the month lands. The projection starts once there are a few days behind it.</>
                )}
                {forecast.committed_items.length ? ` ${nameList(forecast.committed_items.map((c) => merchantLabel(c)))} ${forecast.committed_items.length === 1 ? 'is' : 'are'} still to come.` : ''}
                {projectable && forecast.history_days < 42 ? ' The band is wide until there are six weeks to read from.' : ''}
              </p>
            ) : null}
            {/* A month that stopped moving must say why. The bank ends its session on its own
                schedule, and nothing can be read until it is authorised again. */}
            {reconnect ? (
              <p className="mv-lede">The bank connection has ended, so nothing new has come in. Reconnect it under Sources to start reading again.</p>
            ) : null}
            <div className="mv-ctas"><a href="#ledger" className="mv-pill">Every euro</a><a href="#recurring" className="mv-pill mv-pill--ghost">What comes back</a></div>
          </>
        )}
      </section>

      {/* The band, as a line */}
      {forecast && !empty ? (
        <section className="mv-band">
          {/* Ink for what has gone, grey to where the month lands. The spread stays in the
              sentence above: drawn as a third layer it left a hole that read as a fault. */}
          <div className="mv-band-track">
            <div className="mv-band-likely" style={{ width: `${pct(Math.max(forecast.projected_p50, forecast.spent + forecast.committed), forecast)}%` }} />
            <div className="mv-band-spent" style={{ width: `${pct(forecast.spent, forecast)}%` }} />
          </div>
          <div className="mv-band-labels">
            <span>Spent {euro(forecast.spent)}</span>
            <span>Likely {euro(Math.max(forecast.projected_p50, forecast.spent + forecast.committed))}</span>
          </div>
        </section>
      ) : null}

      {/* What the ledger says, with the lines that say it */}
      {readings.length ? (
        <section className="mv-section" id="readings">
          <h2>What the money says.</h2>
          <ul className="mv-readings">
            {readings.map((r) => (
              <li key={r.id} className="mv-reading">
                <p className="mv-reading-line">{r.sentence}</p>
                {r.detail ? <p className="mv-reading-detail">{r.detail}</p> : null}
                {r.receipts.length ? (
                  <ul className="mv-reading-receipts">
                    {r.receipts.map((t) => (
                      <li key={t.id}><span>{shortDay(t.occurred_at)}</span> {t.merchant_raw || t.merchant_key} <em>{euro(t.amount)}</em></li>
                    ))}
                  </ul>
                ) : null}
                <div className="mv-reading-foot">
                  <span className="mv-reading-evidence">read from {r.evidence_count} {r.evidence_count === 1 ? 'payment' : 'payments'}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Where it went, by kind of place */}
      {categories && categories.groups.length ? (
        <section className="mv-section" id="where">
          <h2>Where it went this month.</h2>
          {categories.read < categories.total ? (
            <p className="mv-quiet">{`${euro(categories.read)} of ${euro(categories.total)} is placed so far. The rest is waiting on a lookup.`}</p>
          ) : null}
          {categories.read < categories.total ? (
            <div className="mv-ctas">
              <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void lookupPlaces()} disabled={busy === 'places'}>
                {busy === 'places' ? 'Looking up…' : 'Look up the rest'}
              </button>
            </div>
          ) : null}
          <ol className="mv-cats">
            {categories.groups.map((g) => (
              <li key={g.category} className={g.known ? '' : 'is-unknown'}>
                <span className="mv-cat-name">{g.category}</span>
                <span className="mv-cat-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, (g.spent / Math.max(...categories.groups.map((x) => x.spent), 1)) * 100)}%` }} />
                </span>
                <span className="mv-cat-amount">{euro(g.spent)}</span>
                <span className="mv-cat-share">{g.share}%</span>
                <span className="mv-cat-who">{g.merchants.map((m) => m.name).slice(0, 3).join(', ')}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Month by month */}
      {months.length > 1 ? (
        <section className="mv-section" id="months">
          <h2>Month by month.</h2>
          <ol className="mv-months">
            {months.map((m) => (
              <li key={m.month} className={m.complete ? '' : 'is-running'}>
                <span className="mv-month-name">{new Date(m.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                <span className="mv-month-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, (m.spent / Math.max(...months.map((x) => x.spent), 1)) * 100)}%` }} />
                </span>
                <span className="mv-month-out">{euro(m.spent)}</span>
                <span className="mv-month-in">{m.received ? `+${euro(m.received)}` : ''}</span>
                <span className="mv-month-lines">{m.complete ? `${m.lines} lines` : `${m.lines} lines, ${m.days_covered} of ${m.days_in_month} days`}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Ledger */}
      <section className="mv-section" id="ledger">
        <h2>Every euro, with its receipts.</h2>
        {ledger.length === 0 ? (
          <p className="mv-quiet">The ledger fills as the phone and the bank send what they saw.</p>
        ) : (
          <ol className="mv-ledger">
            {byMonth.map((group) => (
              <li key={group.key} className="mv-ledger-group">
                <div className="mv-ledger-head">
                  <span>{new Date(`${group.key}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                  {group.segment ? <span>{euro(group.segment.spent)} out{group.segment.received ? `, ${euro(group.segment.received)} in` : ''}</span> : null}
                </div>
                <ol>
            {group.rows.map((t) => (
              <li key={t.id} className={`mv-row ${open === t.id ? 'is-open' : ''} ${Number(t.amount) > 0 ? 'is-in' : ''}`}>
                <button type="button" className="mv-row-head" onClick={() => void toggle(t.id)} aria-expanded={open === t.id}>
                  <span className="mv-row-date">{shortDay(t.occurred_at)}</span>
                  <span className="mv-row-merchant">{merchantLabel(t)}{t.is_recurring ? <small>recurring</small> : null}{t.verdict ? <small className={`mv-verdict-tag is-${t.verdict}`}>{t.verdict === 'worth_it' ? 'worth it' : 'not me'}</small> : null}</span>
                  <span className="mv-row-amount">{Number(t.amount) > 0 ? '+' : ''}{euro(t.amount)}</span>
                </button>
                {open === t.id ? (
                  <div className="mv-row-body">
                    <ul className="mv-receipts">
                      {(receipts[t.id] || []).map((s) => (
                        <li key={s.id}><span>{SOURCE[s.source] || s.source} · read {shortDay(s.seen_at)}</span><p>{s.raw_text || `${euro(s.amount)} ${s.currency || ''}`}</p></li>
                      ))}
                      {receipts[t.id] && receipts[t.id].length === 0 ? <li><p>No receipt kept for this one.</p></li> : null}
                    </ul>
                    {Number(t.amount) < 0 ? (
                      <div className="mv-verdicts">
                        <button type="button" className={`mv-pill mv-pill--sm ${t.verdict === 'worth_it' ? '' : 'mv-pill--ghost'}`} onClick={() => void verdict(t, 'worth_it')}>Worth it</button>
                        <button type="button" className={`mv-pill mv-pill--sm ${t.verdict === 'not_me' ? '' : 'mv-pill--ghost'}`} onClick={() => void verdict(t, 'not_me')}>Not me</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Recurring */}
      <section className="mv-section" id="recurring">
        <h2>What comes back on its own.</h2>
        {recurring.length === 0 ? (
          <p className="mv-quiet">A charge becomes recurring after it has come back three times at the same rhythm.</p>
        ) : (
          <>
          <div className="mv-grid">
            {[...subscriptions, ...bills].map((r) => (
              <button
                type="button"
                key={r.merchant_key}
                className={`mv-card mv-card--open ${openSeries === r.merchant_key ? 'is-open' : ''}`}
                onClick={() => setOpenSeries(openSeries === r.merchant_key ? null : r.merchant_key)}
                aria-expanded={openSeries === r.merchant_key}
              >
                <span className="mv-card-kicker">{r.is_subscription ? 'Subscription' : 'Recurring'} · {CADENCE[r.cadence] || r.cadence}</span>
                <b>{merchantLabel({ merchant_name: r.merchant_name, merchant_key: r.merchant_key })}</b>
                <em>{euro(r.typical_amount)}</em>
                <small>
                  {r.next_expected ? `Next around ${shortDay(r.next_expected)}${r.day_of_month ? `, it lands on the ${r.day_of_month}${ordinalSuffix(r.day_of_month)}` : ''}.` : ''}
                  {typeof r.total_paid === 'number' ? ` ${euro(r.total_paid)} so far, over ${r.occurrences} ${r.occurrences === 1 ? 'charge' : 'charges'}.` : ''}
                  {typeof r.uses === 'number' ? ` Used ${r.uses} time${r.uses === 1 ? '' : 's'} this month${r.cost_per_use ? `, ${euro(r.cost_per_use)} a use` : ''}.` : ''}
                </small>
                {openSeries === r.merchant_key && r.charges?.length ? (
                  <ul className="mv-charges">
                    {r.charges.map((c) => (
                      <li key={c.id}><span>{shortDay(c.occurred_at)}</span><em>{euro(c.amount)}</em></li>
                    ))}
                  </ul>
                ) : null}
              </button>
            ))}
          </div>
          {monthlyLoad ? (
            <p className="mv-quiet">{`${euro(monthlyLoad)} of this comes back every month.`}</p>
          ) : null}
          {usage?.findings.length ? (
            <ul className="mv-usage">
              {usage.findings.map((f) => (
                <li key={f.kind + f.sentence}>
                  <b>{f.sentence}</b>
                  {f.detail ? <p>{f.detail}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {usage?.unmeasurable.length ? (
            <div className="mv-unseen">
              <b>{euro(usage.unmeasurable.reduce((sum, x) => sum + Number(x.typical_amount || 0), 0))} a month goes where nothing here can look.</b>
              <p>
                Whether a charge was worth it depends on whether it was used, and use can only be read from a
                connected account. {usage.unmeasurable.map((x) => x.name).join(', ')} {usage.unmeasurable.length === 1 ? 'has' : 'have'} no
                connection, so this says nothing about {usage.unmeasurable.length === 1 ? 'it' : 'them'} rather than guessing.
              </p>
            </div>
          ) : null}
          </>
        )}
      </section>

      {/* Sources */}
      <section className="mv-section" id="sources">
        <h2>Read from two places.</h2>
        <div className="mv-sources">
          <div className="mv-source">
            <span className="mv-card-kicker">Santander, through Enable Banking</span>
            <b>The truth, four times a day.</b>
            <p>Open banking lets TwinMe read your account four times a day without you. You confirm it at the bank once, and again every six months.</p>
            {accounts.length ? (
              <ul className="mv-accounts">
                {accounts.map((a) => <li key={a.id}><span>{a.name || 'Account'} {a.iban_mask || ''}</span><small>{a.consent_expires_at ? `consent to ${shortDay(a.consent_expires_at)}` : ''}{a.last_pulled_at ? ` · last read ${shortDay(a.last_pulled_at)}` : ''}</small></li>)}
              </ul>
            ) : null}
            <div className="mv-ctas">
              <button type="button" className="mv-pill" onClick={connect} disabled={busy === 'connect' || !bankReady}>{accounts.length ? 'Connect another account' : 'Connect Santander'}</button>
              {accounts.length ? <button type="button" className="mv-pill mv-pill--ghost" onClick={pull} disabled={busy === 'pull'}>Read now</button> : null}
            </div>
            {!bankReady ? <p className="mv-quiet">The bank feed is not switched on yet.</p> : null}
            <div className="mv-upload">
              <b>Older months</b>
              <p>The bank only opens the last ninety days. Export a statement from Santander as Excel or CSV and the months before that come in too.</p>
              <label className="mv-pill mv-pill--ghost mv-pill--file">
                {busy === 'statement' ? 'Reading…' : 'Add a statement'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.tsv"
                  onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; void importStatement(f); }}
                  disabled={busy === 'statement'}
                />
              </label>
            </div>
          </div>
          <div className="mv-source">
            <span className="mv-card-kicker">Your phone</span>
            <b>The moment, in seconds.</b>
            <p>Every payment your bank announces on your phone can land here as it happens, which is the only way to see today rather than three days ago. A key ties the phone to your ledger.</p>
            {key ? (
              <div className="mv-key">
                <code>{key}</code>
                <small>Shown once. Copy it into the macro.</small>
              </div>
            ) : (
              <div className="mv-ctas"><button type="button" className="mv-pill" onClick={makeKey} disabled={busy === 'key'}>Make a key for my phone</button></div>
            )}
            <ol className="mv-steps">
              <li>Install MacroDroid, or Tasker if you already use it. Both can watch a notification and send it on.</li>
              <li>New macro. Trigger: Notification received, from the Santander app. Give it the notification permission when it asks.</li>
              <li>Action: HTTP Request, POST to <code>{`${window.location.origin}/api/money/capture`}</code>, header <code>X-TwinMe-Key</code> with the key, JSON body <code>{'{"text": "[notification]"}'}</code> using the notification text variable.</li>
              <li>Bizum and SMS alerts work the same way. The bank writes them in Spanish and this reads them: the amount, the shop, the card and whether it went out or came in.</li>
            </ol>
          </div>
        </div>
        {note ? <p className="mv-quiet mv-note">{note}</p> : null}
        <p className="mv-quiet">Counts and amounts, never the contents of a message. Remove a source and everything read from it goes with it.</p>
      </section>

      <footer className="mv-footer">
        <span>twinme, 2026</span>
        <nav><Link to="/privacy-policy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/portrait">Portrait</Link></nav>
      </footer>
    </main>
  );
}

/** Where a euro amount falls on the band, 0..100, with the projected p90 as the right edge. */
function pct(v: number, f: MoneyForecast) {
  const max = Math.max(f.projected_p90, f.spent + f.committed, 1) * 1.08;
  return Math.max(0, Math.min(100, (v / max) * 100));
}
