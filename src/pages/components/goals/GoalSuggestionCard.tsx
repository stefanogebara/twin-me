/**
 * GoalSuggestionCard
 *
 * Displays a goal suggestion as a chat bubble from the twin.
 * Includes accept/dismiss actions with category icon mapping.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Moon,
  Dumbbell,
  Focus,
  CalendarClock,
  Scale,
  Sparkles,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import type { Goal } from '@/services/api/goalsAPI';

// Design tokens
const TEXT_PRIMARY = 'var(--foreground)';
const TEXT_SECONDARY = 'var(--text-secondary)';
const BORDER_COLOR = 'var(--glass-surface-border)';

// Category to icon mapping
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  sleep: Moon,
  fitness: Dumbbell,
  focus: Focus,
  schedule: CalendarClock,
  balance: Scale,
};

// Category to color mapping
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  sleep: {
    bg: 'rgba(99, 102, 241, 0.1)',
    text: '#818cf8',
    border: 'rgba(99, 102, 241, 0.2)',
  },
  fitness: {
    bg: 'rgba(16, 185, 129, 0.1)',
    text: '#34d399',
    border: 'rgba(16, 185, 129, 0.2)',
  },
  focus: {
    bg: 'rgba(245, 158, 11, 0.1)',
    text: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.2)',
  },
  schedule: {
    bg: 'rgba(59, 130, 246, 0.1)',
    text: '#60a5fa',
    border: 'rgba(59, 130, 246, 0.2)',
  },
  balance: {
    bg: 'rgba(168, 85, 247, 0.1)',
    text: '#c084fc',
    border: 'rgba(168, 85, 247, 0.2)',
  },
};

interface GoalSuggestionCardProps {
  goal: Goal;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  isAccepting: boolean;
  isDismissing: boolean;
  index: number;
}

const GoalSuggestionCard: React.FC<GoalSuggestionCardProps> = ({
  goal,
  onAccept,
  onDismiss,
  isAccepting,
  isDismissing,
  index,
}) => {
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Sparkles;
  const categoryColor = CATEGORY_COLORS[goal.category] ?? CATEGORY_COLORS.balance;
  const isLoading = isAccepting || isDismissing;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.4, 0, 0.2, 1],
      }}
      className="flex gap-3 items-start"
    >
      {/* Twin avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
        style={{
          background: 'var(--glass-surface-bg)',
          border: `1px solid ${BORDER_COLOR}`,
        }}
      >
        <Sparkles className="w-4 h-4" style={{ color: TEXT_SECONDARY }} />
      </div>

      {/* Message bubble */}
      <div
        className="flex-1 rounded-2xl rounded-tl-md p-4 space-y-3"
        style={{
          background: 'var(--glass-surface-bg-subtle)',
          border: `1px solid ${BORDER_COLOR}`,
        }}
      >
        {/* Category badge + title */}
        <div className="flex items-start gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: categoryColor.bg,
              border: `1px solid ${categoryColor.border}`,
            }}
          >
            <CategoryIcon className="w-3.5 h-3.5" style={{ color: categoryColor.text }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className="text-sm font-medium leading-snug"
              style={{ color: TEXT_PRIMARY, fontFamily: 'var(--font-heading)' }}
            >
              {goal.title}
            </h4>
            {goal.description && (
              <p
                className="text-sm mt-1 leading-relaxed"
                style={{ color: TEXT_SECONDARY, fontFamily: 'var(--font-body)' }}
              >
                {goal.description}
              </p>
            )}
          </div>
        </div>

        {/* Source observation - subtle context */}
        {goal.source_observation && (
          <p
            className="text-xs italic pl-9"
            style={{ color: TEXT_SECONDARY, opacity: 0.7 }}
          >
            Based on: {goal.source_observation}
          </p>
        )}

        {/* Goal details */}
        <div className="flex flex-wrap items-center gap-2 pl-9">
          {goal.target_value != null && goal.target_unit && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px]"
              style={{
                background: categoryColor.bg,
                color: categoryColor.text,
                border: `1px solid ${categoryColor.border}`,
              }}
            >
              Target: {goal.target_operator === '>=' ? '' : goal.target_operator + ' '}
              {goal.target_value} {goal.target_unit}
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded-full text-[10px]"
            style={{
              background: 'var(--glass-surface-bg-subtle)',
              color: TEXT_SECONDARY,
              border: `1px solid ${BORDER_COLOR}`,
            }}
          >
            {goal.duration_days} days
          </span>
          {goal.source_platform && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] capitalize"
              style={{
                background: 'var(--glass-surface-bg-subtle)',
                color: TEXT_SECONDARY,
                border: `1px solid ${BORDER_COLOR}`,
              }}
            >
              via {goal.source_platform}
            </span>
          )}
        </div>

        {/* Accept / Dismiss buttons */}
        <div className="flex items-center gap-2 pl-9 pt-1">
          <button
            onClick={() => onAccept(goal.id)}
            disabled={isLoading}
            className="btn-cta-app flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-all disabled:opacity-40"
          >
            {isAccepting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Accept
          </button>
          <button
            onClick={() => onDismiss(goal.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all hover:bg-black/5 disabled:opacity-40"
            style={{ color: TEXT_SECONDARY }}
          >
            {isDismissing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default GoalSuggestionCard;
