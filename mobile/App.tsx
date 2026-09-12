/**
 * TwinMe, the money twin, on the phone.
 * =====================================
 * One product for a university student in Spain, and one vertical surface to hold it. The
 * old app was five tabs for five ideas; this is a front door, three setup steps a person
 * passes through once, and then the month, the ledger and themselves, reachable from a
 * capsule at the top of the page. There is no bottom bar because there is nothing to
 * choose between: the month is the product, and the other two are where its parts live.
 *
 * Every surface change is a fade on the one easing family in src/ui/motion.ts. Nothing
 * pushes in from the side, because a person reading their money is not travelling
 * anywhere; the page in front of them is simply becoming the next page.
 *
 * What the app decides on the person's behalf it decides from data, not from a flag it
 * set for itself: no bank account means the bank step, open opening-questions mean the
 * questions, and otherwise the month. A step skipped is remembered; a step that the data
 * says is done is never shown again.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, LayoutChangeEvent, Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SecureStore from 'expo-secure-store';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { cosmos } from './src/constants/cosmos';
import { fade, spring } from './src/ui/motion';
import { Glass, Micro, Pill, Press } from './src/ui/primitives';
import { PromptButton } from './src/ui/prompt';
import { useAuth } from './src/hooks/useAuth';
import { requestMagicLink } from './src/services/api';
import { moneyApi } from './src/services/moneyApi';
import { ensureCaptureKey } from './src/services/captureKey';
import { NotificationListenerModule as NotifListenerBg } from './modules/notification-listener/src';

import FrontDoorScreen from './src/screens/FrontDoorScreen';
import BankScreen from './src/screens/BankScreen';
import PhoneCaptureScreen from './src/screens/PhoneCaptureScreen';
import ChatScreen from './src/screens/ChatScreen';
import MonthScreen from './src/screens/MonthScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import YouScreen from './src/screens/YouScreen';

type Setup = 'checking' | 'bank' | 'phone' | 'questions' | 'done';
type Place = 'month' | 'ledger' | 'ask' | 'you';
type Sheet = 'phone' | 'bank' | null;

const PHONE_SEEN = 'twinme_money_phone_step_seen';
const BANK_SKIPPED = 'twinme_money_bank_step_skipped';
const PLACES: { id: Place; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'ask', label: 'Ask' },
  { id: 'you', label: 'You' },
];

/* ----------------------------------------------------------------------------------------
 * Fade. One surface becomes the next. The outgoing surface leaves the tree only after its
 * opacity has reached zero, so two surfaces are never both fully visible.
 * -------------------------------------------------------------------------------------- */

function Fade({ id, children }: { id: string; children: React.ReactNode }) {
  const [shown, setShown] = useState<{ id: string; node: React.ReactNode }>({ id, node: children });
  const opacity = useSharedValue(1);
  const pending = useRef<{ id: string; node: React.ReactNode } | null>(null);

  useEffect(() => {
    if (id === shown.id) { setShown({ id, node: children }); return; }
    pending.current = { id, node: children };
    opacity.value = fade(0);
    const t = setTimeout(() => {
      if (pending.current) { setShown(pending.current); pending.current = null; }
      opacity.value = fade(1);
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, children]);

  const a = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.fill, a]}>{shown.node}</Animated.View>;
}

/* ----------------------------------------------------------------------------------------
 * Places. The three destinations stay mounted and stacked; the capsule chooses which one is
 * opaque. Coming back to a place therefore finds it exactly as it was left, scrolled and
 * loaded, instead of a blank page reading the ledger again.
 * -------------------------------------------------------------------------------------- */

function Layer({ active, children }: { active: boolean; children: React.ReactNode }) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => { opacity.value = fade(active ? 1 : 0); }, [active, opacity]);
  const a = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, a]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  );
}

/* ----------------------------------------------------------------------------------------
 * The capsule. Three words and an underline that moves on the spring.
 * -------------------------------------------------------------------------------------- */

function Capsule({ place, onChange }: { place: Place; onChange: (p: Place) => void }) {
  const [boxes, setBoxes] = useState<Record<Place, { x: number; w: number } | undefined>>({ month: undefined, ledger: undefined, ask: undefined, you: undefined });
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  useEffect(() => {
    const b = boxes[place];
    if (!b) return;
    x.value = spring(b.x);
    w.value = w.value === 0 ? b.w : spring(b.w);
  }, [place, boxes, x, w]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));
  return (
    <View style={styles.capsuleRow} pointerEvents="box-none">
    <Glass style={styles.capsule}>
      {PLACES.map((p) => (
        <Press
          key={p.id}
          onPress={() => onChange(p.id)}
          accessibilityLabel={p.label}
          accessibilityState={{ selected: place === p.id }}
          onLayout={(e: LayoutChangeEvent) => {
            const { x: px, width } = e.nativeEvent.layout;
            setBoxes((all) => (all[p.id]?.x === px && all[p.id]?.w === width ? all : { ...all, [p.id]: { x: px, w: width } }));
          }}
        >
          <CapsuleWord label={p.label} on={place === p.id} />
        </Press>
      ))}
      <Animated.View style={[styles.capsuleLine, line]} />
    </Glass>
    </View>
  );
}

