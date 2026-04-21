/**
 * ConnectBankButton — Financial-Emotional Twin, Phase 3.2
 * =========================================================
 * Opens the Pluggy Connect widget to link a BR bank via Open Finance.
 * On success, the widget returns a Pluggy item id which the server already
 * received via webhook (item/created + transactions/created). We poll
 * /connections briefly to show the user their bank has connected, then
 * refresh the parent Money page.
 */

import React, { useState, useCallback } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { Wallet, Loader2, Globe } from 'lucide-react';
import { getPluggyConnectToken, getTrueLayerAuthUrl } from '@/services/api/transactionsAPI';

interface Props {
  onConnected?: (itemId: string) => void;
}

export function ConnectBankButton({ onConnected }: Props) {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openWidget = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPluggyConnectToken();
      if (!res.success || !res.connectToken) {
        setError(res.error || 'Não foi possível iniciar a conexão bancária');
        return;
      }
      setEnvironment(res.environment || 'sandbox');
      setConnectToken(res.connectToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSuccess = useCallback(
    (itemData: { item?: { id?: string } }) => {
      setConnectToken(null);
      if (itemData?.item?.id) {
        onConnected?.(itemData.item.id);
      }
    },
    [onConnected],
  );

  const handleExit = useCallback(() => {
    setConnectToken(null);
  }, []);

  const openTrueLayer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTrueLayerAuthUrl();
      if (!res.success || !res.authUrl) {
        setError(res.error || 'Não foi possível iniciar a conexão EU/UK');
        return;
      }
      // Full-page redirect: TrueLayer's consent page is not widget-embeddable.
      window.location.assign(res.authUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
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
        {loading ? 'Preparando…' : 'Conectar banco BR'}
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
        {loading ? 'Preparando…' : 'Conectar banco EU/UK'}
      </button>

      {error && (
        <div
          className="mt-2 text-xs"
          style={{ color: 'rgba(239, 68, 68, 0.9)', fontFamily: "'Geist', 'Inter', sans-serif" }}
        >
          {error}
        </div>
      )}

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={environment === 'sandbox'}
          onSuccess={handleSuccess}
          onError={(err) => {
            setError(err?.message || 'Falha na conexão com o banco');
            setConnectToken(null);
          }}
          onClose={handleExit}
        />
      )}
    </>
  );
}
