/**
 * Money setup, as a conversation.
 *
 * The same questions as /money/setup, asked one at a time in a transcript that keeps what
 * you already said. While you answer, the engine is reading the ledger for itself, and the
 * right-hand column shows that work as it happens: real steps, real counts, nothing invented.
 * If the trace stream is not there, the column says so and the conversation carries on.
 *
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { authFetch } from '../../services/api/apiBase';
import { ArrowUp } from 'lucide-react';
import '../../styles/money-v2.css';
import '../../styles/money-chat.css';
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
  { to: '/money/setup', label: 'Questions' },
  { to: '/money/chat', label: 'Conversation', current: true },
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

/** What a saved row reads as once it is back in the transcript. */
function rowSummary(row: ListRow, columns: string[]): string {
  const bits: string[] = [row.label.trim()];
  if (columns.includes('amount')) { const a = parseAmount(row.amount); if (a !== undefined) bits.push(euro(a)); }
  if (columns.includes('day')) { const d = parseDay(row.day); if (d !== undefined) bits.push(`on the ${ordinal(d)}`); }
  if (columns.includes('share')) { const s = parseShare(row.share); if (s !== undefined) bits.push(`${Math.round(s * 100)}% yours`); }
  return bits.join(', ');
}

/* ---------------------------------------------------------------- the trace */

type TraceStep = { step: string; label: string; detail: string | null; count: number | null; done: boolean };

/**
 * The live read of the ledger, over server-sent events. The endpoint is optional by
 * design: if it 404s, errors, or the browser has no EventSource, this returns nothing and
 * the caller shows a quiet line. Nothing here can block or break the conversation.
 */
