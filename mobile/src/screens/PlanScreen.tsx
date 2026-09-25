/**
 * Plan: the month as a calendar.
 * ==============================
 * What each day cost, what the coming days carry, and what the person wrote on a day. Every
 * figure is computed on the server (services/money/plan.js) and read from GET /money/plan;
 * this screen draws cells and phrases the day under the finger, the way the web's
 * src/pages/money/PlanPage.tsx does, so the two say the same thing about the same day.
 *
 * A past day is a filled bar for what it cost, with the range it was given the night before
 * as a faint band behind it (red when it broke). A coming day is a hollow bar for what is
 * expected on it, and marks for what: a charge, a commitment, money in, a day in the diary.
 * Today is the one ember bar. Under the grid, the picked day: its payments or its expected
 * items as rows, and a note field. A note is a fact the ledger reads with everything else.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useActiveRead } from '../hooks/useActiveRead';
import { cosmos, euro } from '../constants/cosmos';
import { moneyApi, type MoneyPlan, type MoneyPlanCell, type MoneyPlanItem } from '../services/moneyApi';
import { Body, Hairline, Heading, Label, List, Micro, Page, Pill, Small, Title } from '../ui/primitives';
import { Orb } from '../ui/Orb';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** The tallest bar, in points. The cell leaves this much clear under its number and marks. */
const BAR_MAX = 30;

// -- Dates and words ---------------------------------------------------------

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (key: string, by: number) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(Date.UTC(y, m - 1 + by, 1))); };
const monthName = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/* The server writes EUR in ASCII; the screen writes the glyph the way every other figure here does. */
const glyphs = (s: string) => s.replace(/(\d) EUR\b/g, '$1\u00a0\u20ac');

/** What an expected item is, in plain words. The web's wording, kept in step. */
function itemWords(i: MoneyPlanItem): string {
  if (i.kind === 'charge') return i.cadence === 'monthly' ? 'Every month' : i.cadence ? `Every ${i.cadence.replace(/ly$/, '')}` : 'Comes back';
  if (i.kind === 'commitment') return 'You said this is due';
  if (i.kind === 'income') return i.said ? 'Comes in' : `Comes in, seen before, not said${i.confidence != null ? `, ${Math.round(i.confidence * 100)}% on time` : ''}`;
  return i.amount > 0 ? 'A day like this usually costs' : 'In the diary';
}

/** The one grey line for a day. Computed from the cell, nothing guessed. */
function dayLine(c: MoneyPlanCell): string {
  if (c.past || c.today) {
    const base = c.count
      ? `${euro(c.spent)}${c.today ? ' so far' : ''}, ${c.count} ${c.count === 1 ? 'payment' : 'payments'}${c.received ? `; ${euro(c.received)} came in` : ''}.`
      : c.received ? `Nothing spent; ${euro(c.received)} came in.` : c.today ? 'Nothing yet today.' : 'Nothing spent.';
    const said = c.said && c.past ? ` It said ${euro(c.said.low)} to ${euro(c.said.high)}, and ${c.hit ? 'held' : c.hit === false ? 'broke' : 'was not scored'}.` : '';
    return base + said;
  }
  const out = c.items.filter((i) => i.kind !== 'income');
  const inc = c.items.filter((i) => i.kind === 'income');
  const parts: string[] = [];
  if (out.length) parts.push(`${euro(c.expected)} expected, ${out.length} ${out.length === 1 ? 'thing' : 'things'}.`);
  if (inc.length) parts.push(`${euro(inc.reduce((s, i) => s + i.amount, 0))} coming in.`);
  if (c.said) parts.push(`Usually up to ${euro(c.said.high)}.`);
  return parts.join(' ') || 'Nothing expected yet.';
}

// -- Pieces ------------------------------------------------------------------

