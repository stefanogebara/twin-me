/**
 * Money, on the phone.
 * ====================
 * TwinMe is one product now, and this is it: the money twin's home screen, carrying the
 * web surface at `src/pages/money/MoneyV2Page.tsx` across without inventing a second
 * register for it. Same order, same wording, same refusal to guess:
 *
 *   1. This month      what has gone, and where the month lands  -> GET /money/forecast
 *   2. What it says    readings, each with the payments under it -> GET /money/readings
 *   3. Where it went   the month by kind of place                -> GET /money/categories
 *   4. What comes back the recurring series and their charges    -> GET /money/recurring
 *   5. Every euro      the ledger, a month at a time             -> GET /money/ledger, /money/months
 *
 * Colour, type, spacing and rounding come from `../constants/cosmos` and nowhere else.
 * Every number on this screen was computed by the server; the screen only arranges them.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  LayoutChangeEvent,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { cosmos, euro, dayMonth, monoStyle } from '../constants/cosmos';
import {
  moneyApi, currentMonthStart,
  type MoneyCategories, type MoneyForecast, type MoneyMonth, type MoneyReading,
  type MoneyRecurring, type MoneyTransaction, type MoneyQuestions,
  type ReadingVerdict, type TransactionVerdict,
} from '../services/moneyApi';
import type { User } from '../types';

/* `monoStyle.fontVariant` is a readonly tuple; a style prop wants a plain array. Copied
   once here so the literal type survives and no cast is needed at any use site. */
const MONO = { ...monoStyle, fontFamily: cosmos.font.mono, fontVariant: [...monoStyle.fontVariant] };
const TABULAR = { fontVariant: [...monoStyle.fontVariant] };

const CADENCE: Record<string, string> = {
  weekly: 'every week',
  biweekly: 'every two weeks',
  monthly: 'every month',
  quarterly: 'every quarter',
  yearly: 'every year',
};

// -- Words -------------------------------------------------------------------

