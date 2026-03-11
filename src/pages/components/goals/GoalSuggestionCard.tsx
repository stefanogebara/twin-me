/**
 * GoalSuggestionCard
 *
 * Displays a goal suggestion as a chat bubble from the twin.
 * Includes accept/dismiss actions with category icon mapping.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { TEXT_PRIMARY, TEXT_SECONDARY, BORDER_COLOR, PILL_STYLE, CATEGORY_ICONS } from './goalStyles';
import type { Goal } from '@/services/api/goalsAPI';

interface GoalSuggestionCardProps {
  goal: Goal;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  isAccepting: boolean;
  isDismissing: boolean;
  index: number;
}

const GoalSuggestionCard = React.forwardRef<HTMLDivElement, GoalSuggestionCardProps>(({
  goal,
  onAccept,
  onDismiss,
  isAccepting,
  isDismissing,
  index,
}, ref) => {
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Sparkles;
  const isLoading = isAccepting || isDismissing;

  return (
    <motion.div
      ref={ref}
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
              background: PILL_STYLE.bg,
              border: `1px solid ${PILL_STYLE.border}`,
            }}
          >
            <CategoryIcon className="w-3.5 h-3.5" style={{ color: PILL_STYLE.text }} />
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
                background: PILL_STYLE.bg,
                color: PILL_STYLE.text,
                border: `1px solid ${PILL_STYLE.border}`,
              }}
            >
              Target: {goal.target_operator === '>=' ? '' : goal.target_operator + ' '}
              {goal.target_value} {goal.target_unit === 'ms' ? 'HRV ms' : goal.target_unit}
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
});

GoalSuggestionCard.displayName = 'GoalSuggestionCard';

export default GoalSuggestionCard;
