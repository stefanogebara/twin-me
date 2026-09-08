/**
 * The bank.
 * =========
 * Santander, through Enable Banking, in a browser sheet. The server starts the PSD2
 * authorisation and hands back a URL; the sheet opens it; the bank sends the person back
 * to twinme://bank; the app then asks the server which accounts it can now read. The
 * person never sees a URL or an identifier, only a sentence for each state.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { cosmos, dayMonth } from '../constants/cosmos';
import { authFetch } from '../services/api';
import { Body, Enter, Hairline, Page, Pill, Row, Small, Title } from '../ui/primitives';

export interface BankScreenProps {
  onDone: () => void;
  onSkip: () => void;
}

interface BankAccount {
  id: string;
  name: string | null;
  iban_mask: string | null;
  consent_expires_at: string | null;
}

type Phase =
  | { kind: 'idle'; failed: boolean }
  | { kind: 'atBank' }
  | { kind: 'connected'; accounts: BankAccount[] };

const RETURN_URL = 'twinme://bank';
const FAILED = 'The bank did not answer. Try again in a moment.';

async function startAuthorisation(): Promise<string | null> {
  const res = await authFetch('/money/bank/connect', {
    method: 'POST',
    body: JSON.stringify({ bank: 'Banco Santander', country: 'ES' }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { url?: string } } | null;
  const url = json?.data?.url;
  return json?.success && typeof url === 'string' && url.length > 0 ? url : null;
}

async function listAccounts(): Promise<BankAccount[]> {
  const res = await authFetch('/money/bank/accounts');
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: BankAccount[] } | null;
  return Array.isArray(json?.data) ? json.data : [];
}

/* The mask arrives as "ES12 **** 3456"; the lead column is narrow, so it shows the part a
   person actually recognises, the last four. */
const ending = (mask: string | null) => (mask ? mask.replace(/[^0-9A-Za-z]/g, '').slice(-4) : undefined);

export default function BankScreen({ onDone, onSkip }: BankScreenProps) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle', failed: false });

  const connect = useCallback(async () => {
    setPhase({ kind: 'atBank' });
    try {
      const url = await startAuthorisation();
      if (!url) { setPhase({ kind: 'idle', failed: true }); return; }
      const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      const accounts = await listAccounts();
      if (accounts.length > 0) { setPhase({ kind: 'connected', accounts }); return; }
      /* Coming back without an account is a failure only if the bank claimed to finish.
         Closing the sheet is a decision, and earns no sentence. */
      setPhase({ kind: 'idle', failed: result.type === 'success' });
    } catch {
      setPhase({ kind: 'idle', failed: true });
    }
  }, []);

  const frame = [s.column, { paddingTop: insets.top + cosmos.space.xxl, paddingBottom: insets.bottom + cosmos.space.lg }];

  if (phase.kind === 'atBank') {
    return (
      <Page>
        <View style={frame}>
          <Enter index={0}>
            <Body muted accessibilityLiveRegion="polite">Finishing at the bank.</Body>
          </Enter>
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <View style={frame}>
        <View style={s.headline}>
          <Enter index={0}>
            <Title accessibilityRole="header">Connect your bank.</Title>
          </Enter>
          <Enter index={1}>
            <Body muted>
              Your account is read four times a day, and you confirm the connection once every six months. Nothing can be moved, only read.
            </Body>
          </Enter>
        </View>

        {phase.kind === 'connected' ? (
          <View style={s.controls}>
            <Enter index={2}>
              <Hairline />
              {phase.accounts.map((a) => {
                const until = dayMonth(a.consent_expires_at);
                return (
                  <React.Fragment key={a.id}>
                    <Row
                      lead={ending(a.iban_mask)}
                      label={a.name || 'Santander'}
                      sub={until ? `Confirm again by ${until}.` : undefined}
                    />
                    <Hairline />
                  </React.Fragment>
                );
              })}
            </Enter>
            <Enter index={3}>
              <Pill label="Continue" onPress={onDone} />
            </Enter>
          </View>
        ) : (
          <View style={s.controls}>
            <Enter index={2}>
              <Pill label="Connect Santander" onPress={connect} />
            </Enter>
            <Enter index={3}>
              <Pill label="Not now" ghost onPress={onSkip} />
            </Enter>
            {phase.failed ? (
              <Small muted accessibilityLiveRegion="polite" style={s.note}>{FAILED}</Small>
            ) : null}
          </View>
        )}
      </View>
    </Page>
  );
}

const s = StyleSheet.create({
  column: { flex: 1, paddingHorizontal: cosmos.space.lg },
  /* Same composition as the front door: the words rest in the room above the controls. */
  headline: { flex: 1, justifyContent: 'center', gap: cosmos.space.md, paddingBottom: cosmos.space.xl },
  controls: { gap: cosmos.space.md },
  note: { paddingTop: cosmos.space.xs },
});
