/**
 * MoneyPage — Financial-Emotional Twin (replan-2026-06-12)
 * ============================================================================
 * Upload a statement (CSV/OFX/XLSX) or link WhatsApp so the twin captures
 * spending from forwarded bank notifications and receipts. Transactions get
 * emotional context (HRV, music valence, calendar load, composite stress
 * score at moment of purchase) plus one honest unlock card stating what
 * appears once enough spend/biology overlap exists.
 * Bank aggregators (Pluggy/Plaid/TrueLayer) were removed — no prod budget,
 * sandbox-only data.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, AlertCircle, Loader2, Sparkles, RefreshCw, Music, MessageCircle, Check } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import {
  uploadStatement,
  listTransactions,
  getTransactionsSummary,
  retagTransactions,
  getTimelineAnalysis,
  setTransactionFeedback,
  type Transaction,
  type TransactionsSummary,
  type UploadResult,
  type TimelineDay,
} from '@/services/api/transactionsAPI';
import { GmailCourierToggle } from './components/money/GmailCourierToggle';
import { StressSpendTimeline } from './components/money/StressSpendTimeline';
import { UnlockProgressCard } from './components/money/UnlockProgressCard';

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--glass-surface-bg)',           // rgba(255,255,255,0.06) per design system
  border: '1px solid var(--glass-surface-border)', // rgba(255,255,255,0.10) per design system
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  borderRadius: 20,
};

/**
 * audit-2026-07-03 (money HIGH): the ONE window every number on this page
 * uses. The page previously pinned the timeline to 30 days but fetched the
 * summary with no window (backend default 90), so "Last 90 days" sat directly
 * above a "30 days" chart. Both fetchers and both card labels read this value.
 */
const MONEY_WINDOW_DAYS = 30;

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: 12,
};

