/**
 * MoneyPage — Financial-Emotional Twin (Phase 2A)
 * ================================================
 * Upload bank statement (CSV/OFX), see transactions with emotional context:
 * HRV, music valence, calendar load, composite stress score at moment of purchase.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, AlertCircle, Loader2, TrendingDown, Sparkles, RefreshCw } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  uploadStatement,
  listTransactions,
  getTransactionsSummary,
  retagTransactions,
  getSavings,
  getSpendingPatterns,
  type Transaction,
  type TransactionsSummary,
  type SavingsSummary,
  type PatternsResult,
  type SpendingPattern,
  type UploadResult,
} from '@/services/api/transactionsAPI';

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
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

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function stressChipColor(score: number | null): { bg: string; fg: string; label: string } {
  if (score === null) return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.35)', label: 'sem sinal' };
  if (score >= 0.6) return { bg: 'rgba(217, 119, 6, 0.15)', fg: 'rgba(232, 160, 80, 0.95)', label: `stress ${Math.round(score * 100)}%` };
  if (score >= 0.4) return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)', label: `moderado ${Math.round(score * 100)}%` };
  return { bg: 'rgba(34, 197, 94, 0.12)', fg: 'rgba(134, 239, 172, 0.90)', label: `calmo ${Math.round(score * 100)}%` };
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
        onError(result.error || 'Upload falhou');
      } else {
        onUpload(result);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload falhou');
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
        accept=".csv,.ofx,text/csv,application/x-ofx"
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
        {uploading ? 'Lendo seu extrato…' : 'Arraste seu extrato aqui'}
      </p>
      <p
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 13,
          color: 'rgba(255,255,255,0.50)',
          lineHeight: 1.5,
        }}
      >
        Nubank, Itaú, Bradesco, Santander — CSV ou OFX.<br />
        Seus dados ficam privados. Nada sai da sua conta.
      </p>
    </label>
  );
}

function SummaryBar({ summary }: { summary: TransactionsSummary | null }) {
  if (!summary) return null;
  if (!summary.transaction_count) return null;

  const emotionalPct = summary.emotional_spend_ratio !== null
    ? Math.round(summary.emotional_spend_ratio * 100)
    : null;

  return (
    <div style={{ ...CARD_STYLE, padding: 24 }}>
      <p style={LABEL_STYLE}>Últimos 30 dias</p>
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
            {formatBRL(summary.total_outflow)}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, fontFamily: "'Geist', 'Inter', sans-serif" }}>
            Gasto total
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
            Sob stress
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
            Compras impulsivas
          </p>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  food_delivery: 'delivery',
  groceries: 'mercado',
  transport: 'transporte',
  fuel: 'combustível',
  shopping: 'compras',
  streaming: 'streaming',
  health: 'saúde',
  fitness: 'academia',
  travel: 'viagem',
  utilities: 'contas',
  entertainment: 'lazer',
  fees: 'tarifa',
  subscription: 'assinatura',
  salary: 'salário',
  transfer: 'transferência',
  other: 'outros',
};

function TransactionRow({ tx }: { tx: Transaction }) {
  const isOutflow = tx.amount < 0;
  const ec = tx.emotional_context;
  const stress = stressChipColor(ec?.computed_stress_score ?? null);
  const displayMerchant = tx.merchant_normalized || tx.merchant_raw;
  const categoryLabel = tx.category ? CATEGORY_LABELS[tx.category] || tx.category : null;

  return (
    <div
      className="flex items-center gap-4 px-4 py-3.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{
            fontFamily: "'Geist', 'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--foreground)',
          }}
        >
          {displayMerchant || '(sem descrição)'}
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
                borderRadius: 20,
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
                borderRadius: 20,
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
              impulso
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
              title={`Música valence ${ec.music_valence.toFixed(2)}`}
            >
              ♪ {ec.music_valence < 0.3 ? 'triste' : ec.music_valence > 0.6 ? 'feliz' : 'neutro'}
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
        {isOutflow ? '−' : '+'} {formatBRL(Math.abs(tx.amount))}
      </div>
    </div>
  );
}

export default function MoneyPage() {
  useDocumentTitle('Money · TwinMe');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [patterns, setPatterns] = useState<PatternsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);
  const [retagging, setRetagging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txns, sum, sav, pat] = await Promise.all([
        listTransactions({ limit: 50 }),
        getTransactionsSummary(),
        getSavings(),
        getSpendingPatterns(),
      ]);
      setTransactions(txns);
      setSummary(sum);
      setSavings(sav);
      setPatterns(pat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar transações');
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
      setError(err instanceof Error ? err.message : 'Retag falhou');
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
        {hasTransactions && (
          <button
            type="button"
            onClick={handleRetag}
            disabled={retagging}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-150 hover:opacity-70 active:scale-[0.97] disabled:opacity-40"
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
            {retagging ? 'Recalculando…' : 'Re-tag'}
          </button>
        )}
      </div>
      <p
        className="mb-8"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 19,
          lineHeight: 1.4,
          color: 'rgba(255,255,255,0.70)',
          letterSpacing: '-0.01em',
        }}
      >
        Seu dinheiro tem sentimentos. A gente traduz.
      </p>

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
              {lastUpload.inserted} transaç{lastUpload.inserted === 1 ? 'ão' : 'ões'} salv{lastUpload.inserted === 1 ? 'a' : 'as'} · {lastUpload.source_bank} · {lastUpload.account_type === 'credit_card' ? 'cartão' : 'conta'}
            </p>
            <p
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.50)',
                marginTop: 4,
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
            >
              Estou conectando cada compra com seu humor, stress e corpo. Volta em alguns segundos.
            </p>
            {lastUpload.parse_errors && lastUpload.parse_errors.length > 0 && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 6, fontFamily: 'monospace' }}>
                {lastUpload.parse_errors.length} linha(s) ignorada(s)
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
            TwinMe economizou pra você · {savings.window_days} dias
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
            {formatBRL(savings.total_saved)}
          </p>
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.55,
            }}
          >
            {savings.waited_count} {savings.waited_count === 1 ? 'vez' : 'vezes'} que você esperou depois do aviso.
            {savings.biggest_save > 0 && <> Maior pausa: {formatBRL(savings.biggest_save)}.</>}
          </p>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mb-6">
          <SummaryBar summary={summary} />
        </div>
      )}

      {/* Stress-spending patterns — the "WHY you spend" UVP card */}
      {patterns && patterns.hasData && patterns.patterns.length > 0 && (
        <div className="mb-6" style={{ ...CARD_STYLE, padding: '24px 24px 18px' }}>
          <p style={{ ...LABEL_STYLE, color: 'rgba(232, 160, 80, 0.85)' }}>
            Seus padrões · últimos 90 dias
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
          <p style={LABEL_STYLE}>Padrões em breve</p>
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
            Preciso de {(patterns.minRequired || 14) - patterns.txCount} transaç
            {(patterns.minRequired || 14) - patterns.txCount === 1 ? 'ão' : 'ões'} a mais pra começar a te mostrar padrões.
          </p>
          <p style={{ fontFamily: "'Geist', 'Inter', sans-serif", fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
            Quando houver dados suficientes, aqui aparecem correlações entre seu stress, seu corpo e seus gastos.
          </p>
        </div>
      )}

      {/* Got enough transactions, but no pattern passed confidence threshold yet */}
      {patterns && patterns.hasData === true && patterns.patterns.length === 0 && (
        <div className="mb-6" style={{ ...CARD_STYLE, padding: '20px 24px' }}>
          <p style={LABEL_STYLE}>Ainda analisando</p>
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
            Seus {patterns.txCount} gastos ainda não formam um padrão claro.
          </p>
          <p style={{ fontFamily: "'Geist', 'Inter', sans-serif", fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
            Prefiro não te mostrar padrões fracos. Quando tiver sinal forte entre stress, corpo e gasto, aparece aqui.
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
          <p style={{ ...LABEL_STYLE, padding: '16px 16px 0' }}>Últimas transações</p>
          <div>
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
            Nada por aqui ainda
          </p>
          <p
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              fontSize: 13,
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.6,
            }}
          >
            Solta um extrato CSV ou OFX aí em cima.<br />
            Seu corpo, seu humor e seu stress vão contar o resto da história.
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
          Onde encontro meu extrato? Nubank → Perfil → Exportar → OFX ou CSV.<br />
          Funciona também com o PDF do fatura? Ainda não — só CSV/OFX por enquanto.
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
                {Math.round(summary.emotional_spend_ratio * 100)}% do seu gasto foi em dias de stress alto.
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
                Em breve vou te avisar <em>antes</em> da próxima compra impulsiva — assim você pode escolher.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
