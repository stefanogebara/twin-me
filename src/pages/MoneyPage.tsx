/**
 * MoneyPage — Financial-Emotional Twin (Phase 2A)
 * ================================================
 * Upload bank statement (CSV/OFX), see transactions with emotional context:
 * HRV, music valence, calendar load, composite stress score at moment of purchase.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, FileText, AlertCircle, Loader2, TrendingDown, Sparkles, RefreshCw, Music } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  uploadStatement,
  listTransactions,
  getTransactionsSummary,
  retagTransactions,
  getSavings,
  getSpendingPatterns,
  getNudgeStats,
  getRiskForecast,
  getTimelineAnalysis,
  setTransactionFeedback,
  type Transaction,
  type TransactionsSummary,
  type SavingsSummary,
  type PatternsResult,
  type SpendingPattern,
  type NudgeStats,
  type RiskForecast,
  type UploadResult,
  type TimelineDay,
} from '@/services/api/transactionsAPI';
import { ConnectBankButton } from './components/money/ConnectBankButton';
import { GmailCourierToggle } from './components/money/GmailCourierToggle';
import { BankConnectionsList } from './components/money/BankConnectionsList';
import { StressSpendTimeline } from './components/money/StressSpendTimeline';
import { BrokerageHoldingsCard } from './components/money/BrokerageHoldingsCard';
import { BrokerageActivityCard } from './components/money/BrokerageActivityCard';

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--glass-surface-bg)',           // rgba(255,255,255,0.06) per design system
  border: '1px solid var(--glass-surface-border)', // rgba(255,255,255,0.10) per design system
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  borderRadius: 20,
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Geist', 'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.45)',
  marginBottom: 12,
};

/**
 * Multi-currency aware formatter. Transactions from TrueLayer ship with
 * EUR/GBP, Pluggy ships BRL. The summary card path has no single currency —
 * pass `null` to render without a symbol and show a chip alongside.
 */
function formatCurrency(value: number, currency: string | null | undefined): string {
  const cur = (currency || 'BRL').toUpperCase();
  const locale = cur === 'BRL' ? 'pt-BR' : cur === 'EUR' ? 'es-ES' : cur === 'GBP' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 2,
  }).format(value);
}

/** Back-compat wrapper for BRL-only sites still in migration. */
function formatBRL(value: number): string {
  return formatCurrency(value, 'BRL');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

function stressChipColor(score: number | null): { bg: string; fg: string; label: string } {
  if (score === null) return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.35)', label: 'no signal' };
  if (score >= 0.6) return { bg: 'rgba(217, 119, 6, 0.15)', fg: 'rgba(232, 160, 80, 0.95)', label: `stress ${Math.round(score * 100)}%` };
  if (score >= 0.4) return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)', label: `moderate ${Math.round(score * 100)}%` };
  return { bg: 'rgba(34, 197, 94, 0.12)', fg: 'rgba(134, 239, 172, 0.90)', label: `calm ${Math.round(score * 100)}%` };
}

interface UploadZoneProps {
  onUpload: (result: UploadResult) => void;
  onError: (msg: string) => void;
}

function UploadZone({ onUpload, onError }: UploadZoneProps) {
  const [isDragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadStatement(file);
      if (!result.success) {
        onError(result.error || 'Upload failed');
      } else {
        onUpload(result);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUpload, onError]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  return (
    <label
      htmlFor="money-upload"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        ...CARD_STYLE,
        display: 'block',
        padding: '32px 24px',
        textAlign: 'center',
        cursor: uploading ? 'wait' : 'pointer',
        borderColor: isDragging ? 'rgba(232, 160, 80, 0.55)' : 'rgba(255,255,255,0.08)',
        borderStyle: 'dashed',
        transition: 'all 150ms ease-out',
      }}
    >
      <input
        id="money-upload"
        type="file"
        accept=".csv,.ofx,.xlsx,text/csv,application/x-ofx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onFileInput}
        disabled={uploading}
        style={{ display: 'none' }}
      />
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-vibrant)' }} />
        ) : (
          <Upload className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.65)' }} />
        )}
      </div>
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 18,
          color: 'var(--foreground)',
          letterSpacing: '-0.01em',
          marginBottom: 6,
        }}
      >
        {uploading ? 'Reading your statement…' : 'Drop your statement here'}
      </p>
      <p
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 13,
          color: 'rgba(255,255,255,0.50)',
          lineHeight: 1.5,
        }}
      >
        Nubank, Itau, Bradesco, Santander — CSV, OFX, or XLSX.<br />
        Your data stays private. Nothing leaves your account.
      </p>
    </label>
  );
}

