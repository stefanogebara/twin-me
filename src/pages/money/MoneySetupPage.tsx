/**
 * Money setup: the questions the ledger cannot answer for itself.
 *
 * The engine reads rhythm, price and place from payments. It cannot read meaning: who a
 * name on a transfer is, what leaves every month whatever happens, what comes in. This
 * screen asks that once, and then keeps asking about specific unexplained lines, each with
 * the payments that raised it attached, so the question is earned rather than nosy.
 *
 * One question per screen, in the money-v2 register.
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/lib/i18n';
import '../../styles/money-v2.css';
import '../../styles/money-setup.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import Wait from '../../components/Wait';
import { MONEY_NAV } from './navLinks';
import { cap, factTitle, factWord } from './factWords';
import { moneyAPI, euro, shortDay, type MoneyFact, type MoneyQuestion } from '../../services/api/moneyAPI';

/** The words a kind of place can be given, matching what the categoriser itself uses. */
const CATEGORIES = [
  'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy',
  'sport', 'education', 'clothing', 'home', 'electronics', 'entertainment', 'software',
  'advertising', 'travel', 'lodging', 'cash', 'fees', 'transfers', 'bills', 'other',
];

/** Shares a person actually names out loud, so the common answer is one press. */
const SHARES: [string, number][] = [['a half', 50], ['a third', 33], ['a quarter', 25], ['two thirds', 67]];

/* English source strings; the page says them through t(), so the dictionaries hold them. */
const PLACEHOLDER: Record<string, string> = {
  name: 'Rent', source: 'Family', what: 'The weekly shop', amount: '500', day: '1',
};

const NAV: MoneyNavLink[] = MONEY_NAV('you');

type ListRow = { key: string; label: string; amount: string; day: string; share: string };

let rowSeq = 0;
function blankRow(): ListRow { rowSeq += 1; return { key: `r${rowSeq}`, label: '', amount: '', day: '', share: '50' }; }