/**
 * Multi-currency aware formatter. BR sources ship BRL; statement uploads can
 * carry EUR/GBP/USD. The summary card path has no single currency — pass
 * `null` to render without a symbol and show a chip alongside.
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

// Law 3: chroma lives in signature tiles and DATA STROKES — never as text
// under 18px, never as a wash. These chips broke both rules twice over: the
// label was Tailwind green-300 at 10px on a green-500 wash, in two hues that
// belong to no Nocturne palette. The signal is worth keeping, so it moves to
// a stroke — a signature-coloured dot — and the label drops to the mono voice
// every sub-13px string is required to speak (Law 5).
function stressChip(score: number | null): { dot: string; label: string } {
  if (score === null) return { dot: 'var(--n-fog)', label: 'no signal' };
  if (score >= 0.6) return { dot: 'var(--n-ember)', label: `stress ${Math.round(score * 100)}%` };
  if (score >= 0.4) return { dot: 'var(--n-fog)', label: `moderate ${Math.round(score * 100)}%` };
  return { dot: 'var(--n-verdigris)', label: `calm ${Math.round(score * 100)}%` };
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
        borderColor: isDragging ? 'var(--n-ember)' : 'var(--n-line)',
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
        style={{ background: 'var(--surface)' }}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-vibrant)' }} />
        ) : (
          <Upload className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
        )}
      </div>
      <p
        style={{
          fontFamily: "var(--font-heading)",
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
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          color: 'var(--text-secondary)',
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
        {/* Label follows the window_days the backend ECHOES for the window we
            requested (MONEY_WINDOW_DAYS) — never a hardcoded number, so the
            label can't contradict the data (audit-2026-07-03). */}
        <p style={{ ...LABEL_STYLE, marginBottom: 0 }}>Last {summary.window_days} days</p>
        {mixedCurrency && (
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{
              background: 'var(--n-steel)',
              color: 'var(--n-ash)',
              fontFamily: 'var(--n-mono)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
            title="You have transactions in more than one currency. Amounts are NOT converted — each total is shown in its own currency below."
          >
            multi-currency
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
              lineHeight: 1.1,
            }}
          >
            {formatCurrency(headlineOutflow, currency)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
            {mixedCurrency ? `Total spending (${currency})` : 'Total spending'}
          </p>
        </div>
        <div>
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: emotionalPct !== null && emotionalPct > 30 ? 'var(--n-ember)' : 'var(--foreground)',
              lineHeight: 1.1,
            }}
          >
            {emotionalPct !== null ? `${emotionalPct}%` : '—'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
            Under stress
          </p>
        </div>
        <div>
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
              lineHeight: 1.1,
            }}
          >
            {summary.stress_shop_count}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
            Impulse purchases
          </p>
        </div>
      </div>

      {/* Per-currency breakdown when the user has more than one currency */}
      {mixedCurrency && summary.currencies && summary.currencies.length > 1 && (
        <div
          className="mt-5 pt-4 flex flex-wrap gap-x-5 gap-y-2"
          style={{ borderTop: '1px solid var(--border-glass)' }}
        >
          {summary.currencies.map((c) => (
            <div key={c.currency}>
              <p
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 17,
                  color: 'var(--foreground)',
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
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-ui)',
                  marginTop: 2,
                }}
              >
                {c.currency} · {c.count} tx
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
  const [saveError, setSaveError] = useState(false);

  const toggle = async (next: boolean) => {
    if (saving) return;
    const prev = value;
    const newVal = value === next ? null : next;
    setValue(newVal);
    if (newVal !== null) {
      // audit-2026-06-10: optimistic update had no failure handling — a failed
      // save left the wrong UI state and a network error was an unhandled
      // rejection. Revert to the prior value and surface an inline hint.
      setSaving(true);
      setSaveError(false);
      try {
        const ok = await setTransactionFeedback(txId, newVal);
        if (!ok) {
          setValue(prev);
          setSaveError(true);
        }
      } catch {
        setValue(prev);
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    }
  };

  const btnBase: React.CSSProperties = {
    fontFamily: 'var(--font-ui)',
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
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>stress?</span>
      <button
        onClick={() => { void toggle(true); }}
        style={{
          ...btnBase,
          borderColor: 'var(--n-line)',
          color: value === true ? 'var(--n-void)' : 'var(--n-ash)',
          background: value === true ? 'var(--n-pure)' : 'transparent',
        }}
      >
        yes
      </button>
      <button
        onClick={() => { void toggle(false); }}
        style={{
          ...btnBase,
          borderColor: 'var(--n-line)',
          color: value === false ? 'var(--n-void)' : 'var(--n-ash)',
          background: value === false ? 'var(--n-pure)' : 'transparent',
        }}
      >
        no
      </button>
      {saveError && (
        <span
          role="alert"
          className='n-micro' style={{ color: 'var(--destructive)' }}
        >
          couldn't save — try again
        </span>
      )}
    </div>
  );
}

/**
 * WhatsApp capture CTA (replan-2026-06-12). The capture itself is server-side
 * (Kapso webhook -> LLM extraction -> user_transactions), so this card only
 * reflects link status and routes to Settings for the linking flow.
 */
function WhatsAppCaptureCard() {
  const [linked, setLinked] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_URL}/whatsapp-link/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!cancelled) setLinked(data.success ? !!data.linked : false);
      } catch {
        if (!cancelled) setLinked(false); // CTA still renders; linking lives in Settings
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className="mb-4 px-5 py-4 flex items-center gap-4 flex-wrap"
      style={CARD_STYLE}
      data-testid="whatsapp-capture-card"
    >
      <MessageCircle size={20} style={{ color: 'var(--foreground)', flexShrink: 0 }} />
      <div className="flex-1 min-w-[220px]">
        <p
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: 2,
          }}
        >
          Capture spending on WhatsApp
        </p>
        <p
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          Forward bank notifications, Pix receipts, or just say "gastei 80 no iFood" — it lands here with emotional context. Or upload a CSV/OFX statement below.
        </p>
      </div>
      {linked ? (
        <span
          className="flex items-center gap-1.5 text-xs"
          style={{
            color: 'var(--n-ash)',
            fontFamily: 'var(--n-mono)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          <Check size={14} style={{ color: 'var(--n-verdigris)' }} /> WhatsApp linked
        </span>
      ) : (
        <Link
          to="/settings"
          className="px-3 py-2"
          style={{
            background: 'var(--claura-bone)',
            color: 'var(--claura-bone-ink)',
            borderRadius: 12,
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          Link WhatsApp
        </Link>
      )}
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isOutflow = tx.amount < 0;
  const ec = tx.emotional_context;
  const stress = stressChip(ec?.computed_stress_score ?? null);
  const displayMerchant = tx.merchant_normalized || tx.merchant_raw;
  const categoryLabel = tx.category ? CATEGORY_LABELS[tx.category] || tx.category : null;
  const showFeedback = isOutflow && ec !== null && ec.signals_found > 0;

  return (
    <div
      data-testid="transaction-row"
      data-merchant={displayMerchant || ''}
      className="flex items-center gap-4 px-4 py-3.5"
      style={{ borderBottom: '1px solid var(--border-glass)' }}
    >
      <div className="flex-1 min-w-0">
        <p
          data-testid="transaction-merchant"
          className="truncate"
          style={{
            fontFamily: 'var(--font-ui)',
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
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              color: 'var(--text-secondary)',
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
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {categoryLabel}
            </span>
          )}
          {ec && ec.signals_found > 0 && (
            <span
              className="n-micro"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--n-ash)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: stress.dot,
                  flexShrink: 0,
                }}
              />
              {stress.label}
            </span>
          )}
          {ec?.is_stress_shop_candidate && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'var(--n-steel)',
                color: 'var(--n-ash)',
                fontFamily: 'var(--n-mono)',
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
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
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
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
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
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
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
              }}
              title={`Recovery ${Math.round(ec.recovery_score)}%`}
            >
              HRV {Math.round(ec.recovery_score)}
            </span>
          )}
        </div>
        {showFeedback && <FeedbackToggle txId={tx.id} initial={tx.feedback ?? null} />}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 15,
          fontWeight: 500,
          color: isOutflow ? 'var(--foreground)' : 'var(--n-cloud)',
          flexShrink: 0,
        }}
      >
        {isOutflow ? '−' : '+'} {formatCurrency(Math.abs(tx.amount), tx.currency)}
      </div>
    </div>
  );
}

