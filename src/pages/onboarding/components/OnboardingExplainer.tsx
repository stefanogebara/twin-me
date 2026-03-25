import React, { useState, useCallback } from 'react';
import { ArrowRight, Lock, Eye, Trash2 } from 'lucide-react';

interface OnboardingExplainerProps {
  onComplete: () => void;
  onSignIn: () => void;
}

const TOTAL_SCREENS = 3;

const SCREEN_1_PLATFORMS = [
  { label: 'Spotify', color: '#1DB954', path: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z' },
  { label: 'YouTube', color: '#FF0000', path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
  { label: 'Calendar', color: '#4285F4', path: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z' },
];

const OnboardingExplainer: React.FC<OnboardingExplainerProps> = ({ onComplete, onSignIn }) => {
  const [currentScreen, setCurrentScreen] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToScreen = useCallback((index: number) => {
    if (index === currentScreen || isTransitioning) return;
    setDirection(index > currentScreen ? 'right' : 'left');
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentScreen(index);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 200);
  }, [currentScreen, isTransitioning]);

  const handleNext = useCallback(() => {
    if (currentScreen < TOTAL_SCREENS - 1) {
      goToScreen(currentScreen + 1);
    } else {
      onComplete();
    }
  }, [currentScreen, goToScreen, onComplete]);

  const screenOpacity = isTransitioning ? 0 : 1;
  const screenTranslateX = isTransitioning
    ? (direction === 'right' ? -20 : 20)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#0A0A0A' }}>
      {/* Skip button */}
      <div className="flex justify-end px-6 pt-5 pb-2">
        <button
          onClick={onComplete}
          className="text-sm tracking-wide uppercase transition-opacity hover:opacity-80"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'rgba(245,245,244,0.4)',
            letterSpacing: '0.1em',
          }}
        >
          Skip
        </button>
      </div>

      {/* Screen content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
        <div
          className="w-full max-w-md flex flex-col items-center text-center"
          style={{
            opacity: screenOpacity,
            transform: `translateX(${screenTranslateX}px)`,
            transition: 'opacity 200ms ease, transform 200ms ease',
          }}
        >
          {currentScreen === 0 && <Screen1 />}
          {currentScreen === 1 && <Screen2 />}
          {currentScreen === 2 && <Screen3 onSignIn={onSignIn} />}
        </div>
      </div>

      {/* Bottom: dots + next button */}
      <div className="flex flex-col items-center gap-6 px-6 pb-10">
        {/* Pagination dots */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_SCREENS }).map((_, i) => (
            <button
              key={i}
              onClick={() => goToScreen(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === currentScreen ? 24 : 8,
                height: 8,
                backgroundColor: i === currentScreen
                  ? '#F5F5F4'
                  : 'rgba(245,245,244,0.2)',
              }}
              aria-label={`Go to screen ${i + 1}`}
            />
          ))}
        </div>

        {/* Next / Get Started button */}
        <button
          onClick={handleNext}
          className="flex items-center justify-center gap-2 rounded-full px-8 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#0C0C0C',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '15px',
            minWidth: 180,
          }}
        >
          {currentScreen === TOTAL_SCREENS - 1 ? 'Get Started' : 'Next'}
          <ArrowRight size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

/* ============================
   Screen 1 — What is TwinMe?
   ============================ */

const Screen1: React.FC = () => (
  <div className="flex flex-col items-center gap-8">
    {/* Visual: platform icons connecting to central orb */}
    <div className="relative" style={{ width: 200, height: 200 }}>
      {/* Central glowing orb */}
      <div
        className="absolute rounded-full"
        style={{
          width: 48,
          height: 48,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(210,145,55,0.9) 0%, rgba(210,145,55,0.3) 60%, transparent 100%)',
          boxShadow: '0 0 40px rgba(210,145,55,0.4), 0 0 80px rgba(210,145,55,0.15)',
          animation: 'explainer-pulse 3s ease-in-out infinite',
        }}
      />

      {/* Platform icons arranged around the orb */}
      {SCREEN_1_PLATFORMS.map((platform, i) => {
        const angle = (i * 120 - 90) * (Math.PI / 180);
        const radius = 72;
        const cx = 100 + Math.cos(angle) * radius;
        const cy = 100 + Math.sin(angle) * radius;

        return (
          <React.Fragment key={platform.label}>
            {/* Connecting line */}
            <svg
              className="absolute inset-0"
              width={200}
              height={200}
              style={{ pointerEvents: 'none' }}
            >
              <line
                x1={cx}
                y1={cy}
                x2={100}
                y2={100}
                stroke="rgba(245,245,244,0.08)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </svg>
            {/* Platform icon circle */}
            <div
              className="absolute flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                left: cx - 22,
                top: cy - 22,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill={platform.color}>
                <path d={platform.path} />
              </svg>
            </div>
          </React.Fragment>
        );
      })}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes explainer-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
    </div>

    {/* Text */}
    <div className="flex flex-col items-center gap-3">
      <h1
        className="text-[32px] md:text-[40px] leading-tight"
        style={{
          fontFamily: 'var(--font-heading)',
          fontStyle: 'italic',
          color: '#F5F5F4',
          letterSpacing: '-0.02em',
        }}
      >
        Your data already knows who you are
      </h1>
      <p
        className="text-[15px] md:text-base leading-relaxed max-w-[340px]"
        style={{
          fontFamily: 'var(--font-body)',
          color: 'rgba(245,245,244,0.6)',
        }}
      >
        TwinMe discovers patterns about you from Spotify, YouTube, Calendar and
        more — building an AI twin that actually knows you.
      </p>
    </div>
  </div>
);

