/**
 * What only you know, as a conversation.
 * ======================================
 * The ledger reads rhythm, price and place from the payments on its own. What it cannot
 * read it asks here, one question at a time, in a transcript that keeps what you already
 * said. The opening seven come first; then the questions the ledger raised from real
 * lines, each with the payments behind it.
 *
 * It is the phone edition of `src/pages/money/MoneyChatPage.tsx`, and it submits exactly
 * the way the web does: one POST per filled row of a list, the row's label slugged into
 * `subject`, amounts accepting a comma decimal, days 1-31, shares as a fraction of one.
 * Nothing here computes a number the server should have computed.
 *
 * Spec: .claude/plans/2026-09-07-money-twin/README.md, section 16.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cosmos, dayMonth, euro } from '../constants/cosmos';
import { Body, Card, Enter, Hairline, Micro, Page, Pill, Press, Row, Small, Title } from '../ui/primitives';
import { useReducedMotion } from '../ui/motion';
import { moneyApi, type MoneyFact, type MoneyQuestion } from '../services/moneyApi';

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

/** What a saved row reads as once it is back in the transcript. */
function rowSummary(row: ListRow, columns: string[]): string {
  const bits: string[] = [row.label.trim()];
  if (columns.includes('amount')) { const a = parseAmount(row.amount); if (a !== undefined) bits.push(euro(a)); }
  if (columns.includes('day')) { const d = parseDay(row.day); if (d !== undefined) bits.push(`on the ${ordinal(d)}`); }
  if (columns.includes('share')) { const s = parseShare(row.share); if (s !== undefined) bits.push(`${Math.round(s * 100)}% yours`); }
  return bits.join(', ');
}

/** What a fact is called in the list at the end: its kind, spelt as words. */
function factLead(kind: string): string { return kind.replace(/_/g, ' '); }
function factLabel(f: MoneyFact): string {
  const what = f.subject_label || f.value || f.subject || 'unnamed';
  const bits = [what];
  if (f.subject_label && f.value) bits.push(f.value);
  if (f.day) bits.push(`on the ${ordinal(f.day)}`);
  if (f.share) bits.push(`${Math.round(Number(f.share) * 100)}% yours`);
  return bits.join(', ');
}

/* ----------------------------------------------------------------------------------------
 * Small parts.
 * -------------------------------------------------------------------------------------- */

/** What the person said, kept in the transcript as an ink capsule on the right. */
function Said({ text }: { text: string }) {
  return (
    <Enter style={s.saidWrap}>
      <View style={s.said} accessibilityRole="text" accessibilityLabel={`You said: ${text}`}>
        <Body style={s.saidText}>{text}</Body>
      </View>
    </Enter>
  );
}

/** A single field in a list row. Hairline border, field radius, white, nothing else. */
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

/** A quiet pressable line, sized for a thumb even though it reads small. */
function QuietAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityLabel={label} style={s.quiet}>
      <Small quiet>{label}</Small>
    </Press>
  );
}

/* ----------------------------------------------------------------------------------------
 * The screen.
 * -------------------------------------------------------------------------------------- */

