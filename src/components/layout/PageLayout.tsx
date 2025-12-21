/**
 * PageLayout Component
 *
 * Provides consistent page structure with Lorix minimal design
 * Includes optional title/subtitle header and content wrapper with glass morphism
 */

import React, { ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

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
      <div className={`mx-auto ${maxWidthClasses[maxWidth]} ${paddingClasses[padding]}`}>
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
      </div>
    </div>
  );
};

/**
 * GlassPanel Component
 *
 * Reusable glass morphism panel for consistent card styling
 */
export const GlassPanel: React.FC<{
  children: ReactNode;
  className?: string;
  hover?: boolean;
  variant?: 'default' | 'card' | 'shimmer' | 'liquid';
}> = ({ children, className = '', hover = false, variant = 'card' }) => {
  const { theme } = useTheme();

  const variantClasses = {
    default: 'glass',
    card: 'glass-card',
    shimmer: 'glass-card glass-shimmer',
    liquid: 'glass-card liquid-glass'
  };

  return (
    <div
      className={`${variantClasses[variant]} ${hover ? 'hover:scale-[1.02]' : ''} ${className} p-6`}
      style={{
        borderRadius: '20px'
      }}
    >
      {children}
    </div>
  );
};

export default PageLayout;
