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
      <header className="mv-nav">
        <Link to="/money" className="mv-mark" aria-label="TwinMe"><i /><i /><i /><i /><i /><i /></Link>
        <span aria-hidden="true" />
        <Link to="/money" className="mv-pill mv-pill--ghost">The month</Link>
      </header>

      <section className="ms-stage">
        {!loaded ? (
          <p className="ms-count">Reading the ledger...</p>
        ) : failed ? (
          <div className="ms-stage-inner">
            <p className="mv-kicker">Setup</p>
            <h1 className="ms-ask">The questions did not load.</h1>
            <p className="ms-why">Nothing was lost. Come back to this in a moment.</p>
            <div className="ms-actions"><Link to="/money" className="mv-pill">Back to the month</Link></div>
          </div>
        ) : queue.length === 0 ? (
          <div className="ms-stage-inner">
            <p className="mv-kicker">Setup</p>
            <h1 className="ms-ask">Nothing it cannot explain.</h1>
            <p className="ms-why">
              {answeredBefore > 0
                ? `You have answered ${answeredBefore} ${answeredBefore === 1 ? 'thing' : 'things'} already, and every line the ledger has read since then it could read on its own.`
                : 'The ledger reads rhythm, price and place from your payments without asking. When a line arrives that it cannot read, it asks here.'}
            </p>
            <div className="ms-actions"><Link to="/money" className="mv-pill">Back to the month</Link></div>
          </div>
        ) : done ? (
          <div className="ms-stage-inner">
            <p className="mv-kicker">Done</p>
            <h1 className="ms-ask">That is enough to change the numbers.</h1>
            <p className="ms-why">
              {facts && facts.length
                ? `It now holds ${facts.length} ${facts.length === 1 ? 'thing' : 'things'} you told it, next to everything it read for itself.`
                : 'Nothing was recorded this time. The ledger carries on with what it can read for itself.'}
            </p>
            {facts && facts.length ? (
              <ul className="ms-facts">
                {facts.map((f) => (
                  <li key={f.id}>
                    <span className="ms-fact-kind">{FACT_WORD[f.kind] || f.kind}</span>
                    <span className="ms-fact-what">
                      {f.subject_label || f.value || f.subject || 'unnamed'}
                      {f.subject_label && f.value ? `, ${f.value}` : ''}
                      {f.day ? `, on the ${ordinal(f.day)}` : ''}
                      {f.share ? `, ${Math.round(Number(f.share) * 100)}% yours` : ''}
                    </span>
                    <span className="ms-fact-amount">{f.amount ? euro(f.amount) : ''}</span>
                    {f.check_note ? <span className="ms-fact-note">{f.check_note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="ms-actions"><Link to="/money" className="mv-pill">See the month</Link></div>
          </div>
        ) : question ? (
          <div className="ms-stage-inner" key={question.id}>
            <p className="ms-count">{index + 1} of {queue.length}</p>
            <p className="mv-kicker">{fromLedger ? 'From your ledger' : 'What only you know'}</p>
            {fromLedger && index === openingCount && openingCount > 0 ? (
              <p className="ms-turn">The opening questions are done. These come from your own payments, biggest unexplained line first.</p>
            ) : null}
            <h1 className="ms-ask">{question.ask}</h1>
            <p className="ms-why">{question.why}</p>
            {question.help ? <p className="ms-help">{question.help}</p> : null}

            {question.receipts && question.receipts.length ? (
              <ul className="mv-reading-receipts" aria-label="The payments behind this question">
                {question.receipts.map((r) => (
                  <li key={r.id}>
                    <span>{shortDay(r.occurred_at)}</span>
                    {r.merchant_raw || r.merchant_key}
                    <em>{euro(r.amount)}</em>
                  </li>
                ))}
              </ul>
            ) : null}

            <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              {question.input === 'text' ? (
                <div className="ms-field">
                  <label className="ms-label" htmlFor="ms-text">Your answer</label>
                  <input
                    id="ms-text"
                    className="ms-input"
                    type="text"
                    value={text}
                    autoComplete="off"
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
              ) : null}

              {question.input === 'category' || question.input.startsWith('choice:') ? (
                <div className="ms-field" role="group" aria-labelledby="ms-choice-label">
                  <span className="ms-label" id="ms-choice-label">{question.input === 'category' ? 'Pick the kind of place' : 'Pick one'}</span>
                  <div className="ms-choices">
                    {(question.input === 'category' ? CATEGORIES : options).map((word) => (
                      <button
                        key={word}
                        type="button"
                        className={`mv-pill mv-pill--sm ${choice === word ? '' : 'mv-pill--ghost'}`}
                        aria-pressed={choice === word}
                        onClick={() => setChoice(choice === word ? null : word)}
                      >
                        <span>{word}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {question.input.startsWith('list:') ? (
                <div className="ms-rows">
                  {rows.map((row) => (
                    <div key={row.key} className={`ms-row ${columns.includes('share') ? 'ms-row--share' : 'ms-row--three'}`}>
                      <div className="ms-field">
                        <label className="ms-label" htmlFor={`ms-${row.key}-label`}>{columns[0]}</label>
                        <input
                          id={`ms-${row.key}-label`}
                          className="ms-input ms-input--sm"
                          type="text"
                          autoComplete="off"
                          placeholder={PLACEHOLDER[columns[0]] || ''}
                          value={row.label}
                          onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                        />
                      </div>

                      {columns.includes('amount') ? (
                        <div className="ms-field">
                          <label className="ms-label" htmlFor={`ms-${row.key}-amount`}>amount, euros</label>
                          <input
                            id={`ms-${row.key}-amount`}
                            className="ms-input ms-input--sm ms-input--num"
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
                          <label className="ms-label" htmlFor={`ms-${row.key}-day`}>day</label>
                          <input
                            id={`ms-${row.key}-day`}
                            className="ms-input ms-input--sm ms-input--num"
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
                          <label className="ms-label" htmlFor={`ms-${row.key}-share`}>your share</label>
                          <div className="ms-pct">
                            <input
                              id={`ms-${row.key}-share`}
                              className="ms-input ms-input--sm ms-input--num"
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

                      {rows.length > 1 ? (
                        <button type="button" className="ms-drop" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                          <span>Remove</span>
                        </button>
                      ) : null}

                      {columns.includes('share') ? (
                        <div className="ms-share-quick">
                          {SHARES.map(([word, pct]) => (
                            <button
                              key={word}
                              type="button"
                              className={`mv-pill mv-pill--sm ${Number(row.share) === pct ? '' : 'mv-pill--ghost'}`}
                              aria-pressed={Number(row.share) === pct}
                              onClick={() => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, share: String(pct) } : r)))}
                            >
                              <span>{word}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" className="mv-pill mv-pill--ghost mv-pill--sm ms-add" onClick={() => setRows((all) => [...all, blankRow()])}>
                    <span>Add another</span>
                  </button>
                </div>
              ) : null}

              <div className="ms-actions">
                <button type="submit" className="mv-pill" disabled={busy || !answerable}>
                  <span>{busy ? 'Saving...' : 'Continue'}</span>
                </button>
                {skippable ? (
                  <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void skip()} disabled={busy}>
                    <span>Skip this</span>
                  </button>
                ) : null}
                <span className="ms-changes">changes {question.changes}</span>
              </div>
              {note ? <p className="ms-note">{note}</p> : null}
            </form>
          </div>
        ) : null}
      </section>

      <footer className="mv-footer">
        <span>twinme, 2026</span>
        <nav><Link to="/money">The month</Link><Link to="/portrait">Portrait</Link></nav>
      </footer>
    </main>
  );
}
