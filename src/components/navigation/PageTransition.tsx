import React, { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  variant?: 'fade' | 'slide' | 'scale' | 'none';
  className?: string;
}

/**
 * PageTransition Component
 *
 * Wraps page content. Animations removed in typography-driven design.
 * Kept as a passthrough wrapper for API compatibility.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  className = ''
}) => {
  return <div className={className}>{children}</div>;
};
