/**
 * Ask.
 *
 * The conversation about the money itself: any month, any shop, anything that leaves the
 * account, answered from the person's own payments with a figure when one says it better
 * and the payments underneath. The same conversation the phone has as its own place.
 *
 * The questions the ledger cannot work out on its own live on /money/setup; when there
 * are any, this page says how many and points there, and otherwise stays out of the way.
 * This page used to be that setup flow again as a transcript, which was the same page
 * twice under two names in the sidebar.
 *
 * The right-hand column shows the engine reading the ledger as it happens: real steps,
 * real counts, nothing invented. If the trace stream is not there, the column says so.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { authFetch } from '../../services/api/apiBase';
import { ArrowUp } from 'lucide-react';
import '../../styles/money-v2.css';
import '../../styles/money-chat.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { moneyAPI, moneyChat, euro, shortDay, type ChatFigure, type ChatReceipt, type ChatTurn } from '../../services/api/moneyAPI';
import { Figure } from './MoneyFigures';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const NAV: MoneyNavLink[] = [
  { to: '/money', label: 'This month' },
  { to: '/money/setup', label: 'Questions' },
  { to: '/money/chat', label: 'Ask', current: true },
];

/** One line of the conversation: yours, or the ledger's with what it drew and what it stands on. */
type AskLine = { id: string; who: 'you' | 'twin'; text: string; pending?: boolean; figures?: ChatFigure[]; receipts?: ChatReceipt[] };

/** What a person tends to ask first. Each is offered once and never after it was asked. */
const OFFERS = ['Where did the money go?', 'What comes back every month?', 'How does this month compare?', 'What is still to come?'];
let askSeq = 0;

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

