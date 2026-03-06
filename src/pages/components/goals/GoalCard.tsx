/**
 * GoalCard
 *
 * Displays an active or completed goal with progress bar, streaks,
 * days remaining, and an abandon action with confirmation.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Flame,
  Trophy,
  Clock,
  Moon,
  Dumbbell,
  Focus,
  CalendarClock,
  Scale,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  XCircle,
} from 'lucide-react';
import GoalProgressChart from './GoalProgressChart';
import type { Goal, GoalProgress } from '@/services/api/goalsAPI';

// Design tokens
const TEXT_PRIMARY = 'var(--foreground)';
const TEXT_SECONDARY = 'var(--text-secondary)';
const BORDER_COLOR = 'var(--glass-surface-border)';

// Category color mapping
const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  sleep: {
    bg: 'rgba(99, 102, 241, 0.1)',
    text: '#818cf8',
    border: 'rgba(99, 102, 241, 0.2)',
    label: 'Sleep',
  },
  fitness: {
    bg: 'rgba(16, 185, 129, 0.1)',
    text: '#34d399',
    border: 'rgba(16, 185, 129, 0.2)',
    label: 'Fitness',
  },
  focus: {
    bg: 'rgba(245, 158, 11, 0.1)',
    text: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.2)',
    label: 'Focus',
  },
  schedule: {
    bg: 'rgba(59, 130, 246, 0.1)',
    text: '#60a5fa',
    border: 'rgba(59, 130, 246, 0.2)',
    label: 'Schedule',
  },
  balance: {
    bg: 'rgba(168, 85, 247, 0.1)',
    text: '#c084fc',
    border: 'rgba(168, 85, 247, 0.2)',
    label: 'Balance',
  },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  sleep: Moon,
  fitness: Dumbbell,
  focus: Focus,
  schedule: CalendarClock,
  balance: Scale,
};

interface GoalCardProps {
  goal: Goal;
  progress?: GoalProgress[];
  onAbandon: (id: string) => void;
  isAbandoning: boolean;
  index: number;
}

const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  progress = [],
  onAbandon,
  isAbandoning,
  index,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const categoryStyle = CATEGORY_STYLES[goal.category] ?? CATEGORY_STYLES.balance;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Sparkles;

  // Progress percentage
  const progressPercent =
    goal.total_days_tracked > 0
      ? Math.round((goal.total_days_met / goal.total_days_tracked) * 100)
      : 0;

  // Days remaining calculation
  const daysRemaining = (() => {
    if (!goal.end_date) return null;
    const end = new Date(goal.end_date);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  })();

  const isCompleted = goal.status === 'completed';

  const handleAbandonClick = () => {
    if (showAbandonConfirm) {
      onAbandon(goal.id);
      setShowAbandonConfirm(false);
    } else {
      setShowAbandonConfirm(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.4, 0, 0.2, 1],
      }}
      className="glass-card p-6 space-y-4"
      style={{ borderRadius: '16px' }}
    >
      {/* Header: Category badge + title */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: categoryStyle.bg,
              border: `1px solid ${categoryStyle.border}`,
            }}
          >
            <CategoryIcon className="w-4 h-4" style={{ color: categoryStyle.text }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className="text-sm font-medium leading-snug truncate"
              style={{ color: TEXT_PRIMARY, fontFamily: 'var(--font-heading)' }}
            >
              {goal.title}
            </h4>
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-medium mt-1.5"
              style={{
                background: categoryStyle.bg,
                color: categoryStyle.text,
                border: `1px solid ${categoryStyle.border}`,
              }}
            >
              {categoryStyle.label}
            </span>
          </div>
        </div>

        {/* Completed badge */}
        {isCompleted && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium flex-shrink-0"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <Trophy className="w-3 h-3" />
            Done
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
            Progress
          </span>
          <span className="text-[10px] font-medium" style={{ color: TEXT_PRIMARY }}>
            {progressPercent}%
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{
            background: 'var(--glass-surface-bg)',
          }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: categoryStyle.text }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
            {goal.total_days_met}/{goal.total_days_tracked} days met
          </span>
          {goal.target_value != null && goal.target_unit && (
            <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
              Target: {goal.target_value}{goal.target_unit === 'percent' ? '%' : ` ${goal.target_unit}`}
            </span>
          )}
        </div>
      </div>

      {/* Streak + days remaining row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Current streak */}
        {goal.current_streak > 0 && (
          <div className="flex items-center gap-1">
            <Flame
              className="w-3.5 h-3.5"
              style={{ color: goal.current_streak >= 3 ? '#f97316' : TEXT_SECONDARY }}
            />
            <span
              className="text-xs font-medium"
              style={{
                color: goal.current_streak >= 3 ? '#f97316' : TEXT_PRIMARY,
              }}
            >
              {goal.current_streak}d streak
            </span>
          </div>
        )}

        {/* Best streak */}
        {goal.best_streak > 0 && (
          <div className="flex items-center gap-1">
            <Trophy className="w-3 h-3" style={{ color: TEXT_SECONDARY }} />
            <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
              Best: {goal.best_streak}d
            </span>
          </div>
        )}

        {/* Days remaining (only for active goals) */}
        {!isCompleted && daysRemaining != null && (
          <div className="flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" style={{ color: TEXT_SECONDARY }} />
            <span
              className="text-[10px]"
              style={{
                color: daysRemaining <= 3 ? '#f97316' : TEXT_SECONDARY,
              }}
            >
              {daysRemaining}d left
            </span>
          </div>
        )}
      </div>

      {/* Expandable section */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full pt-1 transition-colors"
        style={{ color: TEXT_SECONDARY }}
      >
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        <span className="text-[10px]">
          {expanded ? 'Less' : 'Details'}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-3 pt-1"
          style={{ borderTop: `1px solid ${BORDER_COLOR}` }}
        >
          {/* Description */}
          {goal.description && (
            <p
              className="text-xs pt-2"
              style={{ color: TEXT_SECONDARY, fontFamily: 'var(--font-body)' }}
            >
              {goal.description}
            </p>
          )}

          {/* Progress chart */}
          <div className="pt-1">
            <GoalProgressChart
              progress={progress}
              durationDays={goal.duration_days}
              startDate={goal.start_date}
            />
          </div>

          {/* Abandon action (only for active goals) */}
          {!isCompleted && (
            <div className="pt-2">
              {showAbandonConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: TEXT_SECONDARY }}>
                    Are you sure?
                  </span>
                  <button
                    onClick={handleAbandonClick}
                    disabled={isAbandoning}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors hover:bg-red-500/10 disabled:opacity-40"
                    style={{ color: '#ef4444' }}
                  >
                    {isAbandoning ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    Yes, abandon
                  </button>
                  <button
                    onClick={() => setShowAbandonConfirm(false)}
                    className="px-3 py-1 rounded-lg text-xs transition-colors hover:bg-black/5"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAbandonClick}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors hover:bg-red-500/10"
                  style={{ color: '#ef4444' }}
                >
                  <XCircle className="w-3 h-3" />
                  Abandon goal
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default GoalCard;
