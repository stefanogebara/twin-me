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
import { Body, Card, Enter, Hairline, Micro, Page, Pill, Press, Row, Small } from '../ui/primitives';
import { Figure } from '../ui/figures';
import { useReducedMotion } from '../ui/motion';
import {
  moneyApi, readLedgerStream,
  type ChatAction, type ChatReceipt, type ChatTurn, type LedgerStreamEvent, type MoneyQuestion,
} from '../services/moneyApi';
import type { ChatFigure } from '../ui/figures';

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
 * The transcript's grammar. A line is one thing one of the two said.
 * -------------------------------------------------------------------------------------- */

type TraceStep = { step: string; label: string; state: 'working' | 'done' | 'failed'; detail: string | null; count: number | null };

type Line = {
  id: string;
  who: 'twin' | 'you';
  text: string;
  /** Quieter sentences under the main one: a question's help, a consequence. */
  small?: string[];
  /** The line is waiting for the server; its text is the waiting words. */
  pending?: boolean;
  figures?: ChatFigure[];
  actions?: ChatAction[];
  receipts?: ChatReceipt[];
  trace?: TraceStep[];
  /** The question this line asks, when it asks one. Drives the cards and fields under it. */
  question?: MoneyQuestion;
};

let lineSeq = 0;
function lineId() { lineSeq += 1; return `l${lineSeq}`; }

/** What the twin says when it asks a question: the question, then why it matters. */
function questionLine(q: MoneyQuestion): Line {
  return {
    id: lineId(), who: 'twin', text: `${q.ask} ${q.why}`,
    small: [q.help || '', `This changes ${q.changes}.`].filter(Boolean),
    question: q,
  };
}

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
            <Micro>{st.label}</Micro>
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

