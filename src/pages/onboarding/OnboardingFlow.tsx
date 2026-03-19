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

  return (
    <Suspense fallback={<LoadingFallback />}>
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
  );
};

export default OnboardingFlow;
