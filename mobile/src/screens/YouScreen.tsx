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
import { Alert, Linking, Platform, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { cosmos, dayMonth, euro, monthYear } from '../constants/cosmos';
import { Enter, List, Micro, Page, Panel, Pill, Row, Section, Small, Title } from '../ui/primitives';
import { Prompt } from '../ui/prompt';
import { KindTile, Stamp } from '../ui/carved';
import { CalendarGlyph, CardGlyph, PhoneGlyph, MailGlyph } from '../ui/glyphs';
import { moneyApi, bankLabel, type MoneyReconciliation, type MoneyAccount, type MoneyCalendar, type MoneyFact } from '../services/moneyApi';
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
  const [reconciliation, setReconciliation] = useState<MoneyReconciliation | null>(null);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [facts, setFacts] = useState<MoneyFact[]>([]);
  /* A failed read preserves the last calendar; it does not mean disconnected. */
  const [calendar, setCalendar] = useState<MoneyCalendar | null>(null);
  const [calendarFailed, setCalendarFailed] = useState(false);
  const [calendarNeedsReconnect, setCalendarNeedsReconnect] = useState(false);
  /* The receipts address, once the server has minted it; null until then. */
  const [inbox, setInbox] = useState<{ address: string; receiving: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  /* A Canvas or Blackboard link, pasted: the field opens under the calendar row. */
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedNote, setFeedNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [a, f, c, i, review] = await Promise.allSettled([moneyApi.accounts(), moneyApi.facts(), moneyApi.calendar(), moneyApi.inbox(), moneyApi.reconciliation()]);
    setReconciliation(review.status === 'fulfilled' ? review.value : {state: 'unavailable', unresolvedCount: null, revision: null});
    if (i.status === 'fulfilled') setInbox(i.value);
    if (a.status === 'fulfilled') setAccounts(a.value);
    if (f.status === 'fulfilled') setFacts(f.value);
    if (c.status === 'fulfilled') {
      setCalendar(c.value); setCalendarFailed(false); setCalendarNeedsReconnect(false);
    } else {
      setCalendarFailed(true);
      setCalendarNeedsReconnect(c.reason?.needsReconnect === true);
    }
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

  const addFeed = useCallback(async () => {
    const url = feedUrl.trim();
    if (!url || feedBusy) return;
    setFeedBusy(true); setFeedNote(null);
    try {
      const f = await moneyApi.addCalendarFeed(url);
      setFeedUrl(''); setFeedOpen(false);
      setFeedNote(f.already ? 'That link is already here.' : `${f.label} added, ${f.events ?? 0} events read.`);
      await load();
    } catch (e) { setFeedNote((e as Error).message || 'That link could not be read.'); }
    finally { setFeedBusy(false); }
  }, [feedUrl, feedBusy, load]);
  const removeFeed = useCallback((id: string, label: string) => {
    Alert.alert(`Remove ${label}?`, 'Its events leave the calendar read. You can paste the link again any time.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { moneyApi.removeCalendarFeed(id).then(() => load()).catch(() => { /* the row stays */ }); } },
    ]);
  }, [load]);

  /* A fact is the person's own word; pressing it offers to forget it, which reopens its question. */
  const forget = useCallback((f: MoneyFact) => {
    Alert.alert(factLabel(f), `${kindWord(f.kind)}. Forget it and the question is asked again.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: () => { moneyApi.deleteFact(f.id).then(() => load()).catch(() => { /* the row stays */ }); } },
    ]);
  }, [load]);

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
          <View style={s.head}><Title>{name ? `${name}.` : 'You.'}</Title><Stamp mark="rent" /></View>
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
                        label={a.provider === 'enablebanking' ? bankLabel(a.bank_name) : (a.name || 'Bank account')}
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
                  {inbox ? (
                    /* The address is the whole instruction: press to hand it to Mail. */
                    <Row
                      inset
                      glyph={<MailGlyph />}
                      label="Receipts by email"
                      sub={inbox.address}
                      onPress={() => { void Share.share({ message: inbox.address }); }}
                    />
                  ) : null}
                  {reconciliation?.state === 'pending' ? <Row label="Review payment observations" sub="Spending guidance waits until review" onPress={() => { void Linking.openURL('https://twinme.me/money/account#sources'); }} /> : reconciliation?.state === 'unavailable' ? <Row label="Payment evidence unavailable" sub="Tap to try again" onPress={() => { void load(); }} /> : null}
                  {calendar || calendarFailed ? (
                    <Row
                      inset
                      glyph={<CalendarGlyph />}
                      label="Your calendar"
                      sub={connecting ? 'Opening' : refreshing ? 'Reading' : calendarFailed
                        ? (calendarNeedsReconnect ? 'Reconnect Google' : 'Could not read. Tap to retry')
                        : calendar?.google ? (routine || 'Google connected') : 'Connect Google calendar'}
                      onPress={calendarFailed
                        ? () => { if (calendarNeedsReconnect) void connectCalendar(); else { setRefreshing(true); void load(); } }
                        : calendar?.google ? undefined : () => void connectCalendar()}
                      disabled={connecting || refreshing}
                    />
                  ) : null}
                  {(calendar?.feeds || []).map((f) => (
                    <Row key={f.id} inset glyph={<CalendarGlyph />} label={f.label} sub="Calendar link connected. Tap to remove" onPress={() => removeFeed(f.id, f.label)} />
                  ))}
                  {calendar ? (
                    <Row
                      inset
                      glyph={<CalendarGlyph />}
                      label="A Canvas or Blackboard link"
                      sub={feedNote || 'Exams and deadlines come in; nothing goes out'}
                      onPress={() => { setFeedOpen((o) => !o); setFeedNote(null); }}
                    />
                  ) : null}
                  {feedOpen ? (
                    <View style={s.feed}>
                      <Prompt value={feedUrl} onChange={setFeedUrl} onSubmit={() => void addFeed()} placeholder="https://" busy={feedBusy} autoFocus />
                      <Micro quiet>Canvas: Calendar, then Calendar feed. Blackboard Ultra: Calendar settings, then Share calendar. Older Blackboard: Get external calendar link.</Micro>
                    </View>
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
                      glyph={<KindTile kind={f.kind === 'commitment' && f.value !== 'rent' ? 'cash' : f.kind} />}
                      lead={kindWord(f.kind)}
                      label={factLabel(f)}
                      trail={f.amount !== null && f.amount !== undefined ? euro(f.amount) : undefined}
                      sub={f.check_note || undefined}
                      onPress={() => forget(f)}
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
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: cosmos.space.md },
  feed: { gap: cosmos.space.sm, paddingHorizontal: cosmos.space.md, paddingBottom: cosmos.space.md },
  end: { gap: cosmos.space.md, alignItems: 'flex-start', marginTop: cosmos.space.xxl },
});
