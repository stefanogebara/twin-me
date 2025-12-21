/**
 * Animated Wrapper Components
 *
 * Pre-configured Framer Motion wrapper components for common animations
 * throughout the Twin AI Learn platform.
 */

import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';
import {
  fadeIn,
  fadeInUp,
  fadeInDown,
  scaleIn,
  cardHover,
  buttonPress,
  iconBounce,
  slideInLeft,
  slideInRight,
  staggerContainer,
  safeAnimation,
  respectReducedMotion,
} from '@/lib/animations';

// ===== BASE ANIMATED COMPONENTS =====

interface AnimatedProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: ReactNode;
}

/**
 * Fade In Animation
 */
export const FadeIn: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div
    variants={safeAnimation(fadeIn)}
    initial="initial"
    animate="animate"
    exit="exit"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Fade In with Upward Slide
 */
export const FadeInUp: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div
    variants={safeAnimation(fadeInUp)}
    initial="initial"
    animate="animate"
    exit="exit"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Fade In with Downward Slide
 */
export const FadeInDown: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div
    variants={safeAnimation(fadeInDown)}
    initial="initial"
    animate="animate"
    exit="exit"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Scale In Animation
 */
export const ScaleIn: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div
    variants={safeAnimation(scaleIn)}
    initial="initial"
    animate="animate"
    exit="exit"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Slide In from Left
 */
export const SlideInLeft: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div
    variants={safeAnimation(slideInLeft)}
    initial="initial"
    animate="animate"
    exit="exit"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Slide In from Right
 */
export const SlideInRight: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div
    variants={safeAnimation(slideInRight)}
    initial="initial"
    animate="animate"
    exit="exit"
    {...props}
  >
    {children}
  </motion.div>
);

// ===== HOVER ANIMATED COMPONENTS =====

/**
 * Animated Card with Hover Lift
 */
export const AnimatedCard: React.FC<AnimatedProps> = ({ children, className, ...props }) => (
  <motion.div
    className={className}
    variants={respectReducedMotion() ? undefined : cardHover}
    initial="initial"
    whileHover="hover"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Animated Button with Press Effect
 */
export const AnimatedButton: React.FC<AnimatedProps> = ({ children, className, ...props }) => (
  <motion.div
    className={className}
    variants={respectReducedMotion() ? undefined : buttonPress}
    initial="initial"
    whileHover="hover"
    whileTap="tap"
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * Animated Icon with Bounce Effect
 */
export const AnimatedIcon: React.FC<AnimatedProps> = ({ children, className, ...props }) => (
  <motion.div
    className={className}
    variants={respectReducedMotion() ? undefined : iconBounce}
    initial="initial"
    whileHover="hover"
    {...props}
  >
    {children}
  </motion.div>
);

// ===== STAGGER ANIMATION =====

interface StaggerContainerProps extends AnimatedProps {
  staggerDelay?: number;
}

/**
 * Stagger Container
 * Children will animate in sequence
 */
export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  staggerDelay = 0.1,
  ...props
}) => {
  const staggerVariants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: staggerDelay,
      },
    },
  };

  return (
    <motion.div
      variants={respectReducedMotion() ? undefined : staggerVariants}
      initial="initial"
      animate="animate"
      {...props}
    >
      {children}
    </motion.div>
  );
};

/**
 * Stagger Item
 * Use as child of StaggerContainer
 */
export const StaggerItem: React.FC<AnimatedProps> = ({ children, ...props }) => (
  <motion.div variants={safeAnimation(fadeInUp)} {...props}>
    {children}
  </motion.div>
);

// ===== LIST ANIMATIONS =====

interface AnimatedListProps extends AnimatedProps {
  items: any[];
  renderItem: (item: any, index: number) => ReactNode;
  staggerDelay?: number;
}

/**
 * Animated List
 * Automatically staggers list items
 */
export const AnimatedList: React.FC<AnimatedListProps> = ({
  items,
  renderItem,
  staggerDelay = 0.1,
  className,
  ...props
}) => (
  <StaggerContainer className={className} staggerDelay={staggerDelay} {...props}>
    {items.map((item, index) => (
      <StaggerItem key={index}>{renderItem(item, index)}</StaggerItem>
    ))}
  </StaggerContainer>
);

