/**
 * Teaching the phone to send a payment the moment it happens.
 * ===========================================================
 * The bank's open banking feed carries booked rows one to three days late, so the phone is
 * the only way to see today. How the phone does that differs by platform, and the difference
 * is not a matter of effort:
 *
 * On Android an app may read other apps' notifications, with permission, so this is one
 * switch and then nothing to think about again. TwinMe's listener watches the bank, sees the
 * payment and sends it on.
 *
 * On iOS no app may read another app's notifications. There is no permission to request and
 * no private way worth taking. What iOS does offer is Shortcuts: an automation the person
 * builds once, which fires on an Apple Pay transaction and posts it here. That covers card
 * payments made with the phone or watch and nothing else, and this screen says so rather
 * than implying the two platforms are equal.
 *
 * Either way the person leaves with something working, and on iOS they can always add a
 * payment by hand, which is two taps and beats a system that quietly sees nothing.
 */

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Linking, ActivityIndicator } from 'react-native';
import { cosmos } from '../constants/cosmos';

/* The mono style is written out rather than spread from the token file: its `fontVariant`
   is a const-asserted tuple, and StyleSheet.create rejects a readonly array without a cast
   at every use site. Copying the three properties once is cheaper than casting five times. */
const MONO = {
  fontFamily: cosmos.font.regular,
  fontSize: cosmos.size.micro,
  letterSpacing: cosmos.tracking.mono,
  textTransform: 'uppercase' as const,
  color: cosmos.color.ink3,
};
import { NotificationListenerModule } from '../native/NotificationListenerModule';
import { ensureCaptureKey, pendingCaptures } from '../services/captureKey';
import { API_URL } from '../constants';

const CAPTURE_URL = `${API_URL}/money/capture`;

/** The Shortcuts recipe, in the order a person taps it. */
const IOS_STEPS = [
  'Open Shortcuts, go to Automation, and add a new one.',
  'Choose Transaction as the trigger, pick your Santander card, and set it to run immediately without asking.',
  'Add the action Get Contents of URL, and paste the address below.',
  'Set the method to POST, add a header X-TwinMe-Key with the key below, and send a JSON body with the merchant, the amount and the date from the transaction.',
];

const ANDROID_STEPS = [
  'Grant notification access, which is the switch below.',
  'Nothing else. The moment your bank tells you about a payment, this sees it and sends it on.',
];

