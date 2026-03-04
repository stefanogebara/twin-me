import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, TrendingUp, AlertTriangle, PartyPopper, Target } from 'lucide-react';
import type { ProactiveInsight } from './types';

const URGENCY_DOT: Record<string, string> = {
  high: '#E74C3C',
  medium: '#F39C12',
  low: '#3498DB',
};

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  trend: { icon: TrendingUp, color: '#3498DB' },
  anomaly: { icon: AlertTriangle, color: '#F39C12' },
  celebration: { icon: PartyPopper, color: '#2ECC71' },
  concern: { icon: AlertTriangle, color: '#E74C3C' },
  goal_progress: { icon: Target, color: '#9B59B6' },
  goal_suggestion: { icon: Target, color: '#1ABC9C' },
};

const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface Props {
  insights: ProactiveInsight[];
  animationDelay?: number;
}

export const BentoInsightsTile: React.FC<Props> = ({ insights, animationDelay = 0 }) => {
  if (insights.length === 0) return null;

  const sorted = [...insights].sort(
    (a, b) => (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2)
  );
  const top3 = sorted.slice(0, 3);
  const remaining = sorted.length - 3;

  return (
    <motion.div
      className="rounded-2xl p-5 h-full flex flex-col"
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: animationDelay, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: 'rgba(52, 152, 219, 0.15)' }}
        >
          <Lightbulb className="w-3 h-3" style={{ color: '#3498DB' }} />
        </div>
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}
        >
          What Your Twin Noticed
        </p>
      </div>

      {/* Top 3 insights */}
      <div className="space-y-2.5 flex-1">
        {top3.map((insight, i) => {
          const dotColor = URGENCY_DOT[insight.urgency] ?? '#3498DB';
          const truncated = insight.insight.length > 90
            ? insight.insight.slice(0, 90).trim() + '…'
            : insight.insight;

          return (
            <motion.div
              key={insight.id}
              className="flex items-start gap-2.5"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: animationDelay + i * 0.06 }}
            >
              {/* Urgency dot + left accent */}
              <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                <span
                  className="w-2 h-2 rounded-full block"
                  style={{
                    backgroundColor: dotColor,
                    boxShadow: insight.urgency === 'high' ? `0 0 6px ${dotColor}70` : 'none',
                  }}
                />
                {i < top3.length - 1 && (
                  <span
                    className="w-px flex-1 mt-1 min-h-[12px]"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
                  />
                )}
              </div>

              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--foreground)' }}
              >
                {truncated}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Show all link */}
      {remaining > 0 && (
        <p
          className="text-xs mt-3 font-medium"
          style={{ color: '#3498DB' }}
        >
          +{remaining} more insight{remaining > 1 ? 's' : ''}
        </p>
      )}
    </motion.div>
  );
};
