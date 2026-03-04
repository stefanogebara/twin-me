/**
 * PageLayout Component
 *
 * Provides consistent page structure with the TwinMe landing page design.
 * Dark background (#1C1917), Halant headings, liquid glass cards.
 * Light mode only — matches Index.tsx design language.
 */

import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TokenExpiryBanner } from '@/components/TokenExpiryBanner';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  title,
  subtitle,
  className = '',
  maxWidth = 'full',
  padding = 'lg'
}) => {
  const maxWidthClasses = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    '2xl': 'max-w-[1400px]',
    full: 'max-w-full'
  };

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-5 lg:p-7',
    md: 'p-6 lg:p-8',
    lg: 'px-8 py-12 lg:px-10 lg:py-14'
  };

  return (
    <div
      className={`min-h-screen ${className}`}
    >
      {/* Token Expiry Banner - shows when tokens are expiring */}
      <TokenExpiryBanner />

      <motion.div
        className={`mx-auto ${maxWidthClasses[maxWidth]} ${paddingClasses[padding]}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Page Header — hero-scale typography */}
        {(title || subtitle) && (
          <div className="mb-14">
            {title && (
              <h1
                className="heading-serif mb-4"
                style={{
                  fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
                  color: 'var(--foreground)',
                  letterSpacing: '-0.05em',
                  lineHeight: 1.1
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                className="text-[15px] font-medium"
                style={{
                  fontFamily: "'Geist', sans-serif",
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                  maxWidth: '540px'
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Page Content */}
        {children}
      </motion.div>
    </div>
  );
};

/**
 * GlassPanel Component
 *
 * Reusable liquid glass panel with Framer Motion hover and entrance animations.
 * Matches the landing page glass card spec.
 */
export const GlassPanel: React.FC<{
  children: ReactNode;
  className?: string;
  hover?: boolean;
  variant?: 'default' | 'card' | 'shimmer' | 'liquid';
  onClick?: () => void;
  delay?: number;
}> = ({ children, className = '', hover = false, variant = 'card', onClick, delay = 0 }) => {
  const variantClasses = {
    default: 'glass',
    card: 'glass-card',
    shimmer: 'glass-card glass-shimmer',
    liquid: 'glass-card liquid-glass'
  };

  return (
    <motion.div
      className={`${variantClasses[variant]} ${className} p-8`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay,
        ease: [0.4, 0, 0.2, 1]
      }}
      whileHover={hover || onClick ? {
        y: -2,
        scale: 1.005,
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(255, 255, 255, 0.08)',
        transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
      } : undefined}
      whileTap={onClick ? { scale: 0.985, transition: { duration: 0.1 } } : undefined}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
};

export default PageLayout;
