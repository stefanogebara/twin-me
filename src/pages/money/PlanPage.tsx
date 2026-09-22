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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { orbFor } from './orbFor';
import '../../styles/money-v2.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import Wait from '../../components/Wait';
import TotalRow from './figures/TotalRow';
import { MONEY_NAV } from './navLinks';
import { merchantLabel } from './words';
import { daysAhead } from './planAhead';
import { classSplit } from './classDays';
import TermStrip from './views/plan/TermStrip';
import { moneyAPI, euro, shortDay, type MoneyPlan, type MoneyPlanCell, type MoneyPlanItem } from '../../services/api/moneyAPI';
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
  /* Cutting -ly off weekly gave "Cada week", and off biweekly a word in no language at all.
     Each cadence is its own phrase (2026-09-16). */
  if (i.kind === 'charge') return i.cadence && CADENCE_WORD[i.cadence] ? t(CADENCE_WORD[i.cadence]) : t('Comes back');
  if (i.kind === 'commitment') return t('You said this is due');
  if (i.kind === 'income') return i.said ? t('Comes in') : `${t('Comes in, seen before, not said')}${i.confidence != null ? t(', {pct}% on time', { pct: Math.round(i.confidence * 100) }) : ''}`;
  return i.amount > 0 ? t('A day like this usually costs') : t('In the diary');
}

/** The one grey line for a day. Computed from the cell, nothing guessed. */
function monthOnly(month: string, locale: string): string {
  const d = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString(locale, { month: 'long' });
}

/* The month's own line. The server composes one too, in English, with an English month
   name; the page has the same four numbers and says it in the reader's language. */
function planLine(plan: MoneyPlan, t: T, locale: string, current: boolean): string {
  const month = monthOnly(plan.month, locale);
  const n = plan.totals.days_ahead;
  const head = current
    ? t('{month}: {amount} so far', { month, amount: euro(plan.totals.spent_to_day) })
    : t('{month}: {amount}', { month, amount: euro(plan.totals.spent_to_day) });
  if (!current) return `${head}.`;
  const clauses = [
    n ? (n === 1
      ? t('{amount} expected on one day ahead', { amount: euro(plan.totals.expected_rest) })
      : t('{amount} expected on {n} days ahead', { amount: euro(plan.totals.expected_rest), n })) : '',
    plan.totals.income_ahead ? t('{amount} coming in', { amount: euro(plan.totals.income_ahead) }) : '',
  ].filter(Boolean);
  return clauses.length ? `${head}; ${clauses.join(', ')}.` : `${head}.`;
}

/* A row on a day is named by the person's own words: a merchant, a subject they typed. The
   four fallbacks are the ledger's, and only those are translated (2026-09-16). */
const OURS = new Set(['A charge', 'A commitment', 'Money in', 'A day in the diary', 'A standing charge']);
const itemLabel = (label: string | null | undefined, t: T) => (label && OURS.has(label) ? t(label) : label || t('A charge'));