function SummaryBar({ summary, currency, mixedCurrency }: { summary: TransactionsSummary | null; currency: string; mixedCurrency: boolean }) {
  if (!summary) return null;
  if (!summary.transaction_count) return null;

  const emotionalPct = summary.emotional_spend_ratio !== null
    ? Math.round(summary.emotional_spend_ratio * 100)
    : null;

  // audit-2026-06-10 (money-page): total_outflow is a raw sum across
  // currencies — no FX conversion exists anywhere in the pipeline, so for
  // mixed-currency users that number under a single symbol is wrong money
  // data (EUR 100 + BRL 100 is not "R$ 200,00"). Headline the dominant
  // currency's own outflow; the per-currency breakdown below carries the rest.
  const dominantBucket = summary.currencies?.find((c) => c.currency === currency);
  const headlineOutflow = mixedCurrency && dominantBucket
    ? dominantBucket.outflow
    : summary.total_outflow;

  return (
    <div style={{ ...CARD_STYLE, padding: 24 }}>
      <div className="flex items-center gap-2 mb-2">
        {/* replan-2026-06-10 Track D: label must reflect the actual queried
            window — /summary defaults to 90 days, not 30. */}
        <p style={{ ...LABEL_STYLE, marginBottom: 0 }}>Last {summary.window_days} days</p>
        {mixedCurrency && (
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{
              background: 'rgba(217, 119, 6, 0.12)',
              color: 'rgba(232, 160, 80, 0.95)',
              fontFamily: "'Geist', 'Inter', sans-serif",
              letterSpacing: 0,
              textTransform: 'none',
            }}
            title="You have transactions in more than one currency. Amounts are NOT converted — each total is shown in its own currency below."
          >
            multi-currency
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
              lineHeight: 1.1,
            }}
          >
            {formatCurrency(headlineOutflow, currency)}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist', 'Inter', sans-serif" }}>
            {mixedCurrency ? `Total spending (${currency})` : 'Total spending'}
          </p>
        </div>
        <div>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: emotionalPct !== null && emotionalPct > 30 ? 'rgba(232, 160, 80, 0.95)' : 'var(--foreground)',
              lineHeight: 1.1,
            }}
          >
            {emotionalPct !== null ? `${emotionalPct}%` : '—'}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist', 'Inter', sans-serif" }}>
            Under stress
          </p>
        </div>
        <div>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
              lineHeight: 1.1,
            }}
          >
            {summary.stress_shop_count}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist', 'Inter', sans-serif" }}>
            Impulse purchases
          </p>
        </div>
      </div>

      {/* Per-currency breakdown when the user has more than one currency */}
      {mixedCurrency && summary.currencies && summary.currencies.length > 1 && (
        <div
          className="mt-5 pt-4 flex flex-wrap gap-x-5 gap-y-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {summary.currencies.map((c) => (
            <div key={c.currency}>
              <p
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: 17,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.1,
                  letterSpacing: '-0.01em',
                }}
              >
                {formatCurrency(c.outflow, c.currency)}
              </p>
              <p
                style={{
                  fontSize: 10.5,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.40)',
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  marginTop: 2,
                }}
              >
                {c.currency} · {c.count} {c.count === 1 ? 'tx' : 'tx'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  food_delivery: 'delivery',
  groceries: 'groceries',
  transport: 'transport',
  fuel: 'fuel',
  shopping: 'shopping',
  streaming: 'streaming',
  health: 'health',
  fitness: 'gym',
  travel: 'travel',
  utilities: 'bills',
  entertainment: 'entertainment',
  fees: 'fees',
  subscription: 'subscription',
  salary: 'salary',
  transfer: 'transfer',
  other: 'other',
};