/** A stable key for a fact the person named, so the same rent typed twice is one fact. */
function slug(s: string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'; }
function listColumns(input: string) { return input.slice('list:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
function choiceOptions(input: string) { return input.slice('choice:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
/** People write 49,25 as often as 49.25, and both mean the same money. */
function parseAmount(s: string): number | undefined {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : undefined;
}
function parseDay(s: string): number | undefined {
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : undefined;
}
function parseShare(s: string): number | undefined {
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(1, Math.round(n) / 100);
}

/** The 1st, not the 1. A system that cannot spell a date is not trusted with a number. */

export default function MoneySetupPage() {
  const t = useT();
  const locale = useLocale();
  const [queue, setQueue] = useState<MoneyQuestion[]>([]);
  const [openingCount, setOpeningCount] = useState(0);
  const [answeredBefore, setAnsweredBefore] = useState(0);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  /* Their own words when a choice is not enough: who that is, what it was for. */
  const [extra, setExtra] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [facts, setFacts] = useState<MoneyFact[] | null>(null);

  useEffect(() => {
    let live = true;
    moneyAPI.questions()
      .then((q) => {
        if (!live) return;
        setQueue([...q.opening, ...q.fromLedger]);
        setOpeningCount(q.opening.length);
        setAnsweredBefore(q.answered);
      })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const question = queue[index] || null;
  const done = loaded && !failed && queue.length > 0 && index >= queue.length;

  /* Every question starts from an empty answer, and a list question starts with one row
     already open so there is nothing to press before you can type. */
  useEffect(() => {
    setNote(null);
    setText('');
    setChoice(null); setExtra('');
    setRows(question && question.input.startsWith('list:') ? [blankRow()] : []);
  }, [question]);

  useEffect(() => {
    if (!done || facts !== null) return;
    void moneyAPI.facts().then(setFacts).catch(() => setFacts([]));
  }, [done, facts]);

  const columns = useMemo(() => (question && question.input.startsWith('list:') ? listColumns(question.input) : []), [question]);
  const options = useMemo(() => (question && question.input.startsWith('choice:') ? choiceOptions(question.input) : []), [question]);
  const fromLedger = Boolean(question) && index >= openingCount;
  const skippable = Boolean(question?.optional) || fromLedger;

  /* A ledger question carries the merchant's own spelling on its receipts; that reads
     better in the summary than the key the ledger files it under. */
  const subjectLabel = question?.receipts?.[0]?.merchant_raw || undefined;

  const filledRows = rows.filter((r) => r.label.trim());
  const answerable = question
    ? question.input.startsWith('list:')
      ? filledRows.length > 0 || skippable
      : question.input === 'text'
        ? text.trim().length > 0 || skippable
        : Boolean(choice)
    : false;

  const advance = useCallback(() => setIndex((i) => i + 1), []);

  async function submit() {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (question.input.startsWith('list:')) {
        if (filledRows.length === 0) { await moneyAPI.skipQuestion(question.id); advance(); return; }
        /* Each row is its own fact: one rent, one phone bill, one grant, each with its
           own amount and day, so the projection can carry them separately. */
        for (const row of filledRows) {
          const label = row.label.trim();
          const amount = columns.includes('amount') ? parseAmount(row.amount) : undefined;
          const day = columns.includes('day') ? parseDay(row.day) : undefined;
          const share = columns.includes('share') ? parseShare(row.share) : undefined;
          await moneyAPI.answerQuestion({
            questionId: question.id,
            kind: question.kind,
            subject: slug(label),
            subjectLabel: label,
            ...(amount === undefined ? {} : { amount }),
            ...(day === undefined ? {} : { day }),
            ...(share === undefined ? {} : { share }),
          });
        }
      } else if (question.input === 'text') {
        const value = text.trim();
        if (!value) { await moneyAPI.skipQuestion(question.id); advance(); return; }
        await moneyAPI.answerQuestion({
          questionId: question.id, kind: question.kind, value,
          ...(question.subject ? { subject: question.subject } : {}),
          ...(subjectLabel ? { subjectLabel } : {}),
        });
      } else {
        if (!choice) return;
        await moneyAPI.answerQuestion({
          questionId: question.id, kind: question.kind, value: choice,
          ...(question.subject ? { subject: question.subject } : {}),
          ...(subjectLabel ? { subjectLabel } : {}),
          ...(extra.trim() ? { note: extra.trim() } : {}),
        });
      }
      advance();
    } catch (e) {
      setNote((e as Error).message || t('That answer did not save. Try it again.'));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try { await moneyAPI.skipQuestion(question.id); advance(); }
    catch { setNote(t('That did not go through. Try it again.')); }
    finally { setBusy(false); }
  }

  return (
    <main className="mv ms">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <section className="ms-stage">
            {!loaded ? (
              <Wait inline state="searching" line="Reading your payments." />
            ) : failed ? (
              <div className="ms-stage-inner">
                <h1>{t('The questions did not load.')}</h1>
                <p className="mv-sub">{t('Nothing was lost. Try again in a moment.')}</p>
                <div className="ms-actions"><Link to="/money" className="mv-pill">{t('Back to the month')}</Link></div>
              </div>
            ) : queue.length === 0 ? (
              <div className="ms-stage-inner">
                <h1>{t('Nothing to ask.')}</h1>
                <p className="mv-sub">
                  {answeredBefore > 0
                    ? t('You answered {n} already. Everything since reads on its own.', { n: answeredBefore })
                    : t('When a payment arrives that it cannot read, it asks here.')}
                </p>
                <div className="ms-actions"><Link to="/money/you" className="mv-pill">{t('See what it knows')}</Link></div>
              </div>
            ) : done ? (
              <div className="ms-stage-inner">
                <h1>{t('That is enough to change the numbers.')}</h1>
                <p className="mv-sub">
                  {facts && facts.length
                    ? t(facts.length === 1 ? 'It now holds {n} thing you told it.' : 'It now holds {n} things you told it.', { n: facts.length })
                    : t('Nothing was recorded. It carries on with what it reads.')}
                </p>
                {facts && facts.length ? (
                  <ul className="mv-list">
                    {facts.map((f) => (
                      <li key={f.id} className="mv-item">
                        <span className="mv-item-text">
                          <span className="mv-item-title">{factTitle(f)}</span>
                          <span className="mv-item-sub">{factWord(f)}</span>
                        </span>
                        <span className="mv-item-end">{f.amount ? euro(f.amount) : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="ms-actions"><Link to="/money" className="mv-pill">{t('See today')}</Link></div>
              </div>
            ) : question ? (
              <div className="ms-stage-inner" key={question.id}>
                <p className="ms-count">{t(fromLedger ? '{i} of {n}, from your payments' : '{i} of {n}', { i: index + 1, n: queue.length })}</p>
                <h1>{question.ask}</h1>
                {question.help || question.why ? <p className="mv-sub">{question.help || question.why}</p> : null}

                {question.receipts && question.receipts.length ? (
                  <ul className="mv-list" aria-label={t('The payments behind this question')}>
                    {question.receipts.map((r) => (
                      <li key={r.id} className="mv-item mv-item--tight">
                        <span className="mv-item-text">
                          <span className="mv-item-title">{r.merchant_raw || r.merchant_key}</span>
                          <span className="mv-item-sub">{shortDay(r.occurred_at, locale)}</span>
                        </span>
                        <span className="mv-item-end">{euro(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <form className="ms-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                  {question.input === 'text' ? (
                    <div className="ms-field">
                      <label className="mv-sr" htmlFor="ms-text">{t('Your answer')}</label>
                      <input
                        id="ms-text"
                        className="mv-field"
                        type="text"
                        value={text}
                        placeholder={t('Your answer')}
                        autoComplete="off"
                        onChange={(e) => setText(e.target.value)}
                      />
                    </div>
                  ) : null}

                  {question.input === 'category' || question.input.startsWith('choice:') ? (
                    <div className="ms-choices" role="group" aria-label={question.input === 'category' ? t('Pick the kind of place') : t('Pick one')}>
                      {(question.input === 'category' ? CATEGORIES : options).map((word) => (
                        <button
                          key={word}
                          type="button"
                          className="mv-pill mv-pill--ghost"
                          aria-pressed={choice === word}
                          onClick={() => setChoice(choice === word ? null : word)}
                        >
                          <span>{cap(t(word))}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {/* A choice made, and room to say more: who that is, what it was for. It is kept
                      beside the answer and read by the ledger, not filed under a word. */}
                  {choice && question.input.startsWith('choice:') ? (
                    <div className="ms-field ms-note">
                      <label className="mv-label" htmlFor="ms-note">{choice === 'other' ? t('Who is that, or what was it for?') : t('Anything else about it? Optional.')}</label>
                      <input id="ms-note" className="mv-field" type="text" autoComplete="off" maxLength={240} placeholder={choice === 'other' ? t('My landlord, the deposit for the ski trip') : ''} value={extra} onChange={(e) => setExtra(e.target.value)} />
                    </div>
                  ) : null}

                  {question.input.startsWith('list:') ? (
                    <div className="ms-rows">
                      {rows.map((row) => (
                        <div key={row.key} className={`ms-row ${columns.includes('share') ? 'ms-row--share' : 'ms-row--three'}`}>
                          <div className="ms-field">
                            <label className="mv-label" htmlFor={`ms-${row.key}-label`}>{cap(t(columns[0]))}</label>
                            <input
                              id={`ms-${row.key}-label`}
                              className="mv-field"
                              type="text"
                              autoComplete="off"
                              placeholder={PLACEHOLDER[columns[0]] ? t(PLACEHOLDER[columns[0]]) : ''}
                              value={row.label}
                              onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                            />
                          </div>

                          {columns.includes('amount') ? (
                            <div className="ms-field">
                              <label className="mv-label" htmlFor={`ms-${row.key}-amount`}>{t('Amount, \u20ac')}</label>
                              <input
                                id={`ms-${row.key}-amount`}
                                className="mv-field"
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder={PLACEHOLDER.amount}
                                value={row.amount}
                                onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))}
                              />
                            </div>
                          ) : null}

                          {columns.includes('day') ? (
                            <div className="ms-field">
                              <label className="mv-label" htmlFor={`ms-${row.key}-day`}>{t('Day')}</label>
                              <input
                                id={`ms-${row.key}-day`}
                                className="mv-field"
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder={PLACEHOLDER.day}
                                value={row.day}
                                onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, day: e.target.value } : r)))}
                              />
                            </div>
                          ) : null}

                          {columns.includes('share') ? (
                            <div className="ms-field">
                              <label className="mv-label" htmlFor={`ms-${row.key}-share`}>{t('Your share')}</label>
                              <div className="ms-pct">
                                <input
                                  id={`ms-${row.key}-share`}
                                  className="mv-field"
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  value={row.share}
                                  onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, share: e.target.value } : r)))}
                                />
                                <span>%</span>
                              </div>
                            </div>
                          ) : null}

                          {columns.includes('share') ? (
                            <div className="ms-quick">
                              {SHARES.map(([word, pct]) => (
                                <button
                                  key={word}
                                  type="button"
                                  className="mv-pill mv-pill--ghost"
                                  aria-pressed={Number(row.share) === pct}
                                  onClick={() => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, share: String(pct) } : r)))}
                                >
                                  <span>{cap(t(word))}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {rows.length > 1 ? (
                            <button type="button" className="mv-pill mv-pill--ghost ms-drop" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                              <span>{t('Remove')}</span>
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button type="button" className="mv-pill mv-pill--ghost ms-add" onClick={() => setRows((all) => [...all, blankRow()])}>
                        <span>{t('Add another')}</span>
                      </button>
                    </div>
                  ) : null}

                  <div className="ms-actions">
                    <button type="submit" className="mv-pill" disabled={busy || !answerable}>
                      <span>{busy ? t('Saving\u2026') : t('Continue')}</span>
                    </button>
                    {skippable ? (
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void skip()} disabled={busy}>
                        <span>{t('Skip this')}</span>
                      </button>
                    ) : null}
                  </div>
                  {note ? <p className="ms-note" role="alert">{note}</p> : null}
                </form>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
