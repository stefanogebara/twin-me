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
    <div className={`min-h-screen flex items-center justify-center ${className}`} style={{ backgroundColor: 'var(--background)' }}>
      <div className="text-center max-w-md mx-auto px-6">
        {/* TwinMe Logo + Animated loading */}
        <div className="relative mb-8">
          <div className="w-28 h-28 mx-auto relative">
            {/* Spinning ring */}
            <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin" style={{ borderTopColor: 'var(--accent)', borderRightColor: 'rgba(var(--accent-rgb, 99, 102, 241), 0.2)' }}></div>

            {/* Diamond logo in center */}
            <div className="absolute inset-2 flex items-center justify-center">
              <img
                src="/icons/3d/diamond.png"
                alt="Twin Me"
                className="w-16 h-16 object-contain animate-pulse drop-shadow-lg"
              />
            </div>
          </div>
        </div>

        {/* Brand + Loading text */}
        <div className="space-y-3">
          <h1
            className="text-3xl"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              color: 'var(--foreground)'
            }}
          >
            Twin Me
          </h1>
          <h2 className="text-lg font-medium" style={{ color: 'var(--foreground)', opacity: 0.8 }}>
            {message}{dots}
          </h2>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {submessage}
          </p>
        </div>

        {/* Progress bar (if provided) */}
        {progress !== undefined && (
          <div className="mt-6">
            <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'var(--muted)' }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                  backgroundColor: 'var(--accent)'
                }}
              ></div>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
              {Math.round(progress)}% complete
            </p>
          </div>
        )}

        {/* Subtle hint text */}
        <div className="mt-8 text-xs" style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>
          <p>Discover your authentic soul signature</p>
        </div>
      </div>

    </div>
  );
};

export default LoadingScreen;