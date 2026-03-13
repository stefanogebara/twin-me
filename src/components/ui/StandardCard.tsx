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
  style,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-lg',
        variant === 'interactive' && 'cursor-pointer',
        paddings[padding],
        className
      )}
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
        ...style,
      }}
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
          <div style={{ color: '#10b77f' }}>
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm mt-1" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.4)' }}>
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
      className={cn(className)}
      style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}
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
      className={cn('flex items-center justify-between pt-4 mt-4', className)}
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      {...props}
    >
      {children}
    </div>
  );
};

export default StandardCard;
