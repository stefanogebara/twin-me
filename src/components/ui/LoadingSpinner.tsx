import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const colorMap = {
    primary: '#000000',
    secondary: '#8A857D',
    white: '#fcf6ef'
  };

  return (
    <div
      className={`inline-block animate-spin ${sizeClasses[size]} ${className}`}
      style={{ color: colorMap[color] }}
    >
      <svg
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

interface LoadingButtonProps {
  isLoading: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  children,
  onClick,
  disabled = false,
  className = '',
  loadingText = 'Loading...',
  variant = 'primary',
  size = 'md'
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'btn-cta-app',
    secondary: 'btn-glass-app',
    outline: 'btn-glass-app'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-6 py-2.5 text-base gap-2',
    lg: 'px-8 py-3 text-lg gap-2.5'
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {isLoading && (
        <LoadingSpinner
          size={size === 'sm' ? 'sm' : 'md'}
          color={variant === 'primary' ? 'white' : 'secondary'}
        />
      )}
      <span>{isLoading ? loadingText : children}</span>
    </button>
  );
};

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = 'Loading...',
  className = ''
}) => {
  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${className}`}
      style={{ backgroundColor: 'rgba(252, 246, 239, 0.85)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="rounded-2xl p-6 flex flex-col items-center gap-4 max-w-sm mx-4"
        style={{
          background: 'rgba(255, 255, 255, 0.18)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          border: '1px solid rgba(255, 255, 255, 0.45)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
        }}
      >
        <LoadingSpinner size="lg" />
        <p style={{ color: '#8A857D' }} className="text-center text-sm">{message}</p>
      </div>
    </div>
  );
};

interface SkeletonProps {
  className?: string;
  lines?: number;
  avatar?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  lines = 1,
  avatar = false
}) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {avatar && (
        <div
          className="w-10 h-10 rounded-full mb-2 glass-shimmer"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.18)' }}
        />
      )}
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`glass-shimmer rounded h-4 ${
            i === lines - 1 ? 'w-3/4' : 'w-full'
          } ${i > 0 ? 'mt-2' : ''}`}
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.18)' }}
        />
      ))}
    </div>
  );
};
