/**
 * BrokerageHoldingsCard — Financial-Emotional Twin, Phase 4.1 (US coverage)
 * ==========================================================================
 * Investment portfolio snapshot, aggregated across every Plaid item the
 * user has linked. Displays positions with ticker, quantity, value, and
 * unrealized gain/loss.
 *
 * Empty state: when no holdings are returned (either no Plaid connection
 * yet, or the linked institution doesn't support the 'investments' product,
 * or the user only linked a checking account) we render a one-line CTA so
 * the surface still teaches the user what's possible — and pairs the value
 * prop against ChatGPT Personal Finance's spending-only dashboard.
 *
 * Sun-driven theme + glass surface to match the rest of the app. Stays
 * silent if Plaid isn't configured (the connect button below already
 * shows the "Plaid not configured" hint, so we'd just be repeating it).
 */

import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Loader2, Briefcase, AlertCircle, RefreshCw } from 'lucide-react';
import { getPlaidHoldings, type PlaidHolding, type PlaidHoldingsResponse } from '@/services/api/transactionsAPI';

interface Props {
  /**
   * Bump this when the parent wants the card to re-fetch (e.g. after a
   * fresh Plaid Link / disconnect). Mirrors the same pattern as
   * BankConnectionsList.
   */
  refreshNonce?: number;
}

function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(2)}%`;
}

const HoldingRow: React.FC<{ h: PlaidHolding }> = ({ h }) => {
  const positive = h.gainLoss >= 0;
  return (
    <div
      data-testid="brokerage-holding-row"
      className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="col-span-4 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
          {h.ticker || h.name}
        </div>
        <div className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {h.ticker ? h.name : ''}{h.ticker && h.institutionName ? ' · ' : ''}{h.institutionName}
        </div>
      </div>

      <div className="col-span-2 text-right text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {h.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </div>

      <div className="col-span-3 text-right text-sm tabular-nums" style={{ color: 'var(--foreground)' }}>
        {fmtCurrency(h.value, h.currency)}
      </div>

      <div className="col-span-3 text-right text-sm tabular-nums">
        <span style={{ color: positive ? 'rgba(134, 239, 172, 0.95)' : 'rgba(248, 113, 113, 0.95)' }}>
          {h.costBasis > 0 ? (
            <>
              {positive ? '+' : ''}{fmtCurrency(h.gainLoss, h.currency)}
              <span className="ml-1 text-[11px] opacity-70">{fmtPct(h.gainLossPct)}</span>
            </>
          ) : (
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>cost basis n/a</span>
          )}
        </span>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ itemsScanned: number; itemsWithError: number; onRefresh: () => void; loading: boolean }> = ({
  itemsScanned, itemsWithError, onRefresh, loading,
}) => {
  const text = itemsScanned === 0
    ? 'Connect a US brokerage (Schwab, Fidelity, Robinhood, Vanguard, …) to see your portfolio here. ChatGPT shows you what you spent; we show you why — including which investment moves followed a Whoop recovery dip.'
    : itemsWithError > 0
      ? `Plaid returned no holdings (${itemsWithError} item${itemsWithError > 1 ? 's' : ''} skipped — likely a checking-only or non-brokerage account). Link a brokerage to see positions here.`
      : 'No holdings yet on this connection. If you just linked, Plaid may still be backfilling — try Refresh in a minute.';

  return (
    <div
      data-testid="brokerage-empty-state"
      className="flex items-start justify-between gap-3 px-4 py-3.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-sm flex-1" style={{ color: 'rgba(255,255,255,0.65)' }}>{text}</p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        data-testid="brokerage-refresh-btn"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.06)',
          color: 'var(--foreground)',
          border: '1px solid rgba(255,255,255,0.10)',
          fontFamily: "'Geist', 'Inter', sans-serif",
        }}
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
};

export const BrokerageHoldingsCard: React.FC<Props> = ({ refreshNonce = 0 }) => {
  const [data, setData] = useState<PlaidHoldingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPlaidHoldings();
      if (!result.success && result.code === 'PLAID_NOT_CONFIGURED') {
        // Stay silent — the connect button below already shows this hint.
        setData(null);
        return;
      }
      if (!result.success) {
        setError(result.error || 'Failed to load holdings');
        setData(null);
        return;
      }
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshNonce]);

  // Hide entirely when Plaid is not configured. Connect button below covers
  // the actionable hint; we don't need to repeat ourselves.
  if (!loading && !data && !error) return null;

  const showEmpty = !data || data.holdings.length === 0;

  return (
    <div className="mb-6" data-testid="brokerage-holdings-card">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-1 h-5 rounded-full"
          style={{ background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(255,255,255,0.10))' }}
        />
        <Briefcase className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Brokerage holdings
        </h3>
        {data && data.holdings.length > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: 'var(--glass-surface-bg)', color: 'rgba(255,255,255,0.4)' }}
            data-testid="brokerage-positions-count"
          >
            {data.holdings.length}
          </span>
        )}
      </div>

      {loading && !data && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading holdings…
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
          style={{ background: 'rgba(239, 68, 68, 0.10)', color: 'rgba(252, 165, 165, 0.95)' }}
          data-testid="brokerage-error"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary strip */}
          {data.holdings.length > 0 && (
            <div
              className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3 rounded-lg mb-2"
              style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)' }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Portfolio value
                </div>
                <div className="text-lg tabular-nums" style={{ color: 'var(--foreground)' }}>
                  {fmtCurrency(data.totalValue, data.currency)}
                </div>
              </div>
              {data.totalCost > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Total P&L
                  </div>
                  <div className="text-lg tabular-nums flex items-center gap-1">
                    {data.totalGainLoss >= 0 ? (
                      <TrendingUp className="w-4 h-4" style={{ color: 'rgba(134, 239, 172, 0.95)' }} />
                    ) : (
                      <TrendingDown className="w-4 h-4" style={{ color: 'rgba(248, 113, 113, 0.95)' }} />
                    )}
                    <span style={{ color: data.totalGainLoss >= 0 ? 'rgba(134, 239, 172, 0.95)' : 'rgba(248, 113, 113, 0.95)' }}>
                      {data.totalGainLoss >= 0 ? '+' : ''}{fmtCurrency(data.totalGainLoss, data.currency)}
                      <span className="ml-1 text-xs opacity-70">{fmtPct(data.totalCost > 0 ? data.totalGainLoss / data.totalCost : 0)}</span>
                    </span>
                  </div>
                </div>
              )}
              <div className="ml-auto text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {data.itemsScanned} brokerage{data.itemsScanned === 1 ? '' : 's'}
                {data.itemsWithError > 0 && ` · ${data.itemsWithError} no investments`}
              </div>
            </div>
          )}

          {showEmpty ? (
            <EmptyState
              itemsScanned={data.itemsScanned}
              itemsWithError={data.itemsWithError}
              onRefresh={load}
              loading={loading}
            />
          ) : (
            <>
              {/* Column header */}
              <div className="grid grid-cols-12 gap-2 px-4 pb-1 text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <div className="col-span-4">Position</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-3 text-right">Value</div>
                <div className="col-span-3 text-right">Gain/Loss</div>
              </div>
              <div className="space-y-1">
                {data.holdings.map((h, i) => (
                  <HoldingRow key={`${h.accountId}-${h.ticker || h.name}-${i}`} h={h} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default BrokerageHoldingsCard;
