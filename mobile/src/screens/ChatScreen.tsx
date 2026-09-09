/**
 * The conversation with the ledger.
 * =================================
 * One transcript, two uses. In `onboarding` mode the ledger asks what it cannot read for
 * itself (where you live, what leaves every month, what comes in), one question at a time,
 * then reads your bank in front of you, step by step, and hands over. In `ask` mode you ask
 * it anything about your money and it answers in words, with the payments it read and, when
 * a picture says it better, a figure drawn in the same ink.
 *
 * No speech bubbles. The ledger speaks in ink, you speak in the quieter tone, and a small
 * label says who is talking only when that changes. Every number on this screen was worked
 * out by the server; the screen arranges them.
 *
 * Spec: .claude/plans/2026-09-07-money-twin/README.md, section 16.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cosmos, dayMonth, euro } from '../constants/cosmos';
import { Body, Card, Enter, Hairline, Heading, Micro, Page, Pill, Press, Row, Small, Title } from '../ui/primitives';
import { Figure, HomeMap } from '../ui/figures';
import { Prompt, Shimmer } from '../ui/prompt';
import { useReducedMotion } from '../ui/motion';
import {
  moneyApi, readLedgerStream,
  type ChatAction, type ChatReceipt, type ChatTurn, type HomePlace, type HomeSaved, type LedgerStreamEvent, type MoneyQuestion,
} from '../services/moneyApi';
import {
  lineId, readLines, recallLikely, rememberLikely, setLines as storeLines, useTranscript,
  type HomeSpot, type Line, type TraceStep,
} from './chatStore';
import { PACE, beatFor, beatText, chapterFor, pause } from './pace';

/* ----------------------------------------------------------------------------------------
 * Answers. The same parsing the web and the old questions screen used, kept verbatim so a
 * comma decimal, a day of the month and a share of one all mean what they meant.
 * -------------------------------------------------------------------------------------- */

/** The words a kind of place can be given, matching what the categoriser itself uses. */
const CATEGORIES = [
  'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy',
  'sport', 'education', 'clothing', 'home', 'electronics', 'entertainment', 'software',
  'advertising', 'travel', 'lodging', 'cash', 'fees', 'transfers', 'bills', 'other',
];

const PLACEHOLDER: Record<string, string> = {
  name: 'Rent', source: 'Family', what: 'The weekly shop', amount: '500', day: '1', share: '50',
};

type ListRow = { key: string; label: string; amount: string; day: string; share: string };

let rowSeq = 0;
function blankRow(): ListRow { rowSeq += 1; return { key: `r${rowSeq}`, label: '', amount: '', day: '', share: '50' }; }

