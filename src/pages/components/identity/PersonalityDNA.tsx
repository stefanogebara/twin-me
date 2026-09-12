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

// Iris from register.css: a mark, never text.
const ACCENT_COLOR = '#8179fb';

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
        className="text-[13px] font-medium mb-2"
        style={{ color: 'var(--rg-ink)', fontFamily: 'var(--rg-sans)' }}
      >
        {formatTraitName(trait.key)}
      </p>

      {/* Labels row */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[13px]"
          style={{ color: 'var(--rg-ink-2)', fontFamily: 'var(--rg-sans)' }}
        >
          {trait.leftLabel}
        </span>
        <span
          className="text-[13px]"
          style={{ color: 'var(--rg-ink-2)', fontFamily: 'var(--rg-sans)' }}
        >
          {trait.rightLabel}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--rg-rule)' }}>
        {/* Center marker */}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: '50%', background: 'var(--rg-quiet)' }}
        />

        {/* Animated dot */}
        <motion.div
          className="absolute top-1/2 w-3 h-3 rounded-full"
          style={{
            backgroundColor: ACCENT_COLOR,
            marginLeft: '-6px',
            marginTop: '-6px',
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
    style={{ borderTop: '1px solid var(--rg-ink)' }}
  >
    <p className="rg-empty">
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
      className={`mb-20 ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4" style={{ color: 'var(--rg-ink-2)' }} aria-hidden="true" />
        <span className="rg-row-title">Personality DNA</span>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <div style={{ borderTop: '1px solid var(--rg-ink)', padding: '20px 12px 0' }}>
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
