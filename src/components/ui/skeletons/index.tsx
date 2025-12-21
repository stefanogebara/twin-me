/**
 * Comprehensive Skeleton Loaders
 * Purpose: Maintain layout stability while loading data
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// Dashboard Card Skeleton
export const DashboardCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn('p-6', className)}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </Card>
  );
};

// Soul Signature Card Skeleton
export const SoulSignatureCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn('p-8', className)}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>

        {/* Score Circle */}
        <div className="flex justify-center py-8">
          <Skeleton className="h-40 w-40 rounded-full" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
    </Card>
  );
};

// Platform Connection Card Skeleton
export const PlatformCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />

          {/* Action Button */}
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </Card>
  );
};

// Platform Grid Skeleton
export const PlatformGridSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 6,
  className
}) => {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <PlatformCardSkeleton key={i} />
      ))}
    </div>
  );
};

// Twin Profile Skeleton
export const TwinProfileSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Card className={cn('p-6', className)}>
      <div className="space-y-6">
        {/* Avatar and Name */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 flex-1 rounded-lg" />
        </div>
      </div>
    </Card>
  );
};

// Chat Message Skeleton
export const ChatMessageSkeleton: React.FC<{ isUser?: boolean; className?: string }> = ({
  isUser = false,
  className
}) => {
  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start', className)}>
      {!isUser && <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />}
      <div className="space-y-2 max-w-[70%]">
        <Skeleton className="h-4 w-32" />
        <div className={cn(
          'rounded-2xl p-4 space-y-2',
          isUser ? 'bg-[hsl(var(--claude-accent))]/10' : 'bg-[hsl(var(--claude-surface))]'
        )}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      {isUser && <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />}
    </div>
  );
};

// Chat Conversation Skeleton
export const ChatConversationSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('space-y-6', className)}>
      <ChatMessageSkeleton isUser={false} />
      <ChatMessageSkeleton isUser={true} />
      <ChatMessageSkeleton isUser={false} />
      <ChatMessageSkeleton isUser={true} />
    </div>
  );
};

// Data Table Skeleton
export const DataTableSkeleton: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 5,
  columns = 4,
  className
}) => {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-10 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
};

// Onboarding Step Skeleton
export const OnboardingStepSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Progress Bar */}
      <Skeleton className="h-2 w-full rounded-full" />

      {/* Title and Description */}
      <div className="space-y-4 text-center">
        <Skeleton className="h-8 w-64 mx-auto" />
        <Skeleton className="h-4 w-96 mx-auto" />
      </div>

      {/* Content Area */}
      <Card className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
};

// Settings Section Skeleton
export const SettingsSectionSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-20 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// List Item Skeleton
export const ListItemSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('flex items-center gap-4 p-4 border-b border-[hsl(var(--claude-border))]', className)}>
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-8 w-24 rounded-lg" />
    </div>
  );
};

// List Skeleton
export const ListSkeleton: React.FC<{ items?: number; className?: string }> = ({
  items = 5,
  className
}) => {
  return (
    <div className={cn('border border-[hsl(var(--claude-border))] rounded-lg overflow-hidden', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
};

// Full Page Loading Skeleton
export const FullPageSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('min-h-screen bg-[hsl(var(--claude-bg))] p-8', className)}>
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto space-y-6">
        <DashboardCardSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCardSkeleton />
          <DashboardCardSkeleton />
          <DashboardCardSkeleton />
        </div>
      </div>
    </div>
  );
};

export default {
  DashboardCardSkeleton,
  SoulSignatureCardSkeleton,
  PlatformCardSkeleton,
  PlatformGridSkeleton,
  TwinProfileSkeleton,
  ChatMessageSkeleton,
  ChatConversationSkeleton,
  DataTableSkeleton,
  OnboardingStepSkeleton,
  SettingsSectionSkeleton,
  ListItemSkeleton,
  ListSkeleton,
  FullPageSkeleton
};