// ===== CONDITIONAL ANIMATIONS =====

interface ConditionalAnimationProps extends AnimatedProps {
  show: boolean;
  animation?: 'fade' | 'slideUp' | 'slideDown' | 'scale';
}

/**
 * Conditional Animation
 * Show/hide content with animation
 */
export const ConditionalAnimation: React.FC<ConditionalAnimationProps> = ({
  show,
  animation = 'fade',
  children,
  ...props
}) => {
  const animationVariants = {
    fade: fadeIn,
    slideUp: fadeInUp,
    slideDown: fadeInDown,
    scale: scaleIn,
  };

  return (
    <motion.div
      variants={safeAnimation(animationVariants[animation])}
      initial="initial"
      animate={show ? 'animate' : 'exit'}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// ===== PAGE TRANSITIONS =====

interface PageTransitionProps extends AnimatedProps {
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade';
}

/**
 * Page Transition Wrapper
 * Use for page-level route transitions
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  direction = 'up',
  children,
  ...props
}) => {
  const directionVariants = {
    up: fadeInUp,
    down: fadeInDown,
    left: slideInLeft,
    right: slideInRight,
    fade: fadeIn,
  };

  return (
    <motion.div
      variants={safeAnimation(directionVariants[direction])}
      initial="initial"
      animate="animate"
      exit="exit"
      {...props}
    >
      {children}
    </motion.div>
  );
};

// ===== PRESENCE ANIMATION =====

interface PresenceAnimationProps extends AnimatedProps {
  isVisible: boolean;
}

/**
 * Presence Animation
 * Handles mount/unmount animations
 */
export const PresenceAnimation: React.FC<PresenceAnimationProps> = ({
  isVisible,
  children,
  ...props
}) => {
  if (!isVisible) return null;

  return (
    <motion.div
      variants={safeAnimation(fadeIn)}
      initial="initial"
      animate="animate"
      exit="exit"
      {...props}
    >
      {children}
    </motion.div>
  );
};

// ===== SCROLL ANIMATION =====

interface ScrollAnimationProps extends AnimatedProps {
  threshold?: number;
}

/**
 * Scroll Animation
 * Triggers when element comes into view
 */
export const ScrollAnimation: React.FC<ScrollAnimationProps> = ({
  threshold = 0.1,
  children,
  ...props
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: threshold }}
    transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
    {...props}
  >
    {children}
  </motion.div>
);

// ===== LOADING ANIMATIONS =====

/**
 * Pulse Loading Animation
 */
export const PulseLoader: React.FC<AnimatedProps> = ({ className, ...props }) => (
  <motion.div
    className={className}
    animate={{
      opacity: [1, 0.5, 1],
    }}
    transition={{
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    }}
    {...props}
  />
);

/**
 * Spinner Loading Animation
 */
export const SpinLoader: React.FC<AnimatedProps> = ({ className, ...props }) => (
  <motion.div
    className={className}
    animate={{
      rotate: 360,
    }}
    transition={{
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    }}
    {...props}
  />
);

// ===== INTERACTION FEEDBACK =====

/**
 * Success Checkmark Animation
 */
export const SuccessCheckmark: React.FC<AnimatedProps> = ({ className, ...props }) => (
  <motion.div
    className={className}
    initial={{ scale: 0 }}
    animate={{ scale: [0, 1.2, 1] }}
    transition={{
      duration: 0.5,
      times: [0, 0.5, 1],
      ease: [0.68, -0.55, 0.265, 1.55],
    }}
    {...props}
  />
);

/**
 * Error Shake Animation
 */
export const ErrorShake: React.FC<AnimatedProps> = ({ children, trigger, ...props }) => (
  <motion.div
    animate={
      trigger
        ? {
            x: [0, -10, 10, -10, 10, 0],
          }
        : {}
    }
    transition={{ duration: 0.3 }}
    {...props}
  >
    {children}
  </motion.div>
);
