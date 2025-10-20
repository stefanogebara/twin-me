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
  default: 'bg-[hsl(var(--claude-accent))]/10 text-[hsl(var(--claude-accent))] border-[hsl(var(--claude-accent))]/20',
  success: 'bg-green-50 text-green-700 border-green-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  premium: 'bg-purple-50 text-purple-700 border-purple-200',
  neutral: 'bg-gray-50 text-gray-700 border-gray-200'
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