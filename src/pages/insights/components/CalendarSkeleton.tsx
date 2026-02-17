import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';

interface CalendarSkeletonProps {
  theme: string;
}

const SkeletonPulse = ({ className = '', style = {}, theme }: { className?: string; style?: React.CSSProperties; theme: string }) => (
  <div
    className={`animate-pulse rounded ${className}`}
    style={{
      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
      ...style
    }}
  />
);

export const CalendarSkeleton: React.FC<CalendarSkeletonProps> = ({ theme }) => {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-10 h-10 rounded-lg" theme={theme} />
          <SkeletonPulse className="w-12 h-12 rounded-xl" theme={theme} />
          <div>
            <SkeletonPulse className="h-7 w-36 mb-2" theme={theme} />
            <SkeletonPulse className="h-4 w-44" theme={theme} />
          </div>
        </div>
        <SkeletonPulse className="w-10 h-10 rounded-lg" theme={theme} />
      </div>

      <div className="mb-6">
        <SkeletonPulse className="h-4 w-28 mb-3" theme={theme} />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <GlassPanel key={i} className="!p-3">
              <div className="flex items-center gap-3">
                <SkeletonPulse className="w-10 h-10 rounded" theme={theme} />
                <div className="flex-1">
                  <SkeletonPulse className="h-4 w-40 mb-1" theme={theme} />
                  <SkeletonPulse className="h-3 w-20" theme={theme} />
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[1, 2, 3, 4].map(i => (
          <GlassPanel key={i} className="!p-4">
            <SkeletonPulse className="h-3 w-20 mb-2" theme={theme} />
            <SkeletonPulse className="h-6 w-16" theme={theme} />
          </GlassPanel>
        ))}
      </div>

      <GlassPanel className="mb-8">
        <SkeletonPulse className="h-4 w-24 mb-4" theme={theme} />
        <SkeletonPulse className="h-5 w-full mb-2" theme={theme} />
        <SkeletonPulse className="h-5 w-4/5 mb-2" theme={theme} />
        <SkeletonPulse className="h-5 w-2/3" theme={theme} />
      </GlassPanel>

      <div>
        <SkeletonPulse className="h-4 w-36 mb-4" theme={theme} />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <GlassPanel key={i} className="!p-4">
              <SkeletonPulse className="h-4 w-full mb-1" theme={theme} />
              <SkeletonPulse className="h-3 w-16" theme={theme} />
            </GlassPanel>
          ))}
        </div>
      </div>
    </>
  );
};
