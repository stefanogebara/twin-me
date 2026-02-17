import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';

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

interface QuickPulseResultsProps {
  result: AssessmentResult;
  theme: string;
  colors: Record<string, string>;
  typeColor: { primary: string; secondary: string };
  onSeeFullResults: () => void;
  onContinueDeep: () => void;
}

export function QuickPulseResults({
  result,
  theme,
  colors,
  typeColor,
  onSeeFullResults,
  onContinueDeep,
}: QuickPulseResultsProps) {
  const navigate = useNavigate();

  const dimensionConfig: Array<{
    key: string;
    altKey?: string;
    low: string;
    high: string;
    lowLabel: string;
    highLabel: string;
    color: string;
  }> = [
    { key: 'extraversion', altKey: 'mind', low: 'I', high: 'E', lowLabel: 'Introverted', highLabel: 'Extraverted', color: '#4F9DA6' },
    { key: 'openness', altKey: 'energy', low: 'S', high: 'N', lowLabel: 'Observant', highLabel: 'Intuitive', color: '#E8B86D' },
    { key: 'agreeableness', altKey: 'nature', low: 'T', high: 'F', lowLabel: 'Thinking', highLabel: 'Feeling', color: '#00A878' },
    { key: 'conscientiousness', altKey: 'tactics', low: 'P', high: 'J', lowLabel: 'Prospecting', highLabel: 'Judging', color: '#7B68EE' },
    { key: 'neuroticism', altKey: 'identity', low: 'T', high: 'A', lowLabel: 'Turbulent', highLabel: 'Assertive', color: '#FF6B6B' },
  ];

  const scores = result.scores as Record<string, number>;

  return (
    <motion.div
      key="deep-prompt"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative"
    >
      {/* Animated background gradient based on personality type */}
      <div
        className="absolute inset-0 -z-10 opacity-30 blur-3xl"
        style={{
          background: `radial-gradient(ellipse at top, ${typeColor.primary}40, transparent 50%),
                       radial-gradient(ellipse at bottom right, ${typeColor.secondary}30, transparent 50%)`
        }}
      />

      {/* Success badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center mb-8"
      >
        <div
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium"
          style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1))',
            color: '#22c55e',
            border: '1px solid rgba(34, 197, 94, 0.3)'
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 500 }}
          >
            <Check className="w-4 h-4" />
          </motion.div>
          Quick Pulse Complete!
        </div>
      </motion.div>

      {/* Personality Type Hero Section */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-center mb-10"
      >
        {/* Large animated type code */}
        <div className="relative inline-block mb-4">
          <motion.div
            className="text-6xl md:text-8xl font-bold tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${typeColor.primary}, ${typeColor.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'var(--font-heading)',
              textShadow: `0 0 60px ${typeColor.primary}40`
            }}
          >
            {result.archetype.fullCode || result.archetype.code}
          </motion.div>
          {/* Animated glow ring */}
          <motion.div
            className="absolute -inset-4 rounded-full -z-10"
            style={{
              background: `radial-gradient(circle, ${typeColor.primary}20, transparent 70%)`
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Type name and title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-2xl md:text-3xl mb-2"
          style={{
            color: typeColor.primary,
            fontFamily: 'var(--font-heading)',
            fontWeight: 600
          }}
        >
          {result.archetype.name}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-lg italic"
          style={{ color: colors.textSecondary }}
        >
          "{result.archetype.title}"
        </motion.p>
      </motion.div>

      {/* Animated Dimension Bars */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-3xl p-6 md:p-8 mb-8"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(135deg, rgba(45, 45, 41, 0.8), rgba(35, 35, 31, 0.6))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(250, 250, 249, 0.8))',
          border: `1px solid ${colors.border}`,
          backdropFilter: 'blur(10px)'
        }}
      >
        <h3 className="text-lg font-medium mb-6 text-center" style={{ color: colors.text }}>
          Your Personality Spectrum
        </h3>
        <div className="space-y-6">
          {dimensionConfig.map((config, index) => {
            let score = scores[config.key];
            if (score === undefined && config.altKey) {
              score = scores[config.altKey];
            }
            if (score === undefined) score = 50;
            const percentage = Math.round(score > 1 ? score : score * 100);
            const isHighPole = percentage >= 50;

            return (
              <motion.div
                key={config.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                className="relative"
              >
                {/* Labels */}
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{
                        backgroundColor: !isHighPole ? config.color : `${config.color}30`,
                        color: !isHighPole ? '#fff' : config.color
                      }}
                    >
                      {config.low}
                    </span>
                    <span className="text-sm" style={{ color: !isHighPole ? colors.text : colors.textSecondary }}>
                      {config.lowLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: isHighPole ? colors.text : colors.textSecondary }}>
                      {config.highLabel}
                    </span>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{
                        backgroundColor: isHighPole ? config.color : `${config.color}30`,
                        color: isHighPole ? '#fff' : config.color
                      }}
                    >
                      {config.high}
                    </span>
                  </div>
                </div>

                {/* Progress bar with indicator */}
                <div className="relative">
                  <div
                    className="h-3 rounded-full overflow-hidden"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    {/* Center marker */}
                    <div
                      className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 z-10"
                      style={{ backgroundColor: colors.border }}
                    />
                    {/* Filled bar from center */}
                    <motion.div
                      className="absolute h-full rounded-full"
                      style={{
                        backgroundColor: config.color,
                        left: percentage >= 50 ? '50%' : `${percentage}%`,
                        right: percentage >= 50 ? `${100 - percentage}%` : '50%'
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 + index * 0.1, duration: 0.5 }}
                    />
                  </div>

                  {/* Percentage indicator */}
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
                    style={{ left: `${percentage}%`, transform: 'translate(-50%, -50%)' }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1 + index * 0.1, type: 'spring', stiffness: 300 }}
                  >
                    <div
                      className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: theme === 'dark' ? '#1a1a18' : '#fff',
                        borderColor: config.color,
                        color: config.color
                      }}
                    >
                      {percentage}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Description card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="rounded-2xl p-6 mb-8"
        style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.border}`
        }}
      >
        <p className="text-base leading-relaxed" style={{ color: colors.text }}>
          {result.archetype.description}
        </p>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="flex flex-col sm:flex-row gap-4 justify-center mb-8"
      >
        <button
          onClick={onSeeFullResults}
          className="group px-8 py-4 rounded-2xl font-medium transition-all hover:scale-[1.02] relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${typeColor.primary}, ${typeColor.secondary})`,
            color: '#fff',
            boxShadow: `0 4px 20px ${typeColor.primary}40`
          }}
        >
          <span className="relative z-10">See Full Results</span>
        </button>
        <button
          onClick={() => navigate('/soul-signature')}
          className="px-8 py-4 rounded-2xl font-medium transition-all hover:scale-[1.02]"
          style={{
            backgroundColor: colors.accentBg,
            color: colors.text,
            border: `1px solid ${colors.border}`
          }}
        >
          View Soul Signature
        </button>
      </motion.div>

      {/* Deep assessment prompt */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="rounded-2xl p-5 text-center"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(135deg, rgba(193, 192, 182, 0.05), rgba(193, 192, 182, 0.02))'
            : 'linear-gradient(135deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.01))',
          border: `1px dashed ${colors.border}`
        }}
      >
        <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
          Want even more accurate insights? Complete 48 more questions for a detailed profile.
        </p>
        <button
          onClick={onContinueDeep}
          className="text-sm font-medium transition-all hover:gap-3 inline-flex items-center gap-2"
          style={{ color: typeColor.primary }}
        >
          Take Deep Assessment <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </motion.div>
  );
}
