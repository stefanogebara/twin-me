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
import '../../styles/money-v2.css';
import '../../styles/money-setup.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { moneyAPI, euro, shortDay, type MoneyFact, type MoneyQuestion } from '../../services/api/moneyAPI';

/** The words a kind of place can be given, matching what the categoriser itself uses. */
const CATEGORIES = [
  'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy',
  'sport', 'education', 'clothing', 'home', 'electronics', 'entertainment', 'software',
  'advertising', 'travel', 'lodging', 'cash', 'fees', 'transfers', 'bills', 'other',
];

/** Shares a person actually names out loud, so the common answer is one press. */
const SHARES: [string, number][] = [['a half', 50], ['a third', 33], ['a quarter', 25], ['two thirds', 67]];

const PLACEHOLDER: Record<string, string> = {
  name: 'Rent', source: 'Family', what: 'The weekly shop', amount: '500', day: '1',
};
const FACT_WORD: Record<string, string> = {
  home_area: 'lives in', study_place: 'studies at', work_place: 'works at', commitment: 'every month',
  income: 'comes in', shared_cost: 'shared', person: 'who that is', merchant_kind: 'kind of place', goal: 'this term',
};

const NAV: MoneyNavLink[] = [
  { to: '/money', label: 'This month' },
  { to: '/money/setup', label: 'Questions', current: true },
  { to: '/money/chat', label: 'Ask' },
];

type ListRow = { key: string; label: string; amount: string; day: string; share: string };

let rowSeq = 0;
function blankRow(): ListRow { rowSeq += 1; return { key: `r${rowSeq}`, label: '', amount: '', day: '', share: '50' }; }

