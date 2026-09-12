/**
 * EvalDashboard — Twin Accuracy Eval Tool
 * =========================================
 * Internal tool at /eval for scoring the twin's accuracy on 10 standard questions.
 * Also provides feature flag toggles for A/B testing cognitive pipeline features.
 * In the register: the chart sits in a list item, flags are rows with a
 * switch, scores are 32/4 choices, and there is one ink primary at a time.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { authFetch } from '@/services/api/apiBase';
import { toast } from 'sonner';
import { Play, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Page, PageHead, Section, List, Row, Empty } from '@/components/register';
import '@/styles/register-insights.css';

// -- Types --

interface EvalQuestion {
  id: number;
  type: string;
  question: string;
  twinResponse: string;
  scores: { accuracy: number | null; specificity: number | null; voice: number | null };
}

interface EvalRun {
  id: string;
  user_id: string;
  run_at: string;
  questions: EvalQuestion[];
  total_score: number | null;
  notes: string | null;
}

interface FeatureFlag {
  flag_name: string;
  enabled: boolean;
  updated_at: string | null;
}

const FLAG_LABELS: Record<string, { label: string; description: string }> = {
  expert_routing: { label: 'Expert routing', description: 'Domain-specific memory injection via platform experts' },
  identity_context: { label: 'Identity context', description: 'Life stage and cultural conditioning layer' },
  emotional_state: { label: 'Emotional state', description: 'Real-time emotional fingerprint injection' },
  ebbinghaus_decay: { label: 'Ebbinghaus decay', description: 'Time-decay weighting in memory retrieval' },
};

/* SVG presentation attributes do not resolve var(): register.css's hex values.
   --rg-signal for the line (3.3:1 on the page), --rg-rule for the grid, --rg-ink-2 for ticks. */
