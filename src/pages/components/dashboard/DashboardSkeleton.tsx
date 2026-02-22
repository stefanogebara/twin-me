import React from 'react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';

const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => {
  return (
    <div
      className={`glass-shimmer rounded ${className}`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        ...style
      }}
    />
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <PageLayout>
      {/* Skeleton: Greeting Header */}
      <div className="mb-8">
        <SkeletonPulse className="h-9 w-64 mb-2" />
        <SkeletonPulse className="h-5 w-32" />
      </div>

      {/* Skeleton: Today's Insights */}
      <div className="mb-8">
        <SkeletonPulse className="h-32 w-full rounded-xl" />
      </div>

      {/* Skeleton: Next Event Card */}
      <GlassPanel className="mb-8">
        <SkeletonPulse className="h-3 w-full mb-4" style={{ borderRadius: '2px' }} />
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <SkeletonPulse className="h-4 w-36 mb-3" />
            <SkeletonPulse className="h-7 w-48 mb-3" />
            <div className="flex items-center gap-4">
              <SkeletonPulse className="h-5 w-20" />
              <SkeletonPulse className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <SkeletonPulse className="w-12 h-12 rounded-xl" />
        </div>
        <SkeletonPulse className="h-12 w-full mt-6 rounded-xl" />
      </GlassPanel>

      {/* Skeleton: Twin Insights */}
      <div className="mb-8">
        <SkeletonPulse className="h-5 w-28 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <GlassPanel key={i}>
              <div className="flex items-start gap-3">
                <SkeletonPulse className="w-10 h-10 rounded-lg flex-shrink-0" />
                <div className="flex-1">
                  <SkeletonPulse className="h-4 w-24 mb-2" />
                  <SkeletonPulse className="h-3 w-full mb-2" />
                  <SkeletonPulse className="h-6 w-20 rounded-full" />
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>

      {/* Skeleton: Connected Platforms */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SkeletonPulse className="h-5 w-40" />
          <SkeletonPulse className="h-5 w-16" />
        </div>
        <div className="flex gap-3 flex-wrap">
          {[1, 2, 3].map((i) => (
            <SkeletonPulse key={i} className="h-12 w-28 rounded-xl" />
          ))}
        </div>
      </div>
    </PageLayout>
  );
};
