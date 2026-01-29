import { useState, useCallback, useEffect } from 'react';
import { ConfirmedData } from '@/services/enrichmentService';

export interface OnboardingState {
  currentStep: 1 | 2 | 3 | 4;
  connectedPlatforms: string[];
  discoveryCompleted: boolean;
  discoveryData: ConfirmedData | null;
  originDataCompleted: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
}

const STORAGE_KEY = 'soul-signature-onboarding';

const initialState: OnboardingState = {
  currentStep: 1,
  connectedPlatforms: [],
  discoveryCompleted: false,
  discoveryData: null,
  originDataCompleted: false,
  startedAt: null,
  completedAt: null,
};

export const useOnboardingState = () => {
  const [state, setState] = useState<OnboardingState>(() => {
    // Try to restore from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          startedAt: parsed.startedAt ? new Date(parsed.startedAt) : null,
          completedAt: parsed.completedAt ? new Date(parsed.completedAt) : null,
        };
      }
    } catch (e) {
      console.error('Failed to restore onboarding state:', e);
    }
    return initialState;
  });

  // Persist state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save onboarding state:', e);
    }
  }, [state]);

  const startOnboarding = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: 1,
      startedAt: new Date(),
    }));
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => {
      const next = Math.min(prev.currentStep + 1, 4) as 1 | 2 | 3 | 4;
      return { ...prev, currentStep: next };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => {
      const next = Math.max(prev.currentStep - 1, 1) as 1 | 2 | 3 | 4;
      return { ...prev, currentStep: next };
    });
  }, []);

  const goToStep = useCallback((step: 1 | 2 | 3 | 4) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const setDiscoveryCompleted = useCallback((completed: boolean, data?: ConfirmedData) => {
    setState(prev => ({
      ...prev,
      discoveryCompleted: completed,
      discoveryData: data || null
    }));
  }, []);

  const addConnectedPlatform = useCallback((platform: string) => {
    setState(prev => ({
      ...prev,
      connectedPlatforms: [...new Set([...prev.connectedPlatforms, platform])]
    }));
  }, []);

  const removeConnectedPlatform = useCallback((platform: string) => {
    setState(prev => ({
      ...prev,
      connectedPlatforms: prev.connectedPlatforms.filter(p => p !== platform)
    }));
  }, []);

  const setOriginDataCompleted = useCallback((completed: boolean = true) => {
    setState(prev => ({
      ...prev,
      originDataCompleted: completed
    }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState(prev => ({
      ...prev,
      completedAt: new Date()
    }));
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(initialState);
  }, []);

  return {
    state,
    startOnboarding,
    nextStep,
    prevStep,
    goToStep,
    addConnectedPlatform,
    removeConnectedPlatform,
    setDiscoveryCompleted,
    setOriginDataCompleted,
    completeOnboarding,
    resetOnboarding,
    isComplete: state.completedAt !== null,
    progress: {
      platformsConnected: state.connectedPlatforms.length,
      discoveryCompleted: state.discoveryCompleted,
      originDataCompleted: state.originDataCompleted,
    }
  };
};
