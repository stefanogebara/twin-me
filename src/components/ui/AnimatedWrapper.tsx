/**
 * Animated Wrapper Components
 *
 * Simplified pass-through wrapper components.
 * Framer Motion animations removed in favor of typography-driven dark design.
 */

import { ReactNode, HTMLAttributes } from 'react';

// ===== BASE COMPONENTS =====

interface AnimatedProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Fade In — pass-through
 */
export const FadeIn: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

/**
 * Fade In with Upward Slide — pass-through
 */
export const FadeInUp: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

/**
 * Fade In with Downward Slide — pass-through
 */
export const FadeInDown: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

/**
 * Scale In — pass-through
 */
export const ScaleIn: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

/**
 * Slide In from Left — pass-through
 */
export const SlideInLeft: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

/**
 * Slide In from Right — pass-through
 */
export const SlideInRight: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

// ===== HOVER COMPONENTS =====

/**
 * Animated Card — pass-through
 */
export const AnimatedCard: React.FC<AnimatedProps> = ({ children, className, ...props }) => (
  <div className={className} {...props}>{children}</div>
);

/**
 * Animated Button — pass-through
 */
export const AnimatedButton: React.FC<AnimatedProps> = ({ children, className, ...props }) => (
  <div className={className} {...props}>{children}</div>
);

/**
 * Animated Icon — pass-through
 */
export const AnimatedIcon: React.FC<AnimatedProps> = ({ children, className, ...props }) => (
  <div className={className} {...props}>{children}</div>
);

// ===== STAGGER =====

interface StaggerContainerProps extends AnimatedProps {
  staggerDelay?: number;
}

/**
 * Stagger Container — pass-through
 */
export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  staggerDelay = 0.1,
  ...props
}) => (
  <div {...props}>{children}</div>
);

/**
 * Stagger Item — pass-through
 */
export const StaggerItem: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

// ===== LIST =====

interface AnimatedListProps extends AnimatedProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- list items can be any renderable type
  items: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- list items can be any renderable type
  renderItem: (item: any, index: number) => ReactNode;
  staggerDelay?: number;
}

/**
 * Animated List — pass-through with mapping
 */
export const AnimatedList: React.FC<AnimatedListProps> = ({
  items,
  renderItem,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  staggerDelay = 0.1,
  className,
  ...props
}) => (
  <div className={className} {...props}>
    {items.map((item, index) => (
      <div key={index}>{renderItem(item, index)}</div>
    ))}
  </div>
);

// ===== CONDITIONAL =====

interface ConditionalAnimationProps extends AnimatedProps {
  show: boolean;
  animation?: 'fade' | 'slideUp' | 'slideDown' | 'scale';
}

/**
 * Conditional Animation — renders children when show is true
 */
export const ConditionalAnimation: React.FC<ConditionalAnimationProps> = ({
  show,
  children,
  ...props
}) => {
  if (!show) return null;
  return <div {...props}>{children}</div>;
};

// ===== PAGE TRANSITIONS =====

interface PageTransitionProps extends AnimatedProps {
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade';
}

/**
 * Page Transition Wrapper — pass-through
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  ...props
}) => (
  <div {...props}>{children}</div>
);

// ===== PRESENCE =====

interface PresenceAnimationProps extends AnimatedProps {
  isVisible: boolean;
}

/**
 * Presence Animation — renders children when visible
 */
export const PresenceAnimation: React.FC<PresenceAnimationProps> = ({
  isVisible,
  children,
  ...props
}) => {
  if (!isVisible) return null;
  return <div {...props}>{children}</div>;
};

// ===== SCROLL =====

interface ScrollAnimationProps extends AnimatedProps {
  threshold?: number;
}

/**
 * Scroll Animation — pass-through
 */
export const ScrollAnimation: React.FC<ScrollAnimationProps> = ({
  children,
  ...props
}) => (
  <div {...props}>{children}</div>
);

// ===== LOADING =====

/**
 * Pulse Loading — CSS animation only
 */
export const PulseLoader: React.FC<AnimatedProps> = ({ className, ...props }) => (
  <div className={`animate-pulse ${className || ''}`} {...props} />
);

/**
 * Spinner Loading — CSS animation only
 */
export const SpinLoader: React.FC<AnimatedProps> = ({ className, ...props }) => (
  <div className={`animate-spin ${className || ''}`} {...props} />
);

// ===== INTERACTION FEEDBACK =====

/**
 * Success Checkmark — pass-through
 */
export const SuccessCheckmark: React.FC<AnimatedProps> = ({ className, ...props }) => (
  <div className={className} {...props} />
);

/**
 * Error Shake — pass-through
 */
export const ErrorShake: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);
