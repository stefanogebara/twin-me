import React from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { ExpertReflection } from './types';

const EXPERT_META: Record<string, { label: string; color: string }> = {
  personality_psychologist: { label: 'Personality Psychologist', color: '#9B59B6' },
  lifestyle_analyst: { label: 'Lifestyle Analyst', color: '#E74C3C' },
  cultural_identity: { label: 'Cultural Identity Expert', color: '#3498DB' },
  social_dynamics: { label: 'Social Dynamics Analyst', color: '#2ECC71' },
  motivation_analyst: { label: 'Motivation Analyst', color: '#F39C12' },
};

interface Props {
  reflections: ExpertReflection[];
  animationDelay?: number;
}

export const BentoExpertSpotlight: React.FC<Props> = ({ reflections, animationDelay = 0 }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (reflections.length === 0) return null;

  // Pick the reflection with the highest importance score
  const featured = [...reflections].sort((a, b) => b.importance_score - a.importance_score)[0];
  const expertKey = featured.metadata?.expert ?? '';
  const meta = EXPERT_META[expertKey] ?? { label: 'Expert Analyst', color: '#9B59B6' };
  const expertName = meta.label;
  const accentColor = meta.color;

  // Truncate quote to a readable length
  const quote = featured.content.length > 200
    ? featured.content.slice(0, 200).trim() + '…'
    : featured.content;

  const totalCount = reflections.length;

  return (
    <motion.div
      className="relative rounded-2xl p-5 md:p-6 h-full flex flex-col overflow-hidden"
      style={{
        backgroundColor: isDark ? 'rgba(30, 30, 26, 0.7)' : 'rgba(255, 255, 255, 0.8)',
        border: isDark
          ? `1px solid ${accentColor}25`
          : `1px solid ${accentColor}20`,
        boxShadow: isDark
          ? `0 4px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 ${accentColor}12`
          : `0 4px 24px ${accentColor}10`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: animationDelay, ease: 'easeOut' }}
    >
      {/* Background glow */}
      <div
        className="absolute bottom-0 right-0 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${accentColor}10 0%, transparent 70%)`,
          transform: 'translate(30%, 30%)',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-4 relative">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}1A` }}
        >
          <Quote className="w-3 h-3" style={{ color: accentColor }} />
        </div>
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
        >
          Expert Spotlight
        </p>
      </div>

      {/* Quote */}
      <blockquote
        className="text-sm leading-relaxed italic flex-1 relative mb-4"
        style={{
          color: isDark ? 'rgba(193, 192, 182, 0.82)' : '#3d3730',
          borderLeft: `2px solid ${accentColor}50`,
          paddingLeft: '12px',
        }}
      >
        {quote}
      </blockquote>

      {/* Expert attribution */}
      <div className="flex items-center justify-between relative">
        <div>
          <span
            className="text-xs font-semibold"
            style={{ color: accentColor }}
          >
            — {expertName}
          </span>
        </div>
        {totalCount > 1 && (
          <span
            className="text-xs font-medium"
            style={{ color: isDark ? 'rgba(193, 192, 182, 0.35)' : '#c4bfba' }}
          >
            {totalCount - 1} more observation{totalCount > 2 ? 's' : ''}
          </span>
        )}
      </div>
    </motion.div>
  );
};
