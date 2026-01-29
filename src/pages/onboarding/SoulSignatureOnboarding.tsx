import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useOnboardingState } from './hooks/useOnboardingState';
import { InvitationStep } from './steps/InvitationStep';
import { DiscoveryStep } from './steps/DiscoveryStep';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { ConfirmedData } from '@/services/enrichmentService';

const SoulSignatureOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, authToken, isLoaded } = useAuth();
  const { isDemoMode: contextDemoMode } = useDemo();
  const hasProcessedStepParam = useRef(false);

  // Enable demo mode from URL param or context, or if not authenticated (only after auth is loaded)
  const isDemoMode = useMemo(() => {
    // Don't decide demo mode until auth is loaded
    if (!isLoaded) return false;
    return contextDemoMode || searchParams.get('demo') === 'true' || !authToken;
  }, [contextDemoMode, searchParams, authToken, isLoaded]);

  const {
    state,
    startOnboarding,
    nextStep,
    goToStep,
    setDiscoveryCompleted,
    completeOnboarding,
  } = useOnboardingState();

  // Handle step parameter and onboarding initialization (only after auth is loaded)
  useEffect(() => {
    // Wait for auth to load before processing
    if (!isLoaded || hasProcessedStepParam.current) return;

    const stepParam = searchParams.get('step');

    // Process step parameter first (takes priority)
    if (stepParam) {
      const step = parseInt(stepParam, 10);
      if (step >= 1 && step <= 2) {
        // If step=2 is requested and user is authenticated, go directly to discovery
        if (step === 2 && authToken) {
          hasProcessedStepParam.current = true;
          goToStep(2);
          // Clear the step param from URL to prevent it from overriding state changes
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('step');
          window.history.replaceState({}, '', newUrl.toString());
          return; // Don't call startOnboarding
        } else if (step === 1) {
          hasProcessedStepParam.current = true;
          goToStep(1);
          return;
        }
      }
    }

    // No step param or invalid step - start onboarding normally
    hasProcessedStepParam.current = true;
    if (!state.startedAt) {
      startOnboarding();
    }
  }, [isLoaded, authToken, searchParams, goToStep, state.startedAt, startOnboarding]);

  // Handle skipping - go directly to soul signature dashboard
  const handleSkip = useCallback(() => {
    navigate('/soul-signature');
  }, [navigate]);

  // Handle "Begin Discovery" - requires authentication
  const handleBeginDiscovery = useCallback(() => {
    // If auth is still loading, wait for it
    if (!isLoaded) {
      return;
    }
    if (!authToken) {
      // Not logged in - redirect to auth with return URL
      window.location.href = '/auth?redirect=' + encodeURIComponent('/soul-onboarding?step=2');
      return;
    }
    // Logged in - proceed to discovery step
    nextStep();
  }, [authToken, nextStep, isLoaded]);

  // Handle discovery step completion - go directly to dashboard
  const handleDiscoveryComplete = useCallback((data: ConfirmedData) => {
    setDiscoveryCompleted(true, data);
    completeOnboarding();
    navigate('/soul-signature');
  }, [setDiscoveryCompleted, completeOnboarding, navigate]);

  // Handle discovery step skip - go directly to dashboard
  const handleDiscoverySkip = useCallback(() => {
    setDiscoveryCompleted(false);
    completeOnboarding();
    navigate('/soul-signature');
  }, [setDiscoveryCompleted, completeOnboarding, navigate]);

  // Render current step
  // Simplified flow: Invitation → Discovery (magic reveal) → Dashboard
  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return (
          <InvitationStep
            onContinue={handleBeginDiscovery}
            onSkip={handleSkip}
          />
        );

      case 2:
        // Discovery step - magic reveal using web research
        // User must be authenticated to reach this step
        return (
          <DiscoveryStep
            userId={user?.id || ''}
            userEmail={user?.email || ''}
            userName={user?.fullName || user?.firstName}
            onComplete={handleDiscoveryComplete}
            onSkip={handleDiscoverySkip}
          />
        );

      default:
        return null;
    }
  };

  // Show loading state while auth is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#232320]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-8 h-8 text-[#C1C0B6] animate-spin" />
          <p className="text-[#C1C0B6]/70 text-sm">Loading...</p>
        </motion.div>
      </div>
    );
  }

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
