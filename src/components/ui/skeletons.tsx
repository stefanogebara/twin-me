/**
 * Skeleton Loading Components
 * Consistent skeleton loaders for the Soul Signature platform
 */

import React from 'react';
import { cn } from '@/lib/utils';

const darkCardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.06)',
  backgroundColor: 'rgba(255,255,255,0.02)',
};

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton = ({ className, ...props }: SkeletonProps) => {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/10", className)}
      {...props}
    />
  );
};

// Card Skeleton
export const CardSkeleton = () => {
  return (
    <div className="rounded-lg p-6 shadow-md" style={darkCardStyle}>
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
    <div className="rounded-lg p-8 shadow-md" style={darkCardStyle}>
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
        <div key={i} className="rounded-lg p-4 shadow-md" style={darkCardStyle}>
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
    <div className="rounded-lg p-6 shadow-md" style={darkCardStyle}>
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
        <div key={i} className="flex items-start gap-3 p-4 rounded-lg" style={darkCardStyle}>
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
    <div className="rounded-lg p-8 shadow-md" style={darkCardStyle}>
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
        <div key={i} className="rounded-lg p-6 shadow-md" style={darkCardStyle}>
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
    <div className="min-h-screen p-4 md:p-8">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="space-y-8">
        <JourneyProgressSkeleton />
        <StatsCardSkeleton />
        <QuickActionsSkeleton />

        <div className="rounded-lg p-6 shadow-md" style={darkCardStyle}>
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

// Section Skeleton — for content pages (Identity chapters, articles)
export const SectionSkeleton = ({ lines = 3 }: { lines?: number }) => {
  return (
    <div className="space-y-4 animate-pulse">
      <Skeleton className="h-3 w-20" style={{ background: 'rgba(255,255,255,0.08)' }} />
      <Skeleton className="h-5 w-48" />
      <div className="space-y-2">
        {[...Array(lines)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: `${100 - i * 12}%`, background: 'rgba(255,255,255,0.04)' }}
          />
        ))}
      </div>
    </div>
  );
};

// Chart Skeleton — for data visualization pages
export const ChartSkeleton = ({ height = 200 }: { height?: number }) => {
  return (
    <div className="rounded-lg p-6 shadow-md" style={darkCardStyle}>
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="flex items-end gap-2" style={{ height }}>
        {[40, 65, 50, 80, 55, 70, 45].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
};

// Table Row Skeleton — for tabular data (goals, memory stream)
export const TableRowSkeleton = ({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) => {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg" style={darkCardStyle}>
          {[...Array(cols)].map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
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
  DashboardSkeleton,
  SectionSkeleton,
  ChartSkeleton,
  TableRowSkeleton,
};
