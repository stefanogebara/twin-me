/**
 * PersonalityDNA -- OCEAN Spectrum Sliders (Crystal Knows style)
 * ===============================================================
 * Five horizontal spectrum sliders showing Big Five personality dimensions
 * with TwinMe-flavored labels. Animated dot indicator for each trait.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────

interface OceanScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

interface PersonalityDNAProps {
  ocean?: OceanScores | null;
  className?: string;
  delay?: number;
}

// ── Trait definitions ────────────────────────────────────────────────────

interface TraitDef {
  key: keyof OceanScores;
  leftLabel: string;
  rightLabel: string;
}

const TRAITS: readonly TraitDef[] = [
  { key: 'openness', leftLabel: 'Practical Thinker', rightLabel: 'Creative Explorer' },
  { key: 'conscientiousness', leftLabel: 'Free Spirit', rightLabel: 'Master Planner' },
  { key: 'extraversion', leftLabel: 'Solo Recharger', rightLabel: 'Social Battery' },
  { key: 'agreeableness', leftLabel: 'Straight Shooter', rightLabel: 'Warm Diplomat' },
  { key: 'neuroticism', leftLabel: 'Calm Waters', rightLabel: 'Deep Feeler' },
] as const;

const ACCENT_COLOR = 'rgba(199,146,234,0.8)'; // lavender

// ── Helpers ──────────────────────────────────────────────────────────────

/** Clamp score to 0-1 range for safe positioning */
function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Format trait name from camelCase key */
function formatTraitName(key: string): string {
  const labels: Record<string, string> = {
    openness: 'Openness',
    conscientiousness: 'Conscientiousness',
    extraversion: 'Extraversion',
    agreeableness: 'Agreeableness',
    neuroticism: 'Neuroticism',
  };
  return labels[key] ?? key;
}

// ── Trait Slider Component ───────────────────────────────────────────────

interface TraitSliderProps {
  trait: TraitDef;
  score: number;
  index: number;
  delay: number;
}

const TraitSlider: React.FC<TraitSliderProps> = ({ trait, score, index, delay }) => {
  const clamped = clampScore(score);
  const percentage = clamped * 100;

  return (
    <div className="mb-5 last:mb-0">
      {/* Trait name */}
      <p
        className="text-xs font-medium mb-2 uppercase tracking-[0.08em]"
        style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
      >
        {formatTraitName(trait.key)}
      </p>

      {/* Labels row */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          {trait.leftLabel}
        </span>
        <span
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          {trait.rightLabel}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {/* Center marker */}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: '50%', background: 'rgba(255,255,255,0.08)' }}
        />

        {/* Animated dot */}
        <motion.div
          className="absolute top-1/2 w-3 h-3 rounded-full"
          style={{
            backgroundColor: ACCENT_COLOR,
            marginLeft: '-6px',
            marginTop: '-6px',
            boxShadow: `0 0 8px ${ACCENT_COLOR}`,
          }}
          initial={{ left: '50%' }}
          animate={{ left: `${percentage}%` }}
          transition={{
            duration: 1,
            delay: delay + index * 0.15,
            ease: 'easeOut',
          }}
        />
      </div>
    </div>
  );
};

// ── Empty State ──────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div
    className="rounded-[16px] px-5 py-6 text-center"
    style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <p
      className="text-sm"
      style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
    >
      Chat more to discover your personality DNA
    </p>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────

const PersonalityDNA: React.FC<PersonalityDNAProps> = ({
  ocean,
  className = '',
  delay = 0.3,
}) => {
  const hasData = ocean != null && ocean.openness != null;

  return (
    <motion.div
      className={`mb-14 ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.25)' }} />
        <span
          className="text-[11px] uppercase tracking-[0.12em] font-medium"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          Personality DNA
        </span>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <div
          className="rounded-[16px] px-5 py-5"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {TRAITS.map((trait, index) => (
            <TraitSlider
              key={trait.key}
              trait={trait}
              score={ocean[trait.key]}
              index={index}
              delay={delay}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default PersonalityDNA;