const SIGNAL = '#0096ba';
const RULE = '#eae9ea';
const INK_2 = '#585254';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const ScoreButton = ({ value, current, label, onClick }: { value: number; current: number | null; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="n-btn n-btn--ghost rg-choice rg-choice--num"
    aria-pressed={current === value}
    aria-label={`${label} ${value}`}
  >
    {value}
  </button>
);

// -- Main Component --

export default function EvalDashboard() {
  const queryClient = useQueryClient();
  const [activeRun, setActiveRun] = useState<EvalRun | null>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [localScores, setLocalScores] = useState<Record<number, { accuracy: number | null; specificity: number | null; voice: number | null }>>({});
  const [notes, setNotes] = useState('');

  // Load history
  const { data: historyData } = useQuery({
    queryKey: ['eval-history'],
    queryFn: async () => {
      const res = await authFetch('/eval/history');
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
  });

  // Load feature flags
  const { data: flagsData, refetch: refetchFlags } = useQuery<{ flags: FeatureFlag[] }>({
    queryKey: ['eval-flags'],
    queryFn: async () => {
      const res = await authFetch('/eval/flags');
      if (!res.ok) throw new Error('Failed to load flags');
      return res.json();
    },
  });

  // The 10 canonical eval questions (must match api/routes/eval.js)
  const EVAL_QUESTIONS = [
    { id: 1, type: 'factual',    question: 'What is my job or professional role?' },
    { id: 2, type: 'factual',    question: 'What city or country do I live in?' },
    { id: 3, type: 'preference', question: 'What music genre or artists do I listen to most?' },
    { id: 4, type: 'preference', question: 'What do I do for exercise or physical activity?' },
    { id: 5, type: 'behavioral', question: 'Am I more of a morning or night person?' },
    { id: 6, type: 'behavioral', question: 'Do I tend to have busier weekdays or busier weekends?' },
    { id: 7, type: 'value',      question: 'How would you describe my relationship to productivity and work?' },
    { id: 8, type: 'value',      question: 'What topics or subjects am I most curious about?' },
    { id: 9, type: 'prediction', question: 'What would I most likely do on a free Saturday afternoon?' },
    { id: 10, type: 'prediction', question: 'What kind of content or recommendations would I share with a friend?' },
  ] as const;

  // Start eval run — calls twin chat from the browser, then stores results
  const runMutation = useMutation({
    mutationFn: async () => {
      const results: { id: number; type: string; question: string; twinResponse: string; scores: { accuracy: null; specificity: null; voice: null } }[] = [];

      for (const q of EVAL_QUESTIONS) {
        try {
          const res = await authFetch('/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Eval-Mode': 'true' },
            body: JSON.stringify({ message: q.question, streaming: false }),
          });
          let twinResponse = '[no response]';
          if (res.ok) {
            const data = await res.json();
            twinResponse = data.response || data.message || data.content || '[empty]';
          } else {
            twinResponse = `[error ${res.status}]`;
          }
          results.push({ ...q, twinResponse, scores: { accuracy: null, specificity: null, voice: null } });
        } catch (err: any) {
          results.push({ ...q, twinResponse: `[error: ${err.message}]`, scores: { accuracy: null, specificity: null, voice: null } });
        }
      }

      // Per-question failures are stored inline as "[error ...]" responses so
      // they stay visible in the scoring UI — but also call them out up front
      // so a partially-failed run is not mistaken for a clean one
      // (audit-2026-07-03).
      const failedCount = results.filter(r => r.twinResponse.startsWith('[error')).length;
      if (failedCount > 0) {
        toast.warning(`${failedCount} of ${EVAL_QUESTIONS.length} questions failed — their responses are stored as [error]`);
      }

      // Store pre-collected results (backend only does DB write now)
      const storeRes = await authFetch('/eval/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: results }),
      });
      if (!storeRes.ok) throw new Error('Failed to save eval run');
      return storeRes.json();
    },
    onSuccess: (data) => {
      setActiveRun(data.run);
      setLocalScores({});
      setNotes('');
      toast.success('Eval run complete — score each response below');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Save scores
  const scoreMutation = useMutation({
    mutationFn: async () => {
      if (!activeRun) throw new Error('No active run');
      const scores = Object.entries(localScores).map(([qId, s]) => ({
        questionId: parseInt(qId),
        ...s,
      }));
      const res = await authFetch('/eval/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: activeRun.id, scores, notes }),
      });
      if (!res.ok) throw new Error('Failed to save scores');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eval-history'] });
      setActiveRun(data.run);
      toast.success(`Eval scored: ${data.run.total_score?.toFixed(1) ?? '—'}%`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Toggle feature flag
  const flagMutation = useMutation({
    mutationFn: async ({ flag_name, enabled }: { flag_name: string; enabled: boolean }) => {
      const res = await authFetch('/eval/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_name, enabled }),
      });
      if (!res.ok) throw new Error('Failed to update flag');
      return res.json();
    },
    onSuccess: () => refetchFlags(),
    onError: (err: Error) => toast.error(err.message),
  });

  const setScore = (qId: number, dim: 'accuracy' | 'specificity' | 'voice', val: number) => {
    setLocalScores(prev => ({
      ...prev,
      [qId]: { ...(prev[qId] || { accuracy: null, specificity: null, voice: null }), [dim]: val },
    }));
  };

  const scoredCount = Object.values(localScores).filter(s => s.accuracy !== null && s.specificity !== null && s.voice !== null).length;
  const questionCount = activeRun?.questions.length || 0;

  const historyChartData = (historyData?.runs || [])
    .filter((r: any) => r.total_score !== null)
    .slice()
    .reverse()
    .map((r: any) => ({
      date: new Date(r.run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: parseFloat(r.total_score.toFixed(1)),
    }));

  const trend = historyData?.trend;

  return (
    <Page>
      <PageHead
        title="Twin accuracy"
        line={
          trend !== null && trend !== undefined ? (
            <>
              Run it monthly.{' '}
              <span className={trend >= 0 ? 'ri-ok' : 'ri-danger'}>
                {trend >= 0 ? 'Up' : 'Down'} {Math.abs(trend)}% on the last run.
              </span>
            </>
          ) : (
            'Run it monthly to track quality.'
          )
        }
      />

      {/* Score History Chart */}
      <Section title="Score history" line="Scored runs, out of 100.">
        {historyChartData.length > 0 ? (
          <List>
            <li className="ri-block">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={historyChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={RULE} />
                  <XAxis dataKey="date" tick={{ fontSize: 13, fill: INK_2 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 13, fill: INK_2 }} unit="%" axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    formatter={(val: number) => [`${val}%`, 'score']}
                    contentStyle={{ backgroundColor: 'var(--rg-white)', border: '1px solid var(--rg-rule)', borderRadius: 4, boxShadow: 'none', fontSize: 13 }}
                    labelStyle={{ color: 'var(--rg-ink)', fontWeight: 500 }}
                    itemStyle={{ color: 'var(--rg-ink-2)' }}
                  />
                  <Line type="monotone" dataKey="score" stroke={SIGNAL} strokeWidth={2} dot={{ fill: SIGNAL, r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </li>
          </List>
        ) : (
          <>
            <List>{null}</List>
            <Empty>No scored runs yet. Run one below and score it.</Empty>
          </>
        )}
      </Section>

      {/* Feature Flags */}
      <Section title="Feature flags" line="Turn one off, run an eval, compare the scores.">
        <List>
          {(flagsData?.flags || []).map(flag => {
            const meta = FLAG_LABELS[flag.flag_name] || { label: flag.flag_name, description: '' };
            return (
              <Row
                key={flag.flag_name}
                title={meta.label}
                line={meta.description || undefined}
                action={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flag.enabled}
                    aria-label={meta.label}
                    onClick={() => flagMutation.mutate({ flag_name: flag.flag_name, enabled: !flag.enabled })}
                    disabled={flagMutation.isPending}
                    className="ri-switch"
                    title={flag.enabled ? 'Disable' : 'Enable'}
                  />
                }
              />
            );
          })}
        </List>
      </Section>

      {/* Start Eval Run */}
      <Section title="Run an eval" line="The twin answers 10 questions; you score each from 1 to 5.">
        <div className="ri-ruled">
          <div className="ri-actions">
            <button
              type="button"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className={`n-btn ${activeRun ? 'n-btn--ghost' : 'n-btn--primary'}`}
            >
              {runMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Running 10 questions...</>
                : <><Play className="w-4 h-4" aria-hidden="true" /> Start eval run</>}
            </button>
            {runMutation.isPending && (
              <span className="ri-q">This takes 30 to 60 seconds.</span>
            )}
          </div>
        </div>
      </Section>

      {/* Active Run: Score Questions */}
      {activeRun && (
        <Section
          title="Score responses"
          line={`${scoredCount} of ${questionCount} scored${activeRun.total_score !== null ? ` · ${activeRun.total_score.toFixed(1)}%` : ''}`}
        >
          <List>
            {activeRun.questions.map(q => {
              const local = localScores[q.id] || { accuracy: null, specificity: null, voice: null };
              const isExpanded = expandedQ === q.id;
              const scored = local.accuracy !== null && local.specificity !== null && local.voice !== null;
              const Chevron = isExpanded ? ChevronDown : ChevronRight;
              return (
                <React.Fragment key={q.id}>
                  <li>
                    <button
                      type="button"
                      className="rg-row rg-row--plain rg-row--link"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                    >
                      <span className="rg-row-text">
                        <span className="rg-row-title">{q.question}</span>
                        <span className="rg-row-line">
                          {capitalize(q.type)}
                          {scored && <span className="ri-ok"> · Scored</span>}
                        </span>
                      </span>
                      <span className="rg-row-action">
                        <Chevron className="rg-chevron" aria-hidden="true" />
                      </span>
                    </button>
                  </li>

                  {isExpanded && (
                    <li className="ri-block">
                      <span className="rg-row-title">The twin said</span>
                      <p className="ri-prose whitespace-pre-wrap" style={{ margin: '0 0 20px' }}>{q.twinResponse}</p>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {(['accuracy', 'specificity', 'voice'] as const).map(dim => (
                          <div key={dim} role="group" aria-label={capitalize(dim)}>
                            <div className="rg-row-line" style={{ marginBottom: 8 }}>{capitalize(dim)}</div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(v => (
                                <ScoreButton key={v} value={v} current={local[dim]} label={capitalize(dim)} onClick={() => setScore(q.id, dim, v)} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </List>

          <div className="ri-form" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div className="ri-field">
              <label className="ri-label" htmlFor="eval-notes">Notes</label>
              <textarea
                id="eval-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes about this eval run..."
                rows={2}
                className="rg-input"
              />
            </div>
            <div className="ri-actions">
              <button
                type="button"
                onClick={() => scoreMutation.mutate()}
                disabled={scoreMutation.isPending || scoredCount === 0}
                className="n-btn n-btn--primary"
              >
                {scoreMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving...</>
                  : `Save scores (${scoredCount} of ${questionCount})`}
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* History */}
      {(historyData?.runs || []).length > 0 && (
        <Section title="Past runs">
          <List>
            {historyData.runs.map((run: any) => (
              <Row
                key={run.id}
                title={new Date(run.run_at).toLocaleString('en-US')}
                line={run.notes || undefined}
                action={
                  <span className="rg-figures" style={{ fontWeight: 500 }}>
                    {run.total_score !== null ? `${run.total_score.toFixed(1)}%` : '—'}
                  </span>
                }
              />
            ))}
          </List>
        </Section>
      )}
    </Page>
  );
}