export default function QuestionsScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView | null>(null);

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

  useEffect(() => {
    let live = true;
    moneyApi.questions()
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
  const never = loaded && !failed && queue.length === 0;

  /* Every question starts from an empty answer, and a list question starts with one row
     already open so there is nothing to press before you can type. */
  useEffect(() => {
    setNote(null);
    setText('');
    setRows(question && question.input.startsWith('list:') ? [blankRow()] : []);
  }, [question]);

  useEffect(() => {
    if (!done || facts !== null) return;
    void moneyApi.facts().then(setFacts).catch(() => setFacts([]));
  }, [done, facts]);

  /* The transcript grows from the bottom: whatever is newest sits where the eye is. */
  const toEnd = useCallback(() => { scroller.current?.scrollToEnd({ animated: !reduced }); }, [reduced]);

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
      await moneyApi.answerQuestion({
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
        await moneyApi.answerQuestion({
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
    try { await moneyApi.skipQuestion(question.id); keep(at, 'Skipped this one.'); }
    catch { setNote('That did not go through. Try it again.'); }
    finally { setBusy(false); }
  }

  function submitComposer() {
    const value = text.trim();
    if (!isText || !value || busy) return;
    void sendValue(value);
  }

  function setRow(key: string, patch: Partial<ListRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const kicker = fromLedger ? 'From your ledger' : 'What only you know';

  return (
    <Page>
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[s.head, { paddingTop: insets.top + cosmos.space.md }]}>
          <Micro>{done ? 'Done' : never ? 'Nothing to ask' : kicker}</Micro>
          {question && !done ? <Micro>{`${index + 1} of ${queue.length}`}</Micro> : null}
        </View>
        <Hairline />

        <ScrollView
          ref={scroller}
          style={s.fill}
          contentContainerStyle={[s.transcript, { paddingBottom: (isText ? 0 : insets.bottom) + cosmos.space.xl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={toEnd}
        >
          {!loaded ? (
            <Enter><Small quiet>Reading the ledger.</Small></Enter>
          ) : failed ? (
            <Enter style={s.turn}>
              <Title>The questions did not load.</Title>
              <Body muted>Nothing was lost. Come back to this in a moment.</Body>
              <View style={s.actions}><Pill label="See the month" onPress={onDone} /></View>
            </Enter>
          ) : never ? (
            <Enter style={s.turn}>
              <Title>Nothing it cannot explain.</Title>
              <Body muted>
                {answeredBefore > 0
                  ? `You have answered ${answeredBefore} ${answeredBefore === 1 ? 'thing' : 'things'} already, and every line the ledger has read since then it could read on its own.`
                  : 'The ledger reads rhythm, price and place from your payments without asking. When a line arrives that it cannot read, it asks here.'}
              </Body>
              <View style={s.actions}><Pill label="See the month" onPress={onDone} /></View>
            </Enter>
          ) : (
            queue.slice(0, index + 1).map((q, at) => {
              const answered = at < index;
              return (
                <View key={`${q.id}-${at}`} style={s.exchange}>
                  <Enter style={s.turn}>
                    <Title>{q.ask}</Title>
                    <Body muted>{q.why}</Body>
                    {q.help ? <Small quiet>{q.help}</Small> : null}
                    {q.receipts && q.receipts.length ? (
                      <View style={s.receipts} accessibilityLabel="The payments behind this question">
                        <Hairline />
                        {q.receipts.map((r, i) => (
                          <Enter key={r.id} index={i}>
                            <Row lead={dayMonth(r.occurred_at)} label={r.merchant_raw || 'Unnamed'} trail={euro(r.amount)} />
                            <Hairline />
                          </Enter>
                        ))}
                      </View>
                    ) : null}
                  </Enter>
                  {answered ? <Said text={said[at] || 'Answered.'} /> : null}
                </View>
              );
            })
          )}

          {question && !done ? (
            <Enter style={s.answer}>
              <Small quiet>{`This changes ${question.changes}.`}</Small>

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
                        <Field
                          label={columns[0] || 'name'}
                          value={row.label}
                          placeholder={PLACEHOLDER[columns[0]] || ''}
                          onChange={(v) => setRow(row.key, { label: v })}
                          flex={2}
                        />
                        {columns.includes('amount') ? (
                          <Field label="euros" value={row.amount} placeholder={PLACEHOLDER.amount} onChange={(v) => setRow(row.key, { amount: v })} decimal flex={1} />
                        ) : null}
                        {columns.includes('day') ? (
                          <Field label="day" value={row.day} placeholder={PLACEHOLDER.day} onChange={(v) => setRow(row.key, { day: v })} numeric flex={1} />
                        ) : null}
                        {columns.includes('share') ? (
                          <Field label="your share, %" value={row.share} placeholder={PLACEHOLDER.share} onChange={(v) => setRow(row.key, { share: v })} numeric flex={1} />
                        ) : null}
                      </View>
                      {rows.length > 1 ? (
                        <QuietAction label="Remove" onPress={() => setRows((all) => all.filter((r) => r.key !== row.key))} />
                      ) : null}
                    </View>
                  ))}
                  <View style={s.actions}>
                    <Pill label="Add another" ghost small onPress={() => setRows((all) => [...all, blankRow()])} />
                    <Pill
                      label={busy ? 'Saving...' : 'That is all of them'}
                      onPress={() => void sendRows()}
                      disabled={busy || (filledRows.length === 0 && !skippable)}
                    />
                  </View>
                </View>
              ) : null}

              {skippable ? <QuietAction label="Skip this" onPress={() => void skip()} disabled={busy} /> : null}
              {note ? <Small>{note}</Small> : null}
            </Enter>
          ) : null}

          {done ? (
            <Enter style={s.turn}>
              <Title>That is enough to change the numbers.</Title>
              <Body muted>
                {facts && facts.length
                  ? `It now holds ${facts.length} ${facts.length === 1 ? 'thing' : 'things'} you told it, next to everything it read for itself.`
                  : facts === null
                    ? 'Reading back what you told it...'
                    : 'Nothing was recorded this time. The ledger carries on with what it can read for itself.'}
              </Body>
              {facts && facts.length ? (
                <View style={s.receipts}>
                  <Hairline />
                  {facts.map((f, i) => (
                    <Enter key={f.id} index={i}>
                      <Row
                        lead={factLead(f.kind)}
                        label={factLabel(f)}
                        sub={f.check_note || undefined}
                        trail={f.amount ? euro(f.amount) : undefined}
                      />
                      <Hairline />
                    </Enter>
                  ))}
                </View>
              ) : null}
              <View style={s.actions}><Pill label="See the month" onPress={onDone} /></View>
            </Enter>
          ) : null}
        </ScrollView>

        {isText && question && !done ? (
          <View style={[s.composer, { paddingBottom: insets.bottom + cosmos.space.sm }]}>
            <Hairline />
            <View style={s.composerLine}>
              <TextInput
                style={[s.input, s.say]}
                value={text}
                onChangeText={setText}
                placeholder="Your answer"
                placeholderTextColor={cosmos.color.ink3}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={submitComposer}
                onFocus={toEnd}
                editable={!busy}
                autoCorrect
                accessibilityLabel="Your answer"
              />
              <Pill label={busy ? 'Saving...' : 'Send'} ghost onPress={submitComposer} disabled={busy || !text.trim()} />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Page>
  );
}

/* ----------------------------------------------------------------------------------------
 * Styles. Tokens only; the one hex-free file a screen should be.
 * -------------------------------------------------------------------------------------- */

const s = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingHorizontal: cosmos.space.lg, paddingBottom: cosmos.space.md,
  },
  transcript: { paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.space.xl, gap: cosmos.space.xl },
  exchange: { gap: cosmos.space.md },
  turn: { gap: cosmos.space.sm },
  receipts: { marginTop: cosmos.space.sm },
  saidWrap: { alignItems: 'flex-end' },
  said: {
    maxWidth: '84%', backgroundColor: cosmos.color.ink, borderRadius: cosmos.radius.pill,
    paddingVertical: 10, paddingHorizontal: 18,
  },
  saidText: { color: cosmos.color.canvas },
  answer: { gap: cosmos.space.md },
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
  composer: { paddingHorizontal: cosmos.space.lg, backgroundColor: cosmos.color.canvas },
  composerLine: { flexDirection: 'row', alignItems: 'center', gap: cosmos.space.sm, paddingTop: cosmos.space.sm },
});
