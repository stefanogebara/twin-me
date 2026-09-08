/**
 * Money, in the cosmos.so register: a white canvas, one statement per screen, the product as tiles.
 * This month with a band; every euro with its receipts and a verdict; what comes back on its own;
 * the two sources (Santander through Enable Banking, and the phone).
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/money-v2.css';
import { moneyAPI, euro, shortDay, type MoneyAccount, type MoneyForecast, type MoneyRecurring, type MoneySighting, type MoneyTransaction } from '../../services/api/moneyAPI';

const TILE_SPOTS: [number, number, number][] = [[3, 14, -12], [12, 66, 8], [22, 30, 10], [30, 78, -6], [66, 76, 7], [76, 24, -10], [88, 60, 6], [92, 12, -8]];
const CADENCE: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
const SOURCE: Record<string, string> = { phone: 'Your phone', bizum: 'Bizum', bankfeed: 'Santander', gmail: 'Gmail', statement: 'Statement' };

function merchantLabel(t: { merchant_name?: string | null; merchant_raw?: string | null; merchant_key: string }) {
  const s = t.merchant_name || t.merchant_raw || t.merchant_key;
  const base = s.length > 2 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function monthName(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { month: 'long' }); }
function lastDay(iso: string) { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }

export default function MoneyV2Page() {
  const [forecast, setForecast] = useState<MoneyForecast | null>(null);
  const [ledger, setLedger] = useState<MoneyTransaction[]>([]);
  const [recurring, setRecurring] = useState<MoneyRecurring[]>([]);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [bankReady, setBankReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, MoneySighting[]>>({});
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, l, r, a] = await Promise.allSettled([moneyAPI.forecast(), moneyAPI.ledger(), moneyAPI.recurring(), moneyAPI.accounts()]);
    if (f.status === 'fulfilled') setForecast(f.value);
    if (l.status === 'fulfilled') setLedger(l.value);
    if (r.status === 'fulfilled') setRecurring(r.value);
    if (a.status === 'fulfilled') setAccounts(a.value);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const empty = loaded && ledger.length === 0;
  /* One purchase makes p10, p50 and p90 the same euro, and reading the same number three
     times looks broken rather than honest. Say nothing about the month until the band opens. */
  const projectable = Boolean(forecast && forecast.projected_p90 - forecast.projected_p10 > 0.5);
  const tiles = useMemo(() => ledger.filter((t) => Number(t.amount) < 0).slice(0, TILE_SPOTS.length), [ledger]);
  const inflow = useMemo(() => ledger.filter((t) => Number(t.amount) > 0), [ledger]);
  const subscriptions = recurring.filter((r) => r.is_subscription);
  const bills = recurring.filter((r) => !r.is_subscription);

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
          <a href="#ledger">Ledger</a>
          <a href="#recurring">Subscriptions</a>
          <a href="#sources">Sources</a>
        </nav>
        <Link to="/portrait" className="mv-pill mv-pill--ghost">Portrait</Link>
      </header>

      {/* This month: one number, one line, the receipts as tiles around it */}
      <section className="mv-hero" id="month">
        <div className="mv-tiles" aria-hidden="true">
          {tiles.map((t, i) => {
            const [x, y, r] = TILE_SPOTS[i];
            return (
              <div key={t.id} className="mv-tile" style={{ left: `${x}%`, top: `${y}%`, '--r': `${r}deg`, '--d': `${(i % 4) * -1.6}s` } as React.CSSProperties}>
                <span>{SOURCE[t.channel === 'bizum' ? 'bizum' : 'bankfeed'] && t.channel ? t.channel : ''} {shortDay(t.occurred_at)}</span>
                <b>{merchantLabel(t)}</b>
                <em>{euro(t.amount)}</em>
              </div>
            );
          })}
        </div>
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
                {forecast.committed_items.length ? ` ${forecast.committed_items.map((c) => merchantLabel({ merchant_key: c.merchant_key })).join(', ')} ${forecast.committed_items.length === 1 ? 'is' : 'are'} still to come.` : ''}
                {projectable && forecast.history_days < 42 ? ' The band is wide until there are six weeks to read from.' : ''}
              </p>
            ) : null}
            <div className="mv-ctas"><a href="#ledger" className="mv-pill">Every euro</a><a href="#recurring" className="mv-pill mv-pill--ghost">What comes back</a></div>
          </>
        )}
      </section>

      {/* The band, as a line */}
      {forecast && !empty ? (
        <section className="mv-band">
          <div className="mv-band-track">
            <div className="mv-band-range" style={{ left: `${pct(forecast.projected_p10, forecast)}%`, width: `${pct(forecast.projected_p90, forecast) - pct(forecast.projected_p10, forecast)}%` }} />
            <div className="mv-band-spent" style={{ width: `${pct(forecast.spent, forecast)}%` }} />
            <i className="mv-band-mark" style={{ left: `${pct(forecast.projected_p50, forecast)}%` }} />
          </div>
          <div className="mv-band-labels">
            <span>spent {euro(forecast.spent)}</span>
            <span>committed {euro(forecast.committed)}</span>
            <span>{forecast.days_left} days left</span>
          </div>
        </section>
      ) : null}

      {/* Ledger */}
      <section className="mv-section" id="ledger">
        <h2>Every euro, with its receipts.</h2>
        {ledger.length === 0 ? (
          <p className="mv-quiet">The ledger fills as the phone and the bank send what they saw.</p>
        ) : (
          <ol className="mv-ledger">
            {ledger.map((t) => (
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
                        <li key={s.id}><span>{SOURCE[s.source] || s.source} · {shortDay(s.seen_at)}</span><p>{s.raw_text || `${euro(s.amount)} ${s.currency || ''}`}</p></li>
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
        )}
        {inflow.length ? <p className="mv-quiet">{inflow.length} inflow{inflow.length === 1 ? '' : 's'} in the list, marked with a plus.</p> : null}
      </section>

      {/* Recurring */}
      <section className="mv-section" id="recurring">
        <h2>What comes back on its own.</h2>
        {recurring.length === 0 ? (
          <p className="mv-quiet">A charge becomes recurring after it has come back three times at the same rhythm.</p>
        ) : (
          <div className="mv-grid">
            {[...subscriptions, ...bills].map((r) => (
              <div key={r.merchant_key} className="mv-card">
                <span className="mv-card-kicker">{r.is_subscription ? 'Subscription' : 'Recurring'} · {CADENCE[r.cadence] || r.cadence}</span>
                <b>{merchantLabel({ merchant_key: r.merchant_key })}</b>
                <em>{euro(r.typical_amount)}</em>
                <small>
                  {r.next_expected ? `Next around ${shortDay(r.next_expected)}.` : ''}
                  {typeof r.uses === 'number' ? ` Used ${r.uses} time${r.uses === 1 ? '' : 's'} this month${r.cost_per_use ? `, ${euro(r.cost_per_use)} a use` : ''}.` : ''}
                </small>
              </div>
            ))}
          </div>
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
          </div>
          <div className="mv-source">
            <span className="mv-card-kicker">Your phone</span>
            <b>The moment, in seconds.</b>
            <p>Every card payment your bank announces on your phone can land here as it happens. A key ties the phone to your ledger.</p>
            {key ? (
              <div className="mv-key">
                <code>{key}</code>
                <small>Shown once. Copy it into the Shortcut.</small>
              </div>
            ) : (
              <div className="mv-ctas"><button type="button" className="mv-pill" onClick={makeKey} disabled={busy === 'key'}>Make a key for my phone</button></div>
            )}
            <ol className="mv-steps">
              <li>Shortcuts → Automation → Transaction → your Santander card → Run immediately.</li>
              <li>Add “Get contents of URL”: POST to <code>{`${window.location.origin}/api/money/capture`}</code>, JSON body with merchant, amount, card and date from the transaction; header <code>X-TwinMe-Key</code> with the key.</li>
              <li>Bizum and SMS alerts can be forwarded the same way with the message text as <code>text</code>.</li>
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
