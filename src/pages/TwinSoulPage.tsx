import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Pause, Play, Trash2, Pencil, Check, X } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  TwinDirective,
  DirectiveCategory,
  CorrectionRateData,
  fetchDirectives,
  fetchCorrectionRate,
  updateDirective,
  deleteDirective,
} from '@/services/api/twinDirectivesAPI';

const CATEGORY_LABELS: Record<DirectiveCategory, string> = {
  preference: 'Preferences',
  fact: 'Facts',
  tone: 'Tone',
  'topic-avoid': 'Avoid',
  'topic-prefer': 'Prefer',
};

const CATEGORY_ORDER: DirectiveCategory[] = [
  'preference',
  'fact',
  'tone',
  'topic-prefer',
  'topic-avoid',
];

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Geist', 'Inter', sans-serif",
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: 12,
};

// ---------------------------------------------------------------------------
// Mini sparkline — drawn as a single SVG polyline. No external chart lib.
// ---------------------------------------------------------------------------
function CorrectionSparkline({ data }: { data: Array<{ date: string; count: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
        Not enough data yet — chat with your twin and correct it when it's wrong.
      </div>
    );
  }

  const W = 280;
  const H = 48;
  const maxV = Math.max(...data.map(d => d.count), 1);
  const stepX = data.length > 1 ? W / (data.length - 1) : W;

  const points = data
    .map((d, i) => {
      const x = i * stepX;
      const y = H - (d.count / maxV) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(245,245,244,0.6)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Directive card — inline-editable, pause toggle, delete
// ---------------------------------------------------------------------------
interface DirectiveCardProps {
  directive: TwinDirective;
  onUpdate: (id: string, updates: { content?: string; status?: 'active' | 'paused' }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function DirectiveCard({ directive, onUpdate, onDelete }: DirectiveCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(directive.content);
  const [busy, setBusy] = useState(false);

  const isPaused = directive.status === 'paused';

  async function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === directive.content) {
      setEditing(false);
      setDraft(directive.content);
      return;
    }
    setBusy(true);
    try {
      await onUpdate(directive.id, { content: trimmed });
      setEditing(false);
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    setBusy(true);
    try {
      await onUpdate(directive.id, { status: isPaused ? 'active' : 'paused' });
    } catch (err) {
      console.error('Toggle failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await onDelete(directive.id);
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    // TODO(pr45-coderabbit-5): revisit per CodeRabbit style feedback
    <div
      className="px-5 py-4 rounded-[20px]"
      style={{
        background: isPaused ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        opacity: isPaused ? 0.55 : 1,
        transition: 'opacity 200ms ease, background 200ms ease',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              autoFocus
              className="w-full resize-none rounded-[6px] px-3 py-2 text-sm leading-snug"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
                fontFamily: "'Geist', 'Inter', sans-serif",
              }}
            />
          ) : (
            <p
              className="text-sm leading-snug"
              style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', sans-serif" }}
            >
              {directive.content}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            {directive.reinforcement_count > 1 && (
              <span
                className="text-xs"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
              >
                reinforced {directive.reinforcement_count}x
              </span>
            )}
            {directive.user_edited && (
              <span
                className="text-xs"
                style={{ color: 'rgba(245,245,244,0.5)', fontFamily: "'Inter', sans-serif" }}
              >
                edited by you
              </span>
            )}
            {isPaused && (
              <span
                className="text-xs"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
              >
                paused
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                aria-label="Save edit"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:opacity-70 active:scale-90 disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft(directive.content); }}
                disabled={busy}
                aria-label="Cancel edit"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:opacity-70 active:scale-90 disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                aria-label="Edit directive"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:opacity-70 active:scale-90 disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.5)' }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={togglePause}
                disabled={busy}
                aria-label={isPaused ? 'Resume directive' : 'Pause directive'}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:opacity-70 active:scale-90 disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.5)' }}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                aria-label="Delete directive"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:opacity-70 active:scale-90 disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.4)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function TwinSoulPage() {
  const navigate = useNavigate();
  useDocumentTitle('What your twin learned');

  const [directives, setDirectives] = useState<TwinDirective[]>([]);
  const [metrics, setMetrics] = useState<CorrectionRateData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, rate] = await Promise.all([
        fetchDirectives(),
        fetchCorrectionRate(30).catch(() => null),
      ]);
      setDirectives(list);
      setMetrics(rate);
    } catch (err) {
      console.error('Failed to load directives:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdate = useCallback(
    async (id: string, updates: { content?: string; status?: 'active' | 'paused' }) => {
      const updated = await updateDirective(id, updates);
      setDirectives(prev => prev.map(d => (d.id === id ? { ...d, ...updated } : d)));
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    await deleteDirective(id);
    setDirectives(prev => prev.filter(d => d.id !== id));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<DirectiveCategory, TwinDirective[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const d of directives) {
      const bucket = map.get(d.category);
      if (bucket) bucket.push(d);
    }
    return map;
  }, [directives]);

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 pt-6 mb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg transition-all duration-150 hover:opacity-70 active:scale-90 lg:hidden"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 28,
            letterSpacing: '-0.02em',
            color: 'var(--foreground)',
            lineHeight: 1.2,
          }}
        >
          What your twin learned
        </h1>
      </div>
      <p
        className="text-sm mb-8"
        style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
      >
        Rules the twin picked up when you corrected it during chat. Edit anything that's off — your edits stick.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-20 rounded-[20px] animate-pulse"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {/* Correction-rate panel */}
          {metrics && (
            <section>
              <p style={LABEL_STYLE}>Last 30 days</p>
              <div
                className="px-5 py-4 rounded-[20px]"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                }}
              >
                <div className="flex items-end justify-between gap-6">
                  <div className="flex gap-8">
                    <div>
                      <div
                        style={{
                          fontFamily: "'Instrument Serif', Georgia, serif",
                          fontSize: 32,
                          lineHeight: 1,
                          color: 'var(--foreground)',
                        }}
                      >
                        {metrics.totalCorrections}
                      </div>
                      <div
                        className="text-xs mt-1"
                        style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
                      >
                        corrections
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: "'Instrument Serif', Georgia, serif",
                          fontSize: 32,
                          lineHeight: 1,
                          color: 'var(--foreground)',
                        }}
                      >
                        {metrics.directivesCreated}
                      </div>
                      <div
                        className="text-xs mt-1"
                        style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
                      >
                        new rules learned
                      </div>
                    </div>
                  </div>
                  <CorrectionSparkline data={metrics.correctionsByDay} />
                </div>
              </div>
            </section>
          )}

          {/* Empty state */}
          {directives.length === 0 && (
            <section>
              <div
                className="px-5 py-6 rounded-[20px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                }}
              >
                <p
                  className="leading-relaxed"
                  style={{
                    color: 'rgba(245,245,244,0.9)',
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 18,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Your twin hasn't learned anything yet. Chat with it, and when it gets something wrong, tell it so — start with "no, actually..." or "you got that wrong." It listens.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => navigate('/talk-to-twin')}
                    className="px-3 py-2 rounded-[100px] text-xs font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
                    style={{
                      background: '#F5F5F4',
                      color: '#110f0f',
                      fontFamily: "'Geist', 'Inter', sans-serif",
                    }}
                  >
                    Talk to your twin
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Grouped directive sections */}
          {CATEGORY_ORDER.map(cat => {
            const items = grouped.get(cat) || [];
            if (items.length === 0) return null;
            return (
              <section key={cat}>
                <p style={LABEL_STYLE}>{CATEGORY_LABELS[cat]}</p>
                <div className="space-y-3">
                  {items.map(d => (
                    <DirectiveCard
                      key={d.id}
                      directive={d}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
