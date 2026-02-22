import React from 'react';
import { motion } from 'framer-motion';
import { Target, CheckCircle2, Zap } from 'lucide-react';
import type { Goal } from './types';

interface Props {
  goals: Goal[];
  animationDelay?: number;
}

export const BentoGoalsTile: React.FC<Props> = ({ goals, animationDelay = 0 }) => {
  const active = goals.filter(g => g.status === 'active' || g.status === 'suggested');
  const recentCompleted = goals.filter(g => g.status === 'completed').slice(0, 1);
  const displayGoals = [...active, ...recentCompleted].slice(0, 4);

  if (displayGoals.length === 0) return null;

  return (
    <motion.div
      className="rounded-2xl p-5 h-full flex flex-col"
      style={{
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: animationDelay, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
        >
          <Target className="w-3 h-3" style={{ color: '#10B981' }} />
        </div>
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#8A857D' }}
        >
          Goals
        </p>
      </div>

      {/* Goal list */}
      <div className="space-y-3 flex-1">
        {displayGoals.map((goal, i) => {
          const isCompleted = goal.status === 'completed';
          const isSuggested = goal.status === 'suggested';
          const progress = goal.duration_days > 0
            ? Math.min(100, Math.round((goal.total_days_met / goal.duration_days) * 100))
            : 0;

          const progressColor = isCompleted ? '#10B981' : isSuggested ? '#3B82F6' : '#10B981';

          return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: animationDelay + i * 0.05 }}
            >
              {/* Title row */}
              <div className="flex items-center gap-1.5 mb-1">
                {isCompleted
                  ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: '#10B981' }} />
                  : isSuggested
                  ? <Zap className="w-3 h-3 flex-shrink-0" style={{ color: '#3B82F6' }} />
                  : <Target className="w-3 h-3 flex-shrink-0" style={{ color: '#10B981' }} />
                }
                <p
                  className="text-xs font-medium leading-tight truncate flex-1"
                  style={{ color: '#1F1C18' }}
                >
                  {goal.title}
                </p>
                {!isCompleted && !isSuggested && (
                  <span
                    className="text-xs font-semibold flex-shrink-0"
                    style={{ color: progressColor }}
                  >
                    {progress}%
                  </span>
                )}
              </div>

              {/* Progress bar for active goals */}
              {!isCompleted && !isSuggested && (
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: progressColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.7, delay: animationDelay + 0.2, ease: 'easeOut' }}
                  />
                </div>
              )}

              {/* Suggested badge */}
              {isSuggested && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded mt-0.5"
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#3B82F6',
                  }}
                >
                  Suggested
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};