function merchantLabel(t: { merchant_name?: string | null; merchant_raw?: string | null; merchant_key: string }): string {
  const s = t.merchant_name || t.merchant_raw || t.merchant_key;
  const base = s.length > 2 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Two names read with an "and"; more than three become a count, so the line stays a sentence. */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

function ordinalSuffix(n: number): string {
  if (n % 10 === 1 && n !== 11) return 'st';
  if (n % 10 === 2 && n !== 12) return 'nd';
  if (n % 10 === 3 && n !== 13) return 'rd';
  return 'th';
}

function monthName(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

function monthAndYear(monthKey: string): string {
  const d = new Date(`${monthKey}-01T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? monthKey : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function lastDay(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 30;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Where a euro amount falls on the band, 0..100, with the projected p90 near the right edge. */
function pct(v: number, f: MoneyForecast): number {
  const max = Math.max(f.projected_p90, f.spent + f.committed, 1) * 1.08;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

// -- Small parts -------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <Text style={styles.quiet}>{children}</Text>;
}

function VerdictPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.pill, active ? styles.pillOn : styles.pillOff]}
    >
      <Text style={[styles.pillText, active ? styles.pillTextOn : styles.pillTextOff]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * The projection band: the range between p10 and p90, what has actually gone, and a mark
 * where p50 lands. Laid out from the measured track rather than percentage strings, so the
 * three layers can overlap the way they do on the web.
 */
function Band({ forecast }: { forecast: MoneyForecast }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const x = (v: number) => (pct(v, forecast) / 100) * width;

  return (
    <View style={styles.band}>
      <View style={styles.bandTrack} onLayout={onLayout}>
        {width > 0 ? (
          <>
            <View style={[styles.bandRange, { left: x(forecast.projected_p10), width: Math.max(0, x(forecast.projected_p90) - x(forecast.projected_p10)) }]} />
            <View style={[styles.bandSpent, { width: x(forecast.spent) }]} />
            <View style={[styles.bandMark, { left: x(forecast.projected_p50) }]} />
          </>
        ) : null}
      </View>
      <View style={styles.bandLabels}>
        <Text style={styles.bandLabel}>spent {euro(forecast.spent)}</Text>
        <Text style={styles.bandLabel}>committed {euro(forecast.committed)}</Text>
        <Text style={styles.bandLabel}>{forecast.days_left} days left</Text>
      </View>
    </View>
  );
}

/** A proportional bar without percentage strings: two flex children split the track. */
function ShareBar({ share, quiet }: { share: number; quiet: boolean }) {
  const filled = Math.max(0, Math.min(100, share));
  return (
    <View style={styles.shareTrack}>
      <View style={[styles.shareFill, quiet ? styles.shareFillQuiet : null, { flex: filled }]} />
      <View style={{ flex: Math.max(0.0001, 100 - filled) }} />
    </View>
  );
}

// -- Screen ------------------------------------------------------------------

export function MoneyScreen({ user: _user }: { user: User }) {
  const navigation = useNavigation();
  const [forecast, setForecast] = useState<MoneyForecast | null>(null);
  const [ledger, setLedger] = useState<MoneyTransaction[]>([]);
  const [readings, setReadings] = useState<MoneyReading[]>([]);
  const [categories, setCategories] = useState<MoneyCategories | null>(null);
  const [recurring, setRecurring] = useState<MoneyRecurring[]>([]);
  const [months, setMonths] = useState<MoneyMonth[]>([]);
  const [questions, setQuestions] = useState<MoneyQuestions | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    /* One failing endpoint must not take the screen down with it, so each is settled on
       its own. Only a clean sweep of failures is worth telling the person about. */
    const [f, l, rd, c, rc, m, q] = await Promise.allSettled([
      moneyApi.forecast(),
      moneyApi.ledger(),
      moneyApi.readings(),
      moneyApi.categories(currentMonthStart()),
      moneyApi.recurring(),
      moneyApi.months(),
      moneyApi.questions(),
    ]);
    if (f.status === 'fulfilled') setForecast(f.value);
    if (l.status === 'fulfilled') setLedger(l.value);
    if (rd.status === 'fulfilled') setReadings(rd.value);
    if (c.status === 'fulfilled') setCategories(c.value);
    if (rc.status === 'fulfilled') setRecurring(rc.value);
    if (m.status === 'fulfilled') setMonths(m.value);
    if (q.status === 'fulfilled') setQuestions(q.value);
    setUnreachable([f, l, rd, c, rc, m, q].every((r) => r.status === 'rejected'));
    setLoading(false);
    setRefreshing(false);
  }, []);

  /* Focus covers the first mount as well as every return to the tab, so there is no second
     effect firing the same seven requests a beat later. */
  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));

  const empty = !loading && ledger.length === 0;
  /* One purchase makes p10, p50 and p90 the same euro, and reading the same number three
     times looks broken rather than honest. Say nothing about the month until the band opens. */
  const projectable = Boolean(forecast && forecast.projected_p90 - forecast.projected_p10 > 0.5);

  const ahead = useMemo(() => {
    if (!forecast) return [] as string[];
    return [...(forecast.committed_items || []), ...(forecast.commitment_items || [])].map((c) => merchantLabel(c));
  }, [forecast]);

  /* The ledger is read a month at a time, newest first, against the totals the server
     already worked out for each month. */
  const byMonth = useMemo(() => {
    const groups = new Map<string, MoneyTransaction[]>();
    for (const t of ledger) {
      const key = (t.occurred_at || '').slice(0, 7);
      const rows = groups.get(key);
      if (rows) rows.push(t);
      else groups.set(key, [t]);
    }
    return [...groups.entries()].map(([key, rows]) => ({
      key,
      rows,
      segment: months.find((m) => m.month.slice(0, 7) === key) || null,
    }));
  }, [ledger, months]);

  const questionCount = (questions?.opening.length || 0) + (questions?.fromLedger.length || 0);

  async function setReadingVerdict(r: MoneyReading, v: 'true' | 'not_me') {
    const next: ReadingVerdict = r.verdict === v ? null : v;
    setReadings((rows) => rows.map((x) => (x.id === r.id ? { ...x, verdict: next } : x)));
    try {
      await moneyApi.readingVerdict(r.id, next);
    } catch {
      setReadings((rows) => rows.map((x) => (x.id === r.id ? { ...x, verdict: r.verdict } : x)));
    }
  }

  async function setRowVerdict(t: MoneyTransaction, v: 'worth_it' | 'not_me') {
    const next: TransactionVerdict = t.verdict === v ? null : v;
    setLedger((rows) => rows.map((x) => (x.id === t.id ? { ...x, verdict: next } : x)));
    try {
      await moneyApi.transactionVerdict(t.id, next);
    } catch {
      setLedger((rows) => rows.map((x) => (x.id === t.id ? { ...x, verdict: t.verdict } : x)));
    }
  }

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={cosmos.color.ink3} size="large" />
      </View>
    );
  }

  const label = forecast ? monthName(forecast.month) : new Date().toLocaleDateString('en-GB', { month: 'long' });
  const last = forecast ? lastDay(forecast.month) : 30;
  /* The other side of the month, assembled as one sentence so an absent half leaves no gap. */
  const otherSide = forecast
    ? [
      ahead.length ? `${nameList(ahead)} ${ahead.length === 1 ? 'is' : 'are'} still to come.` : '',
      forecast.received ? `${euro(forecast.received)} came in this month.` : '',
      forecast.income_ahead ? `${euro(forecast.income_ahead)} is due in before the ${last}${ordinalSuffix(last)}.` : '',
    ].filter(Boolean).join(' ')
    : '';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void loadAll(); }}
          tintColor={cosmos.color.ink3}
        />
      }
    >
      {/* Something the ledger cannot work out for itself. There is no questions route on
          the phone yet, so this states the count and stays inert until there is one. */}
      {questionCount > 0 ? (
        <View style={styles.questions}>
          <Text style={styles.questionsText}>
            {questionCount} {questionCount === 1 ? 'thing' : 'things'} it cannot work out on its own
          </Text>
        </View>
      ) : null}

      {/* The phone is the only way to see a payment on the day it happens. */}
      <Pressable
        style={styles.questions}
        onPress={() => navigation.navigate('PhoneCapture' as never)}
        accessibilityRole="button"
      >
        <Text style={styles.questionsText}>Let your phone send payments as they happen</Text>
      </Pressable>

      {/* 1. This month */}
      <View style={styles.hero}>
        <Text style={styles.kicker}>{label}</Text>
        {unreachable ? (
          <>
            <Text style={styles.display}>Nothing to read.</Text>
            <Text style={styles.lede}>The ledger did not answer. Pull down to try again.</Text>
          </>
        ) : empty ? (
          <>
            <Text style={styles.display}>Nothing read yet.</Text>
            <Text style={styles.lede}>
              The first line arrives with the first receipt, from the bank or from a payment your phone sees.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.display}>{forecast ? `${euro(forecast.spent)} so far.` : '...'}</Text>
            {forecast ? (
              <>
                <Text style={styles.lede}>
                  {projectable
                    ? `Likely ${euro(forecast.projected_p50)} by the ${last}${ordinalSuffix(last)}, between ${euro(forecast.projected_p10)} and ${euro(forecast.projected_p90)}.`
                    : 'Too little read to say where the month lands. The projection starts once there are a few days behind it.'}
                  {projectable && (forecast.history_days ?? 0) < 42 ? ' The band is wide until there are six weeks to read from.' : ''}
                </Text>
                <Band forecast={forecast} />
                {otherSide ? <Quiet>{otherSide}</Quiet> : null}
              </>
            ) : null}
          </>
        )}
      </View>

      {/* With nothing read at all, the sections below would each say the same absence a
          second time. They arrive with the ledger. */}
      {empty || unreachable ? null : (
        <>
          {/* 2. What the money says */}
          <Section title="What the money says.">
            {readings.length === 0 ? (
              <Quiet>A reading appears once there are enough payments behind it to count one.</Quiet>
            ) : (
              <>
                <Quiet>Every line here is counted, not guessed. The payments behind it are underneath.</Quiet>
                {readings.map((r) => (
                  <View key={r.id} style={styles.reading}>
                    <Text style={styles.readingLine}>{r.sentence}</Text>
                    {r.detail ? <Text style={styles.readingDetail}>{r.detail}</Text> : null}
                    {r.receipts.map((t) => (
                      <View key={t.id} style={styles.receipt}>
                        <Text style={styles.receiptDate}>{dayMonth(t.occurred_at)}</Text>
                        <Text style={styles.receiptName} numberOfLines={1}>{t.merchant_raw || t.merchant_key}</Text>
                        <Text style={styles.receiptAmount}>{euro(t.amount)}</Text>
                      </View>
                    ))}
                    <View style={styles.readingFoot}>
                      <Text style={styles.evidence}>
                        read from {r.evidence_count} {r.evidence_count === 1 ? 'payment' : 'payments'}
                      </Text>
                      <View style={styles.verdicts}>
                        <VerdictPill label="True" active={r.verdict === 'true'} onPress={() => void setReadingVerdict(r, 'true')} />
                        <VerdictPill label="Not me" active={r.verdict === 'not_me'} onPress={() => void setReadingVerdict(r, 'not_me')} />
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </Section>

          {/* 3. Where it went */}
          <Section title="Where it went this month.">
            {!categories || categories.groups.length === 0 ? (
              <Quiet>Nothing is placed this month yet. A payment joins a row here once its shop has a kind of place behind it.</Quiet>
            ) : (
              <>
                <Quiet>
                  {categories.read < categories.total
                    ? `${euro(categories.read)} of ${euro(categories.total)} is placed so far. The rest is waiting on a lookup.`
                    : 'Every payment this month has a kind of place behind it.'}
                </Quiet>
                {categories.groups.map((g) => (
                  <View key={g.category} style={styles.catRow}>
                    <View style={styles.catHead}>
                      <Text style={[styles.catName, g.known ? null : styles.catNameQuiet]} numberOfLines={1}>{g.category}</Text>
                      <Text style={[styles.catAmount, g.known ? null : styles.catAmountQuiet]}>{euro(g.spent)}</Text>
                    </View>
                    <View style={styles.catUnder}>
                      <ShareBar share={g.share} quiet={!g.known} />
                      <Text style={styles.catShare}>{g.share}%</Text>
                    </View>
                    {g.known && g.merchants.length ? (
                      <Text style={styles.catWho} numberOfLines={1}>
                        {g.merchants.slice(0, 3).map((m) => m.name).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </>
            )}
          </Section>

          {/* 4. What comes back */}
          <Section title="What comes back on its own.">
            {recurring.length === 0 ? (
              <Quiet>A charge becomes recurring after it has come back three times at the same rhythm.</Quiet>
            ) : (
              <>
                <Quiet>Press one to see every charge it has made.</Quiet>
                {recurring.map((r) => {
                  const open = openSeries === r.merchant_key;
                  return (
                    <View key={r.merchant_key} style={styles.seriesRow}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        activeOpacity={0.8}
                        onPress={() => setOpenSeries(open ? null : r.merchant_key)}
                      >
                        <View style={styles.seriesHead}>
                          <Text style={styles.seriesName} numberOfLines={1}>{merchantLabel(r)}</Text>
                          <Text style={styles.seriesAmount}>{euro(r.typical_amount)}</Text>
                        </View>
                        <Text style={styles.seriesMeta}>
                          {CADENCE[r.cadence] || r.cadence}
                          {r.next_expected ? `, next around ${dayMonth(r.next_expected)}` : ''}
                          {r.day_of_month ? `, on the ${r.day_of_month}${ordinalSuffix(r.day_of_month)}` : ''}
                          {typeof r.total_paid === 'number'
                            ? `. ${euro(r.total_paid)} so far, over ${r.occurrences} ${r.occurrences === 1 ? 'charge' : 'charges'}.`
                            : '.'}
                        </Text>
                      </TouchableOpacity>
                      {open ? (
                        r.charges && r.charges.length ? (
                          <View style={styles.charges}>
                            {r.charges.map((c) => (
                              <View key={c.id} style={styles.chargeRow}>
                                <Text style={styles.receiptDate}>{dayMonth(c.occurred_at)}</Text>
                                <Text style={styles.chargeAmount}>{euro(c.amount)}</Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <View style={styles.charges}>
                            <Text style={styles.receiptName}>No charge is kept for this one yet.</Text>
                          </View>
                        )
                      ) : null}
                    </View>
                  );
                })}
              </>
            )}
          </Section>

          {/* 5. Every euro */}
          <Section title="Every euro.">
            {byMonth.map((group) => (
              <View key={group.key} style={styles.ledgerGroup}>
                <View style={styles.ledgerHead}>
                  <Text style={styles.ledgerMonth}>{monthAndYear(group.key)}</Text>
                  {group.segment ? (
                    <Text style={styles.ledgerTotals}>
                      {euro(group.segment.spent)} out{group.segment.received ? `, ${euro(group.segment.received)} in` : ''}
                    </Text>
                  ) : null}
                </View>
                {group.rows.map((t) => {
                  const inflow = Number(t.amount) > 0;
                  const open = openRow === t.id;
                  return (
                    <View key={t.id} style={styles.row}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        activeOpacity={0.8}
                        disabled={inflow}
                        onPress={() => setOpenRow(open ? null : t.id)}
                      >
                        <View style={styles.rowHead}>
                          <Text style={styles.rowDate}>{dayMonth(t.occurred_at)}</Text>
                          <Text style={[styles.rowName, inflow ? styles.rowNameIn : null]} numberOfLines={1}>
                            {merchantLabel(t)}
                          </Text>
                          <Text style={[styles.rowAmount, inflow ? styles.rowAmountIn : null]}>
                            {inflow ? '+' : ''}{euro(t.amount)}
                          </Text>
                        </View>
                        {t.is_recurring || t.verdict ? (
                          <Text style={styles.rowTags}>
                            {t.is_recurring ? 'recurring' : ''}
                            {t.is_recurring && t.verdict ? ', ' : ''}
                            {t.verdict === 'worth_it' ? 'worth it' : t.verdict === 'not_me' ? 'not me' : ''}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                      {open && !inflow ? (
                        <View style={[styles.verdicts, styles.verdictsSpaced]}>
                          <VerdictPill label="Worth it" active={t.verdict === 'worth_it'} onPress={() => void setRowVerdict(t, 'worth_it')} />
                          <VerdictPill label="Not me" active={t.verdict === 'not_me'} onPress={() => void setRowVerdict(t, 'not_me')} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </Section>
        </>
      )}

      <View style={styles.tail} />
    </ScrollView>
  );
}

// -- Styles ------------------------------------------------------------------

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: cosmos.color.canvas },
  content: { paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.space.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cosmos.color.canvas },
  tail: { height: cosmos.space.xxl },

  questions: {
    alignSelf: 'flex-start',
    borderRadius: cosmos.radius.pill,
    borderWidth: HAIRLINE,
    borderColor: cosmos.color.ruleStrong,
    paddingVertical: cosmos.space.sm,
    paddingHorizontal: cosmos.space.md,
    marginBottom: cosmos.space.lg,
  },
  questionsText: { fontFamily: cosmos.font.medium, fontSize: cosmos.size.small, color: cosmos.color.ink2, letterSpacing: cosmos.tracking.body },

  // 1. This month
  hero: { marginTop: cosmos.space.md },
  kicker: { ...MONO, marginBottom: cosmos.space.md },
  display: {
    fontFamily: cosmos.font.medium,
    fontSize: cosmos.size.display,
    lineHeight: cosmos.size.display + 6,
    letterSpacing: cosmos.tracking.display,
    color: cosmos.color.ink,
  },
  lede: {
    marginTop: cosmos.space.md,
    fontFamily: cosmos.font.regular,
    fontSize: cosmos.size.body,
    lineHeight: cosmos.size.body + 8,
    letterSpacing: cosmos.tracking.body,
    color: cosmos.color.ink2,
  },

  band: { marginTop: cosmos.space.lg },
  bandTrack: { height: 10, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.card },
  bandRange: { position: 'absolute', top: 0, height: 10, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.ruleStrong },
  bandSpent: { position: 'absolute', top: 0, left: 0, height: 10, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.ink },
  bandMark: { position: 'absolute', top: -5, width: 2, height: 20, backgroundColor: cosmos.color.ink },
  bandLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: cosmos.space.md },
  bandLabel: { ...MONO },

  quiet: {
    marginTop: cosmos.space.md,
    fontFamily: cosmos.font.regular,
    fontSize: cosmos.size.small,
    lineHeight: cosmos.size.small + 7,
    letterSpacing: cosmos.tracking.body,
    color: cosmos.color.ink3,
  },

  // Sections
  section: {
    marginTop: cosmos.space.xxl,
    paddingTop: cosmos.space.xl,
    borderTopWidth: HAIRLINE,
    borderTopColor: cosmos.color.rule,
  },
  sectionTitle: {
    fontFamily: cosmos.font.medium,
    fontSize: cosmos.size.title,
    lineHeight: cosmos.size.title + 6,
    letterSpacing: cosmos.tracking.title,
    color: cosmos.color.ink,
  },

  // 2. Readings
  reading: {
    marginTop: cosmos.space.lg,
    backgroundColor: cosmos.color.card,
    borderRadius: cosmos.radius.card,
    padding: cosmos.space.md,
  },
  readingLine: {
    fontFamily: cosmos.font.regular,
    fontSize: cosmos.size.heading,
    lineHeight: cosmos.size.heading + 8,
    letterSpacing: cosmos.tracking.heading,
    color: cosmos.color.ink,
  },
  readingDetail: {
    marginTop: cosmos.space.sm,
    fontFamily: cosmos.font.regular,
    fontSize: cosmos.size.small,
    lineHeight: cosmos.size.small + 7,
    color: cosmos.color.ink2,
  },
  receipt: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: cosmos.space.sm,
    gap: cosmos.space.sm,
  },
  receiptDate: { ...MONO, width: 58 },
  receiptName: { flex: 1, fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, color: cosmos.color.ink3 },
  receiptAmount: { ...TABULAR, fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, color: cosmos.color.ink3 },
  readingFoot: {
    marginTop: cosmos.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cosmos.space.sm,
  },
  evidence: { ...MONO, flexShrink: 1 },
  verdicts: { flexDirection: 'row', gap: cosmos.space.sm },
  verdictsSpaced: { marginTop: cosmos.space.md },

  pill: {
    borderRadius: cosmos.radius.pill,
    paddingVertical: cosmos.space.sm,
    paddingHorizontal: cosmos.space.md,
    borderWidth: HAIRLINE,
  },
  pillOn: { backgroundColor: cosmos.color.ink, borderColor: cosmos.color.ink },
  pillOff: { backgroundColor: 'transparent', borderColor: cosmos.color.ruleStrong },
  pillText: { fontFamily: cosmos.font.medium, fontSize: cosmos.size.small, letterSpacing: cosmos.tracking.body },
  pillTextOn: { color: cosmos.color.white },
  pillTextOff: { color: cosmos.color.ink2 },

  // 3. Where it went
  catRow: { marginTop: cosmos.space.lg },
  catHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: cosmos.space.sm },
  catName: { flex: 1, fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, letterSpacing: cosmos.tracking.body, color: cosmos.color.ink },
  catNameQuiet: { fontFamily: cosmos.font.regular, color: cosmos.color.ink3 },
  catAmount: { ...TABULAR, fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, color: cosmos.color.ink },
  catAmountQuiet: { fontFamily: cosmos.font.regular, color: cosmos.color.ink3 },
  catUnder: { flexDirection: 'row', alignItems: 'center', gap: cosmos.space.sm, marginTop: cosmos.space.sm },
  shareTrack: { flex: 1, flexDirection: 'row', height: 2, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.card, overflow: 'hidden' },
  shareFill: { backgroundColor: cosmos.color.ink },
  shareFillQuiet: { backgroundColor: cosmos.color.ruleStrong },
  catShare: { ...MONO, width: 38, textAlign: 'right' },
  catWho: { marginTop: cosmos.space.xs, fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, color: cosmos.color.ink3 },

  // 4. What comes back
  seriesRow: { marginTop: cosmos.space.lg, paddingBottom: cosmos.space.md, borderBottomWidth: HAIRLINE, borderBottomColor: cosmos.color.rule },
  seriesHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: cosmos.space.sm },
  seriesName: { flex: 1, fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, letterSpacing: cosmos.tracking.body, color: cosmos.color.ink },
  seriesAmount: { ...TABULAR, fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, color: cosmos.color.ink },
  seriesMeta: {
    marginTop: cosmos.space.xs,
    fontFamily: cosmos.font.regular,
    fontSize: cosmos.size.small,
    lineHeight: cosmos.size.small + 6,
    color: cosmos.color.ink3,
  },
  charges: { marginTop: cosmos.space.md, backgroundColor: cosmos.color.card, borderRadius: cosmos.radius.field, padding: cosmos.space.md },
  chargeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: cosmos.space.xs },
  chargeAmount: { ...TABULAR, fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, color: cosmos.color.ink2 },

  // 5. Every euro
  ledgerGroup: { marginTop: cosmos.space.xl },
  ledgerHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: cosmos.space.sm,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: cosmos.color.ruleStrong,
  },
  ledgerMonth: { fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, letterSpacing: cosmos.tracking.body, color: cosmos.color.ink },
  ledgerTotals: { ...MONO },
  row: { paddingVertical: cosmos.space.md, borderBottomWidth: HAIRLINE, borderBottomColor: cosmos.color.rule },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: cosmos.space.sm },
  rowDate: { ...MONO, width: 58 },
  rowName: { flex: 1, fontFamily: cosmos.font.regular, fontSize: cosmos.size.body, letterSpacing: cosmos.tracking.body, color: cosmos.color.ink },
  rowNameIn: { color: cosmos.color.inflow },
  rowAmount: { ...TABULAR, fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, color: cosmos.color.ink },
  rowAmountIn: { fontFamily: cosmos.font.regular, color: cosmos.color.inflow },
  rowTags: { ...MONO, marginTop: cosmos.space.xs, marginLeft: 58 + cosmos.space.sm },
});
