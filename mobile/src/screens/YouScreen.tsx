/**
 * You: the sources, what the ledger knows, and the way out.
 * =========================================================
 * The third destination in the top capsule. It is the one screen that is about the person
 * rather than the money: where the money comes from (the bank, the phone), what they have
 * told the ledger themselves, what the app will and will not do with any of it, and the
 * sign-out.
 *
 * Nothing here is computed. The bank rows come from `GET /money/bank/accounts`, the facts
 * from `GET /money/facts`, and the screen arranges them. The two pressable rows lead to the
 * two setup screens; the one pill at the end signs out.
 */

import { useCallback, useEffect, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { cosmos, dayMonth, euro, monthYear } from '../constants/cosmos';
import { Enter, List, Micro, Page, Panel, Pill, Row, Section, Small, Title } from '../ui/primitives';
import { CalendarGlyph, CardGlyph, PhoneGlyph } from '../ui/glyphs';
import { moneyApi, type MoneyAccount, type MoneyCalendar, type MoneyFact } from '../services/moneyApi';
import type { User } from '../types';


/** A fact's kind, in the word a person would use for it. Fits the 58-point lead column. */
const KIND_WORDS: Record<string, string> = {
  home_area: 'Home',
  study_place: 'Study',
  work_place: 'Work',
  commitment: 'Monthly',
  income: 'Income',
  shared_cost: 'Shared',
  goal: 'Goal',
  person: 'Person',
  merchant_kind: 'Shop',
};

function kindWord(kind: string): string {
  return KIND_WORDS[kind] || kind.replace(/_/g, ' ');
}

/** What the fact is about, or failing that what was said. */
function factLabel(f: MoneyFact): string {
  return f.subject_label || f.subject || f.value || kindWord(f.kind);
}

function firstName(user: User): string | null {
  const full = (user.name || user.full_name || '').trim();
  if (!full) return null;
  return full.split(/\s+/)[0] || null;
}

const PHONE_SUB = Platform.OS === 'android' ? 'One switch to turn on' : 'A Shortcut, in four steps';

const version: string | null = Constants.expoConfig?.version || Constants.nativeAppVersion || null;

type Props = {
  user: User;
  onSignOut: () => void;
  onOpenPhone: () => void;
  onOpenBank: () => void;
  onOpenQuestions: () => void;
};

export default function YouScreen({ user, onSignOut, onOpenPhone, onOpenBank, onOpenQuestions }: Props) {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [facts, setFacts] = useState<MoneyFact[]>([]);
  /* null until read; a server without the calendar lens reads as not connected. */
  const [calendar, setCalendar] = useState<MoneyCalendar | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [a, f, c] = await Promise.allSettled([moneyApi.accounts(), moneyApi.facts(), moneyApi.calendar()]);
    if (a.status === 'fulfilled') setAccounts(a.value);
    if (f.status === 'fulfilled') setFacts(f.value);
    setCalendar(c.status === 'fulfilled' ? c.value : { connected: false, ahead: [] });
    setFailed(a.status === 'rejected' && f.status === 'rejected');
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Connecting the calendar: the same door as the bank, a browser session that comes back
     to the app when it is done, then the row is read again. */
  const connectCalendar = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const { url } = await moneyApi.calendarConnect();
      if (url) await WebBrowser.openAuthSessionAsync(url, 'twinme://calendar');
    } catch { /* the row keeps saying not connected */ }
    finally { setConnecting(false); void load(); }
  }, [connecting, load]);

  const name = firstName(user);

  /* The lens writes a sentence; the row has room for its first clause. Trimming here rather
     than letting the row ellipsize means the line always ends on a word. */
  const routine = calendar?.routine ? calendar.routine.split(/,|\./)[0].trim() : null;

  return (
    <Page>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={cosmos.color.ink3}
          />
        }
      >
        <Enter index={0}>
          <Title>{name ? `${name}.` : 'You.'}</Title>
        </Enter>

        {/* Everything on this page but two rows is text that needs no network, so nothing waits.
            The account row and the facts fill in when they arrive; until then they are quiet. */}
        <>
            <Enter index={1}>
              <Section title="Sources">
                {/* One panel, one axis: every source begins at the same square, whatever it is. */}
                <Panel>
                  {accounts.length === 0 ? (
                    loaded
                      ? <Row inset glyph={<CardGlyph />} label="No bank yet" sub="Connect one to read the month" onPress={onOpenBank} />
                      : <Row inset glyph={<CardGlyph />} label="Bank" sub=" " />
                  ) : (
                    accounts.map((a) => (
                      /* The bank's own name for the account is the holder's name in capitals, which is
                         nobody's idea of a label. The only bank the app connects today is Santander, so the
                         row says so, and the account is told apart by its last four digits. */
                      <Row
                        key={a.id}
                        inset
                        glyph={<CardGlyph />}
                        label={a.provider === 'enablebanking' ? 'Santander' : (a.name || 'Bank account')}
                        sub={a.needs_reconnect
                          ? 'Ended. Tap to reconnect'
                          : [
                            a.iban_mask ? `Ending ${a.iban_mask.slice(-4)}` : '',
                            a.consent_expires_at ? `until ${monthYear(a.consent_expires_at)}` : '',
                          ].filter(Boolean).join(', ')}
                        onPress={onOpenBank}
                      />
                    ))
                  )}
                  <Row inset glyph={<PhoneGlyph />} label="This phone" sub={PHONE_SUB} onPress={onOpenPhone} />
                  {calendar ? (
                    <Row
                      inset
                      glyph={<CalendarGlyph />}
                      label="Your calendar"
                      sub={calendar.connected
                        ? (routine || 'Connected')
                        : connecting ? 'Opening' : 'Learn what your week costs'}
                      onPress={calendar.connected ? undefined : () => void connectCalendar()}
                    />
                  ) : null}
                </Panel>
              </Section>
            </Enter>

            <Enter index={2}>
              <Section title="What it knows about you" aside={facts.length ? String(facts.length) : undefined}>
                {facts.length === 0 ? (
                  !loaded ? null : <View style={s.empty}>
                    <Small>Nothing yet. The questions are where this fills.</Small>
                    <Pill small ghost label="Answer them" onPress={onOpenQuestions} />
                  </View>
                ) : (
                  <List>
                    {facts.map((f) => (
                    <Row
                      key={f.id}
                      lead={kindWord(f.kind)}
                      label={factLabel(f)}
                      trail={f.amount !== null && f.amount !== undefined ? euro(f.amount) : undefined}
                      sub={f.check_note || undefined}
                    />
                    ))}
                  </List>
                )}
                {failed ? <Small>The ledger could not be reached. Pull down to try again.</Small> : null}
              </Section>
            </Enter>

            <Enter index={3}>
              <Section title="Privacy">
                <View style={s.prose}>
                  <Small muted>It reads your bank. It cannot move money or change anything there.</Small>
                  <Small muted>It never sees your card number, your PIN or your online banking password.</Small>
                  <Small muted>Remove a source and everything read from it goes with it.</Small>
                </View>
              </Section>
            </Enter>

            <Enter index={4} style={s.end}>
              <Pill ghost label="Sign out" onPress={onSignOut} />
              {version ? <Micro>Version {version}</Micro> : null}
            </Enter>
        </>
      </ScrollView>
    </Page>
  );
}

/* Layout only. Every colour, size and curve is the primitives'. */
const s = StyleSheet.create({
  content: { padding: cosmos.space.lg, paddingTop: cosmos.space.lg, paddingBottom: cosmos.chrome.door + cosmos.space.xl },
  empty: { gap: cosmos.space.md, alignItems: 'flex-start' },
  prose: { gap: cosmos.space.sm },
  end: { gap: cosmos.space.md, alignItems: 'flex-start', marginTop: cosmos.space.xxl },
});
