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

// The register's buttons: 32 tall, a 4px corner, 13px. Primary is ink with
// page-colour text, once a screen; secondary and outline are white with a
// hairline; danger is white with the pink line and red text. lg is the one
// marketing / sign-in call to action, 48 tall with a 12px corner.
const variants = {
  primary: 'border-[var(--rg-ink)] bg-[var(--rg-ink)] text-[var(--rg-page)] font-medium hover:opacity-[0.86]',
  secondary: 'border-[var(--rg-rule)] bg-[var(--rg-white)] text-[var(--rg-ink)] hover:border-[var(--rg-quiet)]',
  outline: 'border-[var(--rg-rule)] bg-[var(--rg-white)] text-[var(--rg-ink)] hover:border-[var(--rg-quiet)]',
  ghost: 'border-transparent text-[var(--rg-ink)] hover:bg-[var(--rg-hover)]',
  danger: 'border-[var(--rg-danger-line)] bg-[var(--rg-white)] text-[var(--rg-danger)] hover:border-[var(--rg-danger)]'
};

const sizes = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-8 px-4 text-[13px]',
  lg: 'h-12 px-[22px] text-[15px] font-medium rounded-[var(--rg-radius-cta)]'
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
        'inline-flex items-center justify-center rounded-[var(--rg-radius)] border',
        'font-[family-name:var(--font-ui)] font-normal tracking-[-0.176px]',
        'transition-[opacity,background-color,border-color] duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rg-ink)] focus-visible:ring-offset-2',
        'disabled:opacity-40 disabled:cursor-not-allowed',

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