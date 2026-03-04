import React from 'react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';

interface WebBrowsingSkeletonProps {
  theme?: string;
}

const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div
    className={`animate-pulse rounded ${className}`}
    style={{
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      ...style
    }}
  />
);

export const WebBrowsingSkeleton: React.FC<WebBrowsingSkeletonProps> = () => {
  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-10 h-10 rounded-lg" />
          <SkeletonPulse className="w-12 h-12 rounded-xl" />
          <div>
            <SkeletonPulse className="h-7 w-40 mb-2" />
            <SkeletonPulse className="h-4 w-32" />
          </div>
        </div>
      </div>
      <GlassPanel className="mb-6 !p-4">
        <SkeletonPulse className="h-4 w-40 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonPulse key={i} className="h-8 w-full" />
          ))}
        </div>
      </GlassPanel>
      <GlassPanel className="mb-8">
        <SkeletonPulse className="h-5 w-full mb-2" />
        <SkeletonPulse className="h-5 w-4/5 mb-2" />
        <SkeletonPulse className="h-5 w-3/5" />
      </GlassPanel>
    </PageLayout>
  );
};
