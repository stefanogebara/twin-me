import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, PageHead, Section, List, Row, Empty } from '@/components/register';

/**
 * Twin Fidelity check (/fidelity) — R4 test-retest evaluation UI.
 * Plan: .claude/plans/2026-08-01-twin-interview/README.md (Phase 4).
 *
 * The user answers the fixed versioned battery (one item at a time, ~3
 * minutes); the twin answers the same battery from memory server-side;
 * results show twin accuracy and, from wave 2 on, the normalized metric
 * (twin accuracy relative to the user's own wave-to-wave consistency).
 *
 * Built from the register's page kit: a title, sections of rows under an ink
 * rule, 32px buttons and one ink primary per screen.
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

/** A number at the end of a row: the title's weight, tabular figures. */
const Figure = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--rg-ink)' }}>{children}</span>
);

/** An inline text action: ink, underlined, no box. */
const textLink: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'var(--rg-ink)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};

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
      <Page>
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <button type="button" className="rg-iconbtn" onClick={() => setView('overview')} aria-label="Exit battery">
            <ArrowLeft aria-hidden="true" />
          </button>
          <p style={{ margin: 0, color: 'var(--rg-ink-2)', fontWeight: 350, fontVariantNumeric: 'tabular-nums' }}>
            {itemIndex + 1} of {items.length}. Answer as yourself, quickly.
          </p>
        </div>

        {/* Progress: a hairline track with an ink fill. */}
        <div style={{ height: 2, background: 'var(--rg-rule)', marginBottom: 'var(--rg-section)' }}>
          <div
            className="transition-all duration-300"
            style={{ height: 2, width: `${(itemIndex / items.length) * 100}%`, background: 'var(--rg-ink)' }}
          />
        </div>

        {submitError && (
          <p role="alert" style={{ margin: '0 0 24px', color: 'var(--rg-danger)' }}>
            That did not send. Answer the last question again to retry.
          </p>
        )}

        <Section title={item.text}>
          <List label="Answers">
            {item.type === 'likert'
              ? [1, 2, 3, 4, 5].map(v => (
                  <Row key={v} title={LIKERT_LABELS[v]} onClick={() => selectAnswer(item, v)} />
                ))
              : item.options.map(option => (
                  <Row key={option} title={option} onClick={() => selectAnswer(item, option)} />
                ))}
          </List>
        </Section>

        {itemIndex > 0 && (
          <button
            type="button"
            className="n-btn n-btn--ghost"
            style={{ marginTop: 32 }}
            onClick={() => setItemIndex(itemIndex - 1)}
          >
            Previous question
          </button>
        )}
      </Page>
    );
  }

  // ------------------------------------------------------------------
  // Submitting
  // ------------------------------------------------------------------
  if (view === 'submitting') {
    return (
      <Page>
        <PageHead title="Checking your twin" line="Your answers are saved. Your twin is answering the same questions from memory." />
        <div aria-busy="true" className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--rg-ink-3)' }} />
      </Page>
    );
  }

  // ------------------------------------------------------------------
  // Result reveal
  // ------------------------------------------------------------------
  if (view === 'result' && result) {
    const twinPct = pct(result.twinAccuracy);
    const normPct = pct(result.normalizedFidelity);
    const pending = twinPct === null && !!result.id;
    return (
      <Page>
        <PageHead title={`Wave ${result.wave} complete`} line="Your twin answered the same questions from its memory of you." />

        <Section>
          <List>
            <Row
              title="Twin accuracy"
              line={twinPct !== null
                ? 'How closely your twin matched your answers.'
                : 'Your answers are saved. The twin has not answered yet.'}
              action={twinPct !== null ? <Figure>{twinPct}%</Figure> : undefined}
            />
            {normPct !== null && (
              <Row
                title="Against your own consistency"
                line="100% means it predicts you as well as you repeat yourself."
                action={<Figure>{normPct}%</Figure>}
              />
            )}
          </List>
          {normPct === null && (
            <Empty>Take it again in a couple of weeks to measure it against your own consistency.</Empty>
          )}
        </Section>

        <div className="flex flex-wrap gap-2" style={{ marginTop: 32 }}>
          {pending && (
            <button
              type="button"
              className="n-btn n-btn--primary"
              onClick={() => runTwinAnswering(result.id as string, result)}
            >
              Have the twin answer now
            </button>
          )}
          <button
            type="button"
            className={pending ? 'n-btn n-btn--ghost' : 'n-btn n-btn--primary'}
            onClick={() => setView('overview')}
          >
            Done
          </button>
        </div>
      </Page>
    );
  }

  // ------------------------------------------------------------------
  // Overview
  // ------------------------------------------------------------------
  const needsSecondWave = waves.length > 0 && !waves.some(w => w.self_consistency !== null);

  return (
    <Page>
      <PageHead
        title="How well does your twin know you?"
        line="Twenty-five quick questions, about three minutes. Your twin answers them too, from memory."
        action={!loading && !loadError ? (
          <button type="button" className="n-btn n-btn--primary" onClick={startBattery}>
            {/* Version-agnostic label: wave numbering restarts per battery
                version, so "check N" would drift from the stored wave. */}
            {waves.length === 0 ? 'Take the first check' : 'Take it again'}
          </button>
        ) : undefined}
      />

      {loading ? (
        <div aria-busy="true" className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--rg-ink-3)' }} />
      ) : loadError ? (
        <p style={{ margin: 0, color: 'var(--rg-ink-2)' }}>
          Could not load the questions.{' '}
          <button type="button" style={textLink} onClick={() => { setLoading(true); load(); }}>
            Try again
          </button>
        </p>
      ) : waves.length > 0 ? (
        /* The normalized score — twin accuracy measured against the user's
           OWN answer-to-answer consistency — needs two checks on the same
           question set, so the section says so until one exists. */
        <Section
          title="Past checks"
          line={needsSecondWave ? 'Take it again on the same questions to measure it against your own consistency.' : undefined}
        >
          <List>
            {waves.map(w => {
              const acc = pct(w.twin_accuracy);
              const norm = pct(w.normalized_fidelity);
              const date = new Date(w.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              return (
                <Row
                  key={`${w.battery_version}-${w.wave}`}
                  title={`Wave ${w.wave}`}
                  line={norm !== null ? `${date} · ${norm}% against your consistency` : date}
                  action={<Figure>{acc !== null ? `${acc}%` : 'Twin unavailable'}</Figure>}
                />
              );
            })}
          </List>
        </Section>
      ) : null}

      <button type="button" className="n-btn n-btn--ghost" style={{ marginTop: 'var(--rg-section)' }} onClick={() => navigate(-1)}>
        Back
      </button>
    </Page>
  );
}