/* The word's ink follows the underline instead of snapping a frame ahead of it: two copies of
   the word, quiet under bright, and the bright one fades on the same fade the app uses for
   everything else. Same glyphs, same box, so nothing reflows. */
function CapsuleWord({ label, on }: { label: string; on: boolean }) {
  const bright = useSharedValue(on ? 1 : 0);
  useEffect(() => { bright.value = fade(on ? 1 : 0); }, [on, bright]);
  const a = useAnimatedStyle(() => ({ opacity: bright.value }));
  return (
    <View style={styles.capsuleItem}>
      <Micro quiet>{label}</Micro>
      <Animated.View style={[StyleSheet.absoluteFill, styles.capsuleItem, a]} pointerEvents="none">
        <Micro style={styles.capsuleOn}>{label}</Micro>
      </Animated.View>
    </View>
  );
}

/* ----------------------------------------------------------------------------------------
 * The app.
 * -------------------------------------------------------------------------------------- */

function Shell() {
  const insets = useSafeAreaInsets();
  const { token, user, isLoading, loginWithGoogle, logout } = useAuth();
  const [setup, setSetup] = useState<Setup>('checking');
  const [place, setPlace] = useState<Place>('month');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [questionCount, setQuestionCount] = useState(0);

  /* Where a signed-in person should land, decided from what the ledger knows about them. */
  const decide = useCallback(async () => {
    try {
      /* A network that never answers must not hold the paper blank: each read gets a deadline
         and falls back to what an empty ledger would say. */
      const within = <T,>(p: Promise<T>, fallback: T) =>
        Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), 6000))]).catch(() => fallback);
      const [accounts, questions, bankSkipped, phoneSeen] = await Promise.all([
        within(moneyApi.accounts(), [] as Awaited<ReturnType<typeof moneyApi.accounts>>),
        within(moneyApi.questions(), { opening: [], fromLedger: [], answered: 0 } as Awaited<ReturnType<typeof moneyApi.questions>>),
        SecureStore.getItemAsync(BANK_SKIPPED),
        SecureStore.getItemAsync(PHONE_SEEN),
      ]);
      setQuestionCount(questions.opening.length + questions.fromLedger.length);
      if (!accounts.length && !bankSkipped) { setSetup('bank'); return; }
      if (!phoneSeen) { setSetup('phone'); return; }
      if (questions.opening.length) { setSetup('questions'); return; }
      setSetup('done');
    } catch {
      setSetup('done');
    }
  }, []);

  useEffect(() => {
    if (!token) { setSetup('checking'); return; }
    NotifListenerBg.setAuthToken(token);
    ensureCaptureKey().catch(() => {});
    void decide();
  }, [token, decide]);

  const onRequestLink = useCallback((email: string) => requestMagicLink(email), []);

  /* Development only: the simulator has no hands, so the shell can be steered from outside.
     twinme://dev/place?p=ledger (p=ask opens the chat), twinme://dev/sheet?s=phone (or none), twinme://dev/setup?s=bank,
     and twinme://dev/tour, which walks the three places and a sheet for a frame-by-frame recording.
     Compiled out of release builds. */
  useEffect(() => {
    if (!__DEV__) return;
    const query = (raw: string | undefined) =>
      Object.fromEntries((raw ?? '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]));
    const steer = (url: string) => {
      const m = url.match(/^twinme:\/\/dev\/(\w+)(?:\?(.*))?$/);
      if (!m) return;
      const q = query(m[2]);
      if (m[1] === 'place') setPlace(q.p as Place);
      else if (m[1] === 'sheet') setSheet((q.s && q.s !== 'none' ? q.s : null) as Sheet);
      else if (m[1] === 'setup') setSetup(q.s as Setup);
      else if (m[1] === 'signout') void logout();
      else if (m[1] === 'say') DeviceEventEmitter.emit('dev:say', q.t || '');
      else if (m[1] === 'trace') DeviceEventEmitter.emit('dev:trace');
      else if (m[1] === 'press') DeviceEventEmitter.emit('dev:press', q.l || '');
      else if (m[1] === 'google') void loginWithGoogle();
      else if (m[1] === 'tour') {
        const beat = Number(q.ms) || 1400;
        const steps: Array<() => void> = [
          () => setPlace('month'), () => setPlace('ledger'), () => setPlace('ask'),
          () => setPlace('you'), () => setPlace('month'),
        ];
        steps.forEach((step, i) => setTimeout(step, i * beat));
      }
    };
    const sub = Linking.addEventListener('url', (e) => steer(e.url));
    return () => sub.remove();
  }, []);

  const surfaceId = useMemo(() => {
    if (!token || !user) return 'door';
    if (setup !== 'done') return `setup:${setup}`;
    return sheet ? `sheet:${sheet}` : 'places';
  }, [token, user, setup, sheet]);

  if (isLoading) {
    return <View style={styles.fill} />;
  }

  let surface: React.ReactNode;
  if (!token || !user) {
    surface = <FrontDoorScreen onGoogle={loginWithGoogle} onRequestLink={onRequestLink} />;
  } else if (setup === 'checking') {
    surface = <View style={styles.fill} />;
  } else if (setup === 'bank') {
    surface = (
      <BankScreen
        onDone={() => { void decide(); }}
        onSkip={async () => { await SecureStore.setItemAsync(BANK_SKIPPED, '1'); void decide(); }}
      />
    );
  } else if (setup === 'phone') {
    surface = (
      <StepFrame onNext={async () => { await SecureStore.setItemAsync(PHONE_SEEN, '1'); void decide(); }}>
        <PhoneCaptureScreen />
      </StepFrame>
    );
  } else if (setup === 'questions') {
    surface = <ChatScreen mode="onboarding" onDone={() => { void decide(); }} />;
  } else if (sheet === 'phone') {
    surface = <StepFrame onNext={() => setSheet(null)} nextLabel="Done"><PhoneCaptureScreen /></StepFrame>;
  } else if (sheet === 'bank') {
    surface = <BankScreen onDone={() => { setSheet(null); void decide(); }} onSkip={() => setSheet(null)} />;
  } else {
    surface = (
      <View style={styles.fill}>
        <View style={styles.fill}>
          <Layer active={place === 'month'}>
            <MonthScreen questionCount={questionCount} onOpenQuestions={() => setPlace('ask')} onOpenLedger={() => setPlace('ledger')} />
          </Layer>
          <Layer active={place === 'ledger'}>
            <LedgerScreen />
          </Layer>
          {/* The conversation is a place, not a sheet over one. Kept mounted like the others,
              so leaving it and coming back finds the transcript where it was, and so opening
              it does not throw the month away and read the ledger again. */}
          <Layer active={place === 'ask'}>
            <ChatScreen mode="ask" />
          </Layer>
          <Layer active={place === 'you'}>
            <YouScreen
              user={user}
              onSignOut={() => { void logout(); }}
              onOpenPhone={() => setSheet('phone')}
              onOpenBank={() => setSheet('bank')}
              onOpenQuestions={() => setPlace('ask')}
            />
          </Layer>
        </View>
        {/* The chrome floats: content scrolls beneath the capsule and the door, and both are
            glass, so what is beneath shows through the way it does under the system's bars. */}
        <Capsule place={place} onChange={setPlace} />
        {/* The door is a way in, so it is not there once you are inside: the conversation has
            a field of its own, and two of them on one screen is one too many. */}
        {place === 'ask' ? null : (
          <View style={[styles.askBar, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : cosmos.space.md }]} pointerEvents="box-none">
            <PromptButton label="Ask about your money" onPress={() => setPlace('ask')} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: Platform.OS === 'ios' ? 0 : insets.bottom }]}>
      <Fade id={surfaceId}>{surface}</Fade>
    </View>
  );
}

