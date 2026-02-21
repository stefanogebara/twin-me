import React from 'react';
import { motion } from 'framer-motion';
import { Target, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { Goal } from './types';

interface Props {
  goals: Goal[];
}

export const ActiveGoalsStrip: React.FC<Props> = ({ goals }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const active = goals.filter(g => g.status === 'active' || g.status === 'suggested');
  const recentlyCompleted = goals
    .filter(g => g.status === 'completed')
    .slice(0, 2);

  if (active.length === 0 && recentlyCompleted.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4" style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }} />
        <h3
          className="text-sm uppercase tracking-wider font-medium"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
        >
          Goals
        </h3>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {active.map((goal, i) => {
          const progress = goal.duration_days > 0
            ? Math.min(100, Math.round((goal.total_days_met / goal.duration_days) * 100))
            : 0;

          return (
            <motion.div
              key={goal.id}
              className="flex-shrink-0 w-56 p-4 rounded-xl"
              style={{
                backgroundColor: isDark ? 'rgba(45, 45, 41, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                border: isDark ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: goal.status === 'suggested' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: goal.status === 'suggested' ? '#3B82F6' : '#10B981',
                  }}
                >
                  {goal.status === 'suggested' ? 'Suggested' : 'Active'}
                </span>
              </div>
              <p
                className="text-sm font-medium mb-2 line-clamp-2"
                style={{ color: isDark ? '#C1C0B6' : '#0c0a09' }}
              >
                {goal.title}
              </p>
              {goal.status === 'active' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: isDark ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>Progress</span>
                    <span style={{ color: '#10B981' }}>{progress}%</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: isDark ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%`, backgroundColor: '#10B981' }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}

        {recentlyCompleted.map((goal, i) => (
          <motion.div
            key={goal.id}
            className="flex-shrink-0 w-56 p-4 rounded-xl"
            style={{
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: (active.length + i) * 0.05 }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <span className="text-xs font-medium" style={{ color: '#10B981' }}>Completed</span>
            </div>
            <p
              className="text-sm font-medium line-clamp-2"
              style={{ color: isDark ? '#C1C0B6' : '#0c0a09' }}
            >
              {goal.title}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
