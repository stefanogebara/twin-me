import React from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
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

export const BentoExpertSpotlight: React.FC<Props> = ({ reflections, animationDelay = 0 }) => {
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
    <motion.div
      className="rounded-2xl p-5 md:p-6"
      style={{
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: animationDelay, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: 'rgba(155, 89, 182, 0.15)' }}>
          <Brain className="w-3.5 h-3.5" style={{ color: '#9B59B6' }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8A857D' }}>
          Expert Analysis
        </p>
        <span className="ml-auto text-xs" style={{ color: '#c4bfba' }}>
          {reflections.length} observation{reflections.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* 2-col grid of domain sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeExperts.map((expertKey, groupIdx) => {
          const meta = EXPERT_META[expertKey] ?? { label: expertKey, shortLabel: expertKey, color: '#9B59B6' };
          const expertReflections = grouped[expertKey];

          return (
            <motion.div
              key={expertKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: animationDelay + groupIdx * 0.05 }}
            >
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
                      color: '#3d3730',
                    }}
                  >
                    {r.content}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};