/** A setup step that is a screen of its own plus one pill to move on. The screen names
 *  itself in its own header, so the footer says nothing twice: a hairline, then the pill. */
function StepFrame({ children, onNext, nextLabel = 'Continue' }: { children: React.ReactNode; onNext: () => void; nextLabel?: string }) {
  return (
    <View style={styles.fill}>
      <View style={styles.fill}>{children}</View>
      <View style={styles.stepFoot}>
        <Pill label={nextLabel} onPress={onNext} />
      </View>
    </View>
  );
}

export default function App() {
  /* Two weights, because 500 is the ceiling: a font nobody can reach for is a rule
     that cannot be broken by accident, and it is one less file to fetch at launch. */
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium });
  if (!fontsLoaded) {
    return <View style={styles.fill} />;
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={cosmos.color.canvas} />
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: cosmos.color.canvas },
  askBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: cosmos.space.lg },
  capsuleRow: { position: 'absolute', top: cosmos.space.sm, left: 0, right: 0, alignItems: 'center' },
  capsule: {
    flexDirection: 'row', alignItems: 'center', gap: cosmos.space.md,
    paddingHorizontal: cosmos.space.md, height: cosmos.chrome.capsule - cosmos.space.sm, position: 'relative',
  },
  capsuleItem: { paddingVertical: 12, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' },
  capsuleOn: { color: cosmos.color.ink, fontFamily: cosmos.font.medium },
  capsuleLine: { position: 'absolute', left: 0, bottom: 8, height: StyleSheet.hairlineWidth * 2, backgroundColor: cosmos.color.ink },
  stepFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: cosmos.space.lg, paddingVertical: cosmos.space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cosmos.color.rule,
  },
});
