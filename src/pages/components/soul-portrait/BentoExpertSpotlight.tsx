import React from 'react';
import { Brain } from 'lucide-react';
import { toSecondPerson } from '@/lib/utils';
import type { ExpertReflection } from './types';

const EXPERT_META: Record<string, { label: string; color: string; shortLabel: string }> = {
  personality_psychologist: { label: 'Personality Psychologist', shortLabel: 'Personality', color: '#9B59B6' },
  lifestyle_analyst: { label: 'Lifestyle Analyst', shortLabel: 'Lifestyle', color: '#E74C3C' },
  cultural_identity: { label: 'Cultural Identity Expert', shortLabel: 'Culture & Identity', color: '#3498DB' },
  social_dynamics: { label: 'Social Dynamics Analyst', shortLabel: 'Social Dynamics', color: '#2ECC71' },
  motivation_analyst: { label: 'Motivation Analyst', shortLabel: 'Motivation', color: '#F39C12' },
};

// Domain display order
const EXPERT_ORDER = [
  'personality_psychologist',
  'lifestyle_analyst',
  'cultural_identity',
  'social_dynamics',
  'motivation_analyst',
];

interface Props {
  reflections: ExpertReflection[];
  animationDelay?: number;
}

export const BentoExpertSpotlight: React.FC<Props> = ({ reflections }) => {
  if (reflections.length === 0) return null;

  // Group reflections by expert, limit to 2 per expert
  const grouped: Record<string, ExpertReflection[]> = {};
  for (const r of reflections) {
    const key = r.metadata?.expert ?? 'unknown';
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 2) {
      grouped[key].push(r);
    }
  }

  // Only show experts that have reflections, in canonical order
  const activeExperts = EXPERT_ORDER.filter(k => (grouped[k]?.length ?? 0) > 0);

  return (
    <div
      className="rounded-lg p-5 md:p-6"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: 'rgba(155, 89, 182, 0.15)' }}>
          <Brain className="w-3.5 h-3.5" style={{ color: '#9B59B6' }} />
        </div>
        <p className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
          Expert Analysis
        </p>
        <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {reflections.length} observation{reflections.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* 2-col grid of domain sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeExperts.map((expertKey) => {
          const meta = EXPERT_META[expertKey] ?? { label: expertKey, shortLabel: expertKey, color: '#9B59B6' };
          const expertReflections = grouped[expertKey];

          return (
            <div key={expertKey}>
              {/* Domain label */}
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: meta.color }}
              >
                {meta.shortLabel}
              </p>

              {/* Reflection cards */}
              <div className="space-y-2">
                {expertReflections.map((r, i) => (
                  <div
                    key={r.id ?? i}
                    className="p-3 rounded-xl text-sm leading-relaxed"
                    style={{
                      background: `${meta.color}08`,
                      borderLeft: `2px solid ${meta.color}40`,
                      color: 'var(--foreground)',
                    }}
                  >
                    {toSecondPerson(r.content)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
