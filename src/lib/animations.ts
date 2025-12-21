/**
 * Animation Utilities and Constants
 *
 * Centralized animation configuration for consistent micro-interactions
 * across the Twin AI Learn platform.
 */

import { Variants } from 'framer-motion';

// ===== ANIMATION CONSTANTS =====

/**
 * Standard timing values for transitions
 */
export const TIMING = {
  fast: 150,      // Quick feedback (hover states)
  base: 200,      // Standard transitions
  medium: 300,    // Smooth animations
  slow: 500,      // Deliberate animations
  verySlow: 800,  // Emphasis animations
} as const;

/**
 * Standard easing functions
 */
export const EASING = {
  // Standard easing
  default: [0.4, 0, 0.2, 1],           // cubic-bezier ease-in-out
  linear: [0, 0, 1, 1],                 // linear

  // Entrance animations
  easeOut: [0, 0, 0.2, 1],              // ease-out
  easeIn: [0.4, 0, 1, 1],               // ease-in

  // Smooth animations
  smooth: [0.45, 0, 0.55, 1],           // very smooth

  // Bouncy animations
  spring: [0.68, -0.55, 0.265, 1.55],   // spring-like bounce
  bounce: [0.175, 0.885, 0.32, 1.275],  // subtle bounce

  // Sharp animations
  sharp: [0.4, 0, 0.6, 1],              // sharp ease-in-out
} as const;

/**
 * Transform values for hover effects
 */
export const TRANSFORM = {
  // Lift effects
  liftSmall: -2,
  liftMedium: -4,
  liftLarge: -8,

  // Scale effects
  scaleDown: 0.98,
  scaleUp: 1.02,
  scaleUpLarge: 1.05,

  // Rotation
  rotate: 2,
  rotateLarge: 5,
} as const;

/**
 * Shadow values for elevation changes
 */
export const SHADOWS = {
  none: '0 0 0 0 rgba(0, 0, 0, 0)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
} as const;

// ===== FRAMER MOTION VARIANTS =====

/**
 * Fade in animation variant
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: TIMING.medium / 1000, ease: EASING.easeOut }
  },
  exit: {
    opacity: 0,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeIn }
  }
};

/**
 * Fade in with upward slide
 */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: TIMING.medium / 1000, ease: EASING.easeOut }
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeIn }
  }
};

/**
 * Fade in with downward slide
 */
export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: TIMING.medium / 1000, ease: EASING.easeOut }
  },
  exit: {
    opacity: 0,
    y: 20,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeIn }
  }
};

/**
 * Scale in animation
 */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: TIMING.medium / 1000, ease: EASING.easeOut }
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeIn }
  }
};

/**
 * Card lift on hover
 */
export const cardHover: Variants = {
  initial: { y: 0, boxShadow: SHADOWS.sm },
  hover: {
    y: TRANSFORM.liftMedium,
    boxShadow: SHADOWS.lg,
    transition: { duration: TIMING.base / 1000, ease: EASING.easeOut }
  }
};

/**
 * Button press effect
 */
export const buttonPress: Variants = {
  initial: { scale: 1 },
  tap: {
    scale: TRANSFORM.scaleDown,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeOut }
  },
  hover: {
    scale: TRANSFORM.scaleUp,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeOut }
  }
};

/**
 * Icon bounce on hover
 */
export const iconBounce: Variants = {
  initial: { y: 0 },
  hover: {
    y: [0, -4, 0],
    transition: {
      duration: TIMING.medium / 1000,
      ease: EASING.bounce,
      repeat: 0
    }
  }
};

/**
 * Ripple effect (for buttons)
 */
export const ripple: Variants = {
  initial: { scale: 0, opacity: 1 },
  animate: {
    scale: 4,
    opacity: 0,
    transition: { duration: TIMING.slow / 1000, ease: EASING.easeOut }
  }
};

/**
 * Skeleton shimmer animation
 */
export const shimmer: Variants = {
  initial: { x: '-100%' },
  animate: {
    x: '100%',
    transition: {
      duration: TIMING.verySlow / 1000 * 2,
      ease: EASING.linear,
      repeat: Infinity,
      repeatDelay: 0.5
    }
  }
};

/**
 * Stagger children animation
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

/**
 * Success checkmark animation
 */
export const successCheckmark: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: {
      duration: TIMING.medium / 1000,
      ease: EASING.easeOut
    }
  }
};

/**
 * Error shake animation
 */
export const errorShake: Variants = {
  initial: { x: 0 },
  animate: {
    x: [0, -10, 10, -10, 10, 0],
    transition: {
      duration: TIMING.medium / 1000,
      ease: EASING.default
    }
  }
};

/**
 * Loading spinner rotation
 */
export const spinnerRotate: Variants = {
  initial: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      ease: EASING.linear,
      repeat: Infinity
    }
  }
};

/**
 * Pulse animation (for loading states)
 */
export const pulse: Variants = {
  initial: { opacity: 1 },
  animate: {
    opacity: [1, 0.5, 1],
    transition: {
      duration: TIMING.verySlow / 1000 * 2,
      ease: EASING.smooth,
      repeat: Infinity
    }
  }
};

/**
 * Slide from left
 */
export const slideInLeft: Variants = {
  initial: { x: -50, opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: TIMING.medium / 1000, ease: EASING.easeOut }
  },
  exit: {
    x: -50,
    opacity: 0,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeIn }
  }
};

/**
 * Slide from right
 */
export const slideInRight: Variants = {
  initial: { x: 50, opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: TIMING.medium / 1000, ease: EASING.easeOut }
  },
  exit: {
    x: 50,
    opacity: 0,
    transition: { duration: TIMING.fast / 1000, ease: EASING.easeIn }
  }
};

/**
 * Badge scale on hover
 */
export const badgeHover: Variants = {
  initial: { scale: 1 },
  hover: {
    scale: 1.05,
    transition: { duration: TIMING.fast / 1000, ease: EASING.spring }
  }
};

/**
 * Tab slide indicator
 */
export const tabIndicator: Variants = {
  initial: { scaleX: 0 },
  animate: {
    scaleX: 1,
    transition: { duration: TIMING.base / 1000, ease: EASING.easeOut }
  }
};

// ===== UTILITY FUNCTIONS =====

/**
 * Create a spring animation configuration
 */
export const spring = (stiffness = 300, damping = 30, mass = 1) => ({
  type: 'spring',
  stiffness,
  damping,
  mass
});

/**
 * Create a custom transition
 */
export const transition = (
  duration: number,
  easing: number[] = EASING.default,
  delay = 0
) => ({
  duration: duration / 1000,
  ease: easing,
  delay: delay / 1000
});

/**
 * Reduced motion utility
 * Respects user's prefers-reduced-motion setting
 */
export const respectReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get safe animation config that respects reduced motion preferences
 */
export const safeAnimation = (variants: Variants): Variants => {
  if (respectReducedMotion()) {
    return {
      initial: variants.animate,
      animate: variants.animate,
      exit: variants.animate
    };
  }
  return variants;
};
