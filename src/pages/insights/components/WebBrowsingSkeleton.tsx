import React from 'react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';

interface WebBrowsingSkeletonProps {
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

export const WebBrowsingSkeleton: React.FC<WebBrowsingSkeletonProps> = ({ theme }) => {
  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-10 h-10 rounded-lg" theme={theme} />
          <SkeletonPulse className="w-12 h-12 rounded-xl" theme={theme} />
          <div>
            <SkeletonPulse className="h-7 w-40 mb-2" theme={theme} />
            <SkeletonPulse className="h-4 w-32" theme={theme} />
          </div>
        </div>
      </div>
      <GlassPanel className="mb-6 !p-4">
        <SkeletonPulse className="h-4 w-40 mb-3" theme={theme} />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonPulse key={i} className="h-8 w-full" theme={theme} />
          ))}
        </div>
      </GlassPanel>
      <GlassPanel className="mb-8">
        <SkeletonPulse className="h-5 w-full mb-2" theme={theme} />
        <SkeletonPulse className="h-5 w-4/5 mb-2" theme={theme} />
        <SkeletonPulse className="h-5 w-3/5" theme={theme} />
      </GlassPanel>
    </PageLayout>
  );
};
