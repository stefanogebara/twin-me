/**
 * Icon with Tooltip Component
 *
 * Wraps icons with tooltips for better UX. Includes hover animations
 * and accessibility features.
 */

import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { iconBounce, respectReducedMotion } from '@/lib/animations';

interface IconWithTooltipProps {
  icon: ReactNode;
  tooltip: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  iconClassName?: string;
  tooltipClassName?: string;
  onClick?: () => void;
  ariaLabel?: string;
  animation?: 'bounce' | 'none';
}

/**
 * Icon with Tooltip
 *
 * Usage:
 * <IconWithTooltip
 *   icon={<Settings className="w-5 h-5" />}
 *   tooltip="Settings"
 *   side="right"
 * />
 */
export const IconWithTooltip: React.FC<IconWithTooltipProps> = ({
  icon,
  tooltip,
  side = 'top',
  className,
  iconClassName,
  tooltipClassName,
  onClick,
  ariaLabel,
  animation = 'bounce',
}) => {
  const IconWrapper = animation === 'bounce' && !respectReducedMotion() ? motion.div : 'div';
  const animationProps =
    animation === 'bounce' && !respectReducedMotion()
      ? {
          variants: iconBounce,
          initial: 'initial',
          whileHover: 'hover',
        }
      : {};

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconWrapper
            className={cn(
              'inline-flex items-center justify-center cursor-pointer',
              'transition-colors duration-200',
              'hover:text-primary',
              onClick && 'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded',
              className
            )}
            onClick={onClick}
            aria-label={ariaLabel || tooltip}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            {...animationProps}
          >
            <div className={cn('transition-transform duration-200', iconClassName)}>{icon}</div>
          </IconWrapper>
        </TooltipTrigger>
        <TooltipContent side={side} className={cn('tooltip', tooltipClassName)}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Icon Button with Tooltip
 * Specifically for clickable icons
 */
interface IconButtonWithTooltipProps extends IconWithTooltipProps {
  onClick: () => void;
  variant?: 'default' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButtonWithTooltip: React.FC<IconButtonWithTooltipProps> = ({
  icon,
  tooltip,
  onClick,
  side = 'top',
  variant = 'default',
  size = 'md',
  className,
  iconClassName,
  tooltipClassName,
  ariaLabel,
  animation = 'bounce',
}) => {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const variantClasses = {
    default: 'hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent/50 hover:text-accent-foreground',
    destructive: 'hover:bg-destructive/10 hover:text-destructive',
  };

  return (
    <IconWithTooltip
      icon={icon}
      tooltip={tooltip}
      side={side}
      onClick={onClick}
      ariaLabel={ariaLabel}
      animation={animation}
      className={cn(
        'rounded-lg transition-all duration-200',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      iconClassName={iconClassName}
      tooltipClassName={tooltipClassName}
    />
  );
};

/**
 * Icon Badge with Tooltip
 * Icon with a badge indicator and tooltip
 */
interface IconBadgeWithTooltipProps extends IconWithTooltipProps {
  badgeContent?: string | number;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error';
}

export const IconBadgeWithTooltip: React.FC<IconBadgeWithTooltipProps> = ({
  icon,
  tooltip,
  badgeContent,
  badgeVariant = 'default',
  side = 'top',
  className,
  iconClassName,
  tooltipClassName,
  onClick,
  ariaLabel,
  animation = 'bounce',
}) => {
  const badgeVariantClasses = {
    default: 'bg-primary text-primary-foreground',
    success: 'bg-green-500 text-white',
    warning: 'bg-yellow-500 text-white',
    error: 'bg-red-500 text-white',
  };

  return (
    <div className="relative inline-flex">
      <IconWithTooltip
        icon={icon}
        tooltip={tooltip}
        side={side}
        onClick={onClick}
        ariaLabel={ariaLabel}
        animation={animation}
        className={className}
        iconClassName={iconClassName}
        tooltipClassName={tooltipClassName}
      />
      {badgeContent && (
        <span
          className={cn(
            'absolute -top-1 -right-1 flex items-center justify-center',
            'min-w-[18px] h-[18px] px-1 rounded-full',
            'text-xs font-semibold',
            'transition-transform duration-200 hover:scale-110',
            badgeVariantClasses[badgeVariant]
          )}
        >
          {badgeContent}
        </span>
      )}
    </div>
  );
};

/**
 * Icon Group with Tooltips
 * Multiple icons in a row with individual tooltips
 */
interface IconGroupProps {
  icons: Array<{
    icon: ReactNode;
    tooltip: string;
    onClick?: () => void;
    ariaLabel?: string;
  }>;
  spacing?: 'tight' | 'normal' | 'loose';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export const IconGroupWithTooltips: React.FC<IconGroupProps> = ({
  icons,
  spacing = 'normal',
  side = 'top',
  className,
}) => {
  const spacingClasses = {
    tight: 'gap-1',
    normal: 'gap-2',
    loose: 'gap-4',
  };

  return (
    <div className={cn('flex items-center', spacingClasses[spacing], className)}>
      {icons.map((iconProps, index) => (
        <IconWithTooltip
          key={index}
          icon={iconProps.icon}
          tooltip={iconProps.tooltip}
          onClick={iconProps.onClick}
          ariaLabel={iconProps.ariaLabel}
          side={side}
        />
      ))}
    </div>
  );
};

/**
 * Truncated Text with Tooltip
 * Shows full text on hover if truncated
 */
interface TruncatedTextWithTooltipProps {
  text: string;
  maxLength?: number;
  className?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const TruncatedTextWithTooltip: React.FC<TruncatedTextWithTooltipProps> = ({
  text,
  maxLength = 50,
  className,
  tooltipSide = 'top',
}) => {
  const shouldTruncate = text.length > maxLength;
  const displayText = shouldTruncate ? `${text.slice(0, maxLength)}...` : text;

  if (!shouldTruncate) {
    return <span className={className}>{text}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('cursor-help', className)}>{displayText}</span>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className="max-w-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Info Icon with Tooltip
 * Standard info icon with explanatory tooltip
 */
interface InfoTooltipProps {
  content: string | ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  side = 'top',
  className,
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center',
              'w-4 h-4 rounded-full',
              'text-xs text-muted-foreground',
              'hover:text-foreground transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
              className
            )}
            aria-label="More information"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-full h-full"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-sm">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default IconWithTooltip;
