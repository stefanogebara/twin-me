/**
 * Skeleton Loading Components
 * Consistent skeleton loaders for the Soul Signature platform
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton = ({ className, ...props }: SkeletonProps) => {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-stone-200", className)}
      {...props}
    />
  );
};

// Card Skeleton
export const CardSkeleton = () => {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-md">
      <div className="space-y-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
};

// Soul Signature Card Skeleton
export const SoulSignatureCardSkeleton = () => {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-8 shadow-md">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Platform Grid Skeleton
export const PlatformGridSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white border border-stone-200 rounded-xl p-4 shadow-md">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Dashboard Card Skeleton
export const DashboardCardSkeleton = () => {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-md">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
};

// Stats Card Skeleton
export const StatsCardSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <DashboardCardSkeleton key={i} />
      ))}
    </div>
  );
};

// Activity List Skeleton
export const ActivityListSkeleton = () => {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-stone-50 border border-stone-200">
          <Skeleton className="h-5 w-5 rounded mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
};

// Journey Progress Skeleton
export const JourneyProgressSkeleton = () => {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-8 shadow-md">
      <Skeleton className="h-6 w-1/3 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-7 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
};

// Quick Actions Skeleton
export const QuickActionsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white border border-stone-200 rounded-xl p-6 shadow-md">
          <div className="flex items-start gap-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Page Skeleton (Full Dashboard)
export const DashboardSkeleton = () => {
  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 md:p-8">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="space-y-8">
        <JourneyProgressSkeleton />
        <StatsCardSkeleton />
        <QuickActionsSkeleton />

        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <ActivityListSkeleton />
        </div>
      </div>
    </div>
  );
};

export default {
  Skeleton,
  CardSkeleton,
  DashboardCardSkeleton,
  SoulSignatureCardSkeleton,
  PlatformGridSkeleton,
  StatsCardSkeleton,
  ActivityListSkeleton,
  JourneyProgressSkeleton,
  QuickActionsSkeleton,
  DashboardSkeleton
};
