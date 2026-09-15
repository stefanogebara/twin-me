/**
 * Plan.
 *
 * The month as a calendar: what each day cost, what the coming days carry, and what the
 * person wrote on a day. Every figure is computed on the server (services/money/plan.js);
 * this page draws cells and phrases the day under the finger.
 *
 * A past day is a filled bar for what it cost, with the range it was given the night before
 * as a faint band behind it (red when it broke). A coming day is a hollow bar for what is
 * expected on it, and marks for what: a charge, a commitment, money in, a day in the diary.
 * Today is the one ember bar. Under the grid, the picked day: its payments or its expected
 * items as rows, and a note field. A note is a fact the ledger reads with everything else,
 * in the person's own words: the twin knows the trip before the payments arrive.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/money-v2.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { MONEY_NAV } from './navLinks';
import { moneyAPI, euro, type MoneyPlan, type MoneyPlanCell, type MoneyPlanItem } from '../../services/api/moneyAPI';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useT, useLocale } from '@/lib/i18n';

const NAV: MoneyNavLink[] = MONEY_NAV('plan');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type T = (s: string, holes?: Record<string, string | number>) => string;
const BAR_MAX = 40;

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (key: string, by: number) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(Date.UTC(y, m - 1 + by, 1))); };
const monthLabel = (key: string, locale: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
const dayName = (iso: string, locale: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
const timeOf = (iso: string, locale: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
/* The server writes EUR in ASCII; the page writes the glyph the way every other figure here does. */
const glyphs = (s: string) => s.replace(/(\d) EUR\b/g, '$1\u00a0\u20ac');

/** What an expected item is, in plain words. */
function itemWords(i: MoneyPlanItem, t: T): string {
  if (i.kind === 'charge') return i.cadence === 'monthly' ? t('Every month') : i.cadence ? t('Every {cadence}', { cadence: i.cadence.replace(/ly$/, '') }) : t('Comes back');
  if (i.kind === 'commitment') return t('You said this is due');
  if (i.kind === 'income') return i.said ? t('Comes in') : `${t('Comes in, seen before, not said')}${i.confidence != null ? t(', {pct}% on time', { pct: Math.round(i.confidence * 100) }) : ''}`;
  return i.amount > 0 ? t('A day like this usually costs') : t('In the diary');
}

/** The one grey line for a day. Computed from the cell, nothing guessed. */
function dayLine(c: MoneyPlanCell, t: T): string {
  if (c.past || c.today) {
    const base = c.count
      ? `${euro(c.spent)}${c.today ? t(' so far') : ''}, ${c.count === 1 ? t('{n} payment', { n: 1 }) : t('{n} payments', { n: c.count })}${c.received ? t('; {amount} came in', { amount: euro(c.received) }) : ''}.`
      : c.received ? t('Nothing spent; {amount} came in.', { amount: euro(c.received) }) : c.today ? t('Nothing yet today.') : t('Nothing spent.');
    const said = c.said && c.past ? ` ${t('It said {low} to {high}, and {verdict}.', { low: euro(c.said.low), high: euro(c.said.high), verdict: c.hit ? t('held') : c.hit === false ? t('broke') : t('was not scored') })}` : '';
    return base + said;
  }
  const out = c.items.filter((i) => i.kind !== 'income');
  const inc = c.items.filter((i) => i.kind === 'income');
  const parts: string[] = [];
  if (out.length) parts.push(t('{amount} expected, {things}.', { amount: euro(c.expected), things: out.length === 1 ? t('{n} thing', { n: 1 }) : t('{n} things', { n: out.length }) }));
  if (inc.length) parts.push(t('{amount} coming in.', { amount: euro(inc.reduce((s, i) => s + i.amount, 0)) }));
  if (c.said) parts.push(t('Usually up to {amount}.', { amount: euro(c.said.high) }));
  return parts.join(' ') || t('Nothing expected yet.');
}

