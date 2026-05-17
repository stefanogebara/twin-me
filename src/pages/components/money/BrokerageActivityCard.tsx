/**
 * BrokerageActivityCard — Financial-Emotional Twin, Phase 4.2 (the moat)
 * =======================================================================
 * Investment events (buys / sells / dividends / fees) joined with the
 * emotional fingerprint captured by the existing Phase 2 transaction
 * emotion tagger.
 *
 * This is the surface ChatGPT Personal Finance literally cannot draw:
 * each row shows what the user did with their portfolio AND the bio /
 * mood / load signals from the same moment. "Sold $4,200 of AAPL on
 * May 5 — recovery was 38%, you had 4 calendar events that morning."
 *
 * Renders silently as null when there's no Plaid-investment activity —
 * BrokerageHoldingsCard already handles the "no brokerage linked" pitch
 * one component above this one, so we don't double up.
 */

import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Coins, AlertCircle, Activity } from 'lucide-react';
import { getPlaidInvestmentActivity, type PlaidInvestmentEvent } from '@/services/api/transactionsAPI';

interface Props {
  /** Bump to force a re-fetch (e.g. after a new Plaid link). */
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

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

// Map event-type to icon + tone. Sells = inflow (positive amount in our
// signed convention), Buys = outflow (negative amount).
function typeMeta(type: string, amount: number) {
  switch (type) {
    case 'sell':
      return { Icon: ArrowUpFromLine, label: 'Sell', color: 'rgba(134, 239, 172, 0.95)', bg: 'rgba(34, 197, 94, 0.10)' };
    case 'buy':
      return { Icon: ArrowDownToLine, label: 'Buy', color: 'rgba(248, 113, 113, 0.95)', bg: 'rgba(239, 68, 68, 0.10)' };
    case 'cash':
      return { Icon: amount >= 0 ? TrendingUp : TrendingDown, label: 'Cash', color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)' };
    case 'dividend':
      return { Icon: Coins, label: 'Dividend', color: 'rgba(134, 239, 172, 0.95)', bg: 'rgba(34, 197, 94, 0.10)' };
    case 'fee':
      return { Icon: AlertCircle, label: 'Fee', color: 'rgba(232, 160, 80, 0.95)', bg: 'rgba(217, 119, 6, 0.10)' };
    default:
      return { Icon: Activity, label: type.charAt(0).toUpperCase() + type.slice(1), color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)' };
  }
}

// Compose a short, evocative emotional-context phrase from the joined
// signals. Falls back to '—' when no signals were captured for this date.
function fmtEmotionalContext(ec: PlaidInvestmentEvent['emotionalContext']): { text: string; tone: 'warn' | 'good' | 'neutral' } {
  if (!ec) return { text: '—', tone: 'neutral' };
  const parts: string[] = [];
  let tone: 'warn' | 'good' | 'neutral' = 'neutral';

  if (ec.computedStressScore != null && ec.computedStressScore >= 0.6) {
    parts.push(`stress ${Math.round(ec.computedStressScore * 100)}%`);
    tone = 'warn';
  }
  if (ec.recoveryScore != null) {
    parts.push(`recovery ${Math.round(ec.recoveryScore)}%`);
    if (ec.recoveryScore < 50 && tone !== 'warn') tone = 'warn';
    if (ec.recoveryScore >= 75 && tone === 'neutral') tone = 'good';
  }
  if (ec.calendarLoad != null && ec.calendarLoad >= 3) {
    parts.push(`${ec.calendarLoad} meetings`);
    if (tone === 'neutral') tone = 'warn';
  }
  if (ec.musicValence != null) {
    if (ec.musicValence < 0.3) {
      parts.push(`somber music`);
      if (tone === 'neutral') tone = 'warn';
    } else if (ec.musicValence > 0.7) {
      parts.push(`upbeat music`);
      if (tone === 'neutral') tone = 'good';
    }
  }
  return { text: parts.length ? parts.join(' · ') : '—', tone };
}

const EventRow: React.FC<{ ev: PlaidInvestmentEvent }> = ({ ev }) => {
  const { Icon, label, color, bg } = typeMeta(ev.type, ev.amount);
  const isInflow = ev.amount >= 0;
  const ec = fmtEmotionalContext(ev.emotionalContext);
  const toneColor =
    ec.tone === 'warn' ? 'rgba(232, 160, 80, 0.95)' :
    ec.tone === 'good' ? 'rgba(134, 239, 172, 0.95)' :
    'rgba(255,255,255,0.45)';

  return (
    <div
      data-testid="brokerage-event-row"
      className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="col-span-1 flex items-center justify-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: bg }}
          title={label}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>

      <div className="col-span-4 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
          {label} {ev.ticker || ev.name}
        </div>
        <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {fmtDate(ev.transactionDate)}
        </div>
      </div>

      <div className="col-span-3 text-right text-sm tabular-nums" style={{ color: isInflow ? 'rgba(134, 239, 172, 0.95)' : 'var(--foreground)' }}>
        {isInflow ? '+' : ''}{fmtCurrency(ev.amount, ev.currency)}
      </div>

      <div className="col-span-4 text-right text-[11px] tabular-nums" style={{ color: toneColor }} title="Bio / mood / load context captured at the time of the trade">
        {ec.text}
      </div>
    </div>
  );
};

export const BrokerageActivityCard: React.FC<Props> = ({ refreshNonce = 0 }) => {
  const [events, setEvents] = useState<PlaidInvestmentEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPlaidInvestmentActivity({ limit: 25, sinceDays: 365 });
      if (!result.success) {
        setError(result.error || null);
        setEvents([]);
        return;
      }
      setEvents(result.events);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshNonce]);

  // Render nothing when there's no activity yet — BrokerageHoldingsCard
  // already explains the "connect a brokerage" angle above us, no need
  // to repeat the empty-state.
  if (!loading && (!events || events.length === 0)) return null;
  if (error && (!events || events.length === 0)) return null;

  // Counts of events with VS without emotional context — proves the moat
  // is actually firing rather than just rendering an empty column.
  const withContext = (events || []).filter(e => e.emotionalContext).length;

  return (
    <div className="mb-6" data-testid="brokerage-activity-card">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-1 h-5 rounded-full"
          style={{ background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(255,255,255,0.10))' }}
        />
        <Activity className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Brokerage activity · emotional context
        </h3>
        {events && events.length > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: 'var(--glass-surface-bg)', color: 'rgba(255,255,255,0.4)' }}
            data-testid="brokerage-events-count"
          >
            {events.length}
          </span>
        )}
        {events && events.length > 0 && (
          <span
            className="ml-auto text-[10px]"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            title="Events where we matched Whoop / music / calendar signals from the same day"
          >
            {withContext}/{events.length} tagged with emotional context
          </span>
        )}
      </div>

      {loading && !events && (
        <div className="px-4 py-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Loading activity…
        </div>
      )}

      {events && events.length > 0 && (
        <>
          {/* Column header */}
          <div className="grid grid-cols-12 gap-2 px-4 pb-1 text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <div className="col-span-1" />
            <div className="col-span-4">Event</div>
            <div className="col-span-3 text-right">Amount</div>
            <div className="col-span-4 text-right">Context at the moment</div>
          </div>
          <div className="space-y-1">
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BrokerageActivityCard;
