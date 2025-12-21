import { useState, useCallback, useEffect } from 'react';

export interface OnboardingAnswer {
  questionId: string;
  trait: 'O' | 'C' | 'E' | 'A' | 'N';
  value: number;
  timestamp: Date;
}

export interface PreliminaryScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface OnboardingState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  answers: OnboardingAnswer[];
  preliminaryScores: PreliminaryScores | null;
  connectedPlatforms: string[];
  archetype: {
    name: string;
    subtitle: string;
    description: string;
  } | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

const STORAGE_KEY = 'soul-signature-onboarding';

const initialState: OnboardingState = {
  currentStep: 1,
  answers: [],
  preliminaryScores: null,
  connectedPlatforms: [],
  archetype: null,
  startedAt: null,
  completedAt: null,
};

// Calculate preliminary OCEAN scores from quick assessment answers
const calculatePreliminaryScores = (answers: OnboardingAnswer[]): PreliminaryScores => {
  const traitSums: Record<string, number[]> = {
    O: [], C: [], E: [], A: [], N: []
  };

  answers.forEach(answer => {
    traitSums[answer.trait].push(answer.value);
  });

  const average = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 50;

  return {
    openness: Math.round(average(traitSums.O)),
    conscientiousness: Math.round(average(traitSums.C)),
    extraversion: Math.round(average(traitSums.E)),
    agreeableness: Math.round(average(traitSums.A)),
    neuroticism: Math.round(average(traitSums.N)),
  };
};

// Determine archetype based on preliminary scores
const determineArchetype = (scores: PreliminaryScores): { name: string; subtitle: string; description: string } => {
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = scores;

  // High Openness + High Extraversion
  if (openness >= 65 && extraversion >= 65) {
    return {
      name: 'The Creative Explorer',
      subtitle: 'Curious mind with a passion for discovery',
      description: 'You blend creativity with social energy, always seeking new experiences and sharing your discoveries with others.'
    };
  }

  // High Conscientiousness + High Agreeableness
  if (conscientiousness >= 65 && agreeableness >= 65) {
    return {
      name: 'The Dedicated Harmonizer',
      subtitle: 'Reliable soul who builds meaningful connections',
      description: 'You combine discipline with warmth, creating stability and trust in everything you do.'
    };
  }

  // High Openness + Low Extraversion
  if (openness >= 65 && extraversion < 45) {
    return {
      name: 'The Thoughtful Dreamer',
      subtitle: 'Deep thinker with rich inner worlds',
      description: 'You have a vivid imagination and profound insights, preferring deep conversations to small talk.'
    };
  }

  // High Extraversion + High Agreeableness
  if (extraversion >= 65 && agreeableness >= 65) {
    return {
      name: 'The Social Connector',
      subtitle: 'Natural relationship builder',
      description: 'You light up every room and make others feel valued and included.'
    };
  }

  // High Conscientiousness + Low Neuroticism
  if (conscientiousness >= 65 && neuroticism < 40) {
    return {
      name: 'The Steady Achiever',
      subtitle: 'Calm and focused pursuer of goals',
      description: 'You maintain composure under pressure and consistently deliver on your commitments.'
    };
  }

  // High Openness + High Conscientiousness
  if (openness >= 60 && conscientiousness >= 60) {
    return {
      name: 'The Visionary Builder',
      subtitle: 'Creative mind with execution power',
      description: 'You dream big and have the discipline to turn visions into reality.'
    };
  }

  // High Agreeableness + Low Neuroticism
  if (agreeableness >= 65 && neuroticism < 40) {
    return {
      name: 'The Peaceful Guide',
      subtitle: 'Calm presence who supports others',
      description: 'You provide stability and comfort to those around you, navigating conflict with grace.'
    };
  }

  // Balanced profile
  return {
    name: 'The Balanced Navigator',
    subtitle: 'Versatile spirit adapting to life\'s rhythms',
    description: 'You have a well-rounded personality that adapts to different situations with ease.'
  };
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
          answers: parsed.answers?.map((a: OnboardingAnswer) => ({
            ...a,
            timestamp: new Date(a.timestamp)
          })) || []
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
      const next = Math.min(prev.currentStep + 1, 5) as 1 | 2 | 3 | 4 | 5;
      return { ...prev, currentStep: next };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => {
      const next = Math.max(prev.currentStep - 1, 1) as 1 | 2 | 3 | 4 | 5;
      return { ...prev, currentStep: next };
    });
  }, []);

  const goToStep = useCallback((step: 1 | 2 | 3 | 4 | 5) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const addAnswer = useCallback((answer: Omit<OnboardingAnswer, 'timestamp'>) => {
    setState(prev => ({
      ...prev,
      answers: [
        ...prev.answers.filter(a => a.questionId !== answer.questionId),
        { ...answer, timestamp: new Date() }
      ]
    }));
  }, []);

  const calculateScores = useCallback(() => {
    const scores = calculatePreliminaryScores(state.answers);
    const archetype = determineArchetype(scores);
    setState(prev => ({
      ...prev,
      preliminaryScores: scores,
      archetype
    }));
    return { scores, archetype };
  }, [state.answers]);

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
    addAnswer,
    calculateScores,
    addConnectedPlatform,
    removeConnectedPlatform,
    completeOnboarding,
    resetOnboarding,
    isComplete: state.completedAt !== null,
    progress: {
      questionsAnswered: state.answers.length,
      platformsConnected: state.connectedPlatforms.length,
    }
  };
};