/** One day of the grid. The bar and the band sit at the bottom, behind the number and marks. */
function DayCell({ c, picked, figure, px, onPress }: {
  c: MoneyPlanCell; picked: boolean; figure: boolean; px: (v: number) => number; onPress: () => void;
}) {
  const ahead = !c.past && !c.today;
  const v = ahead ? c.expected : c.spent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dayName(c.day)}: ${dayLine(c)}`}
      accessibilityState={{ selected: picked }}
      style={[s.cell, picked && s.cellPicked]}
    >
      <Micro tabular style={[s.dom, c.today ? s.domToday : ahead ? s.domAhead : null]}>{c.dom}</Micro>
      {c.items.length || c.note ? (
        <View style={s.marks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {c.items.slice(0, 4).map((i, k) => (
            <View key={k} style={[s.mark, i.kind === 'income' && s.markIncome, i.kind === 'calendar' && s.markCalendar]} />
          ))}
          {c.note ? <View style={[s.mark, s.markNote]} /> : null}
        </View>
      ) : null}
      {figure ? <Micro tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={s.figure}>{euro(v)}</Micro> : null}
      {c.said ? <View style={[s.said, { bottom: px(c.said.low), height: Math.max(2, px(c.said.high) - px(c.said.low)) }]} /> : null}
      {v > 0 ? (
        <View style={[s.bar, ahead && s.barAhead, c.hit === false && s.barMiss, c.today && s.barToday, { height: Math.max(2, px(v)) }]} />
      ) : null}
    </Pressable>
  );
}

/** A payment or an expected item under the picked day: a name, one line, the amount. */
function DayRow({ label, sub, trail, income }: { label: string; sub: string; trail: string | null; income: boolean }) {
  return (
    <View style={s.row}>
      <View style={s.rowMid}>
        <Label numberOfLines={1}>{label}</Label>
        <Micro numberOfLines={1}>{sub}</Micro>
      </View>
      {trail ? <Body tabular numberOfLines={1} style={[s.rowTrail, income && s.rowIn]}>{trail}</Body> : null}
    </View>
  );
}

// -- Screen ------------------------------------------------------------------

export default function PlanScreen({ active = true }: { active?: boolean } = {}) {
  const current = monthKey(new Date());
  const [month, setMonth] = useState<string>(current);
  const [plan, setPlan] = useState<MoneyPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    try {
      const p = await moneyApi.plan(month === current ? null : month);
      if (!isCurrent()) return;
      setPlan(p);
      setFailed(false);
      setPicked((was) => (was && p.cells.some((c) => c.day === was) ? was : p.today));
    } catch {
      if (isCurrent()) setFailed(true);
    }
  }, [current, month]);
  const refresh = useActiveRead(load, active);

  const cell = useMemo(() => (plan && picked ? plan.cells.find((c) => c.day === picked) || null : null), [plan, picked]);
  useEffect(() => { setDraft(''); }, [picked]);

  /* Every bar on the month is scaled to the same tallest thing: a day's spend, what a day
     expects, or the top of a range it was given. */
  const max = useMemo(() => Math.max(1, ...(plan ? plan.cells.map((c) => Math.max(c.spent, c.expected, c.said ? c.said.high : 0)) : [1])), [plan]);
  const px = useCallback((v: number) => Math.round(Math.max(0, Math.min(1, v / max)) * BAR_MAX), [max]);

  const saveNote = useCallback(async () => {
    if (!cell || !draft.trim() || busy) return;
    setBusy(true);
    try { await moneyApi.noteDay(cell.day, draft.trim()); setDraft(''); await refresh(true); } catch { /* the field keeps the words */ } finally { setBusy(false); }
  }, [cell, draft, busy, refresh]);

  const forgetNote = useCallback(() => {
    if (!cell?.note?.id || busy) return;
    const id = cell.note.id;
    Alert.alert(cell.note.text, 'Forget it and the ledger stops reading with it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          moneyApi.deleteFact(id).then(() => refresh(true)).catch(() => { /* it stays until it can go */ }).finally(() => setBusy(false));
        },
      },
    ]);
  }, [cell, busy, refresh]);

  /* Seven across, Monday first: blanks before the first day, and after the last so the
     final week keeps the same seven columns. */
  const weeks = useMemo(() => {
    if (!plan) return [] as (MoneyPlanCell | null)[][];
    const slots: (MoneyPlanCell | null)[] = [...Array.from({ length: plan.first_weekday }, () => null), ...plan.cells];
    while (slots.length % 7) slots.push(null);
    const out: (MoneyPlanCell | null)[][] = [];
    for (let i = 0; i < slots.length; i += 7) out.push(slots.slice(i, i + 7));
    return out;
  }, [plan]);

  if (!plan && !failed) {
    return (
      <Page style={s.centre}>
        <Orb state="breathing" size={64} />
      </Page>
    );
  }

  const before = shiftMonth(month, -1);
  const after = shiftMonth(month, 1);

  return (
    <Page>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Title>{`${monthName(month)}, day by day.`}</Title>
        <Small style={s.after}>{failed ? 'The plan could not be read right now.' : plan ? glyphs(plan.line) : ''}</Small>
        <View style={s.months}>
          <Pressable onPress={() => setMonth(before)} accessibilityRole="button" style={s.link}>
            <Small muted style={s.linkText}>{monthName(before)}</Small>
          </Pressable>
          {month !== current ? (
            <Pressable onPress={() => setMonth(after)} accessibilityRole="button" style={s.link}>
              <Small muted style={s.linkText}>{monthName(after)}</Small>
            </Pressable>
          ) : null}
        </View>

        {plan ? (
          <View style={s.grid} accessibilityLabel={`${monthName(month)}, day by day`}>
            <View style={s.week}>
              {WEEKDAYS.map((w) => <Micro key={w} quiet style={s.head}>{w}</Micro>)}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={s.week}>
                {week.map((c, di) => c ? (
                  <DayCell
                    key={c.day}
                    c={c}
                    picked={picked === c.day}
                    figure={(plan.peak !== null && c.day === plan.peak.day) || (c.today && c.spent > 0)}
                    px={px}
                    onPress={() => setPicked(c.day)}
                  />
                ) : (
                  <View key={`b${wi}-${di}`} style={[s.cell, s.cellBlank]} />
                ))}
              </View>
            ))}
            <Hairline />
          </View>
        ) : null}

        {cell ? (
          <View style={s.day}>
            <Heading>{`${dayName(cell.day)}${cell.today ? ', today' : ''}.`}</Heading>
            <Small style={s.afterSmall}>{dayLine(cell)}</Small>
            {(cell.past || cell.today) && cell.rows.length ? (
              <View style={s.rows}>
                <Hairline />
                <List>
                  {cell.rows.map((r) => (
                    <DayRow
                      key={r.id}
                      label={r.merchant || 'Unknown'}
                      sub={timeOf(r.occurred_at)}
                      trail={r.amount > 0 ? `+${euro(r.amount)}` : euro(r.amount)}
                      income={r.amount > 0}
                    />
                  ))}
                </List>
              </View>
            ) : null}
            {!cell.past && !cell.today && cell.items.length ? (
              <View style={s.rows}>
                <Hairline />
                <List>
                  {cell.items.map((i, k) => (
                    <DayRow
                      key={k}
                      label={i.label}
                      sub={itemWords(i)}
                      trail={i.amount > 0 ? (i.kind === 'income' ? `+${euro(i.amount)}` : euro(i.amount)) : null}
                      income={i.kind === 'income'}
                    />
                  ))}
                </List>
              </View>
            ) : null}

            <View style={s.note}>
              {cell.note ? (
                <View style={s.row}>
                  <View style={s.rowMid}>
                    <Label numberOfLines={2}>{cell.note.text}</Label>
                    <Micro numberOfLines={1}>Your note. The ledger reads with it.</Micro>
                  </View>
                  <Pill small ghost label="Forget" disabled={busy} onPress={forgetNote} />
                </View>
              ) : (
                <View style={s.noteForm}>
                  <TextInput
                    style={s.field}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={cell.past ? 'What this day was' : cell.today ? 'What today is' : 'What this day will be: a trip, a visit, an exam'}
                    placeholderTextColor={cosmos.color.ink3}
                    maxLength={240}
                    autoCorrect
                    returnKeyType="done"
                    onSubmitEditing={() => void saveNote()}
                    editable={!busy}
                    accessibilityLabel="A note on this day"
                  />
                  <Pill small ghost label="Keep" disabled={busy || !draft.trim()} onPress={() => void saveNote()} />
                </View>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Page>
  );
}

// -- Layout ------------------------------------------------------------------
// Structure only: the grid, the cells, the bars. Type and colour are the tokens'.

const s = StyleSheet.create({
  content: { paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.space.lg, paddingBottom: cosmos.chrome.door + cosmos.space.xl },
  centre: { alignItems: 'center', justifyContent: 'center' },
  after: { marginTop: cosmos.space.md },
  afterSmall: { marginTop: cosmos.space.sm },

  months: { flexDirection: 'row', gap: cosmos.space.lg, marginTop: cosmos.space.xs },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { textDecorationLine: 'underline' },

  grid: { marginTop: cosmos.space.xl },
  week: { flexDirection: 'row', gap: 2 },
  head: { flex: 1, paddingHorizontal: 4, paddingBottom: cosmos.space.sm },

  /* A cell is at least 84 points tall: its number, its marks, then room for the tallest bar. */
  cell: {
    flex: 1, minHeight: 84, paddingTop: 6, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: cosmos.color.ink, overflow: 'visible',
  },
  cellBlank: { borderTopColor: 'transparent' },
  cellPicked: { backgroundColor: cosmos.color.hover },
  dom: { color: cosmos.color.ink3 },
  domAhead: { color: cosmos.color.ink2 },
  domToday: { color: cosmos.color.ink, fontFamily: cosmos.font.medium },
  figure: { fontSize: 12, lineHeight: 16, marginTop: 2, color: cosmos.color.ink2 },

  marks: { flexDirection: 'row', gap: 3, marginTop: 2, height: 5 },
  mark: { width: 5, height: 5, backgroundColor: cosmos.color.ink },
  markIncome: { backgroundColor: cosmos.color.ok },
  markCalendar: { backgroundColor: 'transparent', borderWidth: 1, borderColor: cosmos.color.ink },
  markNote: { backgroundColor: 'transparent', borderWidth: 1, borderColor: cosmos.color.ink2, borderRadius: 2.5 },

  said: { position: 'absolute', left: 4, right: 4, backgroundColor: cosmos.color.mark, opacity: 0.35 },
  bar: { position: 'absolute', left: 4, right: 4, bottom: 0, backgroundColor: cosmos.color.ink },
  barAhead: { backgroundColor: 'transparent', borderWidth: 1, borderBottomWidth: 0, borderColor: cosmos.color.ink3 },
  barMiss: { backgroundColor: cosmos.color.danger },
  barToday: { backgroundColor: cosmos.color.ember },

  day: { marginTop: cosmos.space.xxl },
  rows: { marginTop: cosmos.space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: cosmos.space.md, paddingVertical: 12, minHeight: 48 },
  rowMid: { flex: 1, minWidth: 0, gap: 1 },
  rowTrail: { textAlign: 'right', fontSize: cosmos.size.label, lineHeight: cosmos.line.label },
  rowIn: { color: cosmos.color.ok },

  note: { marginTop: cosmos.space.lg },
  noteForm: { flexDirection: 'row', alignItems: 'center', gap: cosmos.space.sm },
  /* The register's field: no border, the field ground, 44 tall, a 4 point corner. */
  field: {
    flex: 1, minHeight: 44, paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: cosmos.radius.field, backgroundColor: cosmos.color.panelDeep,
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, letterSpacing: cosmos.tracking.small, color: cosmos.color.ink,
  },
});