/* ============================
   Screen 2 — How it works
   ============================ */

const STEPS = [
  {
    number: '01',
    title: 'Connect',
    description: 'Link your platforms in 2 clicks. No passwords stored.',
  },
  {
    number: '02',
    title: 'Discover',
    description: 'Your twin finds patterns across your music, schedule, and conversations.',
  },
  {
    number: '03',
    title: 'Chat',
    description: 'Talk to a twin that knows your habits, taste, and rhythms.',
  },
];

const Screen2: React.FC = () => (
  <div className="flex flex-col items-center gap-8">
    <h1
      className="text-[32px] md:text-[40px] leading-tight"
      style={{
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        color: '#F5F5F4',
        letterSpacing: '-0.02em',
      }}
    >
      Three steps to meet your twin
    </h1>

    <div className="flex flex-col gap-3 w-full">
      {STEPS.map((step) => (
        <div
          key={step.number}
          className="flex items-start gap-4 rounded-[20px] px-5 py-4"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
          }}
        >
          <span
            className="text-[20px] font-semibold leading-none mt-0.5 shrink-0"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'rgba(210,145,55,0.8)',
            }}
          >
            {step.number}
          </span>
          <div className="flex flex-col gap-1 text-left">
            <span
              className="text-[15px] font-medium"
              style={{
                fontFamily: 'var(--font-body)',
                color: '#F5F5F4',
              }}
            >
              {step.title}
            </span>
            <span
              className="text-[13px] leading-relaxed"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'rgba(245,245,244,0.6)',
              }}
            >
              {step.description}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ============================
   Screen 3 — Your privacy
   ============================ */

const TRUST_BADGES = [
  {
    icon: Lock,
    label: 'Encrypted',
  },
  {
    icon: Eye,
    label: 'Privacy spectrum',
  },
  {
    icon: Trash2,
    label: 'Delete anytime',
  },
];

const Screen3: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => (
  <div className="flex flex-col items-center gap-8">
    <div className="flex flex-col items-center gap-3">
      <h1
        className="text-[32px] md:text-[40px] leading-tight"
        style={{
          fontFamily: 'var(--font-heading)',
          fontStyle: 'italic',
          color: '#F5F5F4',
          letterSpacing: '-0.02em',
        }}
      >
        You're in control
      </h1>
      <p
        className="text-[15px] md:text-base leading-relaxed max-w-[340px]"
        style={{
          fontFamily: 'var(--font-body)',
          color: 'rgba(245,245,244,0.6)',
        }}
      >
        We never sell your data. You choose what your twin can see. Delete
        everything anytime.
      </p>
    </div>

    {/* Trust badges */}
    <div className="flex gap-4">
      {TRUST_BADGES.map((badge) => (
        <div
          key={badge.label}
          className="flex flex-col items-center gap-2.5 rounded-[20px] px-5 py-4 flex-1"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
          }}
        >
          <badge.icon
            size={22}
            strokeWidth={1.5}
            style={{ color: 'rgba(210,145,55,0.8)' }}
          />
          <span
            className="text-[12px] font-medium"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'rgba(245,245,244,0.6)',
            }}
          >
            {badge.label}
          </span>
        </div>
      ))}
    </div>

    {/* Sign in link */}
    <button
      onClick={onSignIn}
      className="text-sm transition-opacity hover:opacity-80"
      style={{
        fontFamily: 'var(--font-body)',
        color: 'rgba(245,245,244,0.5)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      Already have an account?{' '}
      <span style={{ color: '#F5F5F4', textDecoration: 'underline' }}>
        Sign in
      </span>
    </button>
  </div>
);

export default OnboardingExplainer;
