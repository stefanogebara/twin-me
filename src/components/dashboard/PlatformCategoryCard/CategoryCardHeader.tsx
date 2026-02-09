/**
 * Category Card Header Component
 *
 * Displays the collapsed state of a platform category card.
 * Shows category icon, name, connected platforms, and summary stats.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Music,
  Heart,
  Calendar,
  Users,
  Briefcase,
  ChevronDown,
  CheckCircle2
} from 'lucide-react';
import { PLATFORM_INFO, type CategoryConfig } from './categoryConfig';
import { respectReducedMotion, TIMING } from '@/lib/animations';

interface CategoryCardHeaderProps {
  category: CategoryConfig;
  isExpanded: boolean;
  connectedCount: number;
  totalPlatforms: number;
  summaryStat?: string;
  onClick: () => void;
}

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Music,
  Heart,
  Calendar,
  Users,
  Briefcase
};

export const CategoryCardHeader: React.FC<CategoryCardHeaderProps> = ({
  category,
  isExpanded,
  connectedCount,
  totalPlatforms,
  summaryStat,
  onClick
}) => {
  const { theme } = useTheme();

  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const textFaint = theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e';

  const IconComponent = categoryIconMap[category.icon] || Briefcase;

  // Get platform names for connected display
  const connectedPlatformNames = category.platforms
    .filter(p => connectedCount > 0) // Simplified - actual connection check happens in parent
    .map(p => PLATFORM_INFO[p]?.name || p)
    .slice(0, 3);

  return (
    <motion.button
      className="w-full p-5 flex items-center justify-between text-left transition-colors duration-200 rounded-2xl"
      onClick={onClick}
      whileHover={respectReducedMotion() ? {} : {
        backgroundColor: theme === 'dark'
          ? 'rgba(193, 192, 182, 0.03)'
          : 'rgba(0, 0, 0, 0.01)'
      }}
      whileTap={respectReducedMotion() ? {} : { scale: 0.995 }}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Category Icon */}
        <motion.div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `${category.color}15`,
            border: `1px solid ${category.color}25`
          }}
          animate={isExpanded && !respectReducedMotion() ? {
            scale: [1, 1.05, 1],
            transition: { duration: 0.3 }
          } : {}}
        >
          <IconComponent className="w-6 h-6" style={{ color: category.color }} />
        </motion.div>

        {/* Category Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-medium text-base"
              style={{ color: textColor, fontFamily: 'var(--font-heading)' }}
            >
              {category.name}
            </h3>
            {connectedCount > 0 && (
              <motion.div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <CheckCircle2 className="w-3 h-3" style={{ color: '#10B981' }} />
                <span className="text-xs font-medium" style={{ color: '#10B981' }}>
                  {connectedCount}/{totalPlatforms}
                </span>
              </motion.div>
            )}
          </div>

          {/* Platform names or description */}
          <div className="flex items-center gap-2 flex-wrap">
            {connectedCount > 0 ? (
              <>
                <div className="flex items-center gap-1.5">
                  {category.platforms.slice(0, 3).map((platform, index) => {
                    const info = PLATFORM_INFO[platform];
                    return (
                      <span
                        key={platform}
                        className="text-xs"
                        style={{ color: textSecondary }}
                      >
                        {info?.name || platform}
                        {index < Math.min(category.platforms.length - 1, 2) && (
                          <span style={{ color: textFaint }}> · </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                {summaryStat && (
                  <>
                    <span style={{ color: textFaint }}>·</span>
                    <span className="text-xs" style={{ color: category.color }}>
                      {summaryStat}
                    </span>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: textMuted }}>
                {category.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Expand/Collapse Chevron */}
      <motion.div
        className="flex-shrink-0 ml-4"
        animate={{ rotate: isExpanded ? 180 : 0 }}
        transition={{
          duration: TIMING.base / 1000,
          ease: 'easeOut'
        }}
      >
        <ChevronDown className="w-5 h-5" style={{ color: textMuted }} />
      </motion.div>
    </motion.button>
  );
};

export default CategoryCardHeader;
