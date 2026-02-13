import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Render current step
  switch (state.step) {
    case 'discovery':
      return (
        <DiscoveryStep
          userId={user.id}
          userEmail={user.email || ''}
          userName={user.name || user.email?.split('@')[0]}
          onComplete={handleDiscoveryComplete}
          onSkip={handleDiscoverySkip}
        />
      );

    case 'calibration':
      return (
        <CalibrationStep
          userId={user.id}
          enrichmentContext={state.discoveryData || { name: user.name || user.email?.split('@')[0] }}
          onComplete={handleCalibrationComplete}
          onSkip={handleCalibrationSkip}
        />
      );

    case 'platforms':
      return (
        <PlatformConnectStep
          userId={user.id}
          userName={state.discoveryData?.name || user.name || user.email?.split('@')[0]}
          onComplete={handlePlatformConnectComplete}
          onSkip={handlePlatformConnectSkip}
        />
      );

    case 'signature':
      return (
        <SoulSignatureRevealStep
          userId={user.id}
          enrichmentContext={state.discoveryData || { name: user.name || user.email?.split('@')[0] }}
          calibrationData={state.calibrationData}
          connectedPlatforms={state.connectedPlatforms}
          onNavigate={handleSignatureNavigate}
        />
      );

    default:
      return null;
  }
};

export default EnrichedOnboardingFlow;
