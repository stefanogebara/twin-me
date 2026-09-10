/**
 * The front door.
 * ===============
 * The first thing a student sees: one sentence about their money, one black pill, and an
 * email field with a ghost pill under it. No password, because a student has a phone, not
 * a password manager. The link the server emails opens as twinme://auth?auth_code=... and
 * the listener in useAuth finishes the sign-in, so this screen only has to ask for it.
 *
 * Everything on the page enters on the one motion family, in order, top to bottom.
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cosmos } from '../constants/cosmos';
import { Display, Enter, Micro, Page, Pill, Small } from '../ui/primitives';

export interface FrontDoorScreenProps {
  onGoogle: () => Promise<void>;
  onRequestLink: (email: string) => Promise<void>;
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function FrontDoorScreen({ onGoogle, onRequestLink }: FrontDoorScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'link' | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const google = useCallback(async () => {
    if (busy) return;
    setBusy('google');
    setNote(null);
    try {
      await onGoogle();
    } catch (err) {
      /* Closing the sheet is a decision, not a failure, so it earns no sentence. */
      const cancelled = err instanceof Error && /cancel/i.test(err.message);
      if (!cancelled) setNote('Google did not finish signing you in. Try again, or use the email link.');
    } finally {
      setBusy(null);
    }
  }, [busy, onGoogle]);

  const requestLink = useCallback(async () => {
    if (busy) return;
    const address = email.trim().toLowerCase();
    if (!looksLikeEmail(address)) {
      setNote('That does not look like an email address.');
      return;
    }
    setBusy('link');
    setNote(null);
    try {
      await onRequestLink(address);
      setSentTo(address);
    } catch {
      setNote('The link could not be sent. Check the address and try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, email, onRequestLink]);

  return (
    <Page>
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <View style={[s.column, { paddingTop: insets.top + cosmos.space.xxl, paddingBottom: insets.bottom + cosmos.space.lg }]}>
          <View style={s.headline}>
            <Enter index={0}>
              <Display accessibilityRole="header">{'Your money,\nread to you.'}</Display>
            </Enter>
            <Enter index={1}>
              <Small muted style={s.sub}>
                For students in Spain. It reads your bank account and says, in plain words, what the month is doing.
              </Small>
            </Enter>
          </View>

          <View style={s.controls}>
            <Enter index={2}>
              <Pill label="Continue with Google" onPress={google} disabled={busy !== null} />
            </Enter>

            {sentTo ? (
              <Enter index={3}>
                <Small muted style={s.sent}>
                  A sign-in link is on its way to {sentTo}. Open it on this phone and you will be signed in.
                </Small>
              </Enter>
            ) : (
              <>
                <Enter index={3}>
                  <TextInput
                    value={email}
                    onChangeText={(v) => { setEmail(v); if (note) setNote(null); }}
                    onSubmitEditing={requestLink}
                    placeholder="Email address"
                    placeholderTextColor={cosmos.color.ink3}
                    accessibilityLabel="Email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    editable={busy === null}
                    style={s.field}
                  />
                </Enter>
                <Enter index={4}>
                  <Pill label="Email me a link" ghost onPress={requestLink} disabled={busy !== null} />
                </Enter>
              </>
            )}

            {note ? (
              <Small muted accessibilityLiveRegion="polite" style={s.note}>{note}</Small>
            ) : null}
          </View>

          <Enter index={5} style={s.footer}>
            <Micro quiet>Private beta. No card details are ever stored.</Micro>
          </Enter>
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  column: { flex: 1, paddingHorizontal: cosmos.space.lg },
  /* The headline rests in the room above the controls rather than clinging to the top edge:
     centred in what is left, then lifted a little, so the paper around it reads as chosen. */
  headline: { flex: 1, justifyContent: 'center', gap: cosmos.space.md, paddingBottom: cosmos.space.xl },
  sub: { maxWidth: 320 },
  controls: { gap: cosmos.space.md },
  /* A field is a hairline box in the body type: the primitives have no input, so this is
     the one thing composed here, from the same tokens and nothing else. */
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: cosmos.color.ruleStrong,
    borderRadius: cosmos.radius.field,
    paddingHorizontal: cosmos.space.md,
    paddingVertical: 12,
    fontFamily: cosmos.font.regular,
    fontSize: cosmos.size.body,
    letterSpacing: cosmos.tracking.body,
    color: cosmos.color.ink,
    backgroundColor: cosmos.color.canvas,
  },
  sent: { paddingTop: cosmos.space.sm },
  note: { paddingTop: cosmos.space.xs },
  footer: { paddingTop: cosmos.space.xl },
});
