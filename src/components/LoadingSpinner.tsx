import React from 'react';
import { Loader2, Brain, Upload, MessageSquare } from 'lucide-react';

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
    const baseClasses = `${sizeClasses[size]} animate-spin text-[#FF5722]`;

    switch (variant) {
      case 'brain':
        return <Brain className={baseClasses} />;
      case 'upload':
        return <Upload className={baseClasses} />;
      case 'chat':
        return <MessageSquare className={baseClasses} />;
      default:
        return <Loader2 className={baseClasses} />;
    }
  };

  const content = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {getIcon()}
      {text && (
        <p className={`text-[#6B7280] mt-3 ${
          size === 'sm' ? 'text-sm' :
          size === 'lg' || size === 'xl' ? 'text-lg' :
          'text-base'
        }`}>
          {text}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-[#FBF7F0] bg-opacity-90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

// Specific loading components for common use cases
export const LoadingPage: React.FC<{ text?: string }> = ({ text = "Loading..." }) => (
  <div className="min-h-screen bg-[#FBF7F0] flex items-center justify-center">
    <LoadingSpinner size="xl" text={text} className="p-8" />
  </div>
);

export const LoadingCard: React.FC<{ text?: string; className?: string }> = ({
  text = "Loading...",
  className = ""
}) => (
  <div className={`bg-white border border-[#E5E7EB] rounded-lg p-8 ${className}`}>
    <LoadingSpinner size="lg" text={text} />
  </div>
);

export const LoadingButton: React.FC<{ text?: string; size?: 'sm' | 'md' | 'lg' }> = ({
  text = "Loading...",
  size = 'sm'
}) => (
  <div className="flex items-center gap-2">
    <LoadingSpinner size={size} />
    <span className="text-[#6B7280]">{text}</span>
  </div>
);

export const LoadingOverlay: React.FC<{ text?: string; variant?: 'default' | 'brain' | 'upload' | 'chat' }> = ({
  text = "Processing...",
  variant = 'default'
}) => (
  <div className="absolute inset-0 bg-white bg-opacity-90 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
    <LoadingSpinner size="lg" variant={variant} text={text} />
  </div>
);

// Skeleton loaders for specific content types
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`bg-white border border-[#E5E7EB] rounded-lg p-4 ${className}`}>
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded mb-3"></div>
      <div className="h-3 bg-gray-200 rounded mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-3/4"></div>
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
  <div className={`bg-white border border-[#E5E7EB] rounded-xl p-6 ${className}`}>
    <div className="animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-200 rounded"></div>
        <div className="h-3 bg-gray-200 rounded w-4/5"></div>
        <div className="h-3 bg-gray-200 rounded w-3/5"></div>
      </div>
    </div>
  </div>
);

export default LoadingSpinner;