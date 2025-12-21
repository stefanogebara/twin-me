import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PageTransitionProps {
  children: ReactNode;
  variant?: 'fade' | 'slide' | 'scale' | 'none';
  className?: string;
}

/**
 * PageTransition Component
 *
 * Wraps page content with smooth transition animations
 *
 * Variants:
 * - fade: Simple fade in/out
 * - slide: Slide from right to left
 * - scale: Scale up from center
 * - none: No animation (useful for special pages)
 *
 * Usage:
 * <PageTransition variant="fade">
 *   <YourPageContent />
 * </PageTransition>
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  variant = 'fade',
  className = ''
}) => {
  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2, ease: 'easeInOut' }
    },
    slide: {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
      transition: { duration: 0.3, ease: 'easeInOut' }
    },
    scale: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
      transition: { duration: 0.2, ease: 'easeInOut' }
    },
    none: {
      initial: {},
      animate: {},
      exit: {},
      transition: {}
    }
  };

  const selectedVariant = variants[variant];

  if (variant === 'none') {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={selectedVariant.initial}
      animate={selectedVariant.animate}
      exit={selectedVariant.exit}
      transition={selectedVariant.transition}
      className={className}
    >
      {children}
    </motion.div>
  );
};
