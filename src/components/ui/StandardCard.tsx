/**
 * Standardized Card Component
 * Provides consistent card styling across the platform
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface StandardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variants = {
  default: 'bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))]',
  elevated: 'bg-[hsl(var(--claude-surface))] shadow-lg',
  bordered: 'bg-[hsl(var(--claude-surface))] border-2 border-[hsl(var(--claude-border))]',
  interactive: 'bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] hover:shadow-md transition-shadow cursor-pointer'
};

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

export const StandardCard: React.FC<StandardCardProps> = ({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-lg',
        variants[variant],
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

// Card Header Component
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  className,
  ...props
}) => {
  return (
    <div
      className={cn('flex items-start justify-between mb-4', className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="text-[hsl(var(--claude-accent))]">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-lg font-medium font-[family-name:var(--font-heading)] text-[hsl(var(--claude-text))]">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-[hsl(var(--claude-text-muted))] font-[family-name:var(--font-body)] mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div>{action}</div>
      )}
    </div>
  );
};

// Card Content Component
export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn('font-[family-name:var(--font-body)] text-[hsl(var(--claude-text))]', className)}
      {...props}
    >
      {children}
    </div>
  );
};

// Card Footer Component
export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn('flex items-center justify-between pt-4 mt-4 border-t border-[hsl(var(--claude-border))]', className)}
      {...props}
    >
      {children}
    </div>
  );
};

export default StandardCard;