function slug(s: string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'; }
function listColumns(input: string) { return input.slice('list:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
function choiceOptions(input: string) { return input.slice('choice:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
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
function ordinal(n: number): string {
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}
function rowSummary(row: ListRow, columns: string[]): string {
  const bits: string[] = [row.label.trim()];
  if (columns.includes('amount')) { const a = parseAmount(row.amount); if (a !== undefined) bits.push(euro(a)); }
  if (columns.includes('day')) { const d = parseDay(row.day); if (d !== undefined) bits.push(`on the ${ordinal(d)}`); }
  if (columns.includes('share')) { const s = parseShare(row.share); if (s !== undefined) bits.push(`${Math.round(s * 100)}% yours`); }
  return bits.join(', ');
}

/* ----------------------------------------------------------------------------------------
 * The transcript's grammar lives in chatStore.ts, so the page can close and reopen without
 * forgetting. What follows is how a question becomes a line.
 * -------------------------------------------------------------------------------------- */

/** What the twin says when it asks a question: a chapter word, the question as a heading,
 *  why it matters as the sentence, and the quieter help and consequence under it. */
function questionLine(q: MoneyQuestion): Omit<Line, 'id'> {
  return {
    who: 'twin', chapter: chapterFor(q.kind), heading: q.ask, text: q.why,
    small: [q.help || '', `This changes ${q.changes}.`].filter(Boolean),
    question: q,
  };
}

/** The rent question is not asked: what leaves every month is read from the ledger and
 *  confirmed later, when the ledger has a receipt to show. */
function askable(q: MoneyQuestion): boolean { return q.kind !== 'commitment'; }

/** How the home question is being answered right now. */
type HomeStage =
  | { stage: 'off' }
  | { stage: 'guess' }
  | { stage: 'search'; results: HomePlace[]; searching: boolean }
  | { stage: 'picked'; spot: HomeSaved };

/* ----------------------------------------------------------------------------------------
 * Small parts.
 * -------------------------------------------------------------------------------------- */

function Field({ label, value, placeholder, onChange, numeric, decimal, flex }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void;
  numeric?: boolean; decimal?: boolean; flex?: number;
}) {
  return (
    <View style={[s.field, flex !== undefined && { flex }]}>
      <Micro>{label}</Micro>
      <TextInput
        style={s.input}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={cosmos.color.ink3}
        onChangeText={onChange}
        autoCorrect={false}
        autoCapitalize={numeric || decimal ? 'none' : 'sentences'}
        inputMode={decimal ? 'decimal' : numeric ? 'numeric' : 'text'}
        accessibilityLabel={label}
      />
    </View>
  );
}

function QuietAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityLabel={label} style={s.quiet}>
      <Small quiet>{label}</Small>
    </Press>
  );
}

/** The pipeline, read as it runs: a step, what it found, and a word for the one still going. */
function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <View style={s.trace} accessibilityLabel="What the ledger is doing">
      {steps.map((st, i) => (
        <Enter key={st.step} index={i} style={s.traceStep}>
          <View style={s.traceHead}>
            {st.state === 'working' ? <Shimmer text={st.label} style={s.traceLive} /> : <Micro>{st.label}</Micro>}
            <Micro>{st.state === 'working' ? 'working' : st.state === 'failed' ? 'could not' : st.count !== null && st.count !== undefined ? String(st.count) : 'done'}</Micro>
          </View>
          {st.detail ? <Small quiet numberOfLines={2}>{st.detail}</Small> : null}
        </Enter>
      ))}
    </View>
  );
}

