/**
 * EvalDashboard — Twin Accuracy Eval Tool
 * =========================================
 * Internal tool at /eval for scoring the twin's accuracy on 10 standard questions.
 * Also provides feature flag toggles for A/B testing cognitive pipeline features.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageLayout } from '@/components/layout/PageLayout';
import { authFetch } from '@/services/api/apiBase';
import { toast } from 'sonner';
import {
  ClipboardCheck,
  Play,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

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
  expert_routing: { label: 'Expert Routing', description: 'Domain-specific memory injection via platform experts' },
  identity_context: { label: 'Identity Context', description: 'Life stage & cultural conditioning layer' },
  emotional_state: { label: 'Emotional State', description: 'Real-time emotional fingerprint injection' },
  ebbinghaus_decay: { label: 'Ebbinghaus Decay', description: 'Time-decay weighting in memory retrieval' },
};

const TYPE_COLORS: Record<string, string> = {
  factual: '#6366F1',
  preference: '#F59E0B',
  behavioral: '#10B981',
  value: '#8B5CF6',
  prediction: '#F43F5E',
};

const ScoreButton = ({ value, current, onClick }: { value: number; current: number | null; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
      current === value
        ? 'bg-indigo-600 text-white'
        : 'bg-white/8 text-muted-foreground hover:bg-white/10'
    }`}
  >
    {value}
  </button>
);

// ── Main Component ────────────────────────────────────────────────────────────

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
    <PageLayout title="Twin Eval" subtitle="Score accuracy, specificity, and voice across 10 standard questions">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-900/20 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Twin Accuracy Eval</h1>
              <p className="text-sm text-muted-foreground">Internal tool — run monthly to track quality</p>
            </div>
          </div>
          {trend !== null && trend !== undefined && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
              trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-900/20 text-red-700'
            }`}>
              {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {trend >= 0 ? '+' : ''}{trend}% vs last run
            </div>
          )}
        </div>

        {/* Score History Chart */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">Score History</h2>
          {historyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={historyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(val: number) => [`${val}%`, 'score']} />
                <Line type="monotone" dataKey="score" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">No scored eval runs yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Run an eval below and score the responses to see your history chart.
              </p>
            </div>
          )}
        </div>

        {/* Feature Flags */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">Feature Flags (A/B)</h2>
          <p className="text-xs text-muted-foreground mb-4">Toggle features off, run an eval, compare scores to measure impact.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {(flagsData?.flags || []).map(flag => {
              const meta = FLAG_LABELS[flag.flag_name] || { label: flag.flag_name, description: '' };
              return (
                <div key={flag.flag_name} className="flex items-center justify-between p-3 bg-[var(--glass-surface-bg)] rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-foreground">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">{meta.description}</div>
                  </div>
                  <button
                    onClick={() => flagMutation.mutate({ flag_name: flag.flag_name, enabled: !flag.enabled })}
                    disabled={flagMutation.isPending}
                    className="ml-3 flex-shrink-0"
                    title={flag.enabled ? 'Disable' : 'Enable'}
                  >
                    {flag.enabled
                      ? <ToggleRight className="w-8 h-8 text-indigo-400" />
                      : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Start Eval Run */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Run New Eval</h2>
            {activeRun && (
              <span className="text-xs text-muted-foreground">
                {scoredCount}/{questionCount} scored
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Asks the twin 10 standard questions and captures responses. You then score each on Accuracy, Specificity, and Voice (1–5).
          </p>
          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {runMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Running 10 questions...</>
              : <><Play className="w-4 h-4" /> Start Eval Run</>}
          </button>
          {runMutation.isPending && (
            <p className="text-xs text-muted-foreground mt-2">This may take 30–60 seconds while the twin answers each question.</p>
          )}
        </div>

        {/* Active Run: Score Questions */}
        {activeRun && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Score Responses</h2>
              {activeRun.total_score !== null && (
                <div className="px-3 py-1 bg-indigo-900/20 text-indigo-700 rounded-lg text-sm font-bold">
                  {activeRun.total_score.toFixed(1)}%
                </div>
              )}
            </div>

            {activeRun.questions.map(q => {
              const local = localScores[q.id] || { accuracy: null, specificity: null, voice: null };
              const isExpanded = expandedQ === q.id;
              return (
                <div key={q.id} className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-[var(--glass-surface-bg-hover)] transition-colors text-left"
                    onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0`} style={{ background: TYPE_COLORS[q.type] || '#9CA3AF' }} />
                      <span className="text-sm font-medium text-foreground">{q.question}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {local.accuracy !== null && local.specificity !== null && local.voice !== null && (
                        <span className="text-xs text-emerald-600 font-medium">✓ scored</span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--glass-surface-border)] p-4 space-y-4">
                      <div className="bg-[var(--glass-surface-bg)] rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1 font-medium">Twin's response:</div>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{q.twinResponse}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        {(['accuracy', 'specificity', 'voice'] as const).map(dim => (
                          <div key={dim}>
                            <div className="text-xs font-medium text-muted-foreground mb-2 capitalize">{dim}</div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(v => (
                                <ScoreButton key={v} value={v} current={local[dim]} onClick={() => setScore(q.id, dim, v)} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-2 border-t border-[var(--glass-surface-border)]">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes about this eval run..."
                rows={2}
                className="w-full text-sm border border-white/10 rounded-lg p-3 resize-none text-muted-foreground placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={() => scoreMutation.mutate()}
                disabled={scoreMutation.isPending || scoredCount === 0}
                className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {scoreMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  : `Save Scores (${scoredCount}/${questionCount} answered)`}
              </button>
            </div>
          </div>
        )}

        {/* History Table */}
        {(historyData?.runs || []).length > 0 && (
          <div className="glass-card p-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4">Past Runs</h2>
            <div className="space-y-2">
              {historyData.runs.map((run: any) => (
                <div key={run.id} className="flex items-center justify-between p-3 bg-[var(--glass-surface-bg)] rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">{new Date(run.run_at).toLocaleString()}</div>
                    {run.notes && <div className="text-xs text-muted-foreground mt-0.5">{run.notes}</div>}
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {run.total_score !== null ? `${run.total_score.toFixed(1)}%` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
