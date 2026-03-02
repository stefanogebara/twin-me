/**
 * Memory Health Dashboard
 * =======================
 * Shows the quality and composition of the user's memory stream.
 * Accessible at /memory-health (listed in the "More" sidebar section).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PageLayout } from '@/components/layout/PageLayout';
import { authFetch } from '@/services/api/apiBase';
import { TwinReadinessScore } from '@/components/twin/TwinReadinessScore';
import {
  Brain,
  Archive,
  TrendingDown,
  Star,
  Eye,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { toSecondPerson } from '@/lib/utils';

interface MemoryHealthData {
  totalCount: number;
  composition: Record<string, number>;
  avgImportanceByType: Record<string, number>;
  retrievalCoverage: number;
  stalePct: number;
  staleCount: number;
  expertBreakdown: Record<string, number>;
  forgettingPreview: {
    wouldArchiveConversation: number;
    wouldArchivePlatformData: number;
    wouldDecayFact: number;
  };
  topMemories: Array<{
    id: string;
    type: string;
    excerpt: string;
    importance: number;
    retrievalCount: number;
    agedays: number;
  }>;
  readiness?: {
    score: number;
    label: string;
    breakdown?: { volume: number; diversity: number; reflection: number };
  };
}

const TYPE_COLORS: Record<string, string> = {
  fact: '#8B5CF6',
  reflection: '#F59E0B',
  conversation: '#3B82F6',
  platform_data: '#10B981',
};

const TYPE_LABELS: Record<string, string> = {
  fact: 'Facts',
  reflection: 'Reflections',
  conversation: 'Conversations',
  platform_data: 'Platform Data',
  observation: 'Observations',
};

const EXPERT_LABELS: Record<string, string> = {
  personality_psychologist: 'Personality',
  lifestyle_analyst: 'Lifestyle',
  cultural_identity: 'Cultural Identity',
  social_dynamics: 'Social Dynamics',
  motivation_analyst: 'Motivation',
  music_psychologist: 'Music & Mood',
  social_analyst: 'Social Patterns',
  productivity_analyst: 'Productivity',
  media_sociologist: 'Media & Culture',
  health_behaviorist: 'Health Behavior',
  cultural_analyst: 'Cultural Analysis',
  Unknown: 'General',
  unknown: 'General',
};

export default function MemoryHealth() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, error } = useQuery<MemoryHealthData>({
    queryKey: ['memory-health', refreshKey],
    queryFn: async () => {
      const res = await authFetch('/memory-health');
      if (!res.ok) throw new Error('Failed to load memory health');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const pieData = data
    ? Object.entries(data.composition).map(([type, count]) => ({
        name: TYPE_LABELS[type] || type,
        value: count,
        type,
      }))
    : [];

  const importanceData = data
    ? Object.entries(data.avgImportanceByType).map(([type, avg]) => ({
        name: TYPE_LABELS[type] || type,
        avg,
        fill: TYPE_COLORS[type] || '#6B7280',
      }))
    : [];

  const expertData = data
    ? Object.entries(data.expertBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name: name.replace(' ', '\n'), count }))
    : [];

  return (
    <PageLayout title="Memory Health" subtitle="Quality metrics for your twin's memory stream">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-stone-900">Memory Stream Health</h1>
              <p className="text-sm text-stone-500">
                {data ? `${data.totalCount.toLocaleString('en-US')} memories total` : 'Loading...'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Failed to load memory health data. Make sure the backend is running.
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* Twin Readiness Score */}
            {data.readiness !== undefined && (
              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <TwinReadinessScore
                  score={data.readiness.score}
                  label={data.readiness.label}
                  breakdown={data.readiness.breakdown}
                />
              </div>
            )}

            {/* Quality Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-stone-500 font-medium">Retrieval Coverage</span>
                </div>
                <div className="text-2xl font-bold text-stone-900">
                  {(data.retrievalCoverage * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-stone-400 mt-1">memories accessed ≥1×</div>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-stone-500 font-medium">Stale Memories</span>
                </div>
                <div className="text-2xl font-bold text-stone-900">
                  {(data.stalePct * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-stone-400 mt-1">{data.staleCount.toLocaleString('en-US')} older than 90 days</div>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs text-stone-500 font-medium">Avg Importance</span>
                </div>
                <div className="text-2xl font-bold text-stone-900">
                  {importanceData.length > 0
                    ? (importanceData.reduce((s, d) => s + d.avg, 0) / importanceData.length).toFixed(1)
                    : '—'}
                </div>
                <div className="text-xs text-stone-400 mt-1">across all types (1–10)</div>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <span className="text-xs text-stone-500 font-medium">Expert Types</span>
                </div>
                <div className="text-2xl font-bold text-stone-900">
                  {Object.keys(data.expertBreakdown).length}
                </div>
                <div className="text-xs text-stone-400 mt-1">reflection experts active</div>
              </div>
            </div>

            {/* Composition + Importance Charts */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <h2 className="text-sm font-semibold text-stone-700 mb-4">Memory Composition</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {pieData.map((entry, i) => (
                        <Cell key={entry.type} fill={TYPE_COLORS[entry.type] || '#9CA3AF'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => [val.toLocaleString('en-US'), 'count']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-3">
                  {pieData.map(d => (
                    <div key={d.type} className="flex items-center gap-1.5 text-xs text-stone-600">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: TYPE_COLORS[d.type] || '#9CA3AF' }} />
                      {d.name}: {d.value.toLocaleString('en-US')}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <h2 className="text-sm font-semibold text-stone-700 mb-4">Avg Importance by Type</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={importanceData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val: number) => [val.toFixed(2), 'avg importance']} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {importanceData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Expert Breakdown */}
            {expertData.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <h2 className="text-sm font-semibold text-stone-700 mb-4">Expert Memory Breakdown</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(data.expertBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                        <span className="text-xs text-stone-600 leading-tight">{EXPERT_LABELS[name] ?? name}</span>
                        <span className="text-sm font-semibold text-stone-900 ml-2">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Forgetting Preview */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Archive className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-amber-800">Next Weekly Forgetting Run Preview</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-700">{data.forgettingPreview.wouldArchiveConversation}</div>
                  <div className="text-xs text-amber-600 mt-1">conversations would archive<br />(&gt;30d, importance ≤3)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-700">{data.forgettingPreview.wouldArchivePlatformData}</div>
                  <div className="text-xs text-amber-600 mt-1">platform data would archive<br />(&gt;14d, never retrieved)</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingDown className="w-4 h-4 text-amber-700" />
                    <div className="text-2xl font-bold text-amber-700">{data.forgettingPreview.wouldDecayFact}</div>
                  </div>
                  <div className="text-xs text-amber-600 mt-1">facts would decay 20%<br />(&gt;90d, importance ≤5)</div>
                </div>
              </div>
            </div>

            {/* Top Memories */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="text-sm font-semibold text-stone-700 mb-4">Top 10 Memories by Importance</h2>
              <div className="space-y-2">
                {data.topMemories.map(m => (
                  <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-stone-50 transition-colors">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-white"
                      style={{ background: TYPE_COLORS[m.type] || '#9CA3AF' }}
                    >
                      {m.importance}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-700 leading-snug">{toSecondPerson(m.excerpt)}{m.excerpt.length >= 120 ? '…' : ''}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-stone-400">{TYPE_LABELS[m.type] || m.type}</span>
                        <span className="text-xs text-stone-400">·</span>
                        <span className="text-xs text-stone-400">{m.retrievalCount}× accessed</span>
                        <span className="text-xs text-stone-400">·</span>
                        <span className="text-xs text-stone-400">{m.agedays}d old</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
