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
import { View, ScrollView, StyleSheet, Platform, Linking, ActivityIndicator } from 'react-native';
import { cosmos } from '../constants/cosmos';
import { Body, Enter, Micro, Page, Pill, Section, Small, Title } from '../ui/primitives';
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

/** A numbered step: the number in the mono role, the instruction beside it. */
function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.step}>
      <Micro style={s.stepNumber}>{n}</Micro>
      <Small muted style={s.stepText}>{text}</Small>
    </View>
  );
}

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
    <Page>
      <ScrollView contentContainerStyle={s.content}>
        <Enter index={0} style={s.head}>
          <Micro>Your phone</Micro>
          <Title>Seeing a payment{'\n'}the moment it happens.</Title>
          <Body muted>
            The bank posts a payment one to three days after you make it. Your phone knows straight
            away, and this is how it tells the ledger.
          </Body>
        </Enter>

        <Enter index={1}>
          {isAndroid ? (
            <Section title="One switch">
              {ANDROID_STEPS.map((step, i) => <Step key={step} n={i + 1} text={step} />)}

              {granted === true ? (
                <View style={s.state}>
                  <Body>Notification access is on.</Body>
                  <Small muted>
                    {waiting > 0
                      ? `${waiting} ${waiting === 1 ? 'payment is' : 'payments are'} waiting to be sent, and will go with the next one.`
                      : 'Nothing is waiting. Every payment your bank has announced has been sent.'}
                  </Small>
                </View>
              ) : (
                <Pill label="Grant notification access" onPress={askForAccess} />
              )}
            </Section>
          ) : (
            <Section title="Four steps, once">
              <Small muted>
                An iPhone does not let one app read another app's notifications, so this is built in
                Shortcuts instead. It catches what you pay for with Apple Pay on the phone or the
                watch. Anything else reaches the ledger from the bank, a day or two later.
              </Small>
              {IOS_STEPS.map((step, i) => <Step key={step} n={i + 1} text={step} />)}
              <Pill
                ghost
                label="Open Shortcuts"
                onPress={() => Linking.openURL('shortcuts://').catch(() => Linking.openURL('https://apps.apple.com/app/shortcuts/id915249334'))}
              />
            </Section>
          )}
        </Enter>

        <Enter index={2}>
          <Section title={isAndroid ? 'What it sends with' : 'The address and the key'}>
            <Micro>Address</Micro>
            <Body selectable tabular style={s.code}>{CAPTURE_URL}</Body>
            <Micro style={s.fieldLabel}>Key</Micro>
            {minting ? (
              <ActivityIndicator color={cosmos.color.ink3} style={s.spinner} />
            ) : key ? (
              <Body selectable tabular style={s.code}>{key}</Body>
            ) : (
              <Small muted>
                No key yet. It is made the first time this screen opens with a connection; pull back
                and open it again.
              </Small>
            )}
            <Small quiet>
              The key is shown here and nowhere else. It only lets a payment be added to your ledger,
              nothing else, and you can revoke it without changing your password.
            </Small>
          </Section>
        </Enter>

        <Enter index={3}>
          <Small quiet style={s.close}>
            Amounts and names of shops, never the contents of a message. Remove this and everything
            read through it goes with it.
          </Small>
        </Enter>
      </ScrollView>
    </Page>
  );
}

/* Layout only. Every colour, size and curve is the primitives'. */
const s = StyleSheet.create({
  content: { padding: cosmos.space.lg, paddingTop: cosmos.space.xl, paddingBottom: cosmos.space.xxl },
  head: { gap: cosmos.space.md },
  step: { flexDirection: 'row', gap: cosmos.space.md, alignItems: 'flex-start' },
  stepNumber: { width: 18, paddingTop: 3 },
  stepText: { flex: 1 },
  state: { gap: cosmos.space.xs },
  fieldLabel: { marginTop: cosmos.space.sm },
  /* The one tinted surface on the screen, so an address and a key read as things to copy. */
  code: {
    fontSize: cosmos.size.small, lineHeight: 20,
    backgroundColor: cosmos.color.card, borderRadius: cosmos.radius.field, padding: cosmos.space.md,
  },
  spinner: { alignSelf: 'flex-start', marginVertical: cosmos.space.sm },
  close: { marginTop: cosmos.space.xl },
});
