/**
 * Platform Category Skeleton Component
 *
 * Displays loading skeleton with shimmer effect while data is being fetched.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { shimmer, respectReducedMotion } from '@/lib/animations';

interface PlatformCategorySkeletonProps {
  platformCount?: number;
}

export const PlatformCategorySkeleton: React.FC<PlatformCategorySkeletonProps> = ({
  platformCount = 3
}) => {
  const skeletonBg = 'rgba(0, 0, 0, 0.06)';
  const shimmerBg = 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)';

  const SkeletonBar = ({ width, height = 12 }: { width: string; height?: number }) => (
    <div
      className="rounded-md overflow-hidden relative"
      style={{
        width,
        height,
        backgroundColor: skeletonBg
      }}
    >
      {!respectReducedMotion() && (
        <motion.div
          className="absolute inset-0"
          variants={shimmer}
          initial="initial"
          animate="animate"
          style={{ background: shimmerBg }}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: platformCount }).map((_, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08, duration: 0.2 }}
          className="p-4 rounded-xl"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(0, 0, 0, 0.04)'
          }}
        >
          {/* Platform header skeleton */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg"
              style={{ backgroundColor: skeletonBg }}
            />
            <div className="flex-1 space-y-2">
              <SkeletonBar width="40%" height={14} />
              <SkeletonBar width="60%" height={10} />
            </div>
          </div>

          {/* Metrics skeleton */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonBar width="50%" height={10} />
                <SkeletonBar width="80%" height={16} />
              </div>
            ))}
          </div>

          {/* Insight skeleton */}
          <div className="space-y-2 pt-3" style={{ borderTop: `1px solid ${skeletonBg}` }}>
            <SkeletonBar width="100%" height={10} />
            <SkeletonBar width="75%" height={10} />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

/**
 * Mini skeleton for collapsed card summary
 */
export const CategorySummarySkeleton: React.FC = () => {
  const skeletonBg = 'rgba(0, 0, 0, 0.06)';

  return (
    <div className="flex items-center gap-2 mt-2">
      <div
        className="h-3 w-20 rounded-full animate-pulse"
        style={{ backgroundColor: skeletonBg }}
      />
      <div
        className="h-3 w-16 rounded-full animate-pulse"
        style={{ backgroundColor: skeletonBg }}
      />
      <div
        className="h-3 w-24 rounded-full animate-pulse"
        style={{ backgroundColor: skeletonBg }}
      />
    </div>
  );
};

export default PlatformCategorySkeleton;
