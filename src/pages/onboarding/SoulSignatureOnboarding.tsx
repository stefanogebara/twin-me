import React, { useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnboardingState } from './hooks/useOnboardingState';
import { InvitationStep } from './steps/InvitationStep';
import { QuickPulseStep } from './steps/QuickPulseStep';
import { FirstGlimpseStep } from './steps/FirstGlimpseStep';
import { PlatformStoriesStep } from './steps/PlatformStoriesStep';
import { OriginStep } from './steps/OriginStep';
import { RevealStep } from './steps/RevealStep';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { OriginData } from '@/services/originService';

const SoulSignatureOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, authToken } = useAuth();
  const { isDemoMode: contextDemoMode } = useDemo();

  // Enable demo mode from URL param or context, or if not authenticated
  const isDemoMode = useMemo(() => {
    return contextDemoMode || searchParams.get('demo') === 'true' || !authToken;
  }, [contextDemoMode, searchParams, authToken]);

  const {
    state,
    startOnboarding,
    nextStep,
    prevStep,
    goToStep,
    addAnswer,
    calculateScores,
    addConnectedPlatform,
    setOriginDataCompleted,
    completeOnboarding,
    resetOnboarding,
  } = useOnboardingState();

  // Start onboarding if not already started
  useEffect(() => {
    if (!state.startedAt) {
      startOnboarding();
    }
  }, [state.startedAt, startOnboarding]);

  // Handle skipping - go directly to soul signature dashboard
  const handleSkip = useCallback(() => {
    navigate('/soul-signature');
  }, [navigate]);

  // Handle quick pulse completion
  const handleQuickPulseComplete = useCallback((answers: { questionId: string; trait: 'O' | 'C' | 'E' | 'A' | 'N'; value: number }[]) => {
    // Save all answers
    answers.forEach(answer => addAnswer(answer));

    // Calculate preliminary scores
    calculateScores();

    // Move to first glimpse
    nextStep();
  }, [addAnswer, calculateScores, nextStep]);

  // Determine API route based on platform type
  const getPlatformApiRoute = (platformId: string): string => {
    const healthPlatforms = ['whoop', 'oura', 'fitbit', 'strava'];
    const professionalPlatforms = ['github', 'gmail', 'google_calendar', 'slack', 'linkedin'];

    if (healthPlatforms.includes(platformId)) {
      return `/api/health/connect/${platformId}`;
    } else if (professionalPlatforms.includes(platformId)) {
      return `/api/entertainment/connect/${platformId}`; // Professional uses same route for now
    }
    return `/api/entertainment/connect/${platformId}`;
  };

  // Handle platform connection
  const handlePlatformConnect = useCallback(async (platformId: string) => {
    // In demo mode (no auth), redirect to sign in first
    if (isDemoMode) {
      // Store the platform they wanted to connect for after auth
      sessionStorage.setItem('onboarding-return', 'true');
      sessionStorage.setItem('onboarding-platform', platformId);
      // Redirect to auth with return URL
      navigate('/auth?redirect=' + encodeURIComponent('/soul-onboarding'));
      return;
    }

    try {
      // Get the OAuth URL from the backend using the correct API route
      const apiRoute = getPlatformApiRoute(platformId);
      const response = await fetch(apiRoute, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth');
      }

      const { authUrl } = await response.json();

      // Store current onboarding state before redirecting
      sessionStorage.setItem('onboarding-return', 'true');
      sessionStorage.setItem('onboarding-platform', platformId);

      // Redirect to OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Platform connection error:', error);
      // Fallback to simulation on error
      await new Promise(resolve => setTimeout(resolve, 1000));
      addConnectedPlatform(platformId);
    }
  }, [authToken, isDemoMode, addConnectedPlatform, user, navigate]);

  // Check for OAuth return
  useEffect(() => {
    const isReturning = sessionStorage.getItem('onboarding-return');
    const platform = sessionStorage.getItem('onboarding-platform');

    if (isReturning && platform) {
      // Clear the session storage
      sessionStorage.removeItem('onboarding-return');
      sessionStorage.removeItem('onboarding-platform');

      // Add the connected platform
      addConnectedPlatform(platform);

      // Make sure we're on the platform stories step
      if (state.currentStep !== 4) {
        goToStep(4);
      }
    }
  }, [addConnectedPlatform, goToStep, state.currentStep]);

  // Handle origin step completion
  const handleOriginComplete = useCallback((data: OriginData) => {
    setOriginDataCompleted(true);
    nextStep();
  }, [setOriginDataCompleted, nextStep]);

  // Handle origin step skip
  const handleOriginSkip = useCallback(() => {
    setOriginDataCompleted(false);
    nextStep();
  }, [setOriginDataCompleted, nextStep]);

  // Handle onboarding completion
  const handleComplete = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  // Render current step
  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return (
          <InvitationStep
            onContinue={nextStep}
            onSkip={handleSkip}
          />
        );

      case 2:
        return (
          <QuickPulseStep
            onComplete={handleQuickPulseComplete}
            onBack={prevStep}
            onSkip={() => {
              // Skip to first glimpse with default scores
              calculateScores();
              goToStep(3);
            }}
          />
        );

      case 3:
        return state.archetype && state.preliminaryScores ? (
          <FirstGlimpseStep
            archetype={state.archetype}
            scores={state.preliminaryScores}
            onContinue={nextStep}
            onSkip={nextStep}
            onBack={prevStep}
          />
        ) : (
          // If no scores yet, go back to questions
          <QuickPulseStep
            onComplete={handleQuickPulseComplete}
            onBack={prevStep}
            onSkip={() => {
              calculateScores();
              goToStep(3);
            }}
          />
        );

      case 4:
        return (
          <PlatformStoriesStep
            connectedPlatforms={state.connectedPlatforms}
            onConnect={handlePlatformConnect}
            onContinue={nextStep}
            onBack={prevStep}
            onSkip={nextStep}
            isDemoMode={isDemoMode}
          />
        );

      case 5:
        return (
          <OriginStep
            userId={user?.id || ''}
            onComplete={handleOriginComplete}
            onBack={prevStep}
            onSkip={handleOriginSkip}
          />
        );

      case 6:
        return (
          <RevealStep
            connectedPlatforms={state.connectedPlatforms}
            questionsAnswered={state.answers.length}
            onComplete={handleComplete}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <AnimatePresence mode="wait">
        <motion.div
          key={state.currentStep}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="min-h-screen"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default SoulSignatureOnboarding;