function useLedgerTrace(): { steps: TraceStep[]; reading: boolean } {
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    /* Not EventSource: it cannot carry an Authorization header, and this app keeps its
       access token in memory rather than in a cookie the API reads, so the stream came
       back 401. A streaming fetch can send the header, and it also avoids the other way
       out of this, which would have been putting a token in a URL where it lands in logs. */
    const controller = new AbortController();
    let cancelled = false;

    const read = async () => {
      let response: Response;
      try {
        response = await authFetch('/money/stream', {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
      } catch { return; }
      if (!response.ok || !response.body) return;
      setReading(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          buffer += decoder.decode(value, { stream: true });
          /* Server-sent events are separated by a blank line; anything after the last one
             is a partial frame and waits for the next chunk. */
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let parsed: unknown;
            try { parsed = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (!parsed || typeof parsed !== 'object') continue;
            const raw = parsed as Record<string, unknown>;
            if (typeof raw.step !== 'string' || !raw.step) continue;
            const next: TraceStep = {
              step: raw.step,
              label: typeof raw.label === 'string' && raw.label ? raw.label : raw.step,
              detail: typeof raw.detail === 'string' && raw.detail ? raw.detail : null,
              count: typeof raw.count === 'number' && Number.isFinite(raw.count) ? raw.count : null,
              done: raw.done === true || raw.state === 'done' || raw.state === 'failed',
            };
            setSteps((all) => {
              const at = all.findIndex((x) => x.step === next.step);
              if (at < 0) return [...all, next];
              const copy = all.slice();
              copy[at] = next;
              return copy;
            });
          }
        }
      } catch {
        /* A dropped connection leaves what already arrived on screen: it did happen. */
      } finally {
        if (!cancelled) setReading(false);
      }
    };

    void read();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  return { steps, reading };
}

/* A heading, one grey line, then the steps as rows under the ink rule. The step in
   progress is the one in ink at 500; the rest have gone quiet. */
function TracePanel({ steps, reading }: { steps: TraceStep[]; reading: boolean }) {
  return (
    <aside className="mc-trace" aria-label="What it is doing">
      <p className="mc-trace-head">What it is doing</p>
      {steps.length === 0 ? (
        <p className="mv-sub">Not reading the ledger right now.</p>
      ) : (
        <ul className="mv-list mc-steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.step} className={`mv-item mv-item--tight mc-step${reading && !s.done ? ' is-live' : ''}`}>
              <span className="mv-item-text">
                <span className="mv-item-title">{s.label}</span>
                {s.detail ? <span className="mv-item-sub">{s.detail}</span> : null}
              </span>
              {s.count === null ? null : <span className="mv-item-end">{s.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/* ---------------------------------------------------------------- the page */

export default function MoneyChatPage() {
  const [queue, setQueue] = useState<MoneyQuestion[]>([]);
  const [openingCount, setOpeningCount] = useState(0);
  const [answeredBefore, setAnsweredBefore] = useState(0);
  const [index, setIndex] = useState(0);
  const [said, setSaid] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [facts, setFacts] = useState<MoneyFact[] | null>(null);

  const trace = useLedgerTrace();
  const stillMotion = useReducedMotion();
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

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
    setRows(question && question.input.startsWith('list:') ? [blankRow()] : []);
  }, [question]);

  useEffect(() => {
    if (!done || facts !== null) return;
    void moneyAPI.facts().then(setFacts).catch(() => setFacts([]));
  }, [done, facts]);

  /* The newest question should sit where the eye already is. */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: stillMotion ? 'auto' : 'smooth', block: 'end' });
  }, [index, done, loaded, stillMotion]);

  /* An auto-growing composer: no scrollbar until it has earned one. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [text]);

  const columns = useMemo(() => (question && question.input.startsWith('list:') ? listColumns(question.input) : []), [question]);
  const options = useMemo(() => (question && question.input.startsWith('choice:') ? choiceOptions(question.input) : []), [question]);
  const isText = question?.input === 'text';
  const isList = Boolean(question?.input.startsWith('list:'));
  const isCards = Boolean(question) && (question.input === 'category' || question.input.startsWith('choice:'));
  const fromLedger = Boolean(question) && index >= openingCount;
  const skippable = Boolean(question?.optional) || fromLedger;

  /* A ledger question carries the merchant's own spelling on its receipts; that reads
     better in the summary than the key the ledger files it under. */
  const subjectLabel = question?.receipts?.[0]?.merchant_raw || undefined;
  const filledRows = rows.filter((r) => r.label.trim());

  function keep(at: number, summary: string) {
    setSaid((all) => ({ ...all, [at]: summary }));
    setIndex((i) => i + 1);
  }

  async function sendValue(value: string) {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    const at = index;
    try {
      await moneyAPI.answerQuestion({
        questionId: question.id,
        kind: question.kind,
        value,
        ...(question.subject ? { subject: question.subject } : {}),
        ...(subjectLabel ? { subjectLabel } : {}),
      });
      keep(at, value);
    } catch (e) {
      setNote((e as Error).message || 'That answer did not save. Try it again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendRows() {
    if (!question || busy) return;
    if (filledRows.length === 0) { void skip(); return; }
    setBusy(true);
    setNote(null);
    const at = index;
    try {
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
      keep(at, filledRows.map((r) => rowSummary(r, columns)).join(' / '));
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
    const at = index;
    try { await moneyAPI.skipQuestion(question.id); keep(at, 'Skipped this one.'); }
    catch { setNote('That did not go through. Try it again.'); }
    finally { setBusy(false); }
  }

  function submitComposer() {
    const value = text.trim();
    if (!isText || !value || busy) return;
    void sendValue(value);
  }

  const rise = stillMotion
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: [0.2, 0.7, 0.3, 1] as const } };

  const composerPlaceholder = done
    ? 'That is everything for now.'
    : isText && question
      ? question.ask
      : question
        ? 'Answer it above to carry on'
        : 'Nothing to answer';

  return (
    <main className="mv mc">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <div className="mc-columns">
            <section className="mc-thread">
              <div className="mc-scroll">
                {!loaded ? (
                  <p className="mv-quiet">Reading your payments…</p>
                ) : failed ? (
                  <div className="mc-turn">
                    <h1>The questions did not load.</h1>
                    <p className="mv-sub">Nothing was lost. Try again in a moment.</p>
                    <div className="mc-actions"><Link to="/money" className="mv-pill">Back to the month</Link></div>
                  </div>
                ) : queue.length === 0 ? (
                  <div className="mc-turn">
                    <h1>Nothing to ask.</h1>
                    <p className="mv-sub">
                      {answeredBefore > 0
                        ? `You answered ${answeredBefore} already. Everything since reads on its own.`
                        : 'When a payment arrives that it cannot read, it asks here.'}
                    </p>
                    <div className="mc-actions"><Link to="/money" className="mv-pill">Back to the month</Link></div>
                  </div>
                ) : (
                  /* What was asked and answered goes quiet; only the newest question speaks
                     at heading size. */
                  queue.slice(0, index + 1).map((q, at) => (at < index ? (
                    <div className="mc-turn mc-turn--past" key={`${q.id}-${at}`}>
                      <motion.p className="mc-past-ask" {...rise}>{q.ask}</motion.p>
                      <motion.p className="mc-said" {...rise}>{said[at] || 'Answered.'}</motion.p>
                    </div>
                  ) : (
                    <motion.div className="mc-turn" key={`${q.id}-${at}`} {...rise}>
                      <p className="mc-count">{at + 1} of {queue.length}{at >= openingCount ? ', from your payments' : ''}</p>
                      <h1>{q.ask}</h1>
                      {q.help || q.why ? <p className="mv-sub">{q.help || q.why}</p> : null}
                      {q.receipts && q.receipts.length ? (
                        <ul className="mv-list" aria-label="The payments behind this question">
                          {q.receipts.map((r) => (
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
                    </motion.div>
                  )))
                )}

                {question && !done ? (
                  <div className="mc-answer">
                    {isCards ? (
                      <div className="mc-cards" role="group" aria-label={question.input === 'category' ? 'Pick the kind of place' : 'Pick one'}>
                        {(question.input === 'category' ? CATEGORIES : options).map((word) => (
                          <button
                            key={word}
                            type="button"
                            className="mv-pill mv-pill--ghost"
                            disabled={busy}
                            onClick={() => void sendValue(word)}
                          >
                            <span>{cap(word)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {isList ? (
                      <form className="mc-rows" onSubmit={(e) => { e.preventDefault(); void sendRows(); }}>
                        {rows.map((row) => (
                          <div key={row.key} className={`mc-row ${columns.includes('share') ? 'mc-row--share' : 'mc-row--three'}`}>
                            <div className="mc-field">
                              <label className="mv-label" htmlFor={`mc-${row.key}-label`}>{cap(columns[0])}</label>
                              <input
                                id={`mc-${row.key}-label`}
                                className="mv-field"
                                type="text"
                                autoComplete="off"
                                placeholder={PLACEHOLDER[columns[0]] || ''}
                                value={row.label}
                                onChange={(e) => setRows((all) => all.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                              />
                            </div>

                            {columns.includes('amount') ? (
                              <div className="mc-field">
                                <label className="mv-label" htmlFor={`mc-${row.key}-amount`}>Amount, €</label>
                                <input
                                  id={`mc-${row.key}-amount`}
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
                              <div className="mc-field">
                                <label className="mv-label" htmlFor={`mc-${row.key}-day`}>Day</label>
                                <input
                                  id={`mc-${row.key}-day`}
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
                              <div className="mc-field">
                                <label className="mv-label" htmlFor={`mc-${row.key}-share`}>Your share</label>
                                <div className="mc-pct">
                                  <input
                                    id={`mc-${row.key}-share`}
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
                              <div className="mc-quick">
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
                              <button type="button" className="mv-pill mv-pill--ghost mc-drop" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                                <span>Remove</span>
                              </button>
                            ) : null}
                          </div>
                        ))}
                        <div className="mc-actions">
                          <button type="button" className="mv-pill mv-pill--ghost" onClick={() => setRows((all) => [...all, blankRow()])}>
                            <span>Add another</span>
                          </button>
                          <button type="submit" className="mv-pill" disabled={busy || (filledRows.length === 0 && !skippable)}>
                            <span>{busy ? 'Saving…' : 'That is all of them'}</span>
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {skippable ? (
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void skip()} disabled={busy}>
                        <span>Skip this</span>
                      </button>
                    ) : null}
                    {note ? <p className="mc-note" role="alert">{note}</p> : null}
                  </div>
                ) : null}

                {done ? (
                  <motion.div className="mc-turn" {...rise}>
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
                    <div className="mc-actions"><Link to="/money" className="mv-pill">See the month</Link></div>
                  </motion.div>
                ) : null}

                <div ref={endRef} className="mc-end" />
              </div>

              <div className="mc-composer">
                <form
                  className="mc-composer-inner"
                  onSubmit={(e) => { e.preventDefault(); submitComposer(); }}
                >
                  <label className="mv-sr" htmlFor="mc-say">Your answer</label>
                  <textarea
                    id="mc-say"
                    ref={boxRef}
                    className="mc-say"
                    rows={1}
                    value={text}
                    placeholder={composerPlaceholder}
                    disabled={!isText || busy || done}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComposer(); }
                    }}
                  />
                  <button type="submit" className="mv-pill mc-send" disabled={!isText || busy || done || !text.trim()} aria-label="Send this answer">
                    <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </section>

            <TracePanel steps={trace.steps} reading={trace.reading} />
          </div>
        </div>
      </div>
    </main>
  );
}
