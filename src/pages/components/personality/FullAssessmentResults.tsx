import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Check, ChevronRight } from 'lucide-react';

interface AssessmentResult {
  scores: Record<string, number>;
  archetype: {
    code: string;
    fullCode?: string;
    name: string;
    title: string;
    description: string;
    identity?: string;
    identityLabel?: string;
  };
  insights: {
    strengths: string[];
    growthAreas: string[];
    summary: string;
  };
  questionsAnswered: number;
  totalQuestions: number;
  completionPercentage: number;
}

interface FullAssessmentResultsProps {
  result: AssessmentResult;
  theme: string;
  colors: Record<string, string>;
  onContinueDeep: () => void;
}

function DimensionBar({ dimension, score, colors }: { dimension: string; score: number; colors: Record<string, string> }) {
  const labels: Record<string, { name: string; low: string; high: string; letter: string }> = {
    mind: { name: 'Mind (I/E)', low: 'Introverted', high: 'Extraverted', letter: score >= 50 ? 'E' : 'I' },
    energy: { name: 'Energy (S/N)', low: 'Observant', high: 'Intuitive', letter: score >= 50 ? 'N' : 'S' },
    nature: { name: 'Nature (T/F)', low: 'Thinking', high: 'Feeling', letter: score >= 50 ? 'F' : 'T' },
    tactics: { name: 'Tactics (J/P)', low: 'Prospecting', high: 'Judging', letter: score >= 50 ? 'J' : 'P' },
    identity: { name: 'Identity (A/T)', low: 'Turbulent', high: 'Assertive', letter: score >= 50 ? 'A' : 'T' },
    extraversion: { name: 'Mind (I/E)', low: 'Introverted', high: 'Extraverted', letter: score >= 50 ? 'E' : 'I' },
    openness: { name: 'Energy (S/N)', low: 'Observant', high: 'Intuitive', letter: score >= 50 ? 'N' : 'S' },
    agreeableness: { name: 'Nature (T/F)', low: 'Thinking', high: 'Feeling', letter: score >= 50 ? 'F' : 'T' },
    conscientiousness: { name: 'Tactics (J/P)', low: 'Prospecting', high: 'Judging', letter: score >= 50 ? 'J' : 'P' },
    neuroticism: { name: 'Identity (A/T)', low: 'Turbulent', high: 'Assertive', letter: score >= 50 ? 'A' : 'T' },
  };

  const info = labels[dimension] || { name: dimension, low: 'Low', high: 'High', letter: '?' };
  const percentage = Math.round(score > 1 ? score : score * 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium" style={{ color: colors.text }}>{info.name}</span>
        <span className="text-sm" style={{ color: colors.textSecondary }}>{percentage}%</span>
      </div>
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.accentBg }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.accent }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: colors.textSecondary }}>{info.low}</span>
        <span className="text-xs" style={{ color: colors.textSecondary }}>{info.high}</span>
      </div>
    </div>
  );
}

export function FullAssessmentResults({
  result,
  theme,
  colors,
  onContinueDeep,
}: FullAssessmentResultsProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      {/* Archetype header */}
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4"
          style={{
            backgroundColor: colors.accentBg,
            color: colors.accent
          }}
        >
          <Sparkles className="w-4 h-4" />
          Your Soul Signature
        </div>
        <h1 className="text-4xl md:text-5xl mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
          {result.archetype.fullCode || result.archetype.code}
        </h1>
        <h2 className="text-xl mb-2" style={{ color: colors.accent, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
          {result.archetype.name}
        </h2>
        <p className="italic" style={{ color: colors.textSecondary }}>
          {result.archetype.title}
        </p>
      </div>

      {/* Description */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.border}`
        }}
      >
        <p className="leading-relaxed" style={{ color: colors.text }}>
          {result.archetype.description}
        </p>
      </div>

      {/* MBTI Dimension Scores */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.border}`
        }}
      >
        <h3 className="text-lg mb-4" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
          Your Personality Dimensions
        </h3>
        <div className="space-y-4">
          {Object.entries(result.scores || {})
            .filter(([dimension]) => !dimension.endsWith('_ci'))
            .map(([dimension, score]) => (
              <DimensionBar key={dimension} dimension={dimension} score={score as number} colors={colors} />
            ))}
        </div>
      </div>

      {/* Insights */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {/* Strengths */}
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.border}`
          }}
        >
          <h3 className="text-lg mb-3" style={{ color: '#22c55e', fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            Strengths
          </h3>
          <ul className="space-y-2">
            {(result.insights?.strengths || []).map((strength, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.text }}>
                <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                {strength}
              </li>
            ))}
          </ul>
        </div>

        {/* Growth Areas */}
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.border}`
          }}
        >
          <h3 className="text-lg mb-3" style={{ color: '#f59e0b', fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            Growth Areas
          </h3>
          <ul className="space-y-2">
            {(result.insights?.growthAreas || []).map((area, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.text }}>
                <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                {area}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Completion info */}
      <div className="text-center text-sm mb-8" style={{ color: colors.textSecondary }}>
        Based on {result.questionsAnswered} of {result.totalQuestions} questions ({result.completionPercentage}% complete)
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
          style={{
            backgroundColor: colors.accent,
            color: theme === 'dark' ? '#1a1a18' : '#fff'
          }}
        >
          Continue to Dashboard
        </button>
        {result.completionPercentage < 100 && (
          <button
            onClick={onContinueDeep}
            className="px-6 py-3 rounded-xl font-medium transition-all"
            style={{
              backgroundColor: colors.accentBg,
              color: colors.text
            }}
          >
            Refine Results
          </button>
        )}
      </div>
    </motion.div>
  );
}