function FeedbackToggle({ txId, initial }: { txId: string; initial: boolean | null }) {
  const [value, setValue] = useState<boolean | null>(initial);
  const [saving, setSaving] = useState(false);

  const toggle = async (next: boolean) => {
    if (saving) return;
    const newVal = value === next ? null : next;
    setValue(newVal);
    if (newVal !== null) {
      setSaving(true);
      await setTransactionFeedback(txId, newVal).finally(() => setSaving(false));
    }
  };

  const btnBase: React.CSSProperties = {
    fontFamily: "'Geist', 'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 46,
    border: '1px solid',
    cursor: saving ? 'wait' : 'pointer',
    transition: 'all 120ms ease-out',
    background: 'transparent',
    letterSpacing: '0.02em',
  };

  return (
    <div className="flex items-center gap-1.5 mt-1" title="Was this a stress purchase?">
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: "'Geist','Inter',sans-serif" }}>stress?</span>
      <button
        onClick={() => { void toggle(true); }}
        style={{
          ...btnBase,
          borderColor: value === true ? 'rgba(232,160,80,0.6)' : 'rgba(255,255,255,0.12)',
          color: value === true ? 'rgba(232,160,80,0.95)' : 'rgba(255,255,255,0.40)',
          background: value === true ? 'rgba(217,119,6,0.12)' : 'transparent',
        }}
      >
        yes
      </button>
      <button
        onClick={() => { void toggle(false); }}
        style={{
          ...btnBase,
          borderColor: value === false ? 'rgba(134,239,172,0.5)' : 'rgba(255,255,255,0.12)',
          color: value === false ? 'rgba(134,239,172,0.90)' : 'rgba(255,255,255,0.40)',
          background: value === false ? 'rgba(34,197,94,0.08)' : 'transparent',
        }}
      >
        no
      </button>
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isOutflow = tx.amount < 0;
  const ec = tx.emotional_context;
  const stress = stressChipColor(ec?.computed_stress_score ?? null);
  const displayMerchant = tx.merchant_normalized || tx.merchant_raw;
  const categoryLabel = tx.category ? CATEGORY_LABELS[tx.category] || tx.category : null;
  const showFeedback = isOutflow && ec !== null && ec.signals_found > 0;

  return (
    <div
      data-testid="transaction-row"
      data-merchant={displayMerchant || ''}
      className="flex items-center gap-4 px-4 py-3.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex-1 min-w-0">
        <p
          data-testid="transaction-merchant"
          className="truncate"
          style={{
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--foreground)',
          }}
        >
          {displayMerchant || '(no description)'}
        </p>
        <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 11,
              color: 'rgba(255,255,255,0.40)',
            }}
          >
            {formatDate(tx.transaction_date)} · {tx.source_bank}
          </span>
          {categoryLabel && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 46,
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.55)',
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {categoryLabel}
            </span>
          )}
          {ec && ec.signals_found > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 46,
                background: stress.bg,
                color: stress.fg,
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {stress.label}
            </span>
          )}
          {ec?.is_stress_shop_candidate && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(220, 38, 38, 0.15)',
                color: 'rgba(252, 165, 165, 0.95)',
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              impulse
            </span>
          )}
          {tx.is_recurring && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.50)',
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
              title="Recurring charge — does not count as impulse"
            >
              recurring
            </span>
          )}
          {ec?.music_valence !== null && ec?.music_valence !== undefined && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.50)',
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
              title={`Music valence ${ec.music_valence.toFixed(2)}`}
            >
              <Music className="w-3 h-3 inline-block mr-1 -mt-0.5" /> {ec.music_valence < 0.3 ? 'sad' : ec.music_valence > 0.6 ? 'happy' : 'neutral'}
            </span>
          )}
          {ec?.recovery_score !== null && ec?.recovery_score !== undefined && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.50)',
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
              title={`Recovery ${Math.round(ec.recovery_score)}%`}
            >
              HRV {Math.round(ec.recovery_score)}
            </span>
          )}
        </div>
        {showFeedback && <FeedbackToggle txId={tx.id} initial={null} />}
      </div>
      <div
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 15,
          fontWeight: 500,
          color: isOutflow ? 'var(--foreground)' : 'rgba(134, 239, 172, 0.90)',
          flexShrink: 0,
        }}
      >
        {isOutflow ? '−' : '+'} {formatCurrency(Math.abs(tx.amount), tx.currency)}
      </div>
    </div>
  );
}