export default function PhoneCaptureScreen() {
  const isAndroid = Platform.OS === 'android';
  const [key, setKey] = useState<string | null>(null);
  const [minting, setMinting] = useState(true);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let alive = true;
    ensureCaptureKey()
      .then((k) => { if (alive) setKey(k); })
      .finally(() => { if (alive) setMinting(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isAndroid) return;
    const module = NotificationListenerModule;
    if (!module) return;
    const check = () => {
      try {
        setGranted(module.hasNotificationPermission());
        setWaiting(pendingCaptures());
      } catch { setGranted(null); }
    };
    check();
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [isAndroid]);

  const askForAccess = () => {
    try { NotificationListenerModule?.requestNotificationPermission(); } catch { /* the screen still explains it */ }
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Text style={s.kicker}>Your phone</Text>
      <Text style={s.title}>Seeing a payment{'\n'}the moment it happens.</Text>
      <Text style={s.lede}>
        The bank posts a payment one to three days after you make it. Your phone knows straight
        away, and this is how it tells the ledger.
      </Text>

      {isAndroid ? (
        <View style={s.block}>
          <Text style={s.heading}>One switch</Text>
          {ANDROID_STEPS.map((step, i) => (
            <View key={step} style={s.step}>
              <Text style={s.stepNumber}>{i + 1}</Text>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}

          {granted === true ? (
            <View style={s.state}>
              <Text style={s.stateGood}>Notification access is on.</Text>
              <Text style={s.stateNote}>
                {waiting > 0
                  ? `${waiting} ${waiting === 1 ? 'payment is' : 'payments are'} waiting to be sent, and will go with the next one.`
                  : 'Nothing is waiting. Every payment your bank has announced has been sent.'}
              </Text>
            </View>
          ) : (
            <Pressable style={s.pill} onPress={askForAccess} accessibilityRole="button">
              <Text style={s.pillText}>Grant notification access</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={s.block}>
          <Text style={s.heading}>Four steps, once</Text>
          <Text style={s.plain}>
            An iPhone does not let one app read another app's notifications, so this is built in
            Shortcuts instead. It catches what you pay for with Apple Pay on the phone or the
            watch. Anything else reaches the ledger from the bank, a day or two later.
          </Text>
          {IOS_STEPS.map((step, i) => (
            <View key={step} style={s.step}>
              <Text style={s.stepNumber}>{i + 1}</Text>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
          <Pressable
            style={s.pillGhost}
            onPress={() => Linking.openURL('shortcuts://').catch(() => Linking.openURL('https://apps.apple.com/app/shortcuts/id915249334'))}
            accessibilityRole="button"
          >
            <Text style={s.pillGhostText}>Open Shortcuts</Text>
          </Pressable>
        </View>
      )}

      <View style={s.block}>
        <Text style={s.heading}>{isAndroid ? 'What it sends with' : 'The address and the key'}</Text>
        <Text style={s.fieldLabel}>Address</Text>
        <Text selectable style={s.code}>{CAPTURE_URL}</Text>
        <Text style={s.fieldLabel}>Key</Text>
        {minting ? (
          <ActivityIndicator color={cosmos.color.ink3} style={s.spinner} />
        ) : key ? (
          <Text selectable style={s.code}>{key}</Text>
        ) : (
          <Text style={s.plain}>
            No key yet. It is made the first time this screen opens with a connection; pull back
            and open it again.
          </Text>
        )}
        <Text style={s.footnote}>
          The key is shown here and nowhere else. It only lets a payment be added to your ledger,
          nothing else, and you can revoke it without changing your password.
        </Text>
      </View>

      <Text style={s.close}>
        Amounts and names of shops, never the contents of a message. Remove this and everything
        read through it goes with it.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: cosmos.color.canvas },
  content: { padding: cosmos.space.lg, paddingTop: cosmos.space.xl, paddingBottom: cosmos.space.xxl, gap: cosmos.space.md },
  kicker: MONO,
  title: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.title, lineHeight: cosmos.size.title * 1.12,
    letterSpacing: cosmos.tracking.title, color: cosmos.color.ink,
  },
  lede: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.body, lineHeight: cosmos.size.body * 1.45,
    letterSpacing: cosmos.tracking.body, color: cosmos.color.ink2,
  },
  block: {
    gap: cosmos.space.md, paddingTop: cosmos.space.lg, marginTop: cosmos.space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cosmos.color.rule,
  },
  heading: {
    fontFamily: cosmos.font.medium, fontSize: cosmos.size.heading, letterSpacing: cosmos.tracking.heading,
    color: cosmos.color.ink,
  },
  plain: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, lineHeight: cosmos.size.small * 1.5,
    letterSpacing: cosmos.tracking.body, color: cosmos.color.ink2,
  },
  step: { flexDirection: 'row', gap: cosmos.space.md, alignItems: 'flex-start' },
  stepNumber: { ...MONO, width: 18, paddingTop: 2 },
  stepText: {
    flex: 1, fontFamily: cosmos.font.regular, fontSize: cosmos.size.small,
    lineHeight: cosmos.size.small * 1.5, letterSpacing: cosmos.tracking.body, color: cosmos.color.ink2,
  },
  pill: {
    alignSelf: 'flex-start', backgroundColor: cosmos.color.ink, borderRadius: cosmos.radius.pill,
    paddingVertical: 13, paddingHorizontal: 22, marginTop: cosmos.space.sm,
  },
  pillText: { fontFamily: cosmos.font.medium, fontSize: cosmos.size.small, color: cosmos.color.canvas },
  pillGhost: {
    alignSelf: 'flex-start', borderRadius: cosmos.radius.pill, borderWidth: 1,
    borderColor: cosmos.color.ruleStrong, paddingVertical: 12, paddingHorizontal: 20, marginTop: cosmos.space.sm,
  },
  pillGhostText: { fontFamily: cosmos.font.medium, fontSize: cosmos.size.small, color: cosmos.color.ink },
  state: { gap: cosmos.space.xs, marginTop: cosmos.space.sm },
  stateGood: { fontFamily: cosmos.font.medium, fontSize: cosmos.size.body, color: cosmos.color.ink, letterSpacing: cosmos.tracking.body },
  stateNote: { fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, color: cosmos.color.ink2, lineHeight: cosmos.size.small * 1.45 },
  fieldLabel: { ...MONO, marginTop: cosmos.space.sm },
  code: {
    fontFamily: cosmos.font.mono, fontSize: cosmos.size.small, color: cosmos.color.ink,
    backgroundColor: cosmos.color.card, borderRadius: cosmos.radius.field, padding: cosmos.space.md,
  },
  spinner: { alignSelf: 'flex-start', marginVertical: cosmos.space.sm },
  footnote: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, lineHeight: cosmos.size.small * 1.45,
    color: cosmos.color.ink3, marginTop: cosmos.space.xs,
  },
  close: {
    fontFamily: cosmos.font.regular, fontSize: cosmos.size.small, lineHeight: cosmos.size.small * 1.45,
    color: cosmos.color.ink3, marginTop: cosmos.space.lg,
  },
});
