import React, { Suspense, lazy, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAnalytics } from '../../contexts/AnalyticsContext';

const WelcomeStep = lazy(() => import('./steps/WelcomeStep'));
const InterviewStep = lazy(() => import('./steps/InterviewStep'));
const PlatformStep = lazy(() => import('./steps/PlatformStep'));
const AwakeningScreen = lazy(() => import('./steps/AwakeningScreen'));

type Step = 'welcome' | 'interview' | 'platforms' | 'awakening';

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-foreground/20 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  </div>
);

const OnboardingFlow: React.FC = () => {
  const { setNeedsOnboarding } = useAuth();
  const { trackFunnel } = useAnalytics();
  const navigate = useNavigate();
  const startTime = useRef(Date.now());

  // Support returning from OAuth: /onboarding?step=platform -> start at platforms step
  const initialStep = (): Step => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get('step');
    if (stepParam === 'platform' || stepParam === 'platforms') return 'platforms';
    return 'welcome';
  };

  const [step, setStep] = useState<Step>(initialStep);

  const advanceStep = (from: Step, to: Step, extra?: Record<string, unknown>) => {
    trackFunnel(`onboarding_${from}_completed`, { step_from: from, step_to: to, ...extra });
    setStep(to);
  };

  const handleComplete = () => {
    const elapsed = Math.round((Date.now() - startTime.current) / 1000);
    trackFunnel('onboarding_completed', { total_duration_seconds: elapsed });
    // Mark onboarding done — ProtectedRoute gate releases
    setNeedsOnboarding(false);
    navigate('/dashboard', { replace: true });
  };

  const STEPS: Step[] = ['welcome', 'interview', 'platforms', 'awakening'];
  const currentIdx = STEPS.indexOf(step);

  // Ghibli narrative journey — mirrors landing page chapters
  //   welcome    -> arrival       (hero chapter III — cosmic dust, painted dusk clouds)
  //   interview  -> landscape     (descent to earth — teal hills, amber river)
  //   platforms  -> meadow        (connecting — golden-hour path)
  //   awakening  -> twin meeting  (emotional peak — silhouettes at sunset)
  // 2026-05-10: each step carries a 1x WebP + 2x WebP pair so Retina
  // displays get the sharp upscale via image-set(). The JPG is dropped from
  // the prod path now — every browser this app targets supports WebP +
  // unprefixed image-set() (Chrome 2019+, Safari 14.1+, Firefox 88+).
  const stepBg: Record<Step, { x1: string; x2: string }> = {
    welcome:    { x1: '/images/cosmic-v2/stage3-arrival.webp',       x2: '/images/cosmic-v2/stage3-arrival@2x.webp' },
    interview:  { x1: '/images/cosmic-v2/section6-landscape.webp',   x2: '/images/cosmic-v2/section6-landscape@2x.webp' },
    platforms:  { x1: '/images/cosmic-v2/section8-meadow.webp',      x2: '/images/cosmic-v2/section8-meadow@2x.webp' },
    awakening:  { x1: '/images/cosmic-v2/section11-twin-meeting.webp', x2: '/images/cosmic-v2/section11-twin-meeting@2x.webp' },
  };
  const bg = stepBg[step];

  return (
    <div
      className="relative"
      style={{
        minHeight: '100vh',
        backgroundImage: `image-set(url(${bg.x1}) 1x, url(${bg.x2}) 2x)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        transition: 'background-image 800ms ease',
      }}
    >
      {/* Darken + warm-grade overlay so existing step UI stays legible */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 10%, rgba(232,160,80,0.08) 0%, transparent 55%),' +
            'linear-gradient(180deg, rgba(19,18,26,0.55) 0%, rgba(19,18,26,0.75) 100%)',
        }}
      />
      {/* 2026-05-12 Option B: SVG noise grain overlay — gives the painted
          onboarding backgrounds a film-grain texture, masks residual flatness. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          mixBlendMode: 'overlay',
        }}
      />
      <div className="relative z-10">
    <Suspense fallback={<LoadingFallback />}>
      {/* Progress dots — hidden on welcome (intro) and awakening (finale) */}
      {step !== 'welcome' && step !== 'awakening' && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i <= currentIdx ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)',
                transform: i === currentIdx ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      )}

      {step === 'welcome' && (
        <WelcomeStep onBegin={() => advanceStep('welcome', 'interview')} />
      )}

      {step === 'interview' && (
        <InterviewStep
          onComplete={() => advanceStep('interview', 'platforms')}
          onSkip={() => advanceStep('interview', 'platforms', { skipped: true })}
        />
      )}

      {step === 'platforms' && (
        <PlatformStep onContinue={() => advanceStep('platforms', 'awakening')} />
      )}

      {step === 'awakening' && (
        <AwakeningScreen onEnter={handleComplete} />
      )}
    </Suspense>
      </div>
    </div>
  );
};

export default OnboardingFlow;
