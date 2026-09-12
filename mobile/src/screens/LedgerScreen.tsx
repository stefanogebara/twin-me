/**
 * Every euro, with its receipts.
 * ==============================
 * The second half of the old MoneyScreen: the ledger, a month at a time, newest first,
 * against the totals the server already worked out for each month. A row opens to show
 * the receipts behind it, in the source's own words, and the two verdicts.
 *
 *   rows      GET /money/ledger
 *   totals    GET /money/months                        never summed on the phone
 *   receipts  GET /money/transactions/:id/sightings    read when a row is first opened
 *
 * Every number on this screen was computed by the server; the screen only arranges them.
 * Colour, type, spacing, rounding and motion come from the primitives and nowhere else.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { cosmos, dayMonth, euro } from '../constants/cosmos';
import { authFetch } from '../services/api';
import { moneyApi, type MoneyMonth, type MoneyTransaction, type TransactionVerdict } from '../services/moneyApi';
import { Body, Display, Enter, Heading, Label, List, Micro, Page, Pill, Row, Small } from '../ui/primitives';

/** One receipt behind a transaction: who saw it, when, and the text they saw. */
type MoneySighting = {
  id: string;
  source: string;
  seen_at: string;
  raw_text: string | null;
  amount: number | string | null;
  currency: string | null;
  occurred_at: string | null;
};

/** The same names the web gives each source. */
const SOURCE: Record<string, string> = {
  phone: 'Your phone',
  bizum: 'Bizum',
  bankfeed: 'Santander',
  gmail: 'Gmail',
  statement: 'Statement',
};

/* The sightings route is not in `moneyApi` yet; this reads it over the same `authFetch`
   and unwraps the same `{ success, data }` envelope. */
async function fetchSightings(id: string): Promise<MoneySighting[]> {
  const res = await authFetch(`/money/transactions/${encodeURIComponent(id)}/sightings`);
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: MoneySighting[] };
  if (!res.ok || body.success === false) throw new Error(body.error || `Request failed (${res.status})`);
  return body.data || [];
}

// -- Words -------------------------------------------------------------------

function merchantLabel(t: { merchant_name?: string | null; merchant_raw?: string | null; merchant_key: string }): string {
  const s = t.merchant_name || t.merchant_raw || t.merchant_key;
  const base = s.length > 2 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function monthAndYear(monthKey: string): string {
  const d = new Date(`${monthKey}-01T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? monthKey : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function verdictWord(v: TransactionVerdict): string {
  return v === 'worth_it' ? 'worth it' : v === 'not_me' ? 'not me' : '';
}

// -- Screen ------------------------------------------------------------------

export default function LedgerScreen() {
  const [ledger, setLedger] = useState<MoneyTransaction[]>([]);
  const [months, setMonths] = useState<MoneyMonth[]>([]);
  const [receipts, setReceipts] = useState<Record<string, MoneySighting[]>>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    /* Each request is settled on its own, so the totals failing does not hide the rows. */
    const [l, m] = await Promise.allSettled([moneyApi.ledger(), moneyApi.months()]);
    if (l.status === 'fulfilled') setLedger(l.value);
    if (m.status === 'fulfilled') setMonths(m.value);
    setUnreachable([l, m].every((r) => r.status === 'rejected'));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

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

  async function toggle(t: MoneyTransaction) {
    const opening = openRow !== t.id;
    setOpenRow(opening ? t.id : null);
    if (opening && !receipts[t.id]) {
      try {
        const s = await fetchSightings(t.id);
        setReceipts((m) => ({ ...m, [t.id]: s }));
      } catch {
        /* The row still opens; the verdicts do not depend on the receipts. */
      }
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

  const empty = !loading && ledger.length === 0;

  if (loading) {
    return (
      <Page style={layout.content}>
        <Heading>Every euro, with its receipts.</Heading>
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
        <Enter index={0}>
          <Heading>Every euro, with its receipts.</Heading>
        </Enter>

        {unreachable ? (
          <Enter index={1} style={layout.afterLarge}>
            <Display>Nothing to read.</Display>
            <Body muted style={layout.after}>The ledger did not answer. Pull down to try again.</Body>
          </Enter>
        ) : empty ? (
          <Enter index={1} style={layout.afterLarge}>
            <Display>Nothing read yet.</Display>
            <Body muted style={layout.after}>
              The first line arrives with the first receipt, from the bank or from a payment your phone sees.
            </Body>
          </Enter>
        ) : (
          byMonth.map((group, gi) => (
            <View key={group.key} style={layout.group}>
              <Enter index={gi}>
                <View style={layout.groupHead}>
                  <Label>{monthAndYear(group.key)}</Label>
                  {group.segment ? (
                    <Micro quiet tabular>
                      {euro(group.segment.spent)} out{group.segment.received ? `, ${euro(group.segment.received)} in` : ''}
                    </Micro>
                  ) : null}
                </View>
              </Enter>
              <List>
              {group.rows.map((t, i) => {
                const inflow = Number(t.amount) > 0;
                const open = openRow === t.id;
                const tags = [t.is_recurring ? 'recurring' : '', verdictWord(t.verdict)].filter(Boolean).join(', ');
                const seen = receipts[t.id];
                return (
                  <Enter key={t.id} index={i}>
                    <Row
                      lead={dayMonth(t.occurred_at)}
                      label={merchantLabel(t)}
                      sub={tags || undefined}
                      trail={`${inflow ? '+' : ''}${euro(t.amount)}`}
                      quiet={inflow}
                      onPress={inflow ? undefined : () => void toggle(t)}
                    />
                    {open && !inflow ? (
                      <View style={layout.indent}>
                        {seen === undefined ? (
                          <Small>Reading the receipts.</Small>
                        ) : seen.length === 0 ? (
                          <Small>No receipt kept for this one.</Small>
                        ) : (
                          seen.map((s) => (
                            <View key={s.id} style={layout.receipt}>
                              <Micro>{SOURCE[s.source] || s.source}, read {dayMonth(s.seen_at)}</Micro>
                              <Small muted style={layout.afterSmall}>
                                {s.raw_text || `${euro(s.amount)} ${s.currency || ''}`.trim()}
                              </Small>
                            </View>
                          ))
                        )}
                        <View style={layout.pills}>
                          <Pill small ghost={t.verdict !== 'worth_it'} label="Worth it" onPress={() => void setRowVerdict(t, 'worth_it')} />
                          <Pill small ghost={t.verdict !== 'not_me'} label="Not me" onPress={() => void setRowVerdict(t, 'not_me')} />
                        </View>
                      </View>
                    ) : null}
                  </Enter>
                );
              })}
              </List>
            </View>
          ))
        )}
      </ScrollView>
    </Page>
  );
}

// -- Layout ------------------------------------------------------------------
// Structure only: flex and spacing. Type, colour and motion are the primitives' business,
// and every value here is a token.

const layout = StyleSheet.create({
  content: { paddingHorizontal: cosmos.space.lg, paddingTop: cosmos.space.lg, paddingBottom: cosmos.chrome.door + cosmos.space.xl },
  after: { marginTop: cosmos.space.md },
  afterSmall: { marginTop: cosmos.space.xs },
  afterLarge: { marginTop: cosmos.space.lg },
  group: { marginTop: cosmos.space.xl },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: cosmos.space.sm },
  indent: { paddingLeft: 58 + cosmos.space.md, paddingBottom: cosmos.space.md, gap: cosmos.space.md },
  receipt: { gap: 0 },
  pills: { flexDirection: 'row', gap: cosmos.space.sm },
});
