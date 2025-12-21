import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  variant?: 'page' | 'card' | 'inline' | 'skeleton';
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Reusable loading state component with multiple variants
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  variant = 'inline',
  message = 'Loading...',
  size = 'md'
}) => {
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  if (variant === 'skeleton') {
    return <SkeletonLoader />;
  }

  if (variant === 'page') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[hsl(var(--claude-bg))]">
        <Loader2 className={`${iconSizes[size]} animate-spin text-stone-600 mb-4`} />
        <p className="text-stone-600 text-sm">{message}</p>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-stone-200">
        <Loader2 className={`${iconSizes[size]} animate-spin text-stone-600 mb-4`} />
        <p className="text-stone-600 text-sm">{message}</p>
      </div>
    );
  }

  // Inline variant (default)
  return (
    <div className="flex items-center gap-2 text-stone-600">
      <Loader2 className={`${iconSizes[size]} animate-spin`} />
      <span className="text-sm">{message}</span>
    </div>
  );
};

/**
 * Skeleton loader for content placeholders
 */
export const SkeletonLoader: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 bg-stone-200 rounded w-3/4"></div>
          <div className="h-4 bg-stone-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
};

/**
 * Card skeleton for platform cards
 */
export const CardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-stone-200 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-stone-200 rounded-lg"></div>
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-stone-200 rounded w-1/2"></div>
          <div className="h-3 bg-stone-200 rounded w-3/4"></div>
        </div>
      </div>
    </div>
  );
};

/**
 * Dashboard skeleton for complex layouts
 */
export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 bg-stone-200 rounded w-1/3"></div>
        <div className="h-4 bg-stone-200 rounded w-1/2"></div>
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-stone-200 p-6">
            <div className="space-y-3">
              <div className="h-4 bg-stone-200 rounded w-1/2"></div>
              <div className="h-6 bg-stone-200 rounded w-1/3"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="space-y-4">
          <div className="h-6 bg-stone-200 rounded w-1/4"></div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-stone-200 rounded w-full"></div>
              <div className="h-4 bg-stone-200 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
