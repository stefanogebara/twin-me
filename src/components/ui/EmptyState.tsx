import React from 'react';
import { motion } from 'framer-motion';
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
  animate = true
}) => {
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: 'easeOut'
      }
    }
  };

  const iconVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        delay: 0.1,
        duration: 0.3,
        ease: 'easeOut'
      }
    }
  };

  const textVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.2,
        duration: 0.3
      }
    }
  };

  const actionsVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.3,
        duration: 0.3
      }
    }
  };

  const variantStyles = {
    default: 'py-16 px-8',
    compact: 'py-8 px-6',
    centered: 'py-20 px-8 min-h-[400px] flex items-center justify-center'
  };

  const Container = animate ? motion.div : 'div';

  return (
    <Container
      className={cn(
        'text-center',
        variantStyles[variant],
        className
      )}
      initial={animate ? 'hidden' : undefined}
      animate={animate ? 'visible' : undefined}
      variants={containerVariants}
    >
      {/* Icon or Custom Illustration */}
      {illustration ? (
        <motion.div
          className="flex justify-center mb-6"
          variants={animate ? iconVariants : undefined}
        >
          {illustration}
        </motion.div>
      ) : Icon ? (
        <motion.div
          className="flex justify-center mb-6"
          variants={animate ? iconVariants : undefined}
        >
          <div className={cn(
            'w-16 h-16 rounded-full bg-black/[0.04] flex items-center justify-center',
            iconClassName
          )}>
            <Icon className="w-8 h-8 text-stone-600" />
          </div>
        </motion.div>
      ) : null}

      {/* Title & Description */}
      <motion.div
        className="max-w-md mx-auto mb-6"
        variants={animate ? textVariants : undefined}
      >
        <h3 className="text-2xl text-stone-900 mb-2"
            style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
          {title}
        </h3>
        <p className="text-stone-600 text-base leading-relaxed">
          {description}
        </p>
      </motion.div>

      {/* Actions */}
      {(primaryAction || secondaryAction || tertiaryAction) && (
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
          variants={animate ? actionsVariants : undefined}
        >
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              variant={primaryAction.variant || 'default'}
              className={cn(
                primaryAction.variant === 'default' && 'bg-stone-900 hover:bg-stone-800 text-white',
                'min-w-[160px]'
              )}
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
              className="text-stone-600"
            >
              {tertiaryAction.icon && <tertiaryAction.icon className="w-4 h-4 mr-2" />}
              {tertiaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </Container>
  );
};
