import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * Twin Fidelity check (/fidelity) — R4 test-retest evaluation UI.
 * Plan: .claude/plans/2026-08-01-twin-interview/README.md (Phase 4).
 *
 * The user answers the fixed versioned battery (one item at a time, ~3
 * minutes); the twin answers the same battery from memory server-side;
 * results show twin accuracy and, from wave 2 on, the normalized metric
 * (twin accuracy relative to the user's own wave-to-wave consistency).
 */

interface LikertItem {
  id: string;
  type: 'likert';
  scale: { min: number; max: number };
  text: string;
}

interface CategoricalItem {
  id: string;
  type: 'categorical';
  text: string;
  options: string[];
}

type BatteryItem = LikertItem | CategoricalItem;

interface WaveResult {
  id?: string;
  wave: number;
  twinStatus?: 'pending' | 'complete';
  twinAccuracy: number | null;
  selfConsistency: number | null;
  normalizedFidelity: number | null;
}

interface WaveRow {
  wave: number;
  battery_version: number;
  twin_accuracy: number | null;
  self_consistency: number | null;
  normalized_fidelity: number | null;
  created_at: string;
}

type View = 'overview' | 'battery' | 'submitting' | 'result';

const LIKERT_LABELS: Record<number, string> = {
  1: 'Disagree strongly',
  2: 'Disagree a little',
  3: 'Neutral',
  4: 'Agree a little',
  5: 'Agree strongly',
};

const pct = (v: number | null) => (v === null || v === undefined ? null : Math.round(v * 100));

export default function FidelityPage() {
  useDocumentTitle('Twin Fidelity');
  const navigate = useNavigate();
  const { trackEvent } = useAnalytics();

  const [view, setView] = useState<View>('overview');
  const [items, setItems] = useState<BatteryItem[]>([]);
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [itemIndex, setItemIndex] = useState(0);
  const [result, setResult] = useState<WaveResult | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const startedAtRef = useRef(0);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const [batteryRes, resultsRes] = await Promise.all([
        authFetch('/twin-fidelity/battery'),
        authFetch('/twin-fidelity/results'),
      ]);
      if (!batteryRes.ok || !resultsRes.ok) throw new Error('load failed');
      const battery = await batteryRes.json();
      const results = await resultsRes.json();
      setItems(battery.data.items || []);
      setWaves(results.data.waves || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startBattery = () => {
    setAnswers({});
    setItemIndex(0);
    setResult(null);
    setSubmitError(false);
    setView('battery');
    startedAtRef.current = Date.now();
    trackEvent('fidelity_wave_started', { wave: waves.length + 1 });
  };

  /**
   * Two-phase submission. Phase 1 stores the user's answers (fast, no
   * LLM) so they can never be lost to a slow twin. Phase 2 has the twin
   * answer and is retryable — a failure there keeps the wave and offers
   * a retry rather than sending the user back through 20 questions.
   */
  const runTwinAnswering = async (waveId: string, base: WaveResult) => {
    setView('submitting');
    try {
      const res = await authFetch(`/twin-fidelity/wave/${waveId}/twin-answer`, { method: 'POST' });
      if (!res.ok) throw new Error(`twin-answer ${res.status}`);
      const { data } = await res.json();
      setResult(data);
      trackEvent('fidelity_wave_completed', {
        wave: data.wave,
        twin_accuracy: data.twinAccuracy,
        normalized_fidelity: data.normalizedFidelity,
        duration_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      });
    } catch {
      // The wave is stored — surface it as pending, never lose the answers.
      setResult({ ...base, twinStatus: 'pending', twinAccuracy: null, normalizedFidelity: null });
      trackEvent('fidelity_twin_answer_failed', { wave: base.wave });
    } finally {
      setView('result');
      load();
    }
  };

  const submitAnswers = async (finalAnswers: Record<string, number | string>) => {
    setView('submitting');
    try {
      const res = await authFetch('/twin-fidelity/answers', {
        method: 'POST',
        body: JSON.stringify({ answers: finalAnswers }),
      });
      if (!res.ok) throw new Error(`submit ${res.status}`);
      const { data } = await res.json();
      trackEvent('fidelity_wave_stored', { wave: data.wave });
      await runTwinAnswering(data.id, data);
    } catch {
      // Phase 1 failed — nothing stored, so keep the answers on screen.
      setSubmitError(true);
      setView('battery'); // answers intact — allow retry from the last item
    }
  };

  const selectAnswer = (item: BatteryItem, value: number | string) => {
    const next = { ...answers, [item.id]: value };
    setAnswers(next);
    if (itemIndex + 1 >= items.length) {
      submitAnswers(next);
    } else {
      setItemIndex(itemIndex + 1);
    }
  };

  // ------------------------------------------------------------------
  // Battery stepper
  // ------------------------------------------------------------------
  if (view === 'battery' && items.length > 0) {
    const item = items[Math.min(itemIndex, items.length - 1)];
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setView('overview')}
            aria-label="Exit battery"
            className="flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ width: '36px', height: '36px', borderRadius: '100px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {itemIndex + 1} of {items.length} — answer as yourself, quickly and honestly
          </p>
        </div>

        {/* Progress */}
        <div className="w-full h-1 rounded-full mb-10" style={{ background: 'var(--surface)' }}>
          <div
            className="h-1 rounded-full transition-all duration-300"
            style={{ width: `${(itemIndex / items.length) * 100}%`, background: 'var(--accent-vibrant)' }}
          />
        </div>

        {submitError && (
          <p className="text-sm mb-6" style={{ color: 'var(--destructive)' }}>
            Submitting failed — answer the last item again to retry.
          </p>
        )}

        <h2
          className="mb-8"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '24px',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--foreground)',
            lineHeight: 1.35,
          }}
        >
          {item.text}
        </h2>

        {item.type === 'likert' ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => selectAnswer(item, v)}
                className="w-full text-left rounded-[12px] px-5 py-3.5 text-[15px] transition-all hover:brightness-110"
                style={{
                  background: 'var(--glass-surface-bg)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                  border: '1px solid var(--glass-surface-border)',
                  color: 'var(--foreground)',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                }}
              >
                <span className="mr-3 text-xs" style={{ color: 'var(--text-muted)' }}>{v}</span>
                {LIKERT_LABELS[v]}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {item.options.map(option => (
              <button
                key={option}
                onClick={() => selectAnswer(item, option)}
                className="w-full text-left rounded-[12px] px-5 py-3.5 text-[15px] transition-all hover:brightness-110"
                style={{
                  background: 'var(--glass-surface-bg)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                  border: '1px solid var(--glass-surface-border)',
                  color: 'var(--foreground)',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {itemIndex > 0 && (
          <button
            onClick={() => setItemIndex(itemIndex - 1)}
            className="mt-8 py-2 text-[13px] transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Back to previous question
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Submitting
  // ------------------------------------------------------------------
  if (view === 'submitting') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your answers are saved. Your twin is answering the same questions from memory...
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Result reveal
  // ------------------------------------------------------------------
  if (view === 'result' && result) {
    const twinPct = pct(result.twinAccuracy);
    const normPct = pct(result.normalizedFidelity);
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1
          className="mb-2"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '28px', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--foreground)' }}
        >
          Wave {result.wave} complete
        </h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-secondary)' }}>
          Your twin answered the same questions from its memory of you.
        </p>

        <div
          className="rounded-[16px] px-6 py-6 mb-4"
          style={{ background: 'var(--glass-surface-bg)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)', border: '1px solid var(--glass-surface-border)' }}
        >
          <span className="text-[11px] font-medium tracking-widest uppercase block mb-2" style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif' }}>
            Twin accuracy
          </span>
          <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '44px', letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
            {twinPct !== null ? `${twinPct}%` : 'Unavailable'}
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-secondary)' }}>
            {twinPct !== null
              ? 'How closely your twin matched your actual answers.'
              : 'Your answers are saved. The twin has not finished answering yet — this can be retried without redoing the battery.'}
          </p>
          {twinPct === null && result.id && (
            <button
              onClick={() => runTwinAnswering(result.id as string, result)}
              className="mt-4 px-4 py-2.5 rounded-[12px] text-sm font-medium transition-all hover:brightness-105"
              style={{
                background: 'var(--claura-bone)',
                color: 'var(--claura-bone-ink)',
                fontFamily: "'Inter', sans-serif",
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Have the twin answer now
            </button>
          )}
        </div>

        {normPct !== null ? (
          <div
            className="rounded-[16px] px-6 py-6 mb-10"
            style={{ background: 'var(--glass-surface-bg)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)', border: '1px solid var(--glass-surface-border)' }}
          >
            <span className="text-[11px] font-medium tracking-widest uppercase block mb-2" style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif' }}>
              Normalized fidelity
            </span>
            <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '44px', letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
              {normPct}%
            </p>
            <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-secondary)' }}>
              Twin accuracy relative to your own consistency — people do not answer identically twice, so 100% means the twin predicts you as well as you repeat yourself.
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed mb-10" style={{ color: 'var(--text-muted)' }}>
            Come back in a couple of weeks for wave {result.wave + 1}: comparing your answers across waves establishes your own consistency, which unlocks the normalized fidelity metric.
          </p>
        )}

        <button
          onClick={() => setView('overview')}
          className="w-full py-3.5 rounded-[12px] text-sm font-medium transition-all hover:brightness-105"
          style={{ background: 'var(--claura-bone)', color: 'var(--claura-bone-ink)', fontFamily: "'Inter', sans-serif", border: 'none', cursor: 'pointer', minHeight: '48px' }}
        >
          Done
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Overview
  // ------------------------------------------------------------------
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1
        className="mb-2"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '28px', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--foreground)' }}
      >
        How well does your twin know you?
      </h1>
      <p className="text-sm mb-10" style={{ color: 'var(--text-secondary)' }}>
        Twenty-five quick questions about yourself and your last two weeks, about three minutes.
        Your twin answers the same questions from its memory of you, and you see how close it
        gets. Repeat every couple of weeks to track fidelity honestly against your own consistency.
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : loadError ? (
        <div
          className="rounded-[16px] px-5 py-4 text-sm"
          style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)', color: 'var(--text-secondary)' }}
        >
          Could not load the battery.{' '}
          <button
            onClick={() => { setLoading(true); load(); }}
            className="underline transition-opacity hover:opacity-70"
            style={{ color: 'var(--foreground)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={startBattery}
            className="w-full py-3.5 rounded-[12px] text-sm font-medium transition-all hover:brightness-105 mb-10"
            style={{ background: 'var(--claura-bone)', color: 'var(--claura-bone-ink)', fontFamily: "'Inter', sans-serif", border: 'none', cursor: 'pointer', minHeight: '48px' }}
          >
            {/* Version-agnostic label: wave numbering restarts per battery
                version, so "check N" would drift from the stored wave. */}
            {waves.length === 0 ? 'Take the first check' : 'Take the check again'}
          </button>

          {waves.length > 0 && (
            <div className="space-y-3">
              <span className="text-[11px] font-medium tracking-widest uppercase block" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                Past checks
              </span>
              {waves.map(w => (
                <div
                  key={`${w.battery_version}-${w.wave}`}
                  className="flex items-center justify-between rounded-[16px] px-5 py-4"
                  style={{ background: 'var(--glass-surface-bg)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)', border: '1px solid var(--glass-surface-border)' }}
                >
                  <div>
                    <p className="text-[15px]" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>
                      Wave {w.wave}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(w.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] flex items-center gap-1.5 justify-end" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>
                      {pct(w.twin_accuracy) !== null ? `${pct(w.twin_accuracy)}%` : 'Twin unavailable'}
                      {pct(w.normalized_fidelity) !== null && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-vibrant)' }}>
                          <Check className="w-3 h-3" />
                          {pct(w.normalized_fidelity)}% normalized
                        </span>
                      )}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>twin accuracy</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button
        onClick={() => navigate(-1)}
        className="mt-10 py-2.5 text-[13px] transition-opacity hover:opacity-70"
        style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Back
      </button>
    </div>
  );
}