export default function ChatScreen({ mode, onDone }: { mode: 'onboarding' | 'ask'; onDone?: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView | null>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [queue, setQueue] = useState<MoneyQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'asking' | 'reading' | 'done' | 'failed'>('loading');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const say = useCallback((line: Omit<Line, 'id'>) => {
    const id = lineId();
    setLines((all) => [...all, { ...line, id }]);
    return id;
  }, []);
  const amend = useCallback((id: string, patch: Partial<Line>) => {
    setLines((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  /* Opening. Onboarding asks what only the person knows; ask mode opens the floor. */
  useEffect(() => {
    let live = true;
    if (mode === 'ask') {
      say({ who: 'twin', text: 'Ask about any month, any shop, anything that leaves your account. Answers come from your own payments, with the payments underneath.' });
      setPhase('asking');
      return () => { live = false; };
    }
    moneyApi.questions()
      .then((q) => {
        if (!live) return;
        setQueue(q.opening);
        if (q.opening.length === 0) {
          say({ who: 'twin', text: 'Nothing it cannot explain on its own. It will read your bank now.' });
          setPhase('reading');
        } else {
          say({ who: 'twin', text: `Before the first reading, ${q.opening.length} ${q.opening.length === 1 ? 'thing' : 'things'} only you know. Each one changes what the numbers mean.` });
          setLines((all) => [...all, questionLine(q.opening[0])]);
          setPhase('asking');
        }
      })
      .catch(() => {
        if (!live) return;
        say({ who: 'twin', text: 'The questions did not load. Nothing was lost; come back to this in a moment.' });
        setPhase('failed');
      });
    return () => { live = false; };
  }, [mode, say]);

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

  /* After an answer: keep what was said, then either the next question or the reading. */
  function advance(summary: string, saidBack?: string | null) {
    say({ who: 'you', text: summary });
    if (saidBack) say({ who: 'twin', text: saidBack });
    const nextIndex = index + 1;
    setIndex(nextIndex);
    const next = queue[nextIndex];
    if (next) setLines((all) => [...all, questionLine(next)]);
    else setPhase('reading');
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
      advance(value, saidFrom(r));
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
      advance(filledRows.map((r) => rowSummary(r, columns)).join(' / '), saidFrom(last));
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
    try { await moneyApi.skipQuestion(question.id); advance('Skipped this one.'); }
    catch { setNote('That did not go through. Try it again.'); }
    finally { setBusy(false); }
  }

  /* Ask mode: a question in words, answered from the ledger. */
  const history = useMemo<ChatTurn[]>(
    () => lines.filter((l) => !l.pending && !l.trace && !l.question).map((l) => ({ role: l.who === 'you' ? 'user' : 'twin', text: l.text })),
    [lines],
  );

  /* Development only: the simulator has no keyboard of its own, so the shell can hand this
     screen a line to send (twinme://dev/say?t=...). Compiled out of release builds. */
  const askRef = useRef<(m: string) => void>(() => {});
  useEffect(() => {
    if (!__DEV__) return;
    const sub = DeviceEventEmitter.addListener('dev:say', (text: string) => { askRef.current(text); });
    const trace = DeviceEventEmitter.addListener('dev:trace', () => { setPhase('reading'); });
    return () => { sub.remove(); trace.remove(); };
  }, []);

  askRef.current = (m: string) => { if (mode === 'ask') void ask(m); else void sendValue(m); };

  async function ask(message: string) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    say({ who: 'you', text: message });
    const pendingId = say({ who: 'twin', text: 'Reading the ledger.', pending: true });
    try {
      const reply = await moneyApi.chat(message, history);
      amend(pendingId, {
        pending: false, text: reply.text || 'Nothing it can say about that yet.',
        figures: reply.figures || [], actions: reply.actions || [], receipts: reply.receipts || [],
      });
    } catch {
      amend(pendingId, { pending: false, text: 'That could not be read right now. Ask again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  async function act(lineIdOf: string, action: ChatAction) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await moneyApi.chatAct(action);
      /* The card is spent once pressed; the transcript keeps what happened instead. */
      setLines((all) => all.map((l) => (l.id === lineIdOf ? { ...l, actions: (l.actions || []).filter((a) => a !== action) } : l)));
      say({ who: 'twin', text: r.said || 'Done.' });
    } catch {
      setNote('That could not be done right now.');
    } finally {
      setBusy(false);
    }
  }

  function submitComposer() {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    if (mode === 'ask') { void ask(value); return; }
    if (question && !isList) void sendValue(value);
  }

  function setRow(key: string, patch: Partial<ListRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const composerShown = mode === 'ask' || (question !== null && !isList);
  const composerPlaceholder = mode === 'ask' ? 'Ask about your money' : isCards ? 'Or type your own' : 'Your answer';

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
        ) : null}

        <ScrollView
          ref={scroller}
          style={s.fill}
          contentContainerStyle={[s.transcript, { paddingBottom: (composerShown ? 0 : insets.bottom) + cosmos.space.xl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={toEnd}
        >
          {phase === 'loading' ? <Enter><Small quiet>Reading the ledger.</Small></Enter> : null}

          {lines.map((l, i) => {
            const speakerChanged = i === 0 || lines[i - 1].who !== l.who;
            const isCurrentQuestion = Boolean(l.question) && question !== null && l.question!.id === question.id;
            return (
              <Enter key={l.id} style={[s.line, l.who === 'you' && s.lineYou]}>
                {speakerChanged ? <Micro>{l.who === 'you' ? 'You' : 'The ledger'}</Micro> : null}
                {l.pending ? <Small quiet>{l.text}</Small> : <Body muted={l.who === 'you'}>{l.text}</Body>}
                {l.small?.map((t, k) => <Small key={k} quiet>{t}</Small>)}

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
                    {l.actions.map((a, k) => <Card key={`${a.kind}-${k}`} label={a.label} onPress={busy ? undefined : () => void act(l.id, a)} />)}
                  </View>
                ) : null}
                {l.trace ? <Trace steps={l.trace} /> : null}

                {isCurrentQuestion && question ? (
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

          {note ? <Small>{note}</Small> : null}

          {mode === 'onboarding' && (phase === 'done' || phase === 'failed') && onDone ? (
            <Enter style={s.actions}><Pill label="See the month" onPress={onDone} /></Enter>
          ) : null}
        </ScrollView>

        {composerShown ? (
          <View style={[s.composer, { paddingBottom: insets.bottom + cosmos.space.sm }]}>
            <Hairline />
            <View style={s.composerLine}>
              <TextInput
                style={[s.input, s.say]}
                value={text}
                onChangeText={setText}
                placeholder={composerPlaceholder}
                placeholderTextColor={cosmos.color.ink3}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={submitComposer}
                onFocus={toEnd}
                editable={!busy}
                autoCorrect
                accessibilityLabel={composerPlaceholder}
              />
              <Pill label="Send" ghost onPress={submitComposer} disabled={busy || !text.trim()} />
            </View>
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
  composer: { paddingHorizontal: cosmos.space.lg, backgroundColor: cosmos.color.canvas },
  composerLine: { flexDirection: 'row', alignItems: 'center', gap: cosmos.space.sm, paddingTop: cosmos.space.sm },
});
