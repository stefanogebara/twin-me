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
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion, useReducedMotion } from 'framer-motion';
import { authFetch } from '../../services/api/apiBase';
import { ArrowUp, Paperclip } from 'lucide-react';
import '../../styles/money-v2.css';
import '../../styles/money-chat.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { MONEY_NAV } from './navLinks';
import { moneyAPI, moneyChat, euro, shortDay, type ChatFigure, type ChatReceipt, type ChatTurn , type ChatAction } from '../../services/api/moneyAPI';
import { Figure } from './MoneyFigures';
import LedgerOrb from '../../components/LedgerOrb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocale, useT } from '@/lib/i18n';

const NAV: MoneyNavLink[] = MONEY_NAV('ask');

/** One line of the conversation: yours, or the ledger's with what it drew and what it stands on. */
type AskLine = {
  id: string; who: 'you' | 'twin'; text: string; pending?: boolean; figures?: ChatFigure[]; receipts?: ChatReceipt[];
  /** The offers under an answer, the model's own reasoning, and the context lines it stood on. */
  actions?: ChatAction[]; thinking?: string; basis?: string[]; acted?: string; howOpen?: boolean;
  /** Still being written: the caret sits at the end. A file you sent, with its picture when it has one. */
  writing?: boolean; error?: string; file?: { name: string; url?: string };
};

/** Vercel takes 4 MB of body; a photo bigger than this is shrunk before it goes. */
const MAX_UPLOAD = 4 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.heic,.pdf,.txt,.csv,.tsv,.xlsx,.xls,image/*,application/pdf';

/** A phone photo is 3 to 6 MB; the receipt on it reads the same at 1800px and a tenth of the bytes. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * The ledger at work, in view: the orb in the state of the work (searching while the rows
 * are read, solving once the model reasons), the step in words beside it, and the train of
 * thought as it is written, the newest lines kept in view. When the answer starts, this
 * gives way to it and the thought folds into How it got there.
 */
