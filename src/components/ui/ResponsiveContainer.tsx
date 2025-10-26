import React, { ReactNode } from 'react';

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  className = '',
  maxWidth = '2xl',
  padding = 'md'
}) => {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full'
  };

  const paddingClasses = {
    none: '',
    sm: 'px-4 py-2',
    md: 'px-6 py-4',
    lg: 'px-8 py-6',
    xl: 'px-12 py-8'
  };

  return (
    <div className={`mx-auto w-full ${maxWidthClasses[maxWidth]} ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
};

interface ResponsiveGridProps {
  children: ReactNode;
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns = { sm: 1, md: 2, lg: 3, xl: 4 },
  gap = 'md',
  className = ''
}) => {
  const getGridClasses = () => {
    const { sm = 1, md = 2, lg = 3, xl = 4 } = columns;
    return `grid grid-cols-${sm} md:grid-cols-${md} lg:grid-cols-${lg} xl:grid-cols-${xl}`;
  };

  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8'
  };

  return (
    <div className={`${getGridClasses()} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
};

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  children
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Menu */}
      <div className="fixed top-0 right-0 h-full w-64 bg-card shadow-lg z-50 transform transition-transform duration-300 ease-in-out md:hidden">
        <div className="p-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-md hover:bg-muted"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="mt-8">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  padding = 'md'
}) => {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  };

  const hoverClasses = hover
    ? 'hover:shadow-lg hover:scale-[1.02] transition-all duration-200'
    : '';

  return (
    <div className={`bg-white rounded-lg shadow-md border border-gray-200 ${paddingClasses[padding]} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
};