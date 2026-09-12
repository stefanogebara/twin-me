/**
 * The month. Home.
 * ================
 * The number, the band, what the money says, where it went, what comes back, every euro.
 * This is the first of the two halves of the old MoneyScreen, carried onto the primitives
 * in `../ui/primitives` so nothing on it can drift from the rest of the app. Same order,
 * same wording, same refusal to guess:
 *
 *   hero             what has gone, and where the month lands   -> GET /money/forecast
 *   What it says     readings, each with the payments under it  -> GET /money/readings
 *   Where it went    the month by kind of place                 -> GET /money/categories
 *   What comes back  the recurring series and their charges     -> GET /money/recurring
 *   Every euro       one row, which the shell wires to the Ledger destination
 *
 * Every number on this screen was computed by the server; the screen only arranges them.
 * Colour, type, spacing, rounding and motion come from the primitives and nowhere else.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { cosmos, dayMonth, euro } from '../constants/cosmos';
import {
  moneyApi, currentMonthStart,
  type MoneyCategories, type MoneyForecast, type MoneyReading, type MoneyRecurring, type MoneyToday,
} from '../services/moneyApi';
import { Body, Counting, Display, Enter, Hairline, Micro, Page, Pill, Row, Section, Small, Title } from '../ui/primitives';
import { Band } from '../ui/figures';

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

function lastDay(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 30;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** A proportional bar without percentage strings: two flex children split the track. */
function ShareBar({ share, quiet }: { share: number; quiet: boolean }) {
  const filled = Math.max(0, Math.min(100, share));
  return (
    <View style={layout.shareTrack}>
      <View style={[layout.shareFill, quiet ? layout.shareFillQuiet : null, { flex: filled }]} />
      <View style={{ flex: Math.max(0.0001, 100 - filled) }} />
    </View>
  );
}

// -- Screen ------------------------------------------------------------------