export default function MoneyPage() {
  // audit-2026-05-12 M3: hook already appends " | Twin Me", so passing
  // "Money · TwinMe" produced "Money · TwinMe | Twin Me" (brand duplicated,
  // two spellings). Pass just the page label.
  useDocumentTitle('Money');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const [txns, sum, tl] = await Promise.all([
        listTransactions({ limit: 50 }),
        // One shared window for summary + timeline — the page must never
        // show two different "last N days" claims at once (audit-2026-07-03).
        getTransactionsSummary(MONEY_WINDOW_DAYS),
        getTimelineAnalysis(MONEY_WINDOW_DAYS),
      ]);
      setTransactions(txns);
      setSummary(sum);
      setTimeline(tl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      {/* Claura zoned photography — night-screens by night, dusk-train by day (/preview/money). */}
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 pt-6 mb-2">
        <h1
          style={{
            fontFamily: "var(--font-heading)",
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
                background: 'var(--surface)',
                border: '1px solid var(--border-glass)',
                fontSize: 12,
                color: 'var(--foreground)',
                fontFamily: 'var(--font-ui)',
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
                background: 'var(--surface)',
                border: '1px solid var(--border-glass)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
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
          fontFamily: "var(--font-heading)",
          fontSize: 19,
          lineHeight: 1.4,
          color: 'var(--foreground)',
          letterSpacing: '-0.01em',
        }}
      >
        Your money has feelings. We translate them.
      </p>

      {/* Magie-style WhatsApp capture: forward bank notifications / receipts
          to the twin's WhatsApp and they land here as transactions. CSV/OFX
          upload below stays as the bulk/manual path. */}
      <WhatsAppCaptureCard />

      {/* Phase 2 (bank-integration strategy): auto-import OFX statements the
          bank emails you (e.g. Nubank Exportar Extrato) from Gmail. */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <GmailCourierToggle />
      </div>

      {/* Spending timeline, full-width single card. Window label derives from
          MONEY_WINDOW_DAYS — same value the fetchers used. */}
      {timeline.length > 0 && (
        <div className="mb-6" data-testid="moat-headline-grid">
          <div style={{ ...CARD_STYLE, padding: '20px 20px 16px' }}>
            <p style={{ ...LABEL_STYLE, marginBottom: 16 }}>Why you spend · {MONEY_WINDOW_DAYS} days</p>
            <StressSpendTimeline days={timeline} currency={dominantCurrency} windowDays={MONEY_WINDOW_DAYS} />
          </div>
        </div>
      )}

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
            background: 'var(--n-graphite)',
            borderColor: 'var(--n-line)',
          }}
        >
          <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--n-verdigris)' }} />
          <div className="flex-1 min-w-0">
            <p
              style={{
                fontFamily: 'var(--font-ui)',
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
                color: 'var(--text-secondary)',
                marginTop: 4,
                fontFamily: 'var(--font-ui)',
              }}
            >
              I am connecting each purchase with your mood, stress, and body. Check back in a few seconds.
            </p>
            {lastUpload.parse_errors && lastUpload.parse_errors.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'monospace' }}>
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
            background: 'var(--n-graphite)',
            borderColor: 'var(--n-line)',
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--destructive)' }} />
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              color: 'rgba(254, 202, 202, 0.95)',
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        </div>
      )}

      {/* Summary — currency derived from the tx list (dominant). */}
      {summary && (
        <div className="mb-6">
          <SummaryBar summary={summary} currency={dominantCurrency} mixedCurrency={hasMixedCurrency} />
        </div>
      )}

      {/* Transactions list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="px-4 py-3.5 animate-pulse"
              style={{ borderBottom: '1px solid var(--border-glass)' }}
            >
              <div className="h-4 w-3/4 rounded mb-2" style={{ background: 'var(--surface)' }} />
              <div className="h-3 w-1/3 rounded" style={{ background: 'var(--surface)' }} />
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
          <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 18,
              color: 'var(--foreground)',
              marginBottom: 6,
              letterSpacing: '-0.01em',
            }}
          >
            Nothing here yet
          </p>
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              color: 'var(--text-secondary)',
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
            fontFamily: "var(--font-heading)",
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--text-secondary)',
            letterSpacing: '-0.005em',
            lineHeight: 1.5,
          }}
        >
          Where do I find my statement? Nubank → Profile → Export → OFX or CSV.<br />
          Does the PDF bill work too? Not yet — CSV/OFX/XLSX only for now.
        </p>
      )}

      {/* The ONE unlock card (replan-2026-06-10 Track D): replaces the four
          permanently-empty promise surfaces (patterns, risk forecast,
          nudges & wins, savings hero) with a single honest progress meter. */}
      {!loading && <UnlockProgressCard timeline={timeline} transactions={transactions} />}
    </div>
  );
}
