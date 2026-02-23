/**
 * PageLayout Component
 *
 * Provides consistent page structure with the TwinMe landing page design.
 * Cream background (#fcf6ef), Halant headings, liquid glass cards.
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
    lg: 'p-8 lg:p-10'
  };

  return (
    <div
      className={`min-h-screen ${className}`}
      style={{ backgroundColor: '#fcf6ef' }}
    >
      {/* Token Expiry Banner - shows when tokens are expiring */}
      <TokenExpiryBanner />

      <motion.div
        className={`mx-auto ${maxWidthClasses[maxWidth]} ${paddingClasses[padding]}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Page Header */}
        {(title || subtitle) && (
          <div className="mb-10">
            {title && (
              <h1
                className="heading-serif mb-3"
                style={{
                  fontSize: '36px',
                  color: '#000000',
                  letterSpacing: '-0.04em',
                  lineHeight: 1.1
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                className="text-[14px] font-medium"
                style={{
                  fontFamily: "'Geist', sans-serif",
                  color: '#8A857D',
                  lineHeight: 1.65
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
        y: -4,
        scale: 1.01,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
      } : undefined}
      whileTap={onClick ? { scale: 0.985, transition: { duration: 0.1 } } : undefined}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
};

export default PageLayout;
