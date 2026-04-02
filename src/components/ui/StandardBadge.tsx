/**
 * Standardized Badge Component
 * Provides consistent badge/status styling across the platform
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Check, X, AlertCircle, Clock, Loader2, Sparkles, Lock, Unlock } from 'lucide-react';

export interface StandardBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'premium' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  showIcon?: boolean;
}

const variants = {
  default: 'bg-[rgba(255,132,0,0.10)] text-[rgba(255,132,0,0.85)] border-[rgba(255,132,0,0.15)]',
  success: 'bg-[rgba(16,185,129,0.10)] text-[rgba(16,185,129,0.85)] border-[rgba(16,185,129,0.15)]',
  error: 'bg-[rgba(220,38,38,0.10)] text-[rgba(220,38,38,0.85)] border-[rgba(220,38,38,0.15)]',
  warning: 'bg-[rgba(245,158,11,0.10)] text-[rgba(245,158,11,0.85)] border-[rgba(245,158,11,0.15)]',
  info: 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] border-[rgba(255,255,255,0.10)]',
  premium: 'bg-[rgba(139,92,246,0.10)] text-[rgba(139,92,246,0.85)] border-[rgba(139,92,246,0.15)]',
  neutral: 'bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.50)] border-[rgba(255,255,255,0.08)]',
};

const sizes = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5'
};

const defaultIcons = {
  success: <Check className="w-3 h-3" />,
  error: <X className="w-3 h-3" />,
  warning: <AlertCircle className="w-3 h-3" />,
  info: <AlertCircle className="w-3 h-3" />,
  premium: <Sparkles className="w-3 h-3" />,
  default: null,
  neutral: null
};

export const StandardBadge: React.FC<StandardBadgeProps> = ({
  variant = 'default',
  size = 'md',
  icon,
  showIcon = false,
  children,
  className,
  ...props
}) => {
  const displayIcon = icon || (showIcon && defaultIcons[variant]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border',
        'font-[family-name:var(--font-ui)] font-medium',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {displayIcon && <span className="flex-shrink-0">{displayIcon}</span>}
      {children}
    </span>
  );
};

// Status-specific badge components
export const SuccessBadge: React.FC<Omit<StandardBadgeProps, 'variant'>> = (props) => (
  <StandardBadge variant="success" showIcon {...props} />
);

export const ErrorBadge: React.FC<Omit<StandardBadgeProps, 'variant'>> = (props) => (
  <StandardBadge variant="error" showIcon {...props} />
);

export const WarningBadge: React.FC<Omit<StandardBadgeProps, 'variant'>> = (props) => (
  <StandardBadge variant="warning" showIcon {...props} />
);

export const InfoBadge: React.FC<Omit<StandardBadgeProps, 'variant'>> = (props) => (
  <StandardBadge variant="info" showIcon {...props} />
);

export const PremiumBadge: React.FC<Omit<StandardBadgeProps, 'variant'>> = (props) => (
  <StandardBadge variant="premium" showIcon {...props} />
);

// Connection status badges
export const ConnectedBadge: React.FC<Omit<StandardBadgeProps, 'variant' | 'icon'>> = (props) => (
  <StandardBadge variant="success" icon={<Check className="w-3 h-3" />} {...props}>
    Connected
  </StandardBadge>
);

export const DisconnectedBadge: React.FC<Omit<StandardBadgeProps, 'variant' | 'icon'>> = (props) => (
  <StandardBadge variant="error" icon={<X className="w-3 h-3" />} {...props}>
    Disconnected
  </StandardBadge>
);

export const PendingBadge: React.FC<Omit<StandardBadgeProps, 'variant' | 'icon'>> = (props) => (
  <StandardBadge variant="warning" icon={<Clock className="w-3 h-3" />} {...props}>
    Pending
  </StandardBadge>
);

export const ExtractingBadge: React.FC<Omit<StandardBadgeProps, 'variant' | 'icon'>> = (props) => (
  <StandardBadge variant="info" icon={<Loader2 className="w-3 h-3 animate-spin" />} {...props}>
    Extracting
  </StandardBadge>
);

export const LockedBadge: React.FC<Omit<StandardBadgeProps, 'variant' | 'icon'>> = (props) => (
  <StandardBadge variant="neutral" icon={<Lock className="w-3 h-3" />} {...props}>
    Locked
  </StandardBadge>
);

export const UnlockedBadge: React.FC<Omit<StandardBadgeProps, 'variant' | 'icon'>> = (props) => (
  <StandardBadge variant="success" icon={<Unlock className="w-3 h-3" />} {...props}>
    Unlocked
  </StandardBadge>
);

export default StandardBadge;