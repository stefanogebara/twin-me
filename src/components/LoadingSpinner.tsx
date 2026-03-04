import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'brain' | 'upload' | 'chat';
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  text,
  fullScreen = false,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const getIcon = () => {
    const baseClasses = `${sizeClasses[size]} animate-spin`;
    const clay3dSize = size === 'sm' ? 16 : size === 'md' ? 24 : size === 'lg' ? 32 : 48;

    switch (variant) {
      case 'brain':
        return <img src="/icons/3d/brain.png" alt="Loading" className="animate-pulse" style={{ width: clay3dSize, height: clay3dSize }} />;
      case 'upload':
        return <img src="/icons/3d/rocket.png" alt="Uploading" className="animate-bounce" style={{ width: clay3dSize, height: clay3dSize }} />;
      case 'chat':
        return <img src="/icons/3d/chat-bubble.png" alt="Loading chat" className="animate-pulse" style={{ width: clay3dSize, height: clay3dSize }} />;
      default:
        return <Loader2 className={baseClasses} style={{ color: 'var(--foreground)' }} />;
    }
  };

  const content = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {getIcon()}
      {text && (
        <p
          className={`mt-3 ${
            size === 'sm' ? 'text-sm' :
            size === 'lg' || size === 'xl' ? 'text-lg' :
            'text-base'
          }`}
          style={{ color: 'var(--text-secondary)' }}
        >
          {text}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ backgroundColor: 'rgba(28, 25, 23, 0.90)', backdropFilter: 'blur(4px)' }}
      >
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
            border: '1px solid var(--glass-surface-border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export const LoadingPage: React.FC<{ text?: string }> = ({ text = "Loading..." }) => (
  <div
    className="min-h-screen flex items-center justify-center"
    style={{ backgroundColor: 'var(--background)' }}
  >
    <LoadingSpinner size="xl" text={text} className="p-8" />
  </div>
);

export const LoadingCard: React.FC<{ text?: string; className?: string }> = ({
  text = "Loading...",
  className = ""
}) => (
  <div
    className={`rounded-2xl p-8 ${className}`}
    style={{
      background: 'var(--glass-surface-bg)',
      backdropFilter: 'blur(10px) saturate(140%)',
      WebkitBackdropFilter: 'blur(10px) saturate(140%)',
      border: '1px solid var(--glass-surface-border)',
    }}
  >
    <LoadingSpinner size="lg" text={text} />
  </div>
);

export const LoadingButton: React.FC<{ text?: string; size?: 'sm' | 'md' | 'lg' }> = ({
  text = "Loading...",
  size = 'sm'
}) => (
  <div className="flex items-center gap-2">
    <LoadingSpinner size={size} />
    <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
  </div>
);

export const LoadingOverlay: React.FC<{ text?: string; variant?: 'default' | 'brain' | 'upload' | 'chat' }> = ({
  text = "Processing...",
  variant = 'default'
}) => (
  <div
    className="absolute inset-0 flex items-center justify-center rounded-lg z-10"
    style={{
      backgroundColor: 'rgba(28, 25, 23, 0.90)',
      backdropFilter: 'blur(4px)',
    }}
  >
    <LoadingSpinner size="lg" variant={variant} text={text} />
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div
    className={`rounded-2xl p-4 ${className}`}
    style={{
      background: 'var(--glass-surface-bg)',
      border: '1px solid var(--glass-surface-border)',
    }}
  >
    <div className="animate-pulse">
      <div
        className="h-4 rounded mb-3 glass-shimmer"
        style={{ backgroundColor: 'var(--glass-surface-bg)' }}
      />
      <div
        className="h-3 rounded mb-2 glass-shimmer"
        style={{ backgroundColor: 'var(--glass-surface-bg)' }}
      />
      <div
        className="h-3 rounded w-3/4 glass-shimmer"
        style={{ backgroundColor: 'var(--glass-surface-bg)' }}
      />
    </div>
  </div>
);

export const SkeletonList: React.FC<{ items?: number; className?: string }> = ({
  items = 3,
  className = ""
}) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: items }).map((_, index) => (
      <SkeletonCard key={index} />
    ))}
  </div>
);

export const SkeletonTwin: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div
    className={`rounded-2xl p-6 ${className}`}
    style={{
      background: 'var(--glass-surface-bg)',
      border: '1px solid var(--glass-surface-border)',
    }}
  >
    <div className="animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div
          className="w-12 h-12 rounded-full glass-shimmer"
          style={{ backgroundColor: 'var(--glass-surface-bg)' }}
        />
        <div className="flex-1">
          <div
            className="h-5 rounded mb-2 glass-shimmer"
            style={{ backgroundColor: 'var(--glass-surface-bg)' }}
          />
          <div
            className="h-3 rounded w-2/3 glass-shimmer"
            style={{ backgroundColor: 'var(--glass-surface-bg)' }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div
          className="h-3 rounded glass-shimmer"
          style={{ backgroundColor: 'var(--glass-surface-bg)' }}
        />
        <div
          className="h-3 rounded w-4/5 glass-shimmer"
          style={{ backgroundColor: 'var(--glass-surface-bg)' }}
        />
        <div
          className="h-3 rounded w-3/5 glass-shimmer"
          style={{ backgroundColor: 'var(--glass-surface-bg)' }}
        />
      </div>
    </div>
  </div>
);

export default LoadingSpinner;
