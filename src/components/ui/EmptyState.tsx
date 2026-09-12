import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  tertiaryAction?: EmptyStateAction;
  variant?: 'default' | 'compact' | 'centered';
  illustration?: React.ReactNode;
  className?: string;
  animate?: boolean;
}

/**
 * An empty state in the register: a 32px icon square on the field, a row title,
 * one quiet line, and the actions as 32px buttons (ink for the primary). Keep the
 * description to one short line; the register's own empty state is only that.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  iconClassName,
  title,
  description,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  variant = 'default',
  illustration,
  className,
}) => {
  const variantStyles = {
    default: 'py-10 px-6',
    compact: 'py-6 px-4',
    centered: 'py-16 px-6 min-h-[320px] flex items-center justify-center'
  };

  return (
    <div
      className={cn(
        'text-center',
        variantStyles[variant],
        className
      )}
    >
      {/* Icon or Custom Illustration */}
      {illustration ? (
        <div className="flex justify-center mb-4">
          {illustration}
        </div>
      ) : Icon ? (
        <div className="flex justify-center mb-4">
          <div className={cn(
            'w-8 h-8 rounded-[var(--rg-radius-icon)] flex items-center justify-center bg-[var(--rg-field)]',
            iconClassName
          )}>
            <Icon className="w-4 h-4 text-[var(--rg-ink)]" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {/* Title & Description */}
      <div className="max-w-md mx-auto mb-5">
        <h3 className="text-[13px] leading-5 font-medium text-[var(--rg-ink)]">
          {title}
        </h3>
        <p className="text-[13px] leading-[19.5px] font-[350] text-[var(--rg-ink-3)]">
          {description}
        </p>
      </div>

      {/* Actions */}
      {(primaryAction || secondaryAction || tertiaryAction) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              variant={primaryAction.variant || 'default'}
            >
              {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
              {primaryAction.label}
            </Button>
          )}

          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant || 'outline'}
            >
              {secondaryAction.icon && <secondaryAction.icon className="w-4 h-4" />}
              {secondaryAction.label}
            </Button>
          )}

          {tertiaryAction && (
            <Button
              onClick={tertiaryAction.onClick}
              variant={tertiaryAction.variant || 'ghost'}
            >
              {tertiaryAction.icon && <tertiaryAction.icon className="w-4 h-4" />}
              {tertiaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