function NudgesTab({ nudgeStats, currency }: { nudgeStats: NudgeStats | null; currency: string }) {
  if (!nudgeStats || nudgeStats.total_sent === 0) {
    return (
      <div style={{ ...CARD_STYLE, padding: '40px 24px', textAlign: 'center' }}>
        <p
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 20,
            color: 'rgba(255,255,255,0.65)',
            letterSpacing: '-0.01em',
            marginBottom: 8,
          }}
        >
          No alerts yet
        </p>
        <p
          style={{
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 13,
            color: 'rgba(255,255,255,0.40)',
            lineHeight: 1.6,
          }}
        >
          When your twin detects you are about to spend under stress,<br />
          it warns you first. Alerts show up here along with their outcomes.
        </p>
      </div>
    );
  }

  const winRate = nudgeStats.follow_rate !== null ? Math.round(nudgeStats.follow_rate * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero — win counter */}
      <div
        style={{
          ...CARD_STYLE,
          padding: '24px 24px 20px',
          background: nudgeStats.followed_count > 0
            ? 'linear-gradient(135deg, rgba(134,239,172,0.08) 0%, rgba(255,255,255,0.03) 80%)'
            : undefined,
          borderColor: nudgeStats.followed_count > 0 ? 'rgba(134,239,172,0.20)' : undefined,
        }}
      >
        <p style={{ ...LABEL_STYLE, color: 'rgba(134,239,172,0.85)', marginBottom: 10 }}>
          Nudges & Wins · {nudgeStats.window_days} days
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 32,
                letterSpacing: '-0.03em',
                color: 'rgba(134,239,172,0.95)',
                lineHeight: 1.05,
              }}
            >
              {nudgeStats.followed_count}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist','Inter',sans-serif" }}>
              pauses
            </p>
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 32,
                letterSpacing: '-0.03em',
                color: 'var(--foreground)',
                lineHeight: 1.05,
              }}
            >
              {winRate !== null ? `${winRate}%` : '—'}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist','Inter',sans-serif" }}>
              pause rate
            </p>
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 32,
                letterSpacing: '-0.03em',
                color: nudgeStats.est_saved > 0 ? 'rgba(134,239,172,0.95)' : 'rgba(255,255,255,0.40)',
                lineHeight: 1.05,
              }}
            >
              {nudgeStats.est_saved > 0 ? formatCurrency(nudgeStats.est_saved, currency) : '—'}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist','Inter',sans-serif" }}>
              saved
            </p>
          </div>
        </div>
      </div>

      {/* Recent nudge list */}
      {Array.isArray(nudgeStats.recent) && nudgeStats.recent.length > 0 && (
        <div style={{ ...CARD_STYLE, padding: '16px 0 4px' }}>
          <p style={{ ...LABEL_STYLE, padding: '0 16px', marginBottom: 10 }}>History</p>
          <div>
            {nudgeStats.recent.map((n) => {
              const whenTxt = new Date(n.created_at).toLocaleString('en-US', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              });
              let outcome: { text: string; bg: string; fg: string } | null = null;
              if (n.checked) {
                outcome = n.followed
                  ? { text: 'paused', bg: 'rgba(134,239,172,0.14)', fg: 'rgba(134,239,172,0.95)' }
                  : { text: 'went ahead', bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)' };
              }
              return (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontFamily: "'Geist','Inter',sans-serif",
                        fontSize: 14,
                        color: 'var(--foreground)',
                        fontWeight: 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {n.title}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Geist','Inter',sans-serif",
                        fontSize: 12.5,
                        color: 'rgba(255,255,255,0.55)',
                        marginTop: 2,
                        lineHeight: 1.45,
                      }}
                    >
                      {n.merchant
                        ? `${formatCurrency(n.amount, currency)} at ${n.merchant}${n.stress_score !== null ? ` · stress ${Math.round(n.stress_score * 100)}%` : ''}`
                        : n.body}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 3, fontFamily: "'Geist','Inter',sans-serif" }}>
                      {whenTxt}
                    </p>
                  </div>
                  {outcome ? (
                    <span
                      className="flex-shrink-0 px-2 py-0.5 rounded-full"
                      style={{
                        fontSize: 11,
                        fontFamily: "'Geist','Inter',sans-serif",
                        fontWeight: 500,
                        background: outcome.bg,
                        color: outcome.fg,
                      }}
                    >
                      {outcome.text}
                    </span>
                  ) : (
                    <span
                      className="flex-shrink-0 px-2 py-0.5 rounded-full"
                      style={{
                        fontSize: 11,
                        fontFamily: "'Geist','Inter',sans-serif",
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.30)',
                      }}
                    >
                      evaluating
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* If nudges were sent but no recent detail returned */}
      {(!nudgeStats.recent || nudgeStats.recent.length === 0) && nudgeStats.total_sent > 0 && (
        <div style={{ ...CARD_STYLE, padding: '20px 24px' }}>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 16,
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.5,
            }}
          >
            {nudgeStats.total_sent} alert{nudgeStats.total_sent === 1 ? '' : 's'} sent — evaluating outcomes.
          </p>
        </div>
      )}
    </div>
  );
}

