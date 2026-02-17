import React from 'react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';

interface SpotifySkeletonProps {
  theme: string;
}

export const SpotifySkeleton: React.FC<SpotifySkeletonProps> = ({ theme }) => {
  const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        ...style
      }}
    />
  );

  return (
    <PageLayout>
      {/* Skeleton: Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-10 h-10 rounded-lg" />
          <SkeletonPulse className="w-12 h-12 rounded-xl" />
          <div>
            <SkeletonPulse className="h-7 w-40 mb-2" />
            <SkeletonPulse className="h-4 w-32" />
          </div>
        </div>
        <SkeletonPulse className="w-10 h-10 rounded-lg" />
      </div>

      {/* Skeleton: Recent Tracks */}
      <div className="mb-6">
        <SkeletonPulse className="h-4 w-32 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <GlassPanel key={i} className="!p-3">
              <div className="flex items-center gap-3">
                <SkeletonPulse className="w-10 h-10 rounded" />
                <div className="flex-1">
                  <SkeletonPulse className="h-4 w-32 mb-1" />
                  <SkeletonPulse className="h-3 w-24" />
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>

      {/* Skeleton: Top Artists */}
      <GlassPanel className="mb-6 !p-4">
        <SkeletonPulse className="h-4 w-40 mb-3" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonPulse key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </GlassPanel>

      {/* Skeleton: Reflection */}
      <GlassPanel className="mb-8">
        <SkeletonPulse className="h-4 w-24 mb-4" />
        <SkeletonPulse className="h-5 w-full mb-2" />
        <SkeletonPulse className="h-5 w-4/5 mb-2" />
        <SkeletonPulse className="h-5 w-3/5" />
      </GlassPanel>

      {/* Skeleton: Patterns */}
      <div>
        <SkeletonPulse className="h-4 w-36 mb-4" />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <GlassPanel key={i} className="!p-4">
              <SkeletonPulse className="h-4 w-full mb-1" />
              <SkeletonPulse className="h-3 w-16" />
            </GlassPanel>
          ))}
        </div>
      </div>
    </PageLayout>
  );
};
