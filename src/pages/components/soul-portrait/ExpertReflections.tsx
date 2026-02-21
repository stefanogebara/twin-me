import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { ExpertReflection } from './types';

const EXPERT_COLORS: Record<string, string> = {
  'Personality Psychologist': '#9B59B6',
  'Lifestyle Analyst': '#E74C3C',
  'Cultural Identity Expert': '#3498DB',
  'Social Dynamics Analyst': '#2ECC71',
  'Motivation Analyst': '#F39C12',
};

interface Props {
  reflections: ExpertReflection[];
}

export const ExpertReflections: React.FC<Props> = ({ reflections }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (reflections.length === 0) return null;

  // Group by expert persona
  const grouped = reflections.reduce<Record<string, ExpertReflection[]>>((acc, r) => {
    const expert = r.metadata?.expert || 'General';
    if (!acc[expert]) acc[expert] = [];
    acc[expert].push(r);
    return acc;
  }, {});

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4" style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }} />
        <h3
          className="text-sm uppercase tracking-wider font-medium"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
        >
          Expert Observations
        </h3>
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).map(([expert, items], gi) => {
          const color = EXPERT_COLORS[expert] || '#C1C0B6';
          return (
            <motion.div
              key={expert}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: gi * 0.05 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium" style={{ color }}>{expert}</span>
              </div>
              <div className="space-y-2 pl-4">
                {items.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-lg text-sm leading-relaxed"
                    style={{
                      backgroundColor: isDark ? 'rgba(45, 45, 41, 0.3)' : 'rgba(255, 255, 255, 0.5)',
                      borderLeft: `2px solid ${color}30`,
                      color: isDark ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
                    }}
                  >
                    {r.content}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
