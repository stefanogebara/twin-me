/**
 * EvolutionSection
 * ================
 * Shows how the twin's understanding of the user has grown over time.
 */

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { TrendingUp, ArrowRight, Calendar } from 'lucide-react';
import { BigFiveRadarChart } from '../PersonalityRadarChart';
import { getAccessToken } from '@/services/api/apiBase';

// Types
interface PersonalitySnapshot {
  id: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  archetype_name: string | null;
  memory_count: number;
  created_at: string;
}

interface SoulSignatureEntry {
  archetype_name: string | null;
  archetype_subtitle: string | null;
  created_at: string;
}

interface WeeklyGrowth {
  week: string;
  count: number;
}

interface EvolutionData {
  snapshots: PersonalitySnapshot[];
  signatures: SoulSignatureEntry[];
  weeklyGrowth: WeeklyGrowth[];
  firstMemoryAt: string | null;
  daysKnown: number;
}

// Helpers
function formatWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomBarTooltip = ({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-md"
      style={{ backgroundColor: 'rgba(10,15,10,0.9)', border: '1px solid var(--glass-surface-border)', borderRadius: '8px', color: 'rgba(255,255,255,0.8)' }}
    >
      <p className="font-medium text-foreground/60 mb-0.5">{label}</p>
      <p className="font-semibold text-foreground">{payload[0].value.toLocaleString()} memories</p>
    </div>
  );
};

// Sub-components
function ArchetypeTimeline({ signatures }: { signatures: SoulSignatureEntry[] }) {
  if (signatures.length === 0) return null;

  const unique: SoulSignatureEntry[] = [];
  const seen = new Set<string>();
  for (const s of signatures) {
    const key = s.archetype_name ?? '';
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
  }

  if (unique.length < 2) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div
          className="px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}
        >
          {unique[0]?.archetype_name ?? 'Unknown'}
        </div>
        <span className="text-xs text-foreground/30">— collecting more data over time</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {unique.map((s, i) => (
        <React.Fragment key={i}>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: i === unique.length - 1
                ? 'rgba(139,92,246,0.12)'
                : 'rgba(255,255,255,0.03)',
              color: i === unique.length - 1 ? '#8b5cf6' : '#8A857D',
            }}
          >
            {s.archetype_name ?? 'Unknown'}
          </div>
          {i < unique.length - 1 && (
            <ArrowRight size={12} className="text-foreground/20 flex-shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Main component
interface EvolutionSectionProps {
  compact?: boolean;
}

export function EvolutionSection({ compact = false }: EvolutionSectionProps) {
  const [data, setData] = useState<EvolutionData | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL as string;

  useEffect(() => {
    const token = getAccessToken() || localStorage.getItem('auth_token');
    if (!token) { setLoading(false); return; }

    fetch(`${API_URL}/twin/evolution`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [API_URL]);

  if (loading) return null;
  if (!data) return null;

  const latestSnapshot = data.snapshots[data.snapshots.length - 1] ?? null;
  const hasRadar = latestSnapshot !== null;
  const hasGrowth = data.weeklyGrowth.length > 0;
  const hasArchetypes = data.signatures.length > 0;

  if (!hasRadar && !hasGrowth && !hasArchetypes) return null;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
        style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(255,255,255,0.4)' }}
      >
        <Calendar size={11} />
        Known for {data.daysKnown} day{data.daysKnown !== 1 ? 's' : ''}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp size={18} className="text-foreground/40" />
        <h2 className="text-xl text-foreground">Soul Signature Evolution</h2>
        <div
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
          style={{ background: 'rgba(139,92,246,0.08)', color: '#8b5cf6' }}
        >
          <Calendar size={11} />
          {data.daysKnown} day{data.daysKnown !== 1 ? 's' : ''} of memories
        </div>
      </div>

      {/* Big Five Radar */}
      {hasRadar && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/40 mb-4">
              Personality Profile
            </p>
            <BigFiveRadarChart
              openness={latestSnapshot.openness}
              conscientiousness={latestSnapshot.conscientiousness}
              extraversion={latestSnapshot.extraversion}
              agreeableness={latestSnapshot.agreeableness}
              neuroticism={latestSnapshot.neuroticism}
              size={220}
              showLabels
              showValues
              animated
            />
            {latestSnapshot.archetype_name && (
              <p className="text-center text-sm font-medium mt-3 text-foreground/60">
                {latestSnapshot.archetype_name}
              </p>
            )}
          </div>

          {/* Archetype Timeline */}
          {hasArchetypes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground/40 mb-4">
                Archetype Journey
              </p>
              <ArchetypeTimeline signatures={data.signatures} />
              <p className="text-xs text-foreground/30 mt-3 leading-relaxed">
                As your twin learns more about you, it refines its understanding of your core archetype.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Memory Growth Bar Chart */}
      {hasGrowth && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground/40 mb-4">
            Memory Growth (weekly)
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={data.weeklyGrowth.map(w => ({
                week: formatWeek(w.week),
                count: w.count,
              }))}
              margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border-glass)" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar
                dataKey="count"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
                opacity={0.75}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default EvolutionSection;
