import React from 'react';
import { Target, CheckCircle2, Zap } from 'lucide-react';
import type { Goal } from './types';

interface Props {
  goals: Goal[];
  animationDelay?: number;
}

export const BentoGoalsTile: React.FC<Props> = ({ goals }) => {
  const active = goals.filter(g => g.status === 'active' || g.status === 'suggested');
  const recentCompleted = goals.filter(g => g.status === 'completed').slice(0, 1);
  const displayGoals = [...active, ...recentCompleted].slice(0, 4);

  if (displayGoals.length === 0) return null;

  return (
    <div
      className="rounded-lg p-5 h-full flex flex-col"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border-glass)',
      }}
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
          className="text-[11px] font-medium tracking-widest uppercase"
          style={{ color: '#10b77f' }}
        >
          Goals
        </p>
      </div>

      {/* Goal list */}
      <div className="space-y-3 flex-1">
        {displayGoals.map((goal) => {
          const isCompleted = goal.status === 'completed';
          const isSuggested = goal.status === 'suggested';
          const progress = goal.duration_days > 0
            ? Math.min(100, Math.round((goal.total_days_met / goal.duration_days) * 100))
            : 0;

          const progressColor = isCompleted ? '#10B981' : isSuggested ? '#3B82F6' : '#10B981';

          return (
            <div key={goal.id}>
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
                  style={{ color: 'var(--foreground)' }}
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
                  style={{ backgroundColor: 'var(--glass-surface-bg)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ backgroundColor: progressColor, width: `${progress}%` }}
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