export default function MonthScreen({ onOpenQuestions, questionCount, onOpenLedger }: {
  onOpenQuestions: () => void;
  questionCount: number;
  onOpenLedger?: () => void;
}) {
  const [forecast, setForecast] = useState<MoneyForecast | null>(null);
  const [ledgerLines, setLedgerLines] = useState<number | null>(null);
  const [readings, setReadings] = useState<MoneyReading[]>([]);
  const [categories, setCategories] = useState<MoneyCategories | null>(null);
  const [recurring, setRecurring] = useState<MoneyRecurring[]>([]);

  const [today, setToday] = useState<MoneyToday | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [openSeries, setOpenSeries] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    /* One failing endpoint must not take the screen down with it, so each is settled on
       its own. Only a clean sweep of failures is worth telling the person about. */
    const [f, l, rd, c, rc, td, ac] = await Promise.allSettled([
      moneyApi.forecast(),
      moneyApi.ledger(),
      moneyApi.readings(),
      moneyApi.categories(currentMonthStart()),
      moneyApi.recurring(),
      moneyApi.today(),
      moneyApi.accounts(),
    ]);
    if (td.status === 'fulfilled') setToday(td.value);
    /* The refresh call only learns the session has ended when it is the call that hits it;
       once the day's read budget is spent no call is made at all. The account row carries the
       last recorded outcome, so the month still says why it stopped moving. */
    if (ac.status === 'fulfilled' && ac.value.some((a) => a.needs_reconnect)) setNeedsReconnect(true);
    if (f.status === 'fulfilled') setForecast(f.value);
    if (l.status === 'fulfilled') setLedgerLines(l.value.length);
    if (rd.status === 'fulfilled') setReadings(rd.value);
    if (c.status === 'fulfilled') setCategories(c.value);
    if (rc.status === 'fulfilled') setRecurring(rc.value);
    setUnreachable([f, l, rd, c, rc].every((r) => r.status === 'rejected'));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* The month should not be three days old because nobody pressed anything. On open, ask the
     server whether a read is due; it spends one only if the last is old and the budget allows,
     and we read the ledger again only when it actually brought something. */
  useEffect(() => {
    let live = true;
    moneyApi.refreshIfStale()
      .then((r) => {
        if (!live) return;
        if (r.needs_reconnect) setNeedsReconnect(true);
        if (r.pulled && (r.created ?? 0) > 0) void loadAll();
      })
      .catch(() => {});
    return () => { live = false; };
  }, [loadAll]);

  const empty = !loading && (ledgerLines ?? 0) === 0;
  /* One purchase makes p10, p50 and p90 the same euro, and reading the same number three
     times looks broken rather than honest. Say nothing about the month until the band opens. */
  const projectable = Boolean(forecast && forecast.projected_p90 - forecast.projected_p10 > 0.5);

  const ahead = useMemo(() => {
    if (!forecast) return [] as string[];
    /* Charges the ledger knows are due, then what the calendar says is coming and what such
       things have cost before, so the one sentence holds both. */
    const charges = [...(forecast.committed_items || []), ...(forecast.commitment_items || [])].map((c) => merchantLabel(c));
    const events = (forecast.calendar_items || []).map((c) => {
      const amount = Number(c.amount);
      return amount > 0 ? `${c.title} (about ${euro(amount)})` : c.title;
    });
    return [...charges, ...events];
  }, [forecast]);

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

  if (loading) {
    return (
      <Page style={layout.content}>
        <Micro>{label}</Micro>
        <Small style={layout.after}>Reading the ledger.</Small>
      </Page>
    );
  }

  return (
    <Page>
      <ScrollView
        contentContainerStyle={layout.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void loadAll(); }}
            tintColor={cosmos.color.ink3}
          />
        }
      >
        {/* Hero. No hairline above: it is the top of the page. */}
        <Enter index={0}>
          <Micro>{label}</Micro>
          {unreachable ? (
            <>
              <Display style={layout.after}>Nothing to read.</Display>
              <Body muted style={layout.after}>The ledger did not answer. Pull down to try again.</Body>
            </>
          ) : empty ? (
            <>
              <Display style={layout.after}>Nothing read yet.</Display>
              <Body muted style={layout.after}>
                The first line arrives with the first receipt, from the bank or from a payment your phone sees.
              </Body>
            </>
          ) : forecast ? (
            <>
              <Counting value={forecast.spent} format={euro} style={layout.after} />
              <Body muted style={layout.after}>
                {projectable
                  ? `Likely ${euro(forecast.projected_p50)} by the ${last}${ordinalSuffix(last)}, between ${euro(forecast.projected_p10)} and ${euro(forecast.projected_p90)}.`
                  : 'Too little read to say where the month lands. The projection starts once there are a few days behind it.'}
                {projectable && (forecast.history_days ?? 0) < 42 ? ' The band is wide until there are six weeks to read from.' : ''}
              </Body>
              <View style={layout.band}>
                <Band spent={forecast.spent} likely={Math.max(forecast.projected_p50, forecast.spent + forecast.committed)} high={forecast.projected_p90} />
              </View>
              {otherSide ? <Small style={layout.after}>{otherSide}</Small> : null}

              {/* The one number a person opens the app for. It sits under the month rather than
                  over it: the month is what happened, this is what today can carry. */}
              {today ? (
                <View style={layout.today}>
                  <Hairline />
                  <Micro style={layout.after}>Safe to spend today</Micro>
                  {today.amount === null ? (
                    <Small style={layout.afterSmall}>{today.why}</Small>
                  ) : (
                    <>
                      <Title tabular style={layout.afterSmall}>
                        {today.over ? 'Nothing.' : euro(today.amount)}
                      </Title>
                      {today.sentence ? <Small style={layout.afterSmall}>{today.sentence}</Small> : null}
                    </>
                  )}
                </View>
              ) : null}
            </>
          ) : (
            <Display style={layout.after}>...</Display>
          )}
        </Enter>

        {/* A month that stopped moving must say why. The bank ends its session on its own
            schedule, and until it is authorised again nothing can be read. */}
        {needsReconnect ? (
          <Enter index={1} style={layout.afterLarge}>
            <Small>The bank connection has ended, so nothing new has come in. Reconnect it on the You page to start reading again.</Small>
          </Enter>
        ) : null}

        {/* Something the ledger cannot work out for itself. */}
        {questionCount > 0 ? (
          <Enter index={1} style={layout.afterLarge}>
            <Pill
              small
              ghost
              label={`${questionCount} ${questionCount === 1 ? 'thing' : 'things'} it cannot work out on its own`}
              onPress={onOpenQuestions}
            />
          </Enter>
        ) : null}

        {/* With nothing read at all, the sections below would each say the same absence a
            second time. They arrive with the ledger. */}
        {empty || unreachable ? null : (
          <>
            {/* What the money says */}
            <Section title="What the money says">
              {readings.length === 0 ? (
                <Small>A reading appears once there are enough payments behind it to count one.</Small>
              ) : (
                <>
                  {readings.map((r, i) => (
                    <Enter key={r.id} index={i} style={layout.block}>
                      <Body>{r.sentence}</Body>
                      {r.detail ? <Small style={layout.afterSmall}>{r.detail}</Small> : null}
                      {r.receipts.map((t) => (
                        <Row
                          key={t.id}
                          lead={dayMonth(t.occurred_at)}
                          label={t.merchant_raw || t.merchant_key}
                          trail={euro(t.amount)}
                          quiet
                        />
                      ))}
                      <Micro style={layout.foot}>
                        read from {r.evidence_count} {r.evidence_count === 1 ? 'payment' : 'payments'}
                      </Micro>
                    </Enter>
                  ))}
                </>
              )}
            </Section>

            {/* Where it went */}
            <Section title="Where it went">
              {!categories || categories.groups.length === 0 ? (
                <Small>Nothing is placed this month yet. A payment joins a row here once its shop has a kind of place behind it.</Small>
              ) : (
                <>
                  {categories.read < categories.total ? (
                    <Small>{`${euro(categories.read)} of ${euro(categories.total)} is placed so far. The rest is waiting on a lookup.`}</Small>
                  ) : null}
                  {categories.groups.map((g, i) => (
                    <Enter key={g.category} index={i}>
                      <Row
                        label={g.category}
                        trail={euro(g.spent)}
                        quiet={!g.known}
                        sub={g.known ? (g.merchants.slice(0, 2).map((m) => m.name).join(', ') || undefined) : 'not read yet'}
                      />
                      <ShareBar share={g.share} quiet={!g.known} />
                    </Enter>
                  ))}
                </>
              )}
            </Section>

            {/* What comes back */}
            <Section title="What comes back">
              {recurring.length === 0 ? (
                <Small>A charge becomes recurring after it has come back three times at the same rhythm.</Small>
              ) : (
                <>
                  {recurring.map((r, i) => {
                    const open = openSeries === r.merchant_key;
                    /* One line, and it has to fit at 372 points: the cadence and the next date.
                       What it has taken in total is in the charges underneath, where a person
                       who cares enough to open the series will find it. */
                    const meta = [
                      CADENCE[r.cadence] || r.cadence,
                      r.next_expected ? `next around ${dayMonth(r.next_expected)}` : '',
                    ].filter(Boolean).join(', ');
                    return (
                      <Enter key={r.merchant_key} index={i}>
                        <Row
                          label={merchantLabel(r)}
                          sub={meta}
                          trail={euro(r.typical_amount)}
                          onPress={() => setOpenSeries(open ? null : r.merchant_key)}
                        />
                        {open ? (
                          <View style={layout.indent}>
                            {r.charges && r.charges.length ? (
                              r.charges.map((c) => (
                                <Row
                                  key={c.id}
                                  lead={dayMonth(c.occurred_at)}
                                  label={merchantLabel(r)}
                                  sub={c.verdict === 'worth_it' ? 'worth it' : c.verdict === 'not_me' ? 'not me' : undefined}
                                  trail={euro(c.amount)}
                                  quiet
                                />
                              ))
                            ) : (
                              <Small>No charge is kept for this one yet.</Small>
                            )}
                          </View>
                        ) : null}
                      </Enter>
                    );
                  })}
                </>
              )}
            </Section>

            {/* Every euro. One row; the shell takes it to the Ledger. */}
            <View style={layout.tailSection}>
              <Hairline />
              <Row label="Every euro" sub="A month at a time, with receipts" onPress={onOpenLedger} disabled={!onOpenLedger} />
            </View>
          </>
        )}
      </ScrollView>
    </Page>
  );
}