function Pending({ status, thinking, still }: { status: string; thinking?: string; still: boolean }) {
  const t = useT();
  const thought = (thinking || '').trim();
  return (
    <div className="mc-pending" aria-live="polite">
      <p className="mc-line-text is-pending">
        <LedgerOrb state={thought ? 'solving' : 'searching'} size={20} paused={still} label="" />
        <span>{thought ? t('Working it out') : t(status)}</span>
      </p>
      {thought ? (
        <motion.div className="mc-thinking" initial={still ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
          <span className="mc-line-who">{t('Thinking')}</span>
          <div className="mc-thinking-well"><p className="mc-thinking-text">{thought}</p></div>
        </motion.div>
      ) : null}
    </div>
  );
}

/** What a person tends to ask first. Each is offered once and never after it was asked. */
const OFFERS = ['What can I spend today?', 'What changed this week?', 'Where did the money go?', 'What comes back every month?', 'How does this month compare?', 'What is still to come?'];
let askSeq = 0;

type TraceStep = { step: string; label: string; detail: string | null; count: number | null; done: boolean; say?: { key: string; vars?: Record<string, string | number> } | null };

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
/* The step's name comes off the wire in English, one per step id, so the panel is named
   here and read in the person's own language. A detail that carries a number still comes
   through as the server wrote it. */
const STEP_LABEL: Record<string, string> = {
  bank: 'Reading the bank', ledger: 'Reading the payments', places: 'Working out the places',
  learn: 'Learning the rhythms', patterns: 'Reading what it means', gaps: 'Finding what it cannot explain',
  end: 'Done',
};

function TracePanel({ steps, reading }: { steps: TraceStep[]; reading: boolean }) {
  const t = useT();
  /* Six rows of zeros ending in Done is what a new account saw here: machinery with
     nothing in it. Until something has been read, the panel is one quiet line. */
  const idle = steps.length > 0 && steps.every((s) => !s.count);
  return (
    <aside className="mc-trace" aria-label={t('What it is doing')}>
      {/* One orb for the whole panel, at its head. One per unfinished row meant three or four
          canvases turning at once, and on a long read they never stopped (2026-09-16). */}
      {reading && steps.length ? <p className="mc-trace-head"><LedgerOrb state="searching" size={20} label="" /><span className="mv-sub">{t('Reading the ledger.')}</span></p> : null}
      {steps.length === 0 ? (
        <p className="mv-sub">{t('Not reading the ledger right now.')}</p>
      ) : idle ? (
        <p className="mv-sub">{t('Nothing to read yet. Connect Santander under Sources.')}</p>
      ) : (
        <ul className="mv-list mc-steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.step} className={`mv-item mv-item--tight mc-step${reading && !s.done ? ' is-live' : ''}`}>
              <span className="mv-item-text">
                <span className="mv-item-title">{t(STEP_LABEL[s.step] || s.label)}</span>
                {s.say?.key ? <span className="mv-item-sub">{t(s.say.key, s.say.vars)}</span> : s.detail ? <span className="mv-item-sub">{t(s.detail)}</span> : null}
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
  const { user } = useAuth();
  return <MoneyConversation key={user?.id || 'signed-out'} />;
}

function MoneyConversation() {
  const locale = useLocale();
    const t = useT();
useDocumentTitle(t('Ask'));
  const [openQuestions, setOpenQuestions] = useState(0);
  const [lines, setLines] = useState<AskLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const location = useLocation();
  const [text, setText] = useState(() => typeof location.state?.draft === 'string' ? location.state.draft.slice(0, 2000) : '');
  const [historyFailed, setHistoryFailed] = useState(false);
  const acting = useRef(new Set<string>());

  const stop = useRef<(() => void) | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pictures = useRef<string[]>([]);
  const lineCount = useRef(0);
  const pageHeight = useRef(0);
  const trace = useLedgerTrace();
  const stillMotion = useReducedMotion();

  /* The conversation is kept on the server: open where it stood, offers not repeated since
     the ledger may have moved on. */
  useEffect(() => {
    let live = true;
    moneyChat.history()
      .then((turns) => {
        if (!live || !turns.length) return;
        const kept: AskLine[] = turns.map((t) => ({
          id: `kept-${t.id}`, who: t.role === 'twin' ? 'twin' : 'you', text: t.text,
          figures: t.figures || undefined, receipts: t.receipts || undefined, thinking: t.thinking || undefined, basis: t.basis || undefined,
        }));
        /* Whatever was typed while this loaded stays: the kept turns go in front of it. */
        setLines((all) => (all.length ? [...kept, ...all] : kept));
      })
      .catch(() => { if (live) setHistoryFailed(true); });
    return () => { live = false; };
  }, []);

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
     nobody is looking at. The pictures of what was sent are let go with the page. */
  useEffect(() => () => {
    stop.current?.();
    pictures.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /* An auto-growing composer: no scrollbar until it has earned one. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [text]);

  const asked = useMemo(() => new Set(lines.filter((l) => l.who === 'you').map((l) => l.text.trim().toLowerCase())), [lines]);
  /* Three offers before the first question, two after, so they read as prompts, not a menu. */
  /* The offer is sent in the person's language, so the transcript holds the translated words
     and the English source never matched: in Spanish and Portuguese the same suggestion came
     back after it had been asked (2026-09-16). */
  const offers = useMemo(
    () => OFFERS.filter((q) => !asked.has(q.toLowerCase()) && !asked.has(t(q).toLowerCase())).slice(0, asked.size === 0 ? 3 : 2),
    [asked, t],
  );
  const last = lines[lines.length - 1];
  const offersShown = offers.length > 0 && !asking && (!last || (last.who === 'twin' && !last.pending));

  /* The newest line should sit where the eye already is: the page follows the end of the
     transcript while an answer is being written, but not if the person has scrolled up
     to read something older. A new line always brings the end into view. */
  useEffect(() => {
    if (!lines.length) return;
    const doc = document.documentElement;
    /* Judged against the page as it was before this render: the receipts under an answer
       arrive in one piece and would otherwise put the end out of reach of the test. */
    const nearEnd = window.innerHeight + window.scrollY >= (pageHeight.current || doc.scrollHeight) - 240;
    const added = lines.length !== lineCount.current;
    lineCount.current = lines.length;
    pageHeight.current = doc.scrollHeight;
    if (!added && !nearEnd) return;
    const last = lines[lines.length - 1];
    const streaming = Boolean(last && (last.pending || last.writing));
    window.scrollTo({ top: doc.scrollHeight, behavior: stillMotion || streaming ? 'auto' : 'smooth' });
  }, [lines, offersShown, stillMotion]);

  function ask(value: string) {
    const said = value.trim();
    if (asking || !said) return;
    const history: ChatTurn[] = lines.filter((l) => !l.pending).map((l) => ({ role: l.who === 'you' ? 'user' : 'twin', text: l.text }));
    askSeq += 1;
    const twinId = `twin-${askSeq}`;
    setLines((all) => [...all, { id: `you-${askSeq}`, who: 'you', text: said }, { id: twinId, who: 'twin', text: 'Reading the ledger', pending: true }]);
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
          amend((l) => ({ ...l, pending: false, writing: true, text: first ? e.delta : l.text + e.delta }));
        } else if (e.phase === 'thinking') {
          amend((l) => ({ ...l, thinking: (l.thinking || '') + e.delta }));
        } else if (e.phase === 'figures') {
          amend((l) => ({ ...l, figures: e.figures || [] }));
        } else if (e.phase === 'actions') {
          amend((l) => ({ ...l, receipts: e.receipts || [], actions: e.actions || [], basis: e.basis || [] }));
        } else if (e.phase === 'failed') {
          amend((l) => ({ ...l, pending: false, text: wrote ? l.text : '', error: e.detail ? t(e.detail) : t('That could not be read right now.') }));
          wrote = true;
        }
      },
      onEnd: (ok) => {
        stop.current = null;
        if (!ok) amend((l) => ({ ...l, pending: false, text: wrote ? l.text : '', error: l.error || t('The answer was interrupted. Please try again.') }));
        amend((l) => ({ ...l, writing: false }));
        setAsking(false);
      },
    });
  }

  /* A photo or a file: shown as yours at once, read by the ledger, answered in one line
     with the payment it kept. What was typed alongside goes with it as a note. */
  async function attach(file: File) {
    if (asking || !file) return;
    const note = text.trim();
    askSeq += 1;
    const twinId = `twin-${askSeq}`;
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    if (url) pictures.current.push(url);
    setLines((all) => [
      ...all,
      { id: `you-${askSeq}`, who: 'you', text: note ? `${t('Sent {name}', { name: file.name })}. ${note}` : t('Sent {name}', { name: file.name }), file: { name: file.name, url } },
      { id: twinId, who: 'twin', text: 'Reading the file', pending: true },
    ]);
    setAsking(true);
    setText('');
    const amend = (patch: (l: AskLine) => AskLine) => setLines((all) => all.map((l) => (l.id === twinId ? patch(l) : l)));
    try {
      const blob = await shrink(file);
      if (blob.size > MAX_UPLOAD) {
        amend((l) => ({ ...l, pending: false, text: t('That file is over 4 MB. A photo of it would come through.') }));
        return;
      }
      const name = blob === file ? file.name : `${file.name.replace(/\.[a-z0-9]+$/i, '')}.jpg`;
      const r = await moneyChat.attach(blob, note, name);
      amend((l) => ({ ...l, pending: false, text: r.said, receipts: r.receipts }));
    } catch (e) {
      /* The server's own words are English, whoever is reading. */
      amend((l) => ({ ...l, pending: false, text: t('That file could not be read right now.') }));
    } finally {
      setAsking(false);
    }
  }

  /* An offer tapped: the ledger checks it again and says what it did; the offers go, the
     sentence stays under the answer. */
  async function take(lineId: string, action: ChatAction) {
    if (acting.current.has(lineId)) return;
    acting.current.add(lineId);
    /* The offers go the moment one is tapped, so a second tap cannot run it twice. */
    setLines((all) => all.map((l) => (l.id === lineId ? { ...l, actions: [], acted: t('Doing it.') } : l)));
    try {
      const r = await moneyChat.act(action);
      setLines((all) => all.map((l) => (l.id === lineId ? { ...l, actions: [], acted: r.said } : l)));
    } catch (e) {
      setLines((all) => all.map((l) => (l.id === lineId ? { ...l, actions: [action], acted: t('That could not be done.') } : l)));
    } finally { acting.current.delete(lineId); }
  }
  const toggleHow = (lineId: string) => setLines((all) => all.map((l) => (l.id === lineId ? { ...l, howOpen: !l.howOpen } : l)));

  const rise = stillMotion
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: [0.2, 0.7, 0.3, 1] as const } };

  return (
    <main className="mv mc">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <div className="mc-columns">
            <section
              className="mc-thread"
              onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
              onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); void attach(f); } }}
            >
              <div className={`mc-scroll${lines.length ? '' : ' is-empty'}`}>
                <div className="mc-turn">
                  <h1>{t('Ask.')}</h1>
                  <p className="mv-sub">{t('Any month, any shop, anything that leaves your account. Answers come from your own payments, with the payments underneath.')}</p>
                  {openQuestions > 0 ? (
                    <div className="mc-actions">
                      <Link to="/money/setup" className="mv-pill mv-pill--ghost">
                        <span>{openQuestions === 1 ? t('one thing it cannot work out on its own') : t('{n} things it cannot work out on its own', { n: openQuestions })}</span>
                      </Link>
                    </div>
                  ) : null}
                </div>

                {historyFailed ? <p role="alert" className="mv-note">{t('Your earlier conversation could not be loaded. Refresh to try again.')}</p> : null}
                {lines.map((l) => (
                  <motion.div key={l.id} className={`mc-line ${l.who === 'you' ? 'mc-line--you' : ''}`} {...rise}>
                    <span className="mc-line-who">{l.who === 'you' ? t('You') : t('The ledger')}</span>
                    {l.pending ? (
                      <Pending status={l.text} thinking={l.thinking} still={Boolean(stillMotion)} />
                    ) : (
                      <p className="mc-line-text">{l.text}{l.writing ? <LedgerOrb state="composing" size={16} className="mc-writing" label={t('Writing')} /> : null}</p>
                    )}
                    {l.error ? <p role="alert" className="mv-note">{l.error}</p> : null}
                    {l.file?.url ? <img className="mc-file" src={l.file.url} alt="" /> : null}
                    {l.figures?.map((f, k) => <Figure key={k} figure={f} />)}
                    {l.who === 'twin' && l.actions && l.actions.length ? (
                      <div className="mc-acts" role="group" aria-label={t('What it can do')}>
                        {l.actions.map((a, k) => (
                          <button key={k} type="button" className="mv-pill mv-pill--ghost" onClick={() => void take(l.id, a)}><span>{a.label}</span></button>
                        ))}
                      </div>
                    ) : null}
                    {l.acted ? <p className="mc-acted">{l.acted}</p> : null}
                    {l.who === 'twin' && !l.pending && ((l.thinking && l.thinking.trim()) || (l.basis && l.basis.length)) ? (
                      <div className="mc-how">
                        <button type="button" className="mc-how-toggle" aria-expanded={Boolean(l.howOpen)} onClick={() => toggleHow(l.id)}>{t('How it got there')}</button>
                        {l.howOpen ? (
                          <div className="mc-how-body">
                            {l.thinking && l.thinking.trim() ? <p className="mc-how-thought">{l.thinking.trim()}</p> : null}
                            {l.basis && l.basis.length ? (
                              <ul className="mc-how-basis">
                                {l.basis.map((b, k) => <li key={k}>{b}</li>)}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {l.receipts && l.receipts.length ? (
                      <div className="mc-receipts">
                        <span className="mv-quiet">{l.receipts.length === 1 ? t('Read from one payment') : t('Read from {n} payments', { n: l.receipts.length })}</span>
                        <ul className="mv-list">
                          {l.receipts.slice(0, 8).map((r) => (
                            <li key={r.id} className="mv-item mv-item--tight">
                              <span className="mv-item-text">
                                <span className="mv-item-title">{r.merchant}</span>
                                <span className="mv-item-sub">{shortDay(r.occurred_at, locale)}</span>
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
                  <div className="mc-offers" role="group" aria-label={t('Things to ask')}>
                    {offers.map((q) => (
                      <button key={q} type="button" className="mv-pill mv-pill--ghost" onClick={() => ask(t(q))}><span>{t(q)}</span></button>
                    ))}
                  </div>
                ) : null}

                <div className="mc-end" />
              </div>

              <div className="mc-composer">
                <form className="mc-composer-inner" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    className="mv-sr"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void attach(f); }}
                  />
                  <button type="button" className="mc-attach" aria-label={t('Add a photo or a file')} disabled={asking} onClick={() => fileRef.current?.click()}>
                    <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <label className="mv-sr" htmlFor="mc-say">{t('Ask about your money')}</label>
                  <textarea
                    id="mc-say"
                    ref={boxRef}
                    className="mc-say"
                    rows={1}
                    maxLength={2000}
                    value={text}
                    placeholder={t('Ask about your money')}
                    disabled={asking}
                    onChange={(e) => setText(e.target.value)}
                    onPaste={(e) => { const f = e.clipboardData.files?.[0]; if (f) { e.preventDefault(); void attach(f); } }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); }
                    }}
                  />
                  <button type="submit" className="mv-pill mc-send" disabled={asking || !text.trim()} aria-label={t('Ask')}>
                    <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </section>

            {/* The ledger's own progress is for the curious, not the default: one link opens it. */}
            <aside className="mc-side">
              <button type="button" className="mc-trace-toggle" aria-expanded={traceOpen} onClick={() => setTraceOpen((o) => !o)}>{t('What it is doing')}</button>
              {traceOpen ? <TracePanel steps={trace.steps} reading={trace.reading} /> : null}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
