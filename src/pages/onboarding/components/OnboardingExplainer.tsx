import React, { useState, useCallback } from 'react';
import { ArrowRight, Lock, Eye, Trash2 } from 'lucide-react';
import { Row } from '@/components/register';

interface OnboardingExplainerProps {
  onComplete: () => void;
  // onSignIn kept optional for caller compatibility; the soul-reveal flow is
  // auth-gated so every viewer is already signed in and the link was a no-op.
  onSignIn?: () => void;
}

const TOTAL_SCREENS = 3;

// SVG presentation attributes do not resolve var(): register.css's hex.
const LINE = '#eae9ea'; // --rg-rule

const SCREEN_1_PLATFORMS = [
  { label: 'Spotify', color: '#1DB954', path: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z' },
  { label: 'YouTube', color: '#FF0000', path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
  { label: 'Calendar', color: '#4285F4', path: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z' },
];

/**
 * Three short screens before the reveal, in the register: the flat page, an
 * upright Cosmos title, rows instead of glass cards, one 48/12 button.
 */
const OnboardingExplainer: React.FC<OnboardingExplainerProps> = ({ onComplete }) => {
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
    <div className="rs fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--rg-page)', color: 'var(--rg-ink)' }}>
      {/* Skip button */}
      <div className="flex justify-end px-6 pt-5 pb-2">
        <button type="button" onClick={onComplete} className="n-btn n-btn--ghost">
          Skip
        </button>
      </div>

      {/* Screen content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
        <div
          className="rs-flow w-full max-w-md flex flex-col items-center text-center"
          style={{
            opacity: screenOpacity,
            transform: `translateX(${screenTranslateX}px)`,
            transition: 'opacity 200ms ease, transform 200ms ease',
          }}
        >
          {currentScreen === 0 && <Screen1 />}
          {currentScreen === 1 && <Screen2 />}
          {currentScreen === 2 && <Screen3 />}
        </div>
      </div>

      {/* Bottom: dots + next button */}
      <div className="flex flex-col items-center gap-6 px-6 pb-10">
        {/* Pagination dots: ink for the current screen, the mark grey (3.4:1) for the rest */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_SCREENS }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToScreen(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === currentScreen ? 24 : 8,
                height: 8,
                backgroundColor: i === currentScreen ? 'var(--rg-ink)' : 'var(--rg-mark)',
              }}
              aria-label={`Go to screen ${i + 1}`}
              aria-current={i === currentScreen ? 'step' : undefined}
            />
          ))}
        </div>

        {/* Next / Get started */}
        <button type="button" onClick={handleNext} className="n-btn n-btn--primary pb-cta" style={{ minWidth: 180 }}>
          {currentScreen === TOTAL_SCREENS - 1 ? 'Get started' : 'Next'}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
    {/* Visual: platform icons connected to a flat centre, no glow, no pulse */}
    <div className="relative" style={{ width: 200, height: 200 }} aria-hidden="true">
      <div
        className="absolute rounded-full"
        style={{
          width: 48,
          height: 48,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--rg-field)',
          border: '1px solid var(--rg-ink)',
        }}
      />

      {SCREEN_1_PLATFORMS.map((platform, i) => {
        const angle = (i * 120 - 90) * (Math.PI / 180);
        const radius = 72;
        const cx = 100 + Math.cos(angle) * radius;
        const cy = 100 + Math.sin(angle) * radius;

        return (
          <React.Fragment key={platform.label}>
            <svg className="absolute inset-0" width={200} height={200} style={{ pointerEvents: 'none' }}>
              <line x1={cx} y1={cy} x2={100} y2={100} stroke={LINE} strokeWidth={1} strokeDasharray="4 4" />
            </svg>
            <div
              className="absolute flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                left: cx - 22,
                top: cy - 22,
                background: 'var(--rg-white)',
                border: '1px solid var(--rg-rule)',
              }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill={platform.color}>
                <path d={platform.path} />
              </svg>
            </div>
          </React.Fragment>
        );
      })}
    </div>

    <div className="flex flex-col items-center gap-3">
      <h1 className="rs-flow-h1">Your data already knows who you are</h1>
      <p className="rs-flow-line max-w-[340px]">
        TwinMe finds patterns in your Spotify, YouTube, Calendar and more, and builds a twin that knows you.
      </p>
    </div>
  </div>
);

/* ============================
   Screen 2 — How it works
   ============================ */

const STEPS = [
  { number: '1', title: 'Connect', description: 'Link your platforms in two clicks. No passwords stored.' },
  { number: '2', title: 'Discover', description: 'Your twin finds patterns in your music, schedule and messages.' },
  { number: '3', title: 'Chat', description: 'Talk to a twin that knows your habits, taste and rhythms.' },
];

const Screen2: React.FC = () => (
  <div className="flex flex-col items-center gap-8 w-full">
    <h1 className="rs-flow-h1">Three steps to meet your twin</h1>

    <ol className="rg-list w-full" style={{ textAlign: 'left' }}>
      {STEPS.map((step) => (
        <Row
          key={step.number}
          icon={<span className="rs-strong pb-figures">{step.number}</span>}
          title={step.title}
          line={step.description}
        />
      ))}
    </ol>
  </div>
);

/* ============================
   Screen 3 — Your privacy
   ============================ */

const TRUST_BADGES = [
  { icon: Lock, label: 'Encrypted' },
  { icon: Eye, label: 'You choose what it sees' },
  { icon: Trash2, label: 'Delete everything any time' },
];

const Screen3: React.FC = () => (
  <div className="flex flex-col items-center gap-8 w-full">
    <div className="flex flex-col items-center gap-3">
      <h1 className="rs-flow-h1">You're in control</h1>
      <p className="rs-flow-line max-w-[340px]">
        We never sell your data. You choose what your twin can see.
      </p>
    </div>

    <ul className="rg-list rs-compact w-full" style={{ textAlign: 'left' }}>
      {TRUST_BADGES.map((badge) => (
        <Row key={badge.label} icon={<badge.icon />} title={badge.label} />
      ))}
    </ul>
  </div>
);

export default OnboardingExplainer;
