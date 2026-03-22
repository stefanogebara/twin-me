/**
 * Memory Health Dashboard
 * Shows the quality and composition of the user's memory stream.
 * Typography-driven dark design.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
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
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

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
  reflection: 'rgba(255,255,255,0.5)',
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
  useDocumentTitle('Memory Health');
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

  return (
    <div className="max-w-[900px] mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Memory Stream Health
        </h1>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="p-2 rounded-lg transition-opacity hover:opacity-60"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        {data ? `${data.totalCount.toLocaleString('en-US')} memories total` : 'Quality metrics for your twin\'s memory stream'}
      </p>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-8" />

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg text-sm mb-6" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Failed to load memory health data. Make sure the backend is running.
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* Twin Readiness Score */}
          {data.readiness !== undefined && (
            <div
              className="p-5 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <TwinReadinessScore
                score={data.readiness.score}
                label={data.readiness.label}
                breakdown={data.readiness.breakdown}
              />
            </div>
          )}

          {/* Quality Indicators */}
          <div>
            <span
              className="text-[11px] font-medium tracking-widest uppercase block mb-4"
              style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
            >
              Quality Indicators
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Eye, color: '#3B82F6', label: 'Retrieval Coverage', value: `${(data.retrievalCoverage * 100).toFixed(1)}%`, sub: 'memories accessed ≥1×' },
                { icon: Clock, color: 'rgba(255,255,255,0.5)', label: 'Stale Memories', value: `${(data.stalePct * 100).toFixed(1)}%`, sub: `${data.staleCount.toLocaleString('en-US')} older than 90 days` },
                { icon: Star, color: '#FBBF24', label: 'Avg Importance', value: importanceData.length > 0 ? (importanceData.reduce((s, d) => s + d.avg, 0) / importanceData.length).toFixed(1) : '—', sub: 'across all types (1–10)' },
                { icon: Brain, color: '#8B5CF6', label: 'Expert Types', value: String(Object.keys(data.expertBreakdown).length), sub: 'reflection experts active' },
              ].map(({ icon: Icon, color, label, value, sub }) => (
                <div
                  key={label}
                  className="p-4 rounded-lg"
                  style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4" style={{ color }} />
                    <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{value}</div>
                  <div className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Composition + Importance Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <div
              className="p-5 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <span className="text-[11px] font-medium tracking-widest uppercase block mb-4" style={{ color: '#10b77f' }}>
                Memory Composition
              </span>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {pieData.map((entry) => (
                      <Cell key={entry.type} fill={TYPE_COLORS[entry.type] || '#9CA3AF'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => [val.toLocaleString('en-US'), 'count']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-3">
                {pieData.map(d => (
                  <div key={d.type} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: TYPE_COLORS[d.type] || '#9CA3AF' }} />
                    {d.name}: {d.value.toLocaleString('en-US')}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="p-5 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <span className="text-[11px] font-medium tracking-widest uppercase block mb-4" style={{ color: '#10b77f' }}>
                Avg Importance by Type
              </span>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={importanceData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
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
          {Object.keys(data.expertBreakdown).length > 0 && (
            <div>
              <span className="text-[11px] font-medium tracking-widest uppercase block mb-4" style={{ color: '#10b77f' }}>
                Expert Memory Breakdown
              </span>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(data.expertBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                    >
                      <span className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.4)' }}>{EXPERT_LABELS[name] ?? name}</span>
                      <span className="text-sm font-semibold ml-2" style={{ color: 'var(--foreground)' }}>{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Forgetting Preview */}
          <div
            className="p-5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Archive className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
              <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Next Weekly Forgetting Run Preview
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{data.forgettingPreview.wouldArchiveConversation}</div>
                <div className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>conversations would archive<br />(&gt;30d, importance ≤3)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{data.forgettingPreview.wouldArchivePlatformData}</div>
                <div className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>platform data would archive<br />(&gt;14d, never retrieved)</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendingDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                  <div className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{data.forgettingPreview.wouldDecayFact}</div>
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>facts would decay 20%<br />(&gt;90d, importance ≤5)</div>
              </div>
            </div>
          </div>

          {/* Top Memories */}
          <div>
            <span className="text-[11px] font-medium tracking-widest uppercase block mb-4" style={{ color: '#10b77f' }}>
              Top 10 Memories by Importance
            </span>
            <div className="space-y-0">
              {data.topMemories.map(m => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-white"
                    style={{ background: TYPE_COLORS[m.type] || '#9CA3AF' }}
                  >
                    {m.importance}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>{toSecondPerson(m.excerpt)}{m.excerpt.length >= 120 ? '…' : ''}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{TYPE_LABELS[m.type] || m.type}</span>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{m.retrievalCount}× accessed</span>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{m.agedays}d old</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
