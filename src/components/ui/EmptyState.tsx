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
    default: 'py-16 px-8',
    compact: 'py-8 px-6',
    centered: 'py-20 px-8 min-h-[400px] flex items-center justify-center'
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
        <div className="flex justify-center mb-6">
          {illustration}
        </div>
      ) : Icon ? (
        <div className="flex justify-center mb-6">
          <div className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center',
            iconClassName
          )} style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
            <Icon className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
        </div>
      ) : null}

      {/* Title & Description */}
      <div className="max-w-md mx-auto mb-6">
        <h3 className="text-2xl text-foreground mb-2"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}>
          {title}
        </h3>
        <p style={{ color: 'rgba(255,255,255,0.4)' }} className="text-base leading-relaxed">
          {description}
        </p>
      </div>

      {/* Actions */}
      {(primaryAction || secondaryAction || tertiaryAction) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              variant={primaryAction.variant || 'default'}
              className={cn(
                primaryAction.variant === 'default' && 'text-white',
                'min-w-[160px]'
              )}
              style={primaryAction.variant === 'default' ? { backgroundColor: '#10b77f', color: '#0a0f0a' } : undefined}
            >
              {primaryAction.icon && <primaryAction.icon className="w-4 h-4 mr-2" />}
              {primaryAction.label}
            </Button>
          )}

          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant || 'outline'}
              className="min-w-[160px]"
            >
              {secondaryAction.icon && <secondaryAction.icon className="w-4 h-4 mr-2" />}
              {secondaryAction.label}
            </Button>
          )}

          {tertiaryAction && (
            <Button
              onClick={tertiaryAction.onClick}
              variant={tertiaryAction.variant || 'ghost'}
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              {tertiaryAction.icon && <tertiaryAction.icon className="w-4 h-4 mr-2" />}
              {tertiaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
