import { useState, useEffect } from 'react';

interface LoadingScreenProps {
  message?: string;
  submessage?: string;
  progress?: number;
  className?: string;
}

const LoadingScreen = ({
  message = "Loading your digital twin...",
  submessage = "This may take a few moments",
  progress,
  className = ""
}: LoadingScreenProps) => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`min-h-screen flex items-center justify-center ${className}`} style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      <div className="text-center max-w-md mx-auto px-6">
        {/* Simple animated loading icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 mx-auto relative">
            <div className="absolute inset-0 rounded-full border-4" style={{ borderColor: 'var(--_color-theme---border)' }}></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin" style={{ borderTopColor: 'var(--_color-theme---accent)' }}></div>

            {/* Center dot */}
            <div className="absolute inset-6 rounded-full animate-pulse flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
              <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
            </div>
          </div>
        </div>

        {/* Loading text */}
        <div className="space-y-3">
          <h2 className="text-2xl font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
            {message}{dots}
          </h2>
          <p className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
            {submessage}
          </p>
        </div>

        {/* Progress bar (if provided) */}
        {progress !== undefined && (
          <div className="mt-6">
            <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                  backgroundColor: 'var(--_color-theme---accent)'
                }}
              ></div>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--_color-theme---text-secondary)' }}>
              {Math.round(progress)}% complete
            </p>
          </div>
        )}

        {/* Subtle hint text */}
        <div className="mt-8 text-xs" style={{ color: 'var(--_color-theme---text-secondary)', opacity: 0.7 }}>
          <p>Building your personalized AI experience</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes gentlePulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.8;
          }
        }

        @keyframes floatUp {
          0% {
            transform: translateY(0px);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(-20px);
            opacity: 0;
          }
        }
        `
      }} />
    </div>
  );
};

export default LoadingScreen;