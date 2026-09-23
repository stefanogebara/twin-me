/**
 * The conversation: the kept turns, the offers, what asking, attaching and taking an offer
 * do, and where the page scrolls as an answer is written. The page draws; this decides.
 * (Split from MoneyChatPage on 2026-09-19, M2-2b.)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { moneyAPI, moneyChat, type ChatTurn, type ChatAction } from '../../../services/api/moneyAPI';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocale, useT } from '@/lib/i18n';
import { MAX_UPLOAD, OFFERS, shrink, nextAsk, type AskLine, type Offer } from './askLine';
import { useLedgerTrace } from './useLedgerTrace';

export function useConversation() {
  const locale = useLocale();
  const t = useT();
  useDocumentTitle(t('Ask'));
  const [openQuestions, setOpenQuestions] = useState(0);
  const [lines, setLines] = useState<AskLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
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
  /* Before the first question, three openers with the ledger's own figures, read once; while
     they load, or when the read fails, the fixed list stands in. After an answer, what the
     ledger computed as the next thing to ask; the fixed list again when it offered nothing. */
  const [openers, setOpeners] = useState<Offer[] | null>(null);
  useEffect(() => {
    if (lines.length !== 0 || openers !== null) return;
    let live = true;
    moneyAPI.chatOpeners().then((o) => { if (live) setOpeners(Array.isArray(o) ? o : []); }).catch(() => { if (live) setOpeners([]); });
    return () => { live = false; };
  }, [lines.length, openers]);
  const last = lines[lines.length - 1];
  const offers = useMemo<Offer[]>(() => {
    const fixed = OFFERS.map((q) => ({ ask: t(q), figure: null }));
    const fresh = !asked.size && openers && openers.length ? openers : null;
    const computed = last?.who === 'twin' && Array.isArray(last.next) && last.next.length ? last.next.map((ask) => ({ ask, figure: null })) : null;
    const pool = fresh || computed || fixed;
    return pool.filter((o) => !asked.has(o.ask.trim().toLowerCase())).slice(0, asked.size === 0 ? 3 : 2);
  }, [asked, t, openers, last]);
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
    const seq = nextAsk();
    const twinId = `twin-${seq}`;
    setLines((all) => [...all, { id: `you-${seq}`, who: 'you', text: said }, { id: twinId, who: 'twin', text: 'Reading the ledger', pending: true }]);
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
          amend((l) => ({ ...l, receipts: e.receipts || [], actions: e.actions || [], basis: e.basis || [], next: Array.isArray(e.next) ? e.next : undefined }));
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
    const seq = nextAsk();
    const twinId = `twin-${seq}`;
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    if (url) pictures.current.push(url);
    setLines((all) => [
      ...all,
      { id: `you-${seq}`, who: 'you', text: note ? `${t('Sent {name}', { name: file.name })}. ${note}` : t('Sent {name}', { name: file.name }), file: { name: file.name, url } },
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
    /* A setup offer is a step on another page, not something the ledger does. */
    if (action.kind === 'setup' && typeof action.href === 'string' && action.href.startsWith('/money/')) { navigate(action.href); return; }
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

  return { openQuestions, lines, traceOpen, setTraceOpen, asking, text, setText, historyFailed, locale, t, boxRef, fileRef, trace, stillMotion, offers, offersShown, toggleHow, ask, attach, take, rise };
}
export type Conversation = ReturnType<typeof useConversation>;