export default function MoneyChatPage() {
  useDocumentTitle('Ask');
  const [openQuestions, setOpenQuestions] = useState(0);
  const [lines, setLines] = useState<AskLine[]>([]);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');

  const stop = useRef<(() => void) | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const trace = useLedgerTrace();
  const stillMotion = useReducedMotion();

  /* How many things the ledger still cannot work out on its own. Answering them is a page
     of its own; this one only says they are waiting. */
  useEffect(() => {
    let live = true;
    moneyAPI.questions()
      .then((q) => { if (live) setOpenQuestions(q.opening.length + q.fromLedger.length); })
      .catch(() => { /* the count is a courtesy, not a condition */ });
    return () => { live = false; };
  }, []);

  /* A stream in flight when the page goes is stopped; nothing writes into a transcript
     nobody is looking at. */
  useEffect(() => () => { stop.current?.(); }, []);

  /* The newest line should sit where the eye already is. */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: stillMotion ? 'auto' : 'smooth', block: 'end' });
  }, [lines, stillMotion]);

  /* An auto-growing composer: no scrollbar until it has earned one. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [text]);

  const asked = useMemo(() => new Set(lines.filter((l) => l.who === 'you').map((l) => l.text.trim().toLowerCase())), [lines]);
  /* Three offers before the first question, two after, so they read as prompts, not a menu. */
  const offers = useMemo(() => OFFERS.filter((q) => !asked.has(q.toLowerCase())).slice(0, asked.size === 0 ? 3 : 2), [asked]);
  const last = lines[lines.length - 1];
  const offersShown = offers.length > 0 && !asking && (!last || (last.who === 'twin' && !last.pending));

  function ask(value: string) {
    const said = value.trim();
    if (asking || !said) return;
    const history: ChatTurn[] = lines.filter((l) => !l.pending).map((l) => ({ role: l.who === 'you' ? 'user' : 'twin', text: l.text }));
    askSeq += 1;
    const twinId = `twin-${askSeq}`;
    setLines((all) => [...all, { id: `you-${askSeq}`, who: 'you', text: said }, { id: twinId, who: 'twin', text: 'Reading the ledger.', pending: true }]);
    setAsking(true);
    setText('');
    const amend = (patch: (l: AskLine) => AskLine) => setLines((all) => all.map((l) => (l.id === twinId ? patch(l) : l)));
    let wrote = false;
    stop.current = moneyChat.stream(said, history, {
      onEvent: (e) => {
        if (e.phase === 'text') {
          /* Decided now, not when React applies the update: two deltas in one tick would
             both see wrote=true and the first would append to "Reading the ledger." */
          const first = !wrote;
          wrote = true;
          amend((l) => ({ ...l, pending: false, text: first ? e.delta : l.text + e.delta }));
        } else if (e.phase === 'figures') {
          amend((l) => ({ ...l, figures: e.figures || [] }));
        } else if (e.phase === 'actions') {
          amend((l) => ({ ...l, receipts: e.receipts || [] }));
        } else if (e.phase === 'failed') {
          amend((l) => ({ ...l, pending: false, text: e.detail || 'That could not be read right now.' }));
          wrote = true;
        }
      },
      onEnd: (ok) => {
        stop.current = null;
        if (!ok && !wrote) amend((l) => ({ ...l, pending: false, text: 'That could not be read right now.' }));
        setAsking(false);
      },
    });
  }

  const rise = stillMotion
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: [0.2, 0.7, 0.3, 1] as const } };

  return (
    <main className="mv mc">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <div className="mc-columns">
            <section className="mc-thread">
              <div className="mc-scroll">
                <div className="mc-turn">
                  <h1>Ask.</h1>
                  <p className="mv-sub">Any month, any shop, anything that leaves your account. Answers come from your own payments, with the payments underneath.</p>
                  {openQuestions > 0 ? (
                    <div className="mc-actions">
                      <Link to="/money/setup" className="mv-pill mv-pill--ghost">
                        <span>{openQuestions} {openQuestions === 1 ? 'thing' : 'things'} it cannot work out on its own</span>
                      </Link>
                    </div>
                  ) : null}
                </div>

                {lines.map((l) => (
                  <motion.div key={l.id} className={`mc-line ${l.who === 'you' ? 'mc-line--you' : ''}`} {...rise}>
                    <span className="mc-line-who">{l.who === 'you' ? 'You' : 'The ledger'}</span>
                    <p className={`mc-line-text ${l.pending ? 'is-pending' : ''}`}>{l.text}</p>
                    {l.figures?.map((f, k) => <Figure key={k} figure={f} />)}
                    {l.receipts && l.receipts.length ? (
                      <div className="mc-receipts">
                        <span className="mv-quiet">{`Read from ${l.receipts.length} ${l.receipts.length === 1 ? 'payment' : 'payments'}`}</span>
                        <ul className="mv-list">
                          {l.receipts.slice(0, 8).map((r) => (
                            <li key={r.id} className="mv-item mv-item--tight">
                              <span className="mv-item-text">
                                <span className="mv-item-title">{r.merchant}</span>
                                <span className="mv-item-sub">{shortDay(r.occurred_at)}</span>
                              </span>
                              <span className="mv-item-end">{euro(r.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </motion.div>
                ))}

                {offersShown ? (
                  <div className="mc-offers" role="group" aria-label="Things to ask">
                    {offers.map((q) => (
                      <button key={q} type="button" className="mv-pill mv-pill--ghost" onClick={() => ask(q)}><span>{q}</span></button>
                    ))}
                  </div>
                ) : null}

                <div ref={endRef} className="mc-end" />
              </div>

              <div className="mc-composer">
                <form className="mc-composer-inner" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
                  <label className="mv-sr" htmlFor="mc-say">Ask about your money</label>
                  <textarea
                    id="mc-say"
                    ref={boxRef}
                    className="mc-say"
                    rows={1}
                    value={text}
                    placeholder="Ask about your money"
                    disabled={asking}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); }
                    }}
                  />
                  <button type="submit" className="mv-pill mc-send" disabled={asking || !text.trim()} aria-label="Ask">
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
