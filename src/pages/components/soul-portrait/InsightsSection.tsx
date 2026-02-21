import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, TrendingUp, AlertTriangle, PartyPopper, Target } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { ProactiveInsight } from './types';

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  trend: { icon: TrendingUp, color: '#3498DB' },
  anomaly: { icon: AlertTriangle, color: '#F39C12' },
  celebration: { icon: PartyPopper, color: '#2ECC71' },
  concern: { icon: AlertTriangle, color: '#E74C3C' },
  goal_progress: { icon: Target, color: '#9B59B6' },
  goal_suggestion: { icon: Target, color: '#1ABC9C' },
};

const URGENCY_ORDER = { high: 0, medium: 1, low: 2 } as const;

interface Props {
  insights: ProactiveInsight[];
}

export const InsightsSection: React.FC<Props> = ({ insights }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (insights.length === 0) return null;

  const sorted = [...insights].sort(
    (a, b) => (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2)
  );

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4" style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }} />
        <h3
          className="text-sm uppercase tracking-wider font-medium"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
        >
          What Your Twin Noticed
        </h3>
      </div>

      <div className="space-y-2">
        {sorted.map((insight, i) => {
          const config = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.trend;
          const Icon = config.icon;

          return (
            <motion.div
              key={insight.id}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: isDark ? 'rgba(45, 45, 41, 0.3)' : 'rgba(255, 255, 255, 0.5)',
                border: insight.urgency === 'high'
                  ? `1px solid ${config.color}30`
                  : isDark ? '1px solid rgba(193, 192, 182, 0.06)' : '1px solid rgba(0, 0, 0, 0.03)',
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `${config.color}15` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: isDark ? 'rgba(193, 192, 182, 0.8)' : '#44403c' }}
                >
                  {insight.insight}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-xs"
                    style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}
                  >
                    {new Date(insight.created_at).toLocaleDateString()}
                  </span>
                  {insight.urgency === 'high' && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${config.color}15`, color: config.color }}>
                      Important
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
