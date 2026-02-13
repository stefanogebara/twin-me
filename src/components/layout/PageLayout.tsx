/**
 * PageLayout Component
 *
 * Provides consistent page structure with Lorix minimal design
 * Includes optional title/subtitle header and content wrapper with glass morphism
 */

import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
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
  const { theme } = useTheme();

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
    sm: 'p-4 lg:p-6',
    md: 'p-5 lg:p-7',
    lg: 'p-6 lg:p-8'
  };

  return (
    <div
      className={`min-h-screen ${className}`}
      style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA'
      }}
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
          <div className="mb-8">
            {title && (
              <h1
                className="text-3xl mb-2"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                className="text-[15px]"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
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
 * Reusable glass morphism panel with Framer Motion hover and entrance animations
 */
export const GlassPanel: React.FC<{
  children: ReactNode;
  className?: string;
  hover?: boolean;
  variant?: 'default' | 'card' | 'shimmer' | 'liquid';
  onClick?: () => void;
  delay?: number;
}> = ({ children, className = '', hover = false, variant = 'card', onClick, delay = 0 }) => {
  const { theme } = useTheme();

  const variantClasses = {
    default: 'glass',
    card: 'glass-card',
    shimmer: 'glass-card glass-shimmer',
    liquid: 'glass-card liquid-glass'
  };

  return (
    <motion.div
      className={`${variantClasses[variant]} ${className} p-6`}
      style={{ borderRadius: '20px' }}
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
        boxShadow: theme === 'dark'
          ? '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 20px rgba(212, 168, 83, 0.06)'
          : '0 20px 60px rgba(12, 10, 9, 0.12), 0 0 20px rgba(212, 168, 83, 0.08)',
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