/** The payments an answer rests on. Never more than eight; the ledger has the rest. */
function Receipts({ receipts }: { receipts: ChatReceipt[] }) {
  const shown = receipts.slice(0, 8);
  return (
    <View style={s.receipts}>
      <Micro>{`Read from ${receipts.length} ${receipts.length === 1 ? 'payment' : 'payments'}`}</Micro>
      <Hairline />
      {shown.map((r, i) => (
        <Enter key={r.id} index={i}>
          <Row lead={dayMonth(r.occurred_at)} label={r.merchant || 'Unnamed'} trail={euro(r.amount)} />
          <Hairline />
        </Enter>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * The screen.
 * -------------------------------------------------------------------------------------- */

export default function ChatScreen({ mode, onDone, onClose }: { mode: 'onboarding' | 'ask'; onDone?: () => void; onClose?: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView | null>(null);

  /* The transcript is kept outside the screen (chatStore), so closing the page and coming
     back finds the conversation where it was, and the greeting is said once. */
  const lines = useTranscript(mode);
  const setLines = useCallback((next: Line[] | ((all: Line[]) => Line[])) => storeLines(mode, next), [mode]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [queue, setQueue] = useState<MoneyQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'asking' | 'reading' | 'done' | 'failed'>('loading');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [home, setHome] = useState<HomeStage>({ stage: 'off' });
  const queueRef = useRef<MoneyQuestion[]>([]);
  const indexRef = useRef(0);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const say = useCallback((line: Omit<Line, 'id'>) => {
    const id = lineId();
    setLines((all) => [...all, { ...line, id }]);
    return id;
  }, [setLines]);
  const amend = useCallback((id: string, patch: Partial<Line>) => {
    setLines((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, [setLines]);

  /* The ledger never speaks at once. A thinking line shimmers for as long as the sentence
     deserves, then becomes the sentence. The person's own words use `say` and never wait. */
  const speak = useCallback(async (line: Omit<Line, 'id'>, thinking = 'Reading.') => {
    const ms = beatFor(line.heading || line.text, reducedRef.current);
    if (ms === 0) { say(line); return; }
    const id = say({ who: 'twin', text: thinking, pending: true });
    await pause(ms, reducedRef.current);
    amend(id, { ...line, pending: false });
  }, [say, amend]);

  /* Learning with the person: after something they said or did, the month is read again, and
     if the likely total moved by more than a euro the transcript says so in one quiet line. */
  const noteForecastMove = useCallback(async () => {
    try {
      const f = await moneyApi.forecast();
      const before = recallLikely();
      rememberLikely(f.projected_p50);
      if (before === null || !Number.isFinite(before)) return;
      const diff = f.projected_p50 - before;
      if (Math.abs(diff) <= 1) return;
      say({ who: 'twin', quiet: true, text: `The month now reads ${euro(Math.abs(diff))} ${diff < 0 ? 'lower' : 'higher'}.` });
    } catch { /* the month page still has the number */ }
  }, [say]);

  /* Suggestions: questions the ledger can answer for this person, worked out from what the
     app already has. Nothing is offered that the data cannot back. */
  useEffect(() => {
    if (mode !== 'ask') return;
    let live = true;
    (async () => {
      const [rec, months, cats, fc, ledger] = await Promise.allSettled([
        moneyApi.recurring(), moneyApi.months(), moneyApi.categories(), moneyApi.forecast(), moneyApi.ledger(),
      ]);
      if (!live) return;
      const out: string[] = [];
      if (fc.status === 'fulfilled') rememberLikely(fc.value.projected_p50);
      if (rec.status === 'fulfilled' && rec.value.length > 0) out.push('What comes back every month?');
      if (months.status === 'fulfilled' && months.value.length >= 2) out.push('How does this month compare?');
      if (cats.status === 'fulfilled' && cats.value.groups.length > 0) out.push('Where did the money go?');
      if (fc.status === 'fulfilled' && ((fc.value.committed_items?.length ?? 0) + (fc.value.commitment_items?.length ?? 0) + (fc.value.calendar_items?.length ?? 0)) > 0) out.push('What is still to come?');
      if (ledger.status === 'fulfilled') {
        const month = new Date().toISOString().slice(0, 7);
        const seenBefore = new Set(ledger.value.filter((r) => !r.occurred_at.startsWith(month)).map((r) => r.merchant_key));
        const fresh = ledger.value
          .filter((r) => r.occurred_at.startsWith(month) && !seenBefore.has(r.merchant_key) && Number(r.amount) < 0)
          .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
        const first = fresh[0];
        const name = first ? (first.merchant_name || first.merchant_raw || '').trim() : '';
        if (name) out.push(`What was ${name}?`);
      }
      setSuggestions(out);
    })();
    return () => { live = false; };
  }, [mode]);

  /* Opening. Onboarding asks what only the person knows; ask mode opens the floor, once. */
  useEffect(() => {
    let live = true;
    if (mode === 'ask') {
      if (readLines('ask').length === 0) {
        say({ who: 'twin', text: 'Ask about any month, any shop, anything that leaves your account. Answers come from your own payments, with the payments underneath.' });
      }
      setPhase('asking');
      return () => { live = false; };
    }
    storeLines('onboarding', []);
    moneyApi.forecast().then((f) => rememberLikely(f.projected_p50)).catch(() => {});
    (async () => {
      try {
        const q = await moneyApi.questions();
        if (!live) return;
        const opening = q.opening.filter(askable);
        setQueue(opening); queueRef.current = opening; indexRef.current = 0; setIndex(0);
        await pause(PACE.first, reducedRef.current);
        if (!live) return;
        if (opening.length === 0) {
          await speak({ who: 'twin', text: 'Nothing it cannot explain on its own. It will read your bank now.' });
          if (live) setPhase('reading');
          return;
        }
        await speak({ who: 'twin', text: `Before the first reading, ${opening.length} ${opening.length === 1 ? 'thing' : 'things'} only you know. Each one changes what the numbers mean.` });
        if (!live) return;
        await pause(PACE.next, reducedRef.current);
        if (!live) return;
        await present(opening[0]);
        if (live) setPhase('asking');
      } catch {
        if (!live) return;
        await speak({ who: 'twin', text: 'The questions did not load. Nothing was lost; come back to this in a moment.' });
        if (live) setPhase('failed');
      }
    })();
    return () => { live = false; };
    // present is stable for the life of the screen; listing it would restart the opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, say, speak]);

  const question = mode === 'onboarding' && phase === 'asking' ? queue[index] || null : null;

  /* Every question starts from an empty answer, and a list question with one row already
     open so there is nothing to press before you can type. */
  useEffect(() => {
    setNote(null);
    setText('');
    setRows(question && question.input.startsWith('list:') ? [blankRow()] : []);
  }, [question]);

  /* The reading. When the opening questions are done the ledger reads the bank in front of
     the person, one step at a time, and hands over when it is finished. */
  useEffect(() => {
    if (phase !== 'reading') return;
    const traceId = lineId();
    setLines((all) => [...all, { id: traceId, who: 'twin', text: 'Reading your bank.', trace: [] }]);
    const stop = readLedgerStream(
      (e: LedgerStreamEvent) => {
        if (e.step === 'end') return;
        setLines((all) => all.map((l) => {
          if (l.id !== traceId) return l;
          const trace = l.trace ? [...l.trace] : [];
          const at = trace.findIndex((t) => t.step === e.step);
          const next: TraceStep = { step: e.step, label: e.label, state: e.state, detail: e.detail ?? null, count: e.count ?? null };
          if (at >= 0) trace[at] = next; else trace.push(next);
          return { ...l, trace };
        }));
      },
      (ok) => {
        say({
          who: 'twin',
          text: ok
            ? 'That is the first reading. From here the month page says what the money is doing, and you can ask it anything.'
            : 'The reading could not finish this time. The month page has everything read so far.',
        });
        setPhase('done');
      },
    );
    return stop;
  }, [phase, say]);

  /* The transcript grows from the bottom: whatever is newest sits where the eye is. */
  const toEnd = useCallback(() => { scroller.current?.scrollToEnd({ animated: !reduced }); }, [reduced]);

  const columns = useMemo(() => (question && question.input.startsWith('list:') ? listColumns(question.input) : []), [question]);
  const options = useMemo(() => (question && question.input.startsWith('choice:') ? choiceOptions(question.input) : []), [question]);
  const isList = Boolean(question?.input.startsWith('list:'));
  const isCards = Boolean(question) && (question!.input === 'category' || question!.input.startsWith('choice:'));
  const filledRows = rows.filter((r) => r.label.trim());

  /* Putting a question. The home question is not asked in words when the ledger can point
     at a map instead: it looks at where the person shops, shows the neighbourhood, and asks
     only whether that is right. Everything else arrives as a chapter, a heading and a why. */
  async function present(q: MoneyQuestion) {
    setHome({ stage: 'off' });
    if (q.kind === 'home_area') {
      try {
        const h = await moneyApi.home();
        const spot = h.guess;
        if (spot) {
          await speak({
            who: 'twin', chapter: chapterFor(q.kind), heading: q.ask,
            text: `From where you shop, home looks like ${spot.district}.`,
            small: [q.help || '', `This changes ${q.changes}.`].filter(Boolean),
            question: q,
            home: { lat: spot.lat, lng: spot.lng, district: spot.district, city: spot.city, basis: spot.basis, open: true },
          }, beatText(q.kind));
          setHome({ stage: 'guess' });
          return;
        }
        await speak({ ...questionLine(q), text: 'Search for the district or town, and it will show you the map.' }, beatText(q.kind));
        setHome({ stage: 'search', results: [], searching: false });
        return;
      } catch {
        /* No map service reachable: the question is asked in words, as before. */
      }
    }
    await speak(questionLine(q), beatText(q.kind));
  }

  /* After an answer: the person's words at once, then a beat, what was said back, a beat,
     and the next question, or the reading when the questions are done. */
  async function advance(summary: string, saidBack?: string | null) {
    say({ who: 'you', text: summary });
    setLines((all) => all.map((l) => (l.home?.open ? { ...l, home: { ...l.home, open: false } } : l)));
    setHome({ stage: 'off' });
    if (saidBack) {
      await pause(PACE.saidBack, reducedRef.current);
      await speak({ who: 'twin', text: saidBack });
    }
    const nextIndex = indexRef.current + 1;
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    const next = queueRef.current[nextIndex];
    if (next) {
      await pause(PACE.next, reducedRef.current);
      await present(next);
    } else {
      await pause(PACE.next, reducedRef.current);
      setPhase('reading');
    }
  }

  /** Whatever the answer route hands back that reads as a sentence, or nothing. */
  function saidFrom(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    for (const key of ['said', 'check_note', 'note']) {
      if (typeof r[key] === 'string' && (r[key] as string).trim()) return r[key] as string;
    }
    return null;
  }

  async function sendValue(value: string) {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await moneyApi.answerQuestion({ questionId: question.id, kind: question.kind, value, ...(question.subject ? { subject: question.subject } : {}) });
      await advance(value, saidFrom(r));
      void noteForecastMove();
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
    try {
      let last: unknown = null;
      for (const row of filledRows) {
        const label = row.label.trim();
        const amount = columns.includes('amount') ? parseAmount(row.amount) : undefined;
        const day = columns.includes('day') ? parseDay(row.day) : undefined;
        const share = columns.includes('share') ? parseShare(row.share) : undefined;
        last = await moneyApi.answerQuestion({
          questionId: question.id, kind: question.kind, subject: slug(label), subjectLabel: label,
          ...(amount === undefined ? {} : { amount }), ...(day === undefined ? {} : { day }), ...(share === undefined ? {} : { share }),
        });
      }
      await advance(filledRows.map((r) => rowSummary(r, columns)).join(' / '), saidFrom(last));
      void noteForecastMove();
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
    try { await moneyApi.skipQuestion(question.id); await advance('Skipped this one.'); }
    catch { setNote('That did not go through. Try it again.'); }
    finally { setBusy(false); }
  }

  /* Ask mode: a question in words, answered from the ledger. */
  const history = useMemo<ChatTurn[]>(
    () => lines.filter((l) => !l.pending && !l.trace && !l.question && !l.quiet).map((l) => ({ role: l.who === 'you' ? 'user' : 'twin', text: l.text })),
    [lines],
  );

  /* Development only: the simulator has no keyboard of its own, so the shell can hand this
     screen a line to send (twinme://dev/say?t=...). Compiled out of release builds. */
  const askRef = useRef<(m: string) => void>(() => {});
  useEffect(() => {
    if (!__DEV__) return;
    const sub = DeviceEventEmitter.addListener('dev:say', (text: string) => { askRef.current(text); });
    const press = DeviceEventEmitter.addListener('dev:press', (label: string) => { pressRef.current(label); });
    const trace = DeviceEventEmitter.addListener('dev:trace', () => { setPhase('reading'); });
    return () => { sub.remove(); press.remove(); trace.remove(); };
  }, []);

  askRef.current = (m: string) => { if (mode === 'ask') void ask(m); else if (homeSearching) searchHome(m); else void sendValue(m); };
  /* Development only: press a card by its label, or Enter for the composer. */
  const pressRef = useRef<(label: string) => void>(() => {});
  pressRef.current = (label: string) => {
    if (label === 'Enter') { submitComposer(); return; }
    const open = [...lines].reverse().find((l) => l.home?.open);
    if (label === 'Yes, that is home' && open?.home) { void confirmHome({ district: open.home.district, city: open.home.city ?? null, lat: open.home.lat, lng: open.home.lng }); return; }
    if (label === 'Somewhere else') { searchHomeInstead(); return; }
    void sendValue(label);
  };

  async function ask(message: string) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    say({ who: 'you', text: message });
    const pendingId = say({ who: 'twin', text: 'Reading the ledger.', pending: true });
    try {
      const reply = await moneyApi.chat(message, history);
      const text = reply.text || 'Nothing it can say about that yet.';
      /* An answer that opens with an amount gets that amount set large above the sentence. */
      const lead = text.match(/^(\d[\d.,]*)\s?(?:EUR|\u20ac)/);
      amend(pendingId, {
        pending: false, text, lead: lead ? `${lead[1]} \u20ac` : undefined,
        figures: reply.figures || [], actions: reply.actions || [], receipts: reply.receipts || [],
      });
    } catch {
      amend(pendingId, { pending: false, text: 'That could not be read right now. Ask again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  async function act(lineIdOf: string, index: number, action: ChatAction) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await moneyApi.chatAct(action);
      /* The card turns into what happened, in its own place, so nothing jumps. */
      setLines((all) => all.map((l) => (l.id === lineIdOf ? { ...l, acted: { ...(l.acted || {}), [index]: r.said || 'Done.' } } : l)));
      void noteForecastMove();
    } catch {
      setNote('That could not be done right now.');
    } finally {
      setBusy(false);
    }
  }

  /* Home on the map: yes saves the spot; somewhere else opens the search; a picked result is
     shown on its own map and waits for its yes. */
  async function confirmHome(spot: HomeSaved) {
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await moneyApi.saveHome(spot);
      await advance(spot.district, saidFrom(r) || `Home is ${spot.district}. Shops near it now count as near home.`);
      void noteForecastMove();
    } catch (e) {
      setNote((e as Error).message || 'That did not save. Try it again.');
    } finally {
      setBusy(false);
    }
  }

  function searchHomeInstead() {
    setLines((all) => all.map((l) => (l.home?.open ? { ...l, home: { ...l.home, open: false } } : l)));
    setHome({ stage: 'search', results: [], searching: false });
    setText('');
  }

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  function searchHome(q: string) {
    setText(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = q.trim();
    if (term.length < 3) { setHome((h) => (h.stage === 'search' ? { ...h, results: [], searching: false } : h)); return; }
    setHome((h) => (h.stage === 'search' ? { ...h, searching: true } : h));
    searchTimer.current = setTimeout(async () => {
      try {
        const { results } = await moneyApi.homeSearch(term);
        setHome((h) => (h.stage === 'search' ? { stage: 'search', results: results.slice(0, 6), searching: false } : h));
      } catch {
        setHome((h) => (h.stage === 'search' ? { ...h, results: [], searching: false } : h));
      }
    }, 300);
  }

  async function pickHome(place: HomePlace) {
    const spot: HomeSaved = { district: place.label, city: place.secondary || null, lat: place.lat, lng: place.lng };
    setHome({ stage: 'picked', spot });
    setText('');
    await speak({ who: 'twin', text: 'Is this it?', home: { ...spot, open: true } }, 'Finding it on the map.');
  }

  const homeSearching = mode === 'onboarding' && question?.kind === 'home_area' && home.stage === 'search';

  function submitComposer() {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    if (mode === 'ask') { void ask(value); return; }
    if (homeSearching) { if (home.stage === 'search' && home.results[0]) void pickHome(home.results[0]); return; }
    if (question && !isList) void sendValue(value);
  }

  function setRow(key: string, patch: Partial<ListRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const composerShown = mode === 'ask' || (question !== null && !isList && home.stage !== 'guess' && home.stage !== 'picked');
  /* Offers to ask show when the floor is open: nothing pending, and the ledger spoke last. */
  const lastLine = lines[lines.length - 1];
  /* A question already asked in this transcript is not offered again, and once the
     conversation has started the offers thin out to two, so they read as prompts, not a menu. */
  const asked = useMemo(() => new Set(lines.filter((l) => l.who === 'you').map((l) => l.text.trim().toLowerCase())), [lines]);
  const offers = useMemo(() => {
    const fresh = suggestions.filter((q) => !asked.has(q.trim().toLowerCase()));
    return fresh.slice(0, asked.size === 0 ? 3 : 2);
  }, [suggestions, asked]);
  const suggestionsShown = offers.length > 0 && !busy && (!lastLine || (lastLine.who === 'twin' && !lastLine.pending));
  const composerPlaceholder = mode === 'ask' ? 'Ask about your money' : homeSearching ? 'Search a district or town' : isCards ? 'Or type your own' : 'Your answer';

  return (
    <Page>
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {mode === 'onboarding' ? (
          <>
            <View style={[s.head, { paddingTop: insets.top + cosmos.space.md }]}>
              <Micro>{phase === 'done' ? 'Done' : phase === 'reading' ? 'Reading' : 'What only you know'}</Micro>
              {question ? <Micro>{`${index + 1} of ${queue.length}`}</Micro> : null}
            </View>
            <Hairline />
          </>
        ) : (
          <>
            <View style={[s.head, s.headAsk]}>
              <Micro>Ask</Micro>
              {onClose ? <Pill label="Close" ghost small onPress={onClose} /> : null}
            </View>
            <Hairline />
          </>
        )}

        <ScrollView
          ref={scroller}
          style={s.fill}
          contentContainerStyle={[s.transcript, { paddingBottom: (composerShown ? 0 : insets.bottom) + cosmos.space.xl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={toEnd}
        >
          {phase === 'loading' ? <Enter><Shimmer text="Reading the ledger." /></Enter> : null}

          {lines.map((l, i) => {
            const speakerChanged = i === 0 || lines[i - 1].who !== l.who;
            const isCurrentQuestion = Boolean(l.question) && question !== null && l.question!.id === question.id;
            return (
              <Enter key={l.id} settle style={[s.line, l.who === 'you' && s.lineYou]}>
                {l.chapter && !l.pending ? <Micro>{l.chapter}</Micro> : speakerChanged && !l.quiet ? <Micro>{l.who === 'you' ? 'You' : 'The ledger'}</Micro> : null}
                {l.lead ? <Title tabular>{l.lead}</Title> : null}
                {l.heading && !l.pending ? <Heading accessibilityRole="header">{l.heading}</Heading> : null}
                {l.pending ? <Shimmer text={l.text} /> : l.quiet ? <Small quiet>{l.text}</Small> : <Body muted={l.who === 'you'}>{l.text}</Body>}
                {l.small?.map((t, k) => <Small key={k} quiet>{t}</Small>)}
                {l.home && !l.pending ? <HomeMap lat={l.home.lat} lng={l.home.lng} district={l.home.district} basis={l.home.basis} /> : null}
                {l.home?.open && question?.kind === 'home_area' ? (
                  <View style={s.cards} accessibilityRole="radiogroup" accessibilityLabel="Is this home">
                    <Card label="Yes, that is home" onPress={busy ? undefined : () => void confirmHome({ district: l.home!.district, city: l.home!.city ?? null, lat: l.home!.lat, lng: l.home!.lng })} />
                    {home.stage === 'guess' ? <Card label="Somewhere else" onPress={busy ? undefined : searchHomeInstead} /> : null}
                  </View>
                ) : null}

                {l.question?.receipts && l.question.receipts.length ? (
                  <View style={s.receipts} accessibilityLabel="The payments behind this question">
                    <Hairline />
                    {l.question.receipts.map((r, k) => (
                      <Enter key={r.id} index={k}>
                        <Row lead={dayMonth(r.occurred_at)} label={r.merchant_raw || 'Unnamed'} trail={euro(r.amount)} />
                        <Hairline />
                      </Enter>
                    ))}
                  </View>
                ) : null}

                {l.figures?.map((f, k) => <Figure key={k} figure={f} />)}
                {l.receipts && l.receipts.length ? <Receipts receipts={l.receipts} /> : null}
                {l.actions && l.actions.length ? (
                  <View style={s.cards}>
                    {l.actions.map((a, k) => (
                      l.acted && l.acted[k]
                        ? <Small key={`${a.kind}-${k}`} quiet>{l.acted[k]}</Small>
                        : <Card key={`${a.kind}-${k}`} label={a.label} onPress={busy ? undefined : () => void act(l.id, k, a)} />
                    ))}
                  </View>
                ) : null}
                {l.trace ? <Trace steps={l.trace} /> : null}

                {isCurrentQuestion && question && home.stage === 'search' ? (
                  <View style={s.answer}>
                    {home.searching ? <Shimmer text="Searching." /> : null}
                    {home.results.map((r, k) => (
                      <Enter key={r.id} index={k}>
                        <Row label={r.label} sub={r.secondary || undefined} onPress={busy ? undefined : () => void pickHome(r)} />
                        <Hairline />
                      </Enter>
                    ))}
                    {question.optional ? <QuietAction label="Skip this" onPress={() => void skip()} disabled={busy} /> : null}
                  </View>
                ) : null}

                {isCurrentQuestion && question && home.stage === 'off' ? (
                  <View style={s.answer}>
                    {isCards ? (
                      <View style={s.cards} accessibilityRole="radiogroup" accessibilityLabel={question.input === 'category' ? 'Pick the kind of place' : 'Pick one'}>
                        {(question.input === 'category' ? CATEGORIES : options).map((word) => (
                          <Card key={word} label={word} onPress={busy ? undefined : () => void sendValue(word)} />
                        ))}
                      </View>
                    ) : null}

                    {isList ? (
                      <View style={s.rows}>
                        {rows.map((row) => (
                          <View key={row.key} style={s.listRow}>
                            <View style={s.fieldsLine}>
                              <Field label={columns[0] || 'name'} value={row.label} placeholder={PLACEHOLDER[columns[0]] || ''} onChange={(v) => setRow(row.key, { label: v })} flex={2} />
                              {columns.includes('amount') ? <Field label="euros" value={row.amount} placeholder={PLACEHOLDER.amount} onChange={(v) => setRow(row.key, { amount: v })} decimal flex={1} /> : null}
                              {columns.includes('day') ? <Field label="day" value={row.day} placeholder={PLACEHOLDER.day} onChange={(v) => setRow(row.key, { day: v })} numeric flex={1} /> : null}
                              {columns.includes('share') ? <Field label="your share, %" value={row.share} placeholder={PLACEHOLDER.share} onChange={(v) => setRow(row.key, { share: v })} numeric flex={1} /> : null}
                            </View>
                            {rows.length > 1 ? <QuietAction label="Remove" onPress={() => setRows((all) => all.filter((r) => r.key !== row.key))} /> : null}
                          </View>
                        ))}
                        <View style={s.actions}>
                          <Pill label="Add another" ghost small onPress={() => setRows((all) => [...all, blankRow()])} />
                          <Pill label={busy ? 'Saving' : 'That is all of them'} onPress={() => void sendRows()} disabled={busy || (filledRows.length === 0 && !question.optional)} />
                        </View>
                      </View>
                    ) : null}

                    {question.optional || isList ? <QuietAction label="Skip this" onPress={() => void skip()} disabled={busy} /> : null}
                  </View>
                ) : null}
              </Enter>
            );
          })}

          {mode === 'ask' && suggestionsShown ? (
            <Enter style={s.cards}>
              {offers.map((q) => <Card key={q} label={q} onPress={busy ? undefined : () => void ask(q)} />)}
            </Enter>
          ) : null}

          {note ? <Small>{note}</Small> : null}

          {mode === 'onboarding' && (phase === 'done' || phase === 'failed') && onDone ? (
            <Enter style={s.actions}><Pill label="See the month" onPress={onDone} /></Enter>
          ) : null}
        </ScrollView>

        {composerShown ? (
          <View style={[s.composer, { paddingBottom: insets.bottom + cosmos.space.sm }]}>
            <Prompt
              value={text}
              onChange={homeSearching ? searchHome : setText}
              onSubmit={submitComposer}
              placeholder={composerPlaceholder}
              busy={busy}
              onFocus={toEnd}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Page>
  );
}

/* ----------------------------------------------------------------------------------------
 * Styles. Tokens only.
 * -------------------------------------------------------------------------------------- */

const s = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingHorizontal: cosmos.space.lg, paddingBottom: cosmos.space.md,
  },
  headAsk: { alignItems: 'center', paddingTop: cosmos.space.md },
  /* The transcript grows upward from the composer, the way a conversation does: one line sits
     just above the field, not at the top of an empty page. */
  transcript: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.space.xl, gap: cosmos.space.lg },
  line: { gap: cosmos.space.sm },
  /* The person's own words sit a step in from the margin: the same column, a quieter place in it. */
  lineYou: { paddingLeft: cosmos.space.lg },
  answer: { gap: cosmos.space.md, paddingTop: cosmos.space.xs },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: cosmos.space.sm },
  rows: { gap: cosmos.space.md },
  listRow: { gap: cosmos.space.xs },
  fieldsLine: { flexDirection: 'row', gap: cosmos.space.sm, alignItems: 'flex-end' },
  field: { gap: cosmos.space.xs },
  input: {
    minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: cosmos.color.ruleStrong,
    borderRadius: cosmos.radius.field, backgroundColor: cosmos.color.white,
    paddingHorizontal: cosmos.space.md, paddingVertical: 12,
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.body, letterSpacing: cosmos.tracking.body,
    color: cosmos.color.ink,
  },
  say: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: cosmos.space.sm, paddingTop: cosmos.space.sm },
  quiet: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  receipts: { marginTop: cosmos.space.xs, gap: cosmos.space.xs },
  trace: { gap: cosmos.space.sm, paddingTop: cosmos.space.xs },
  traceStep: { gap: 2 },
  traceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: cosmos.space.md },
  composer: { paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.space.sm, backgroundColor: cosmos.color.canvas },
  /* The live step in the trace is read in the mono voice, lit while it works. */
  traceLive: { fontSize: cosmos.size.micro, lineHeight: 14, letterSpacing: cosmos.tracking.mono, textTransform: 'uppercase', color: cosmos.color.ink3 },
});
