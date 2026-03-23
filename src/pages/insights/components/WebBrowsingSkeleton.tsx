import React from 'react';

interface WebBrowsingSkeletonProps {
  theme?: string;
}

const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div
    className={`animate-pulse rounded ${className}`}
    style={{
      backgroundColor: 'var(--glass-surface-bg)',
      ...style
    }}
  />
);

export const WebBrowsingSkeleton: React.FC<WebBrowsingSkeletonProps> = () => {
  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
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
      <div
        className="mb-6 p-4 rounded-lg"
        style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      >
        <SkeletonPulse className="h-4 w-40 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonPulse key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div
        className="p-4 rounded-lg mb-8"
        style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      >
        <SkeletonPulse className="h-5 w-full mb-2" />
        <SkeletonPulse className="h-5 w-4/5 mb-2" />
        <SkeletonPulse className="h-5 w-3/5" />
      </div>
    </div>
  );
};
