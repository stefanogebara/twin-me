import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DiscoveryStep } from './steps/DiscoveryStep';
import { CalibrationStep, CalibrationResult } from './steps/CalibrationStep';
import { PlatformConnectStep } from './steps/PlatformConnectStep';
import { SoulSignatureRevealStep } from './steps/SoulSignatureRevealStep';
import { enrichmentService, ConfirmedData } from '@/services/enrichmentService';
import { Loader2 } from 'lucide-react';

/**
 * EnrichedOnboardingFlow
 *
 * Cofounder.co-style onboarding in 4 steps:
 * 1. Discovery - Email enrichment + instant reveal (wow moment)
 * 2. Calibration - AI-driven Q&A to understand personality (2-3 min)
 * 3. Platform Connect - Quick OAuth for Spotify/Calendar/YouTube/Whoop
 * 4. Soul Signature Reveal - AI-generated personality archetype card
 *
 * Each step can be skipped. The soul signature improves as more data flows in.
 */

type OnboardingStep = 'discovery' | 'calibration' | 'platforms' | 'signature' | 'complete';

const STEP_PROGRESS: Record<OnboardingStep, number> = {
  discovery: 12,
  calibration: 37,
  platforms: 62,
  signature: 87,
  complete: 100,
};

/** Fixed top bar showing twin "materializing" as the user progresses through onboarding. */
const TwinFormationBar: React.FC<{ step: OnboardingStep }> = ({ step }) => {
  const percent = STEP_PROGRESS[step];

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50"
      style={{ height: '6px', backgroundColor: 'rgba(232, 213, 183, 0.08)' }}
    >
      <motion.div
        className="h-full"
        initial={{ width: '0%' }}
        animate={{ width: `${percent}%` }}
        transition={{ type: 'spring', stiffness: 60, damping: 20 }}
        style={{
          background: 'linear-gradient(90deg, #E8D5B7 0%, #D4C4A8 60%, rgba(232, 213, 183, 0.6) 100%)',
          boxShadow: '0 0 12px rgba(232, 213, 183, 0.3)',
        }}
      />
      <div
        className="absolute right-3 flex items-center gap-2"
        style={{ top: '10px' }}
      >
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'rgba(232, 213, 183, 0.4)', fontFamily: 'var(--font-body)' }}
        >
          Twin Formation
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'rgba(232, 213, 183, 0.5)', fontFamily: 'var(--font-body)' }}
        >
          {percent}%
        </span>
      </div>
    </div>
  );
};

interface OnboardingState {
  step: OnboardingStep;
  discoveryData: ConfirmedData | null;
  calibrationData: CalibrationResult | null;
  connectedPlatforms: string[];
}

const EnrichedOnboardingFlow: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<OnboardingState>({
    step: 'discovery',
    discoveryData: null,
    calibrationData: null,
    connectedPlatforms: [],
  });

  const [loading, setLoading] = useState(true);

  // Check if user has already completed onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);

        // Check enrichment status
        const statusResult = await enrichmentService.getStatus(user.id);

        if (statusResult.isConfirmed) {
          // User has already confirmed their identity - skip to dashboard
          navigate('/dashboard');
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        setLoading(false);
      }
    };

    if (!authLoading && user) {
      checkOnboardingStatus();
    } else if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Handle discovery step completion
  const handleDiscoveryComplete = async (data: ConfirmedData) => {
    setState(prev => ({
      ...prev,
      step: 'calibration',
      discoveryData: data,
    }));

    // Fetch updated enrichment data in background
    if (user?.id) {
      try {
        await enrichmentService.getResults(user.id);
      } catch (error) {
        console.error('Error fetching enrichment results:', error);
      }
    }
  };

  // Handle calibration step completion
  const handleCalibrationComplete = (data: CalibrationResult) => {
    setState(prev => ({
      ...prev,
      step: 'platforms',
      calibrationData: data,
    }));
  };

  // Handle platform connect step completion
  const handlePlatformConnectComplete = (connectedPlatforms: string[]) => {
    setState(prev => ({
      ...prev,
      connectedPlatforms,
      step: 'signature',
    }));
  };

  // Handle soul signature navigation choice
  const handleSignatureNavigate = (destination: 'twin' | 'dashboard') => {
    navigate(destination === 'twin' ? '/talk-to-twin' : '/dashboard');
  };

  // Handle skips - each skip advances to the next step
  const handleDiscoverySkip = () => {
    setState(prev => ({ ...prev, step: 'calibration' }));
  };

  const handleCalibrationSkip = () => {
    setState(prev => ({ ...prev, step: 'platforms' }));
  };

  const handlePlatformConnectSkip = () => {
    setState(prev => ({ ...prev, step: 'signature' }));
  };

  // Show loading while checking auth and onboarding status
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0C0C0C]">
        <div className="text-center">
          <Loader2
            className="w-8 h-8 animate-spin mx-auto mb-4"
            style={{ color: '#E8D5B7' }}
          />
          <p style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: 'var(--font-body)' }}>
            Preparing your experience...
          </p>
        </div>
      </div>
    );
  }

  // User not logged in
  if (!user) {
    return null;
  }

  // Render current step with Twin Formation bar
  const renderStep = () => {
    switch (state.step) {
      case 'discovery':
        return (
          <DiscoveryStep
            userId={user.id}
            userEmail={user.email || ''}
            userName={user.fullName || undefined}
            onComplete={handleDiscoveryComplete}
            onSkip={handleDiscoverySkip}
          />
        );

      case 'calibration':
        return (
          <CalibrationStep
            userId={user.id}
            enrichmentContext={state.discoveryData || { name: user.fullName || '' }}
            onComplete={handleCalibrationComplete}
            onSkip={handleCalibrationSkip}
          />
        );

      case 'platforms':
        return (
          <PlatformConnectStep
            userId={user.id}
            userName={state.discoveryData?.name || user.fullName || ''}
            onComplete={handlePlatformConnectComplete}
            onSkip={handlePlatformConnectSkip}
          />
        );

      case 'signature':
        return (
          <SoulSignatureRevealStep
            userId={user.id}
            enrichmentContext={state.discoveryData || { name: user.fullName || '' }}
            calibrationData={state.calibrationData}
            connectedPlatforms={state.connectedPlatforms}
            onNavigate={handleSignatureNavigate}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      <TwinFormationBar step={state.step} />
      <div style={{ paddingTop: '40px' }}>
        {renderStep()}
      </div>
    </>
  );
};

export default EnrichedOnboardingFlow;
