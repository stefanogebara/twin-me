import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Heart, Palette, Users, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { TwinSummaryData } from './types';

const DOMAIN_CONFIG = [
  { key: 'personality', label: 'Personality', icon: Brain, color: '#9B59B6' },
  { key: 'lifestyle', label: 'Lifestyle', icon: Heart, color: '#E74C3C' },
  { key: 'culturalIdentity', label: 'Cultural Identity', icon: Palette, color: '#3498DB' },
  { key: 'socialDynamics', label: 'Social Dynamics', icon: Users, color: '#2ECC71' },
  { key: 'motivation', label: 'Motivation', icon: Flame, color: '#F39C12' },
] as const;

interface Props {
  data: TwinSummaryData;
}

export const TwinSummaryHero: React.FC<Props> = ({ data }) => {
  const { theme } = useTheme();
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const domains = data.domains || {};
  const activeDomains = DOMAIN_CONFIG.filter(
    d => domains[d.key as keyof typeof domains]
  );

  if (activeDomains.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Overall summary */}
      {data.summary && (
        <motion.div
          className="p-5 rounded-2xl mb-4"
          style={{
            backgroundColor: isDark ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
            border: isDark ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: isDark ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}
          >
            {data.summary}
          </p>
          <p className="text-xs mt-2" style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
            Last updated {new Date(data.generatedAt).toLocaleDateString()}
          </p>
        </motion.div>
      )}

      {/* Domain cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeDomains.map((domain, i) => {
          const Icon = domain.icon;
          const content = domains[domain.key as keyof typeof domains] || '';
          const isExpanded = expandedDomain === domain.key;

          return (
            <motion.button
              key={domain.key}
              className="text-left p-4 rounded-xl transition-all"
              style={{
                backgroundColor: isDark ? 'rgba(45, 45, 41, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                border: isDark ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)',
              }}
              onClick={() => setExpandedDomain(isExpanded ? null : domain.key)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${domain.color}15` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: domain.color }} />
                  </div>
                  <span
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: domain.color }}
                  >
                    {domain.label}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }} />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }} />
                )}
              </div>
              <AnimatePresence>
                <motion.p
                  className="text-sm leading-relaxed"
                  style={{ color: isDark ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
                  initial={false}
                  animate={{ height: isExpanded ? 'auto' : '2.6em' }}
                  transition={{ duration: 0.2 }}
                >
                  <span className={isExpanded ? '' : 'line-clamp-2'}>
                    {content}
                  </span>
                </motion.p>
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