/** A stable key for a fact the person named, so the same rent typed twice is one fact. */
function slug(s: string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'; }
function listColumns(input: string) { return input.slice('list:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
function choiceOptions(input: string) { return input.slice('choice:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
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
function ordinal(n: number): string {
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function MoneySetupPage() {
  const [queue, setQueue] = useState<MoneyQuestion[]>([]);
  const [openingCount, setOpeningCount] = useState(0);
  const [answeredBefore, setAnsweredBefore] = useState(0);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
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
    setChoice(null);
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
        });
      }
      advance();
    } catch (e) {
      setNote((e as Error).message || 'That answer did not save. Try it again.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try { await moneyAPI.skipQuestion(question.id); advance(); }
    catch { setNote('That did not go through. Try it again.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="mv ms">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <section className="ms-stage">
            {!loaded ? (
              <p className="mv-quiet">Reading your payments…</p>
            ) : failed ? (
              <div className="ms-stage-inner">
                <h1>The questions did not load.</h1>
                <p className="mv-sub">Nothing was lost. Try again in a moment.</p>
                <div className="ms-actions"><Link to="/money" className="mv-pill">Back to the month</Link></div>
              </div>
            ) : queue.length === 0 ? (
              <div className="ms-stage-inner">
                <h1>Nothing to ask.</h1>
                <p className="mv-sub">
                  {answeredBefore > 0
                    ? `You answered ${answeredBefore} already. Everything since reads on its own.`
                    : 'When a payment arrives that it cannot read, it asks here.'}
                </p>
                <div className="ms-actions"><Link to="/money" className="mv-pill">Back to the month</Link></div>
              </div>
            ) : done ? (
              <div className="ms-stage-inner">
                <h1>That is enough to change the numbers.</h1>
                <p className="mv-sub">
                  {facts && facts.length
                    ? `It now holds ${facts.length} ${facts.length === 1 ? 'thing' : 'things'} you told it.`
                    : 'Nothing was recorded. It carries on with what it reads.'}
                </p>
                {facts && facts.length ? (
                  <ul className="mv-list">
                    {facts.map((f) => (
                      <li key={f.id} className="mv-item">
                        <span className="mv-item-text">
                          <span className="mv-item-title">
                            {f.subject_label || f.value || f.subject || 'unnamed'}
                            {f.subject_label && f.value ? `, ${f.value}` : ''}
                            {f.day ? `, on the ${ordinal(f.day)}` : ''}
                            {f.share ? `, ${Math.round(Number(f.share) * 100)}% yours` : ''}
                          </span>
                          <span className="mv-item-sub">{f.check_note || cap(FACT_WORD[f.kind] || f.kind)}</span>
                        </span>
                        <span className="mv-item-end">{f.amount ? euro(f.amount) : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="ms-actions"><Link to="/money" className="mv-pill">See the month</Link></div>
              </div>
            ) : question ? (
              <div className="ms-stage-inner" key={question.id}>
                <p className="ms-count">{index + 1} of {queue.length}{fromLedger ? ', from your payments' : ''}</p>
                <h1>{question.ask}</h1>
                {question.help || question.why ? <p className="mv-sub">{question.help || question.why}</p> : null}

                {question.receipts && question.receipts.length ? (
                  <ul className="mv-list" aria-label="The payments behind this question">
                    {question.receipts.map((r) => (
                      <li key={r.id} className="mv-item mv-item--tight">
                        <span className="mv-item-text">
                          <span className="mv-item-title">{r.merchant_raw || r.merchant_key}</span>
                          <span className="mv-item-sub">{shortDay(r.occurred_at)}</span>
                        </span>
                        <span className="mv-item-end">{euro(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <form className="ms-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                  {question.input === 'text' ? (
                    <div className="ms-field">
                      <label className="mv-sr" htmlFor="ms-text">Your answer</label>
                      <input
                        id="ms-text"
                        className="mv-field"
                        type="text"
                        value={text}
                        placeholder="Your answer"
                        autoComplete="off"
                        onChange={(e) => setText(e.target.value)}
                      />
                    </div>
                  ) : null}

                  {question.input === 'category' || question.input.startsWith('choice:') ? (
                    <div className="ms-choices" role="group" aria-label={question.input === 'category' ? 'Pick the kind of place' : 'Pick one'}>
                      {(question.input === 'category' ? CATEGORIES : options).map((word) => (
                        <button
                          key={word}
                          type="button"
                          className="mv-pill mv-pill--ghost"
                          aria-pressed={choice === word}
                          onClick={() => setChoice(choice === word ? null : word)}
                        >
                          <span>{cap(word)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {question.input.startsWith('list:') ? (
                    <div className="ms-rows">
                      {rows.map((row) => (
                        <div key={row.key} className={`ms-row ${columns.includes('share') ? 'ms-row--share' : 'ms-row--three'}`}>
                          <div className="ms-field">
                            <label className="mv-label" htmlFor={`ms-${row.key}-label`}>{cap(columns[0])}</label>
                            <input
                              id={`ms-${row.key}-label`}
                              className="mv-field"
                              type="text"
                              autoComplete="off"
                              placeholder={PLACEHOLDER[columns[0]] || ''}
                              value={row.label}
                              onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                            />
                          </div>

                          {columns.includes('amount') ? (
                            <div className="ms-field">
                              <label className="mv-label" htmlFor={`ms-${row.key}-amount`}>Amount, €</label>
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
                              <label className="mv-label" htmlFor={`ms-${row.key}-day`}>Day</label>
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
                              <label className="mv-label" htmlFor={`ms-${row.key}-share`}>Your share</label>
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
                                  <span>{cap(word)}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {rows.length > 1 ? (
                            <button type="button" className="mv-pill mv-pill--ghost ms-drop" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                              <span>Remove</span>
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button type="button" className="mv-pill mv-pill--ghost ms-add" onClick={() => setRows((all) => [...all, blankRow()])}>
                        <span>Add another</span>
                      </button>
                    </div>
                  ) : null}

                  <div className="ms-actions">
                    <button type="submit" className="mv-pill" disabled={busy || !answerable}>
                      <span>{busy ? 'Saving…' : 'Continue'}</span>
                    </button>
                    {skippable ? (
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void skip()} disabled={busy}>
                        <span>Skip this</span>
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
