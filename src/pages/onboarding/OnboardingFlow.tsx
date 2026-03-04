import React, { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

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
  const navigate = useNavigate();

  // Support returning from OAuth: /onboarding?step=platform -> start at platforms step
  const initialStep = (): Step => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get('step');
    if (stepParam === 'platform' || stepParam === 'platforms') return 'platforms';
    return 'welcome';
  };

  const [step, setStep] = useState<Step>(initialStep);

  const handleComplete = () => {
    // Mark onboarding done — ProtectedRoute gate releases
    setNeedsOnboarding(false);
    navigate('/dashboard', { replace: true });
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      {step === 'welcome' && (
        <WelcomeStep onBegin={() => setStep('interview')} />
      )}

      {step === 'interview' && (
        <InterviewStep
          onComplete={() => setStep('platforms')}
          onSkip={() => setStep('platforms')}
        />
      )}

      {step === 'platforms' && (
        <PlatformStep onContinue={() => setStep('awakening')} />
      )}

      {step === 'awakening' && (
        <AwakeningScreen onEnter={handleComplete} />
      )}
    </Suspense>
  );
};

export default OnboardingFlow;