export default function MoneyPage() {
  // audit-2026-05-12 M3: hook already appends " | Twin Me", so passing
  // "Money · TwinMe" produced "Money · TwinMe | Twin Me" (brand duplicated,
  // two spellings). Pass just the page label.
  useDocumentTitle('Money');

  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [patterns, setPatterns] = useState<PatternsResult | null>(null);
  const [nudgeStats, setNudgeStats] = useState<NudgeStats | null>(null);
  const [forecast, setForecast] = useState<RiskForecast | null>(null);
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gastos' | 'nudges'>('gastos');
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);
  const [retagging, setRetagging] = useState(false);

  // audit-2026-06-10 (money-page): derive dominance from the backend's
  // per-currency summary breakdown (full window, sorted by outflow desc) so
  // it can never disagree with the summary numbers themselves. The previous
  // tx-count-over-last-50 heuristic used a different dominance definition
  // than the backend's outflow sort; keep it only as a fallback when the
  // summary failed to load.
  const { dominantCurrency, hasMixedCurrency } = useMemo(() => {
    if (summary?.currencies && summary.currencies.length > 0) {
      return {
        dominantCurrency: summary.currencies[0].currency,
        hasMixedCurrency: summary.currencies.length > 1,
      };
    }
    const counts = new Map<string, number>();
    for (const t of transactions) {
      const c = (t.currency || 'BRL').toUpperCase();
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (!counts.size) return { dominantCurrency: 'BRL', hasMixedCurrency: false };
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { dominantCurrency: sorted[0][0], hasMixedCurrency: counts.size > 1 };
  }, [summary, transactions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txns, sum, sav, pat, nudges, fc, tl] = await Promise.all([
        listTransactions({ limit: 50 }),
        getTransactionsSummary(),
        getSavings(),
        getSpendingPatterns(),
        getNudgeStats(),
        getRiskForecast(),
        getTimelineAnalysis(),
      ]);
      setTransactions(txns);
      setSummary(sum);
      setSavings(sav);
      setPatterns(pat);
      setNudgeStats(nudges);
      setForecast(fc);
      setTimeline(tl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // audit-2026-06-10 (money-page): the TrueLayer callback (api/routes/
  // truelayer.js) full-page-redirects back here with ?truelayer_connected=1
  // or ?truelayer_error=<code>, but nothing consumed them — a failed bank
  // consent landed on /money with zero feedback. Surface the outcome, then
  // strip the params so refresh/back doesn't replay it. Declared AFTER the
  // load() effect: load() synchronously clears `error` on mount, so this
  // must run second or the error banner would be wiped.
  useEffect(() => {
    const connected = searchParams.get('truelayer_connected');
    const tlError = searchParams.get('truelayer_error');
    if (connected === null && tlError === null) return;
    if (connected === '1') {
      // The backend only redirects with this flag after the token exchange
      // and connection insert succeeded, so success feedback is truthful.
      toast.success('Bank connected. Your transactions are being imported and will appear here shortly.');
    } else if (tlError !== null) {
      setError(
        tlError === 'access_denied'
          ? 'Bank connection cancelled — no account was linked. You can try again anytime.'
          : 'We could not finish connecting your bank. Try again, or upload a CSV/OFX statement below.'
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete('truelayer_connected');
    next.delete('truelayer_error');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleUpload = useCallback(async (result: UploadResult) => {
    setLastUpload(result);
    setError(null);
    // Reload after a short delay to pick up emotion-tagging
    setTimeout(() => { void load(); }, 800);
  }, [load]);

  const handleRetag = useCallback(async () => {
    setRetagging(true);
    try {
      await retagTransactions();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retag failed');
    } finally {
      setRetagging(false);
    }
  }, [load]);

  const hasTransactions = transactions.length > 0;

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 pt-6 mb-2">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 36,
            letterSpacing: '-0.03em',
            color: 'var(--foreground)',
            lineHeight: 1.05,
          }}
        >
          Money
        </h1>
        <div className="flex items-center gap-2">
          {hasTransactions && (
            <Link
              to="/money/insights"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-all duration-150 hover:opacity-70 active:scale-[0.97]"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.85)',
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
              title="A narrative read of your patterns, subscriptions, trades, and stress timeline"
            >
              See your insights
            </Link>
          )}
          {hasTransactions && (
            <button
              type="button"
              onClick={handleRetag}
              disabled={retagging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[100px] transition-all duration-150 hover:opacity-70 active:scale-[0.97] disabled:opacity-40"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.65)',
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
              title="Recompute emotional context with latest HRV/music/calendar data"
            >
              <RefreshCw className={`w-3 h-3 ${retagging ? 'animate-spin' : ''}`} />
              {retagging ? 'Recalculating…' : 'Re-tag'}
            </button>
          )}
        </div>
      </div>
      <p
        className="mb-6"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 19,
          lineHeight: 1.4,
          color: 'rgba(255,255,255,0.70)',
          letterSpacing: '-0.01em',
        }}
      >
        Your money has feelings. We translate them.
      </p>

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-[12px]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'inline-flex',
        }}
      >
        {(['gastos', 'nudges'] as const).map((tab) => {
          // Tab key 'gastos' is internal state only — label is user-facing English.
          const labels = { gastos: 'Spending', nudges: 'Nudges & Wins' };
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontFamily: "'Geist','Inter',sans-serif",
                fontSize: 13,
                fontWeight: 500,
                padding: '6px 16px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 120ms ease-out',
                background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: isActive ? 'var(--foreground)' : 'rgba(255,255,255,0.40)',
              }}
            >
              {labels[tab]}
              {tab === 'nudges' && nudgeStats && nudgeStats.followed_count > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 20,
                    background: 'rgba(134,239,172,0.20)',
                    color: 'rgba(134,239,172,0.95)',
                  }}
                >
                  {nudgeStats.followed_count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Nudges tab — dedicated view */}
      {activeTab === 'nudges' && (
        <NudgesTab nudgeStats={nudgeStats} currency={dominantCurrency} />
      )}

      {/* Main gastos view */}
      {activeTab === 'gastos' && (<>

      {/* Connect a BR bank in real time via Pluggy Open Finance. Falls back to
          CSV/OFX upload below for banks Pluggy doesn't cover or users who
          prefer the manual flow. */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <ConnectBankButton
          onConnected={() => {
            // Webhook has already ingested 90d of tx; refresh the view after
            // a small delay so the background pipeline has time to tag them.
            window.setTimeout(() => { load(); }, 2500);
          }}
        />
        <span
          className="text-xs"
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontFamily: "'Geist', 'Inter', sans-serif",
          }}
        >
          or upload a CSV/OFX statement below
        </span>
        {/* Phase 2 (bank-integration strategy): auto-import OFX statements the
            bank emails you (e.g. Nubank Exportar Extrato) from Gmail. */}
        <GmailCourierToggle />
      </div>

      <BankConnectionsList onChanged={load} />

      {/* Moat headline — Phase 4.2 visual treatment. Stress-Spend Timeline +
          Brokerage Activity side-by-side: "why you spent" next to "why you
          traded". This is the pair that distinguishes us from ChatGPT
          Personal Finance, so it lands above the portfolio snapshot and
          spend detail. Each card hides itself when empty, so the grid
          gracefully collapses to one column when only one has data. */}
      {(timeline.length > 0) && (
        <div
          className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4"
          data-testid="moat-headline-grid"
        >
          {timeline.length > 0 && (
            <div style={{ ...CARD_STYLE, padding: '20px 20px 16px' }}>
              <p style={{ ...LABEL_STYLE, marginBottom: 16 }}>Why you spend · 30 days</p>
              <StressSpendTimeline days={timeline} currency={dominantCurrency} />
            </div>
          )}
          <div>
            {/* BrokerageActivityCard is self-headered; wrap so it sits in the
                same grid cell. The card returns null when empty so the grid
                collapses to single-column gracefully. */}
            <BrokerageActivityCard />
          </div>
        </div>
      )}

      {/* Brokerage holdings — Phase 4.1 (US Plaid). Reads /api/plaid/holdings,
          renders an empty CTA when no brokerage is linked. Quietly returns
          null when Plaid is unconfigured so we don't double up on the
          connect-button hint. */}
      <BrokerageHoldingsCard />

      {/* Upload zone */}
      <div className="mb-6">
        <UploadZone onUpload={handleUpload} onError={setError} />
      </div>

      {/* Upload success banner */}
      {lastUpload && (
        <div
          className="mb-6 px-4 py-3 flex items-start gap-3"
          style={{
            ...CARD_STYLE,
            background: 'rgba(34, 197, 94, 0.08)',
            borderColor: 'rgba(34, 197, 94, 0.20)',
          }}
        >
          <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(134, 239, 172, 0.95)' }} />
          <div className="flex-1 min-w-0">
            <p
              style={{
                fontFamily: "'Geist', 'Inter', sans-serif",
                fontSize: 14,
                color: 'var(--foreground)',
                lineHeight: 1.4,
              }}
            >
              {lastUpload.inserted} transaction{lastUpload.inserted === 1 ? '' : 's'} saved · {lastUpload.source_bank} · {lastUpload.account_type === 'credit_card' ? 'credit card' : 'account'}
            </p>
            <p
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.50)',
                marginTop: 4,
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
            >
              I am connecting each purchase with your mood, stress, and body. Check back in a few seconds.
            </p>
            {lastUpload.parse_errors && lastUpload.parse_errors.length > 0 && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 6, fontFamily: 'monospace' }}>
                {lastUpload.parse_errors.length} line{lastUpload.parse_errors.length === 1 ? '' : 's'} skipped
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="mb-6 px-4 py-3 flex items-start gap-3"
          style={{
            ...CARD_STYLE,
            background: 'rgba(220, 38, 38, 0.08)',
            borderColor: 'rgba(220, 38, 38, 0.25)',
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(252, 165, 165, 0.95)' }} />
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(254, 202, 202, 0.95)',
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        </div>
      )}

      {/* Stress-Spend Timeline moved to the moat-headline grid above
          (alongside BrokerageActivityCard) so it lands at the top of the
          page as the headline pair, not buried below the upload zone. */}

      {/* Savings hero — the ROI proof card, only when there's a positive total */}
      {savings && savings.total_saved > 0 && (
        <div
          className="mb-6"
          style={{
            ...CARD_STYLE,
            padding: '24px 24px 22px',
            background: 'linear-gradient(135deg, rgba(134, 239, 172, 0.08) 0%, rgba(255,255,255,0.04) 80%)',
            borderColor: 'rgba(134, 239, 172, 0.22)',
          }}
        >
          <p
            style={{
              ...LABEL_STYLE,
              color: 'rgba(134, 239, 172, 0.85)',
              marginBottom: 10,
            }}
          >
            TwinMe saved you money · {savings.window_days} days
          </p>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 36,
              letterSpacing: '-0.03em',
              color: 'var(--foreground)',
              lineHeight: 1.05,
              marginBottom: 8,
            }}
          >
            {formatCurrency(savings.total_saved, dominantCurrency)}
          </p>
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.55,
            }}
          >
            {savings.waited_count} time{savings.waited_count === 1 ? '' : 's'} you waited after an alert.
            {savings.biggest_save > 0 && <> Biggest pause: {formatCurrency(savings.biggest_save, dominantCurrency)}.</>}
          </p>
        </div>
      )}

      {/* Phase 3.5 — "before it happens" daily risk forecast. Appears only when
          the backend has enough signal to say something meaningful. */}
      {forecast && (forecast.status === 'high_risk' || forecast.status === 'low_risk') && (
        <div
          className="mb-6 px-5 py-4"
          style={{
            ...CARD_STYLE,
            background: forecast.status === 'high_risk'
              ? 'rgba(217, 119, 6, 0.06)'
              : 'rgba(134, 239, 172, 0.04)',
            borderColor: forecast.status === 'high_risk'
              ? 'rgba(217, 119, 6, 0.20)'
              : 'rgba(134, 239, 172, 0.14)',
          }}
        >
          <p
            style={{
              ...LABEL_STYLE,
              color: forecast.status === 'high_risk' ? 'rgba(232, 160, 80, 0.85)' : 'rgba(134, 239, 172, 0.85)',
              marginBottom: 6,
            }}
          >
            Today
          </p>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 24,
              color: 'var(--foreground)',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              marginBottom: 6,
            }}
          >
            {forecast.headline}
          </p>
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.70)',
            }}
          >
            {forecast.detail}
          </p>
        </div>
      )}

      {/* Summary — currency derived from the tx list (dominant). */}
      {summary && (
        <div className="mb-6">
          <SummaryBar summary={summary} currency={dominantCurrency} mixedCurrency={hasMixedCurrency} />
        </div>
      )}

      {/* Inline nudge summary in the gastos tab — just the counter, points to the tab */}
      {nudgeStats && nudgeStats.total_sent > 0 && (
        <div
          className="mb-6 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          style={{
            ...CARD_STYLE,
            background: 'rgba(134,239,172,0.04)',
            borderColor: 'rgba(134,239,172,0.14)',
          }}
          onClick={() => setActiveTab('nudges')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') setActiveTab('nudges'); }}
        >
          <div>
            <p style={{ ...LABEL_STYLE, color: 'rgba(134,239,172,0.85)', marginBottom: 4 }}>
              Nudges & Wins
            </p>
            <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 16, color: 'var(--foreground)', lineHeight: 1.3 }}>
              {nudgeStats.followed_count > 0
                ? `${nudgeStats.followed_count} pause${nudgeStats.followed_count === 1 ? '' : 's'} · ${formatCurrency(nudgeStats.est_saved, dominantCurrency)} saved`
                : `${nudgeStats.total_sent} alert${nudgeStats.total_sent === 1 ? '' : 's'} sent`}
            </p>
          </div>
          <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.30)' }}>›</span>
        </div>
      )}


      {/* Stress-spending patterns — the "WHY you spend" UVP card */}
      {patterns && patterns.hasData && patterns.patterns.length > 0 && (
        <div className="mb-6" style={{ ...CARD_STYLE, padding: '24px 24px 18px' }}>
          <p style={{ ...LABEL_STYLE, color: 'rgba(232, 160, 80, 0.85)' }}>
            Your patterns · last 90 days
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {patterns.patterns.map((p: SpendingPattern, i: number) => (
              <div
                key={i}
                style={{
                  borderLeft: '2px solid rgba(232, 160, 80, 0.35)',
                  paddingLeft: 14,
                }}
              >
                <p
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 19,
                    lineHeight: 1.35,
                    color: 'var(--foreground)',
                    letterSpacing: '-0.01em',
                    margin: 0,
                  }}
                >
                  {p.headline}
                </p>
                <p
                  style={{
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    fontSize: 12.5,
                    color: 'rgba(255,255,255,0.50)',
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {p.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not-enough-data state — teaches user what's needed */}
      {patterns && patterns.hasData === false && patterns.minTransactionsReached === false && patterns.txCount !== undefined && (
        <div className="mb-6" style={{ ...CARD_STYLE, padding: '20px 24px' }}>
          <p style={LABEL_STYLE}>Patterns coming soon</p>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 17,
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '-0.01em',
              marginBottom: 6,
            }}
          >
            I need {(patterns.minRequired || 14) - patterns.txCount} more transaction
            {(patterns.minRequired || 14) - patterns.txCount === 1 ? '' : 's'} before I can start showing you patterns.
          </p>
          <p style={{ fontFamily: "'Geist', 'Inter', sans-serif", fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
            Once there is enough data, correlations between your stress, your body, and your spending will appear here.
          </p>
        </div>
      )}

      {/* Got enough transactions, but no pattern passed confidence threshold yet */}
      {patterns && patterns.hasData === true && patterns.patterns.length === 0 && (
        <div className="mb-6" style={{ ...CARD_STYLE, padding: '20px 24px' }}>
          <p style={LABEL_STYLE}>Still analyzing</p>
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 17,
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '-0.01em',
              marginBottom: 6,
            }}
          >
            Your {patterns.txCount} purchases do not form a clear pattern yet.
          </p>
          <p style={{ fontFamily: "'Geist', 'Inter', sans-serif", fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
            I would rather not show you weak patterns. When there is a strong signal between stress, body, and spending, it appears here.
          </p>
        </div>
      )}

      {/* Transactions list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="px-4 py-3.5 animate-pulse"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="h-4 w-3/4 rounded mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 w-1/3 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      ) : hasTransactions ? (
        <div style={CARD_STYLE}>
          <p style={{ ...LABEL_STYLE, padding: '16px 16px 0' }}>Recent transactions</p>
          <div>
            {/* audit-2026-05-23 M5: list fetched with limit:50 (line 772). 50 DOM
                nodes is comfortable — react-window is only worth the complexity
                past ~200 rows. If you raise the listTransactions limit above 200,
                add react-window virtualization here (variable item height because
                of the chips row). */}
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ ...CARD_STYLE, padding: 32, textAlign: 'center' }}>
          <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.20)' }} />
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 18,
              color: 'rgba(255,255,255,0.70)',
              marginBottom: 6,
              letterSpacing: '-0.01em',
            }}
          >
            Nothing here yet
          </p>
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.6,
            }}
          >
            Drop a CSV or OFX statement above.<br />
            Your body, your mood, and your stress will tell the rest of the story.
          </p>
        </div>
      )}

      {/* Footer hint */}
      {!hasTransactions && !loading && (
        <p
          className="text-center mt-8"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 14,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.30)',
            letterSpacing: '-0.005em',
            lineHeight: 1.5,
          }}
        >
          Where do I find my statement? Nubank → Profile → Export → OFX or CSV.<br />
          Does the PDF bill work too? Not yet — CSV/OFX only for now.
        </p>
      )}

      {/* Visual balance accent */}
      {hasTransactions && summary && summary.emotional_spend_ratio !== null && summary.emotional_spend_ratio > 0.3 && (
        <div className="mt-8" style={{ ...CARD_STYLE, padding: 20 }}>
          <div className="flex items-start gap-3">
            <TrendingDown className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'rgba(232, 160, 80, 0.95)' }} />
            <div>
              <p
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: 17,
                  lineHeight: 1.4,
                  color: 'var(--foreground)',
                  letterSpacing: '-0.01em',
                }}
              >
                {Math.round(summary.emotional_spend_ratio * 100)}% of your spending happened on high-stress days.
              </p>
              <p
                style={{
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.55)',
                  marginTop: 6,
                  lineHeight: 1.55,
                }}
              >
                Soon I will warn you <em>before</em> your next impulse purchase — so you get to choose.
              </p>
            </div>
          </div>
        </div>
      )}

      </>)}
    </div>
  );
}
