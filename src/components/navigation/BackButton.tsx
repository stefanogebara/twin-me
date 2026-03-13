import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigationHistory } from '../../hooks/useNavigationHistory';
import { cn } from '../../lib/utils';

interface BackButtonProps {
  label?: string;
  showLabel?: boolean;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'ghost' | 'minimal';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * BackButton Component
 *
 * Features:
 * - Smart back navigation with history awareness
 * - Multiple variants (default, ghost, minimal)
 * - Customizable size
 * - Optional custom onClick handler
 * - Shows "Back" label by default
 */
export const BackButton: React.FC<BackButtonProps> = ({
  label = 'Back',
  showLabel = true,
  className = '',
  onClick,
  variant = 'default',
  size = 'md'
}) => {
  const { goBack, canGoBack, previousPage } = useNavigationHistory();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      goBack();
    }
  };

  // Size classes
  const sizeClasses = {
    sm: 'h-8 px-2 gap-1 text-xs',
    md: 'h-10 px-3 gap-2 text-sm',
    lg: 'h-12 px-4 gap-2 text-base'
  };

  // Variant classes
  const variantClasses = {
    default: cn(
      'bg-[var(--claude-surface)]',
      'border border-[var(--claude-border)]',
      'text-[var(--claude-text)]',
      'hover:bg-[var(--claude-surface-raised)]',
      'hover:border-[var(--claude-accent)]',
      'hover:text-[var(--claude-accent)]'
    ),
    ghost: cn(
      'bg-transparent',
      'text-[var(--claude-text-muted)]',
      'hover:bg-[var(--claude-surface-raised)]',
      'hover:text-[var(--claude-accent)]'
    ),
    minimal: cn(
      'bg-transparent',
      'text-[var(--claude-text-muted)]',
      'hover:text-[var(--claude-accent)]'
    )
  };

  // Icon size based on button size
  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  if (!canGoBack && !onClick) {
    return null; // Don't show if there's nowhere to go back to
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center justify-center',
        'rounded-lg font-medium',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-[var(--claude-accent)] focus:ring-offset-2',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      title={previousPage ? `Back to ${previousPage.title || previousPage.path}` : label}
      aria-label={label}
    >
      <ArrowLeft className={cn(iconSize[size], 'flex-shrink-0')} />
      {showLabel && (
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            letterSpacing: '-0.01em'
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
};