export default function PlanPage() {
  useDocumentTitle('Money, the plan');
  const t = useT();
  const locale = useLocale();
  const current = monthKey(new Date());
  const [month, setMonth] = useState<string>(current);
  const [plan, setPlan] = useState<MoneyPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (key: string) => {
    try {
      const p = await moneyAPI.plan(key === current ? null : key);
      setPlan(p);
      setFailed(false);
      setPicked((was) => (was && p.cells.some((c) => c.day === was) ? was : p.today));
    } catch {
      setFailed(true);
    }
  }, [current]);
  useEffect(() => { void load(month); }, [month, load]);

  const cell = useMemo(() => (plan && picked ? plan.cells.find((c) => c.day === picked) || null : null), [plan, picked]);
  useEffect(() => { setDraft(''); }, [picked]);

  const max = useMemo(() => Math.max(1, ...(plan ? plan.cells.map((c) => Math.max(c.spent, c.expected, c.said ? c.said.high : 0)) : [1])), [plan]);
  const px = (v: number) => Math.round(Math.max(0, Math.min(1, v / max)) * BAR_MAX);

  async function saveNote() {
    if (!cell || !draft.trim() || busy) return;
    setBusy(true);
    try { await moneyAPI.noteDay(cell.day, draft.trim()); setDraft(''); await load(month); } catch { /* the field keeps the words */ } finally { setBusy(false); }
  }
  async function forgetNote() {
    if (!cell?.note?.id || busy) return;
    setBusy(true);
    try { await moneyAPI.deleteFact(cell.note.id); await load(month); } catch { /* it stays until it can go */ } finally { setBusy(false); }
  }

  const blanks = plan ? Array.from({ length: plan.first_weekday }) : [];

  return (
    <main className="mv">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <section className="mv-section mv-plan-top">
            <h1>{t('{month}, day by day.', { month: monthLabel(month, locale).replace(/ \d{4}$/, '') })}</h1>
            <p className="mv-sub">{failed ? t('The plan could not be read right now.') : plan ? glyphs(plan.line) : ''}</p>
            <div className="mv-plan-months">
              <button type="button" className="mv-link" onClick={() => setMonth(shiftMonth(month, -1))}>{monthLabel(shiftMonth(month, -1), locale).replace(/ \d{4}$/, '')}</button>
              {month !== current ? <button type="button" className="mv-link" onClick={() => setMonth(shiftMonth(month, 1))}>{monthLabel(shiftMonth(month, 1), locale).replace(/ \d{4}$/, '')}</button> : null}
            </div>
          </section>

          {plan ? (
            <div className="mv-plan" role="grid" aria-label={t('{month}, day by day.', { month: monthLabel(month, locale) })}>
              {WEEKDAYS.map((w) => <span key={w} className="mv-plan-head" role="columnheader">{t(w)}</span>)}
              {blanks.map((_, i) => <span key={`b${i}`} className="mv-plan-day is-blank" aria-hidden="true" />)}
              {plan.cells.map((c) => {
                const v = c.past || c.today ? c.spent : c.expected;
                const figure = (plan.peak && c.day === plan.peak.day) || (c.today && c.spent > 0);
                return (
                  <button
                    type="button"
                    key={c.day}
                    role="gridcell"
                    className={`mv-plan-day${c.today ? ' is-today' : c.past ? ' is-past' : ' is-ahead'}${c.hit === false ? ' is-miss' : ''}${picked === c.day ? ' is-picked' : ''}`}
                    aria-label={`${dayName(c.day, locale)}: ${dayLine(c, t)}`}
                    aria-selected={picked === c.day}
                    onClick={() => setPicked(c.day)}
                  >
                    <span className="mv-plan-dom">{c.dom}</span>
                    {figure ? <span className="mv-plan-figure mv-figures">{euro(v)}</span> : null}
                    {(c.items.length || c.note) ? (
                      <span className="mv-plan-marks" aria-hidden="true">
                        {c.items.slice(0, 4).map((i, k) => <i key={k} className={`mv-plan-mark mv-plan-mark--${i.kind}`} />)}
                        {c.note ? <i className="mv-plan-mark mv-plan-mark--note" /> : null}
                      </span>
                    ) : null}
                    {c.said ? <i className="mv-plan-said" style={{ bottom: px(c.said.low), height: Math.max(2, px(c.said.high) - px(c.said.low)) }} /> : null}
                    {v > 0 ? <b className="mv-plan-bar" style={{ height: Math.max(2, px(v)) }} /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {cell ? (
            <section className="mv-section" aria-live="polite">
              <h2>{dayName(cell.day, locale)}{cell.today ? t(', today') : ''}.</h2>
              <p className="mv-sub">{dayLine(cell, t)}</p>
              {(cell.past || cell.today) && cell.rows.length ? (
                <ul className="mv-list">
                  {cell.rows.map((r) => (
                    <li key={r.id} className="mv-item mv-item--tight">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{r.merchant || t('Unknown')}</span>
                        <span className="mv-item-sub">{timeOf(r.occurred_at, locale)}</span>
                      </span>
                      <span className={`mv-item-end${r.amount > 0 ? ' mv-in' : ''}`}>{r.amount > 0 ? `+${euro(r.amount)}` : euro(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!cell.past && !cell.today && cell.items.length ? (
                <ul className="mv-list">
                  {cell.items.map((i, k) => (
                    <li key={k} className="mv-item mv-item--tight">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{i.label}</span>
                        <span className="mv-item-sub">{itemWords(i, t)}</span>
                      </span>
                      <span className={`mv-item-end${i.kind === 'income' ? ' mv-in' : ''}`}>{i.amount > 0 ? (i.kind === 'income' ? `+${euro(i.amount)}` : euro(i.amount)) : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mv-plan-note">
                {cell.note ? (
                  <ul className="mv-list">
                    <li className="mv-item mv-item--tight">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{cell.note.text}</span>
                        <span className="mv-item-sub">{t('Your note. The ledger reads with it.')}</span>
                      </span>
                      <button type="button" className="mv-pill mv-pill--ghost" disabled={busy} onClick={() => void forgetNote()}><span>{t('Forget')}</span></button>
                    </li>
                  </ul>
                ) : (
                  <form className="mv-plan-note-form" onSubmit={(e) => { e.preventDefault(); void saveNote(); }}>
                    <label className="mv-sr" htmlFor="plan-note">{t('A note on this day')}</label>
                    <input id="plan-note" className="mv-field" type="text" autoComplete="off" maxLength={240} placeholder={cell.past ? t('What this day was') : cell.today ? t('What today is') : t('What this day will be: a trip, a visit, an exam')} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
                    <button type="submit" className="mv-pill mv-pill--ghost" disabled={busy || !draft.trim()}><span>{t('Keep')}</span></button>
                  </form>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