// -- Layout ------------------------------------------------------------------
// Structure only: flex, spacing, the band and the bars. Type, colour and motion are the
// primitives' business, and every value here is a token.

const layout = StyleSheet.create({
  content: { paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.chrome.capsule + cosmos.space.lg, paddingBottom: cosmos.chrome.door + cosmos.space.xl },
  after: { marginTop: cosmos.space.md },
  afterSmall: { marginTop: cosmos.space.sm },
  afterLarge: { marginTop: cosmos.space.lg },
  block: { gap: 0, paddingTop: cosmos.space.sm },
  today: { marginTop: cosmos.space.lg },
  shrink: { flexShrink: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: cosmos.space.sm, marginTop: cosmos.space.sm },
  pills: { flexDirection: 'row', gap: cosmos.space.sm },
  indent: { paddingLeft: cosmos.space.lg, paddingBottom: cosmos.space.sm },
  tailSection: { marginTop: cosmos.space.lg, paddingTop: cosmos.space.lg },

  band: { marginTop: cosmos.space.lg },

  shareTrack: { flexDirection: 'row', height: 2, borderRadius: cosmos.radius.pill, backgroundColor: cosmos.color.panelDeep, overflow: 'hidden' },
  shareFill: { backgroundColor: cosmos.color.ink },
  shareFillQuiet: { backgroundColor: cosmos.color.rule },
});
