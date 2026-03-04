import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';

const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div
    className={`animate-pulse rounded ${className}`}
    style={{
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      ...style
    }}
  />
);

export const CalendarSkeleton: React.FC = () => {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-10 h-10 rounded-lg" />
          <SkeletonPulse className="w-12 h-12 rounded-xl" />
          <div>
            <SkeletonPulse className="h-7 w-36 mb-2" />
            <SkeletonPulse className="h-4 w-44" />
          </div>
        </div>
        <SkeletonPulse className="w-10 h-10 rounded-lg" />
      </div>

      <div className="mb-6">
        <SkeletonPulse className="h-4 w-28 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <GlassPanel key={i} className="!p-3">
              <div className="flex items-center gap-3">
                <SkeletonPulse className="w-10 h-10 rounded" />
                <div className="flex-1">
                  <SkeletonPulse className="h-4 w-40 mb-1" />
                  <SkeletonPulse className="h-3 w-20" />
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[1, 2, 3, 4].map(i => (
          <GlassPanel key={i} className="!p-4">
            <SkeletonPulse className="h-3 w-20 mb-2" />
            <SkeletonPulse className="h-6 w-16" />
          </GlassPanel>
        ))}
      </div>

      <GlassPanel className="mb-8">
        <SkeletonPulse className="h-4 w-24 mb-4" />
        <SkeletonPulse className="h-5 w-full mb-2" />
        <SkeletonPulse className="h-5 w-4/5 mb-2" />
        <SkeletonPulse className="h-5 w-2/3" />
      </GlassPanel>

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
    </>
  );
};
