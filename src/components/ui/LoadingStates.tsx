/**
 * Loading States Components
 * Provides consistent loading indicators across the platform
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Brain, Sparkles, Database, Server } from 'lucide-react';

// Spinner Loader
export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'primary' | 'white';
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'default',
  className,
  ...props
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const colors = {
    default: 'text-[hsl(var(--claude-text-muted))]',
    primary: 'text-[hsl(var(--claude-accent))]',
    white: 'text-white',
  };

  return (
    <div className={cn('flex items-center justify-center', className)} {...props}>
      <Loader2 className={cn('animate-spin', sizes[size], colors[variant])} />
    </div>
  );
};

// Full Page Loader
export interface PageLoaderProps {
  message?: string;
  submessage?: string;
  icon?: React.ReactNode;
}

export const PageLoader: React.FC<PageLoaderProps> = ({
  message = 'Loading...',
  submessage,
  icon,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--claude-bg))]/80 backdrop-blur-sm">
      <div className="text-center">
        <div className="mb-4">
          {icon || <Loader2 className="w-12 h-12 mx-auto text-[hsl(var(--claude-accent))] animate-spin" />}
        </div>
        <h3 className="text-lg font-medium font-[family-name:var(--font-heading)] text-[hsl(var(--claude-text))]">
          {message}
        </h3>
        {submessage && (
          <p className="mt-2 text-sm text-[hsl(var(--claude-text-muted))] font-[family-name:var(--font-body)]">
            {submessage}
          </p>
        )}
      </div>
    </div>
  );
};

// Card Skeleton Loader
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'card' | 'avatar' | 'button';
  animate?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  animate = true,
  className,
  ...props
}) => {
  const variants = {
    text: 'h-4 w-full rounded',
    card: 'h-32 w-full rounded-lg',
    avatar: 'h-10 w-10 rounded-full',
    button: 'h-10 w-24 rounded-lg',
  };

  return (
    <div
      className={cn(
        'bg-[hsl(var(--claude-text-muted))]/10',
        variants[variant],
        animate && 'animate-pulse',
        className
      )}
      {...props}
    />
  );
};

// Content Loader with Skeletons
export const ContentLoader: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" style={{ width: `${100 - i * 20}%` }} />
      ))}
    </div>
  );
};

// Soul Data Extraction Loader
export interface ExtractionLoaderProps {
  platform?: string;
  stage?: 'connecting' | 'extracting' | 'processing' | 'analyzing';
}

export const ExtractionLoader: React.FC<ExtractionLoaderProps> = ({
  platform,
  stage = 'extracting',
}) => {
  const stages = {
    connecting: {
      icon: <Server className="w-8 h-8 text-[hsl(var(--claude-accent))]" />,
      message: 'Connecting to platform...',
      submessage: 'Establishing secure connection',
    },
    extracting: {
      icon: <Database className="w-8 h-8 text-[hsl(var(--claude-accent))] animate-pulse" />,
      message: `Extracting ${platform ? `${platform} ` : ''}data...`,
      submessage: 'This may take a few moments',
    },
    processing: {
      icon: <Brain className="w-8 h-8 text-[hsl(var(--claude-accent))] animate-pulse" />,
      message: 'Processing soul signature...',
      submessage: 'Analyzing patterns and behaviors',
    },
    analyzing: {
      icon: <Sparkles className="w-8 h-8 text-[hsl(var(--claude-accent))] animate-pulse" />,
      message: 'Generating insights...',
      submessage: 'Discovering your unique patterns',
    },
  };

  const currentStage = stages[stage];

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-4">{currentStage.icon}</div>
      <h3 className="text-lg font-medium font-[family-name:var(--font-heading)] text-[hsl(var(--claude-text))]">
        {currentStage.message}
      </h3>
      <p className="mt-2 text-sm text-[hsl(var(--claude-text-muted))] font-[family-name:var(--font-body)]">
        {currentStage.submessage}
      </p>
      <div className="mt-6 flex gap-1">
        <div className="w-2 h-2 bg-[hsl(var(--claude-accent))] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-[hsl(var(--claude-accent))] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-[hsl(var(--claude-accent))] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};

// Button with Loading State
export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading = false,
  loadingText = 'Loading...',
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center px-4 py-2 rounded-lg',
        'bg-[hsl(var(--claude-accent))] text-white',
        'hover:bg-[hsl(var(--claude-accent-hover))]',
        'font-[family-name:var(--font-ui)] font-medium',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))] focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {loadingText}
        </>
      ) : (
        <>
          {leftIcon && <span className="mr-2">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};

// Progress Bar
export interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  showPercentage = false,
  variant = 'default',
  size = 'md',
}) => {
  const colors = {
    default: 'bg-[hsl(var(--claude-accent))]',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between mb-2">
          {label && (
            <span className="text-sm font-medium font-[family-name:var(--font-ui)] text-[hsl(var(--claude-text))]">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm font-medium font-[family-name:var(--font-ui)] text-[hsl(var(--claude-text-muted))]">
              {Math.round(value)}%
            </span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-gray-200 rounded-full overflow-hidden', sizes[size])}>
        <div
          className={cn('h-full transition-all duration-300', colors[variant])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
};

// Circular Progress
export interface CircularProgressProps {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  strokeWidth?: number;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 'md',
  showValue = true,
  strokeWidth = 4,
}) => {
  const sizes = {
    sm: 40,
    md: 60,
    lg: 80,
  };

  const dimension = sizes[size];
  const radius = (dimension - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={dimension} height={dimension} className="transform -rotate-90">
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200"
        />
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-[hsl(var(--claude-accent))] transition-all duration-300"
          strokeLinecap="round"
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold font-[family-name:var(--font-ui)] text-[hsl(var(--claude-text))]">
            {Math.round(value)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default {
  Spinner,
  PageLoader,
  Skeleton,
  ContentLoader,
  ExtractionLoader,
  LoadingButton,
  ProgressBar,
  CircularProgress,
};