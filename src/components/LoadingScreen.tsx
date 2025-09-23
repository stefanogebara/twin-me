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
    <div className={`min-h-screen bg-[#FBF7F0] flex items-center justify-center ${className}`}>
      <div className="text-center max-w-md mx-auto px-6">
        {/* Beautiful animated icon */}
        <div className="relative mb-8">
          {/* Outer rotating ring */}
          <div className="w-24 h-24 mx-auto relative">
            <div className="absolute inset-0 rounded-full border-4 border-[#FF5722]/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#FF5722] animate-spin"></div>

            {/* Inner pulsing dot */}
            <div className="absolute inset-6 bg-[#FF5722] rounded-full animate-pulse flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
            </div>
          </div>

          {/* Floating particles */}
          <div className="absolute -inset-8 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-2 h-2 bg-[#FF5722]/30 rounded-full animate-ping" style={{ animationDelay: '0s' }}></div>
            <div className="absolute top-1/4 right-0 w-1.5 h-1.5 bg-[#4A90E2]/30 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
            <div className="absolute bottom-1/4 left-0 w-1 h-1 bg-[#FF5722]/30 rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
            <div className="absolute bottom-0 right-1/4 w-2 h-2 bg-[#4A90E2]/30 rounded-full animate-ping" style={{ animationDelay: '1.5s' }}></div>
          </div>
        </div>

        {/* Loading text */}
        <div className="space-y-3">
          <h2 className="font-playfair text-2xl italic text-[#1A1A4B] font-normal">
            {message}{dots}
          </h2>
          <p className="text-[#6B7280] text-sm">
            {submessage}
          </p>
        </div>

        {/* Progress bar (if provided) */}
        {progress !== undefined && (
          <div className="mt-6">
            <div className="w-full bg-[#E5E7EB] rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF5722] to-[#FF9800] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              ></div>
            </div>
            <p className="text-xs text-[#6B7280] mt-2">
              {Math.round(progress)}% complete
            </p>
          </div>
        )}

        {/* Subtle hint text */}
        <div className="mt-8 text-xs text-[#6B7280]/70">
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