import React from 'react';

export const SpotifySkeleton: React.FC = () => {
  const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{
        backgroundColor: 'var(--glass-surface-bg)',
        ...style
      }}
    />
  );

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
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
            <div key={i} className="py-3" style={{ borderBottom: '1px solid var(--border-glass)' }}>
              <div className="flex items-center gap-3">
                <SkeletonPulse className="w-10 h-10 rounded" />
                <div className="flex-1">
                  <SkeletonPulse className="h-4 w-32 mb-1" />
                  <SkeletonPulse className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton: Top Artists */}
      <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
        <SkeletonPulse className="h-4 w-40 mb-3" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonPulse key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>

      {/* Skeleton: Reflection */}
      <div className="p-4 rounded-lg mb-8" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
        <SkeletonPulse className="h-4 w-24 mb-4" />
        <SkeletonPulse className="h-5 w-full mb-2" />
        <SkeletonPulse className="h-5 w-4/5 mb-2" />
        <SkeletonPulse className="h-5 w-3/5" />
      </div>

      {/* Skeleton: Patterns */}
      <div>
        <SkeletonPulse className="h-4 w-36 mb-4" />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="p-4 rounded-lg" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <SkeletonPulse className="h-4 w-full mb-1" />
              <SkeletonPulse className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