const CADENCE_WORD: Record<string, string> = {
  weekly: 'Every week', biweekly: 'Every two weeks', monthly: 'Every month',
  quarterly: 'Every three months', yearly: 'Every year',
};

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
  const t = useT();
  const locale = useLocale();
  useDocumentTitle(t('Money, the plan'));
  const current = monthKey(new Date());
  const [month, setMonth] = useState<string>(current);
  const [plan, setPlan] = useState<MoneyPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  /* One month at a time: a second request started before the first came back could land
     second and paint the month the reader had already left. The newest read wins. */
  const seq = useRef(0);
  const load = useCallback(async (key: string) => {
    const mine = ++seq.current;
    try {
      const p = await moneyAPI.plan(key === current ? null : key);
      if (mine !== seq.current) return;
      setPlan(p);
      setFailed(false);
      setPicked((was) => (was && p.cells.some((c) => c.day === was) ? was : p.today));
    } catch {
      if (mine !== seq.current) return;
      /* The grid goes with it: thirty squares of the month before sat under the heading of
         the month that failed to load. */
      setPlan(null);
      setPicked(null);
      setFailed(true);
    }
  }, [current]);
  useEffect(() => { void load(month); }, [month, load]);

  const cell = useMemo(() => (plan && picked ? plan.cells.find((c) => c.day === picked) || null : null), [plan, picked]);
  useEffect(() => { setDraft(''); }, [picked]);

  /* "setembro de 2026" minus its year left "setembro de" in Portuguese: the year is part of
     the phrase, not a suffix. The month's own name is asked for instead. */
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
            <h1>{t('{month}, day by day.', { month: monthOnly(month, locale) })}</h1>
            <p className="mv-sub">{failed ? t('The plan could not be read right now.') : plan ? glyphs(planLine(plan, t, locale, month === current)) : ''}</p>
            <div className="mv-plan-months">
              <button type="button" className="mv-link" onClick={() => setMonth(shiftMonth(month, -1))}>{monthOnly(shiftMonth(month, -1), locale)}</button>
              {month !== current ? <button type="button" className="mv-link" onClick={() => setMonth(shiftMonth(month, 1))}>{monthOnly(shiftMonth(month, 1), locale)}</button> : null}
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
                    {(c.items.length || c.note || c.events) ? (
                      <span className="mv-plan-marks" aria-hidden="true">
                        {c.items.slice(0, 4).map((i, k) => <i key={k} className={`mv-plan-mark mv-plan-mark--${i.kind}`} />)}
                        {/* The diary, on the square: a dot an event, up to four (2026-09-21). */}
                        {Array.from({ length: Math.min(c.events || 0, 4) }, (_, k) => <i key={`e${k}`} className="mv-plan-mark mv-plan-mark--event" />)}
                        {c.note ? <i className="mv-plan-mark mv-plan-mark--note" /> : null}
                      </span>
                    ) : null}
                    {c.said ? <i className="mv-plan-said" style={{ bottom: px(c.said.low), height: Math.max(2, px(c.said.high) - px(c.said.low)) }} /> : null}
                    {v > 0 ? <b className="mv-plan-bar" style={{ height: Math.max(2, px(v)) }} /> : null}
                  </button>
                );
              })}
            </div>
          ) : failed ? null : <Wait inline state={orbFor('page')} line="Reading the plan." />}

          {/* The term either side of this week, from the diary's own day counts (2026-09-21). */}
          {plan?.term && plan.term.weeks.length ? <TermStrip term={plan.term} t={t} locale={locale} /> : null}

          {/* A day with class against a day without, from the squares themselves (2026-09-21). */}
          {plan && classSplit(plan.cells) ? (() => {
            const s = classSplit(plan.cells)!;
            const top = Math.max(s.withClass, s.free) || 1;
            return (
              <section className="mv-section" id="classdays">
                <h2>{t('With class, or free.')}</h2>
                {/* The middle day of each, not the average: on a real ledger two big days
                    moved the average into a pattern that was not there (2026-09-22). */}
                <p className="mv-sub">{t('What the middle day of each costs. {n} of these {d} days cost nothing at all.', { n: s.withFree + s.freeFree, d: s.withDays + s.freeDays })}</p>
                <div className="mv-split">
                  <div className="mv-split-row"><span>{t('With class')}</span><i style={{ width: `${(s.withClass / top) * 100}%` }} /><b className="mv-figures">{euro(s.withClass)}</b></div>
                  <div className="mv-split-row"><span>{t('Free')}</span><i className="is-free" style={{ width: `${(s.free / top) * 100}%` }} /><b className="mv-figures">{euro(s.free)}</b></div>
                </div>
              </section>
            );
          })() : null}

          {/* The days ahead, listed: what the diary and the standing charges hold for the rest of
              the month, without opening a square (2026-09-21). */}
          {plan && daysAhead(plan.cells).length ? (
            <section className="mv-section" id="ahead">
              <h2>{t('The days ahead.')}</h2>
              <p className="mv-sub">{t('What the diary and the standing charges hold for the rest of the month.')}</p>
              <ul className="mv-list mv-ahead-list">
                {daysAhead(plan.cells).map(({ day, item }, k) => (
                  <li key={`${day}-${k}`} className="mv-item mv-item--tight">
                    <span className="mv-ahead-day">{shortDay(day, locale)}</span>
                    <span className="mv-item-text">
                      <span className="mv-item-title">{itemLabel(item.label, t)}</span>
                      <span className="mv-item-sub">{itemWords(item, t)}</span>
                    </span>
                    <span className={`mv-item-end${item.kind === 'income' ? ' mv-in' : ''}`}>{item.amount > 0 ? (item.kind === 'income' ? `+${euro(item.amount)}` : euro(item.amount)) : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
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
                        <span className="mv-item-title">{merchantLabel({ merchant_key: r.merchant || '' }, t)}</span>
                        <span className="mv-item-sub">{timeOf(r.occurred_at, locale)}</span>
                      </span>
                      <span className={`mv-item-end${r.amount > 0 ? ' mv-in' : ''}`}>{r.amount > 0 ? `+${euro(r.amount)}` : euro(r.amount)}</span>
                    </li>
                  ))}
                  <TotalRow count={cell.rows.filter((r) => r.amount < 0).length} total={cell.rows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)} />
                </ul>
              ) : null}
              {!cell.past && !cell.today && cell.items.length ? (
                <ul className="mv-list">
                  {cell.items.map((i, k) => (
                    <li key={k} className="mv-item mv-item--tight">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{itemLabel(i.label, t)}</span>
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
