import React, { Suspense, lazy, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import OnboardingExplainer from './components/OnboardingExplainer';

const WelcomeStep = lazy(() => import('./steps/WelcomeStep'));
const InterviewStep = lazy(() => import('./steps/InterviewStep'));
const PlatformStep = lazy(() => import('./steps/PlatformStep'));
const AwakeningScreen = lazy(() => import('./steps/AwakeningScreen'));

type Step = 'explainer' | 'welcome' | 'interview' | 'platforms' | 'awakening';

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
    // Show explainer on first visit
    const seen = sessionStorage.getItem('twinme_explainer_seen');
    return seen ? 'welcome' : 'explainer';
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

  const STEPS: Step[] = ['explainer', 'welcome', 'interview', 'platforms', 'awakening'];
  const currentIdx = STEPS.indexOf(step);

  // Show explainer before the main flow
  if (step === 'explainer') {
    return (
      <OnboardingExplainer
        onComplete={() => {
          sessionStorage.setItem('twinme_explainer_seen', '1');
          setStep('welcome');
        }}
        onSignIn={() => {
          sessionStorage.setItem('twinme_explainer_seen', '1');
          navigate('/auth');
        }}
      />
    );
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #110f0f 0%, #0d0b0b 50%, #0a0909 100%)', minHeight: '100vh' }}>
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
  );
};

export default OnboardingFlow;
