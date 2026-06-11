/**
 * ConnectBankButton — Financial-Emotional Twin, Phase 3.2
 * =========================================================
 * Opens the Pluggy Connect widget to link a BR bank via Open Finance.
 * On success, the widget returns a Pluggy item id which the server already
 * received via webhook (item/created + transactions/created). We poll
 * /connections briefly to show the user their bank has connected, then
 * refresh the parent Money page.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { usePlaidLink } from 'react-plaid-link';
import { Wallet, Loader2, Globe, Building2 } from 'lucide-react';
import {
  getPluggyConnectToken,
  getTrueLayerAuthUrl,
  registerPluggyItem,
  getPlaidLinkToken,
  exchangePlaidPublicToken,
} from '@/services/api/transactionsAPI';

interface Props {
  onConnected?: (itemId: string) => void;
}

export function ConnectBankButton({ onConnected }: Props) {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plaid Link state. usePlaidLink REQUIRES a token at hook-call time, but we
  // mint the token lazily on button click — so we keep linkToken in state and
  // call open() once the hook reports ready. Pattern is from react-plaid-link's
  // README "delayed token" example.
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);

  const openWidget = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPluggyConnectToken();
      if (!res.success || !res.connectToken) {
        // audit-2026-05-08 C1: friendlier message when the integration isn't
        // configured (dev or prod-misconfig). Direct user to CSV upload below.
        if (res.code === 'PLUGGY_NOT_CONFIGURED') {
          // In dev mode the user IS the operator — surface the actionable
          // configuration step instead of the production-facing "unavailable".
          const isDev = import.meta.env?.DEV === true;
          setError(
            isDev
              ? 'Pluggy is not configured. Add PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET to .env, restart the backend, and try again. (Free account at dashboard.pluggy.ai)'
              : 'BR bank linking is temporarily unavailable. Use the CSV/OFX statement upload below in the meantime.',
          );
        } else {
          setError(res.error || 'Could not start the bank connection');
        }
        return;
      }
      setEnvironment(res.environment || 'sandbox');
      setConnectToken(res.connectToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSuccess = useCallback(
    async (itemData: { item?: { id?: string } }) => {
      setConnectToken(null);
      const itemId = itemData?.item?.id;
      if (!itemId) return;

      // Webhook-delivery fallback: register the item with our backend now
      // so the connection row exists even when Pluggy can't reach our
      // webhook URL (local dev) or misses a delivery (prod resilience).
      // Idempotent — if the webhook already arrived first, this is a no-op.
      try {
        const result = await registerPluggyItem(itemId);
        if (!result.success) {
          console.warn('[ConnectBankButton] register fallback failed (non-fatal):', result.error);
        }
      } catch (err) {
        console.warn('[ConnectBankButton] register fallback threw (non-fatal):', err);
      }

      onConnected?.(itemId);
    },
    [onConnected],
  );

  const handleExit = useCallback(() => {
    setConnectToken(null);
  }, []);

  // Plaid Link onSuccess: exchange public_token for our internal id +
  // backfill transactions on the server. Bootstrap is server-side so the
  // emotion tagger + memory dual-write fire automatically.
  const handlePlaidSuccess = useCallback(
    async (publicToken: string) => {
      setPlaidLinkToken(null);
      try {
        const result = await exchangePlaidPublicToken(publicToken);
        if (!result.success || !result.itemId) {
          setError(result.error || 'Failed to connect US account (Plaid).');
          return;
        }
        onConnected?.(result.itemId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error exchanging Plaid token');
      }
    },
    [onConnected],
  );

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: (publicToken) => { void handlePlaidSuccess(publicToken); },
    onExit: (err) => {
      if (err) {
        // Plaid LinkOnExitMetadata has a stable error_code we can map.
        const friendly: Record<string, string> = {
          INVALID_CREDENTIALS: 'Invalid credentials. Check your bank login and password.',
          ITEM_LOGIN_REQUIRED: 'Account requires authentication. Please try again.',
          INSUFFICIENT_CREDENTIALS: 'A multi-factor or authentication step was missing.',
          INVALID_MFA: 'Invalid verification code.',
          RATE_LIMIT_EXCEEDED: 'Too many attempts in a row. Wait a few minutes.',
        };
        const code = (err as { error_code?: string }).error_code || '';
        setError(friendly[code] || 'US bank connection failed. Please try again.');
      }
      setPlaidLinkToken(null);
    },
  });

  // Auto-open the drawer as soon as we have a token AND the SDK is ready.
  // The Plaid SDK loads its iframe shell async, so we have to wait. Once
  // open succeeds, plaidReady stays true until the drawer closes.
  useEffect(() => {
    if (plaidLinkToken && plaidReady) openPlaidLink();
  }, [plaidLinkToken, plaidReady, openPlaidLink]);

  const openPlaid = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Request both transactions + investments at link time so brokerage
      // accounts (Schwab, Fidelity, Robinhood) populate BrokerageHoldingsCard
      // out of the box. Plaid will simply ignore investments for institutions
      // that don't support it.
      const res = await getPlaidLinkToken({
        products: ['transactions', 'investments'],
        countryCodes: ['US'],
      });
      if (!res.success || !res.linkToken) {
        if (res.code === 'PLAID_NOT_CONFIGURED') {
          const isDev = import.meta.env?.DEV === true;
          setError(
            isDev
              ? 'Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env, restart the backend, and try again. (Free account at dashboard.plaid.com)'
              : 'US bank linking is temporarily unavailable. Use the CSV/OFX statement upload below in the meantime.',
          );
        } else {
          setError(res.error || 'Could not start the US connection');
        }
        return;
      }
      setPlaidLinkToken(res.linkToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  const openTrueLayer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTrueLayerAuthUrl();
      if (!res.success || !res.authUrl) {
        // audit-2026-05-08 C1: same pattern as Pluggy — show friendly message
        // and point user to CSV upload when TL isn't configured.
        if (res.code === 'TRUELAYER_NOT_CONFIGURED') {
          // Dev-mode actionable hint; production message kept friendly.
          const isDev = import.meta.env?.DEV === true;
          setError(
            isDev
              ? 'TrueLayer is not configured. Add TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET to .env, restart the backend, and try again.'
              : 'EU/UK bank linking is temporarily unavailable. Use the CSV/OFX statement upload below in the meantime.',
          );
        } else {
          setError(res.error || 'Could not start the EU/UK connection');
        }
        return;
      }
      // Full-page redirect: TrueLayer's consent page is not widget-embeddable.
      window.location.assign(res.authUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <>
      <button
        onClick={openWidget}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[100px] transition-colors disabled:opacity-60"
        style={{
          background: '#F5F5F4',
          color: '#110f0f',
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontWeight: 500,
          fontSize: 14,
        }}
        title="Nubank, Itaú, Santander BR, Bradesco (via Pluggy)"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Wallet className="w-4 h-4" />
        )}
        {loading ? 'Preparing…' : 'Connect BR bank'}
      </button>

      <button
        onClick={openPlaid}
        disabled={loading || !!plaidLinkToken}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[100px] transition-colors disabled:opacity-60"
        style={{
          background: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.90)',
          border: '1px solid rgba(255,255,255,0.12)',
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontWeight: 500,
          fontSize: 14,
        }}
        title="Chase, Schwab, Fidelity, Robinhood, Amex, Capital One, and 12,000+ US institutions (via Plaid)"
      >
        {loading || (plaidLinkToken && !plaidReady) ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Building2 className="w-4 h-4" />
        )}
        {loading
          ? 'Preparing…'
          : plaidLinkToken && !plaidReady
            ? 'Opening Plaid…'
            : 'Connect US bank'}
      </button>

      <button
        onClick={openTrueLayer}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[100px] transition-colors disabled:opacity-60"
        style={{
          background: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.90)',
          border: '1px solid rgba(255,255,255,0.12)',
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontWeight: 500,
          fontSize: 14,
        }}
        title="Santander Spain, Revolut, N26, Monzo, EU/UK banks (via TrueLayer)"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Globe className="w-4 h-4" />
        )}
        {loading ? 'Preparing…' : 'Connect EU/UK bank'}
      </button>

      {error && (
        <div
          className="mt-2 text-xs"
          style={{ color: 'rgba(239, 68, 68, 0.9)', fontFamily: "'Geist', 'Inter', sans-serif" }}
        >
          {error}
        </div>
      )}

      {/* Open Finance BR guidance: real Brazilian banks connect through
          MeuPluggy (Pluggy's free consumer app + regulated Open Finance
          participant). Without this hint a first-time user opens the widget,
          sees only "MeuPluggy", and has no idea what to do with it. */}
      <div
        className="mt-2 w-full text-xs leading-relaxed"
        style={{ color: 'var(--text-muted)', fontFamily: "'Geist', 'Inter', sans-serif", maxWidth: 560 }}
      >
        To connect Brazilian banks (Nubank, Itau, Santander, Bradesco and others) via Open Finance:
        create a free account at{' '}
        <a
          href="https://meu.pluggy.ai"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-narrative-secondary)', textDecoration: 'underline' }}
        >
          meu.pluggy.ai
        </a>
        , link your banks there, then click Connect BR bank and choose MeuPluggy.
        Your data flows in automatically and refreshes daily.
      </div>

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={environment === 'sandbox'}
          onSuccess={handleSuccess}
          onError={(err) => {
            const code = err?.message || '';
            const friendly: Record<string, string> = {
              TRIAL_CLIENT_ITEM_CREATE_NOT_ALLOWED:
                'Bank connection is unavailable right now. Please contact support.',
              ITEM_ALREADY_EXISTS:
                'This bank is already connected to your account.',
              INVALID_CREDENTIALS:
                'Invalid credentials. Check your bank login and password.',
              ACCOUNT_LOCKED:
                'Account locked at the bank. Unlock it in your bank app and try again.',
              CONNECTION_ERROR:
                'Connection error with the bank. Try again in a moment.',
            };
            setError(friendly[code] || 'Bank connection failed. Please try again.');
            setConnectToken(null);
          }}
          onClose={handleExit}
        />
      )}
    </>
  );
}
