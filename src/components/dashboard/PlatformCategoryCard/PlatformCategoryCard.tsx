/**
 * Platform Category Card Component
 *
 * Main expandable card that groups platforms by category.
 * Lazy loads platform data when expanded.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '@/components/layout/PageLayout';
import { StaggerContainer, StaggerItem } from '@/components/ui/AnimatedWrapper';
import { PLATFORM_CATEGORIES, type CategoryConfig } from './categoryConfig';
import { CategoryCardHeader } from './CategoryCardHeader';
import { PlatformSubCard } from './PlatformSubCard';
import { PlatformCategorySkeleton } from './PlatformCategorySkeleton';
import { usePlatformCategoryData } from '../hooks/usePlatformCategoryData';
import { spring, respectReducedMotion, TIMING } from '@/lib/animations';

interface PlatformCategoryCardProps {
  categoryId: string;
  connectedProviders: string[];
  onPlatformClick?: (platform: string) => void;
}

export const PlatformCategoryCard: React.FC<PlatformCategoryCardProps> = ({
  categoryId,
  connectedProviders,
  onPlatformClick
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const { categoryData, fetchCategoryData, isLoading } = usePlatformCategoryData();

  const category = PLATFORM_CATEGORIES[categoryId];

  // Count connected platforms in this category (safe if category is undefined)
  const connectedInCategory = category ? category.platforms.filter(p =>
    connectedProviders.includes(p)
  ) : [];
  const connectedCount = connectedInCategory.length;

  // Generate summary stat from first connected platform
  const getSummaryStat = (): string | undefined => {
    if (connectedCount === 0) return undefined;

    const firstConnected = connectedInCategory[0];
    const data = categoryData.platforms[firstConnected];

    if (data?.metrics?.[0]) {
      return `${data.metrics[0].value} ${data.metrics[0].label.toLowerCase()}`;
    }

    return undefined;
  };

  // Handle expand/collapse (after all hooks — early return moved below)
  const handleToggle = useCallback(() => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    // Fetch data on first expand
    if (newExpanded && !hasLoadedOnce && connectedCount > 0 && category) {
      setHasLoadedOnce(true);
      fetchCategoryData(category.platforms, connectedProviders);
    }
  }, [isExpanded, hasLoadedOnce, connectedCount, category, connectedProviders, fetchCategoryData]);

  if (!category) return null;

  // Handle platform navigation
  const handlePlatformClick = (platform: string) => {
    if (onPlatformClick) {
      onPlatformClick(platform);
    } else {
      navigate(`/insights/${platform}`);
    }
  };

  const cardBorder = '1px solid rgba(0, 0, 0, 0.04)';

  // Animation variants
  const expandVariants = {
    collapsed: {
      height: 0,
      opacity: 0,
      transition: {
        height: { duration: TIMING.medium / 1000, ease: 'easeOut' },
        opacity: { duration: TIMING.fast / 1000, ease: 'easeOut' }
      }
    },
    expanded: {
      height: 'auto',
      opacity: 1,
      transition: {
        height: respectReducedMotion() ? { duration: 0 } : spring(200, 25),
        opacity: { duration: TIMING.base / 1000, delay: 0.1, ease: 'easeOut' }
      }
    }
  };

  return (
    <motion.div
      layout={!respectReducedMotion()}
      className="rounded-2xl overflow-hidden"
      style={{ border: cardBorder }}
      initial={false}
    >
      {/* Collapsed Header */}
      <CategoryCardHeader
        category={category}
        isExpanded={isExpanded}
        connectedCount={connectedCount}
        totalPlatforms={category.platforms.length}
        summaryStat={getSummaryStat()}
        onClick={handleToggle}
      />

      {/* Expandable Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            variants={expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-5 pb-5"
              style={{
                borderTop: '1px solid rgba(0, 0, 0, 0.03)'
              }}
            >
              {/* Loading State */}
              {isLoading && (
                <PlatformCategorySkeleton platformCount={category.platforms.length} />
              )}

              {/* Loaded Content */}
              {!isLoading && (
                <StaggerContainer staggerDelay={0.08} className="space-y-3 pt-4">
                  {category.platforms.map((platform) => {
                    const platformData = categoryData.platforms[platform] || {
                      platform,
                      connected: connectedProviders.includes(platform),
                      lastSync: null,
                      metrics: []
                    };

                    return (
                      <StaggerItem key={platform}>
                        <PlatformSubCard
                          platform={platform}
                          data={platformData}
                          categoryColor={category.color}
                          onNavigate={() => handlePlatformClick(platform)}
                        />
                      </StaggerItem>
                    );
                  })}
                </StaggerContainer>
              )}

              {/* Connect More CTA */}
              {connectedCount < category.platforms.length && (
                <motion.button
                  className="w-full mt-4 p-3 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: `${category.color}08`,
                    border: `1px dashed ${category.color}30`,
                    color: category.color
                  }}
                  onClick={() => navigate('/get-started')}
                  whileHover={respectReducedMotion() ? {} : {
                    backgroundColor: `${category.color}12`,
                    borderStyle: 'solid'
                  }}
                  whileTap={respectReducedMotion() ? {} : { scale: 0.98 }}
                >
                  Connect {category.platforms.length - connectedCount} more platform{category.platforms.length - connectedCount > 1 ? 's' : ''}
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glow effect for connected categories */}
      {connectedCount > 0 && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            boxShadow: `0 0 20px ${category.color}10, inset 0 0 0 1px ${category.color}15`,
            opacity: isExpanded ? 1 : 0.5
          }}
          animate={{
            opacity: isExpanded ? 1 : 0.5
          }}
          transition={{ duration: 0.3 }}
        />
      )}
    </motion.div>
  );
};

export default PlatformCategoryCard;
