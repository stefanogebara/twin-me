/**
 * Standardized Button Component
 * Provides consistent styling across the platform with variants
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface StandardButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variants = {
  primary: 'bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent-hover))] text-white',
  secondary: 'bg-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-text))] text-white',
  outline: 'border-2 border-[hsl(var(--claude-accent))] text-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))] hover:text-white',
  ghost: 'text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))]',
  danger: 'bg-red-600 hover:bg-red-700 text-white'
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg'
};

export const StandardButton: React.FC<StandardButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
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
        // Base styles
        'inline-flex items-center justify-center rounded-lg',
        'font-[family-name:var(--font-ui)] font-medium',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))] focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',

        // Variant styles
        variants[variant],

        // Size styles
        sizes[size],

        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
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

// Export convenience components
export const PrimaryButton: React.FC<StandardButtonProps> = (props) => (
  <StandardButton variant="primary" {...props} />
);

export const SecondaryButton: React.FC<StandardButtonProps> = (props) => (
  <StandardButton variant="secondary" {...props} />
);

export const OutlineButton: React.FC<StandardButtonProps> = (props) => (
  <StandardButton variant="outline" {...props} />
);

export const GhostButton: React.FC<StandardButtonProps> = (props) => (
  <StandardButton variant="ghost" {...props} />
);

export const DangerButton: React.FC<StandardButtonProps> = (props) => (
  <StandardButton variant="danger" {...props} />
);

export default StandardButton;