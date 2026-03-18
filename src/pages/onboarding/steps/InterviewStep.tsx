import React from 'react';
import DeepInterview from '../components/DeepInterview';
import { useAuth } from '../../../contexts/AuthContext';

interface InterviewStepProps {
  onComplete: () => void;
  onSkip: () => void;
}

const InterviewStep: React.FC<InterviewStepProps> = ({ onComplete, onSkip }) => {
  const { user } = useAuth();

  // Build minimal enrichment context from authenticated user
  const enrichmentContext = {
    name: user?.fullName || user?.firstName || undefined,
  };

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex-1 flex flex-col w-full mx-auto px-6 pt-6 pb-4 min-h-0">
        <DeepInterview
          enrichmentContext={enrichmentContext}
          onComplete={() => onComplete()}
          onSkip={onSkip}
        />
      </div>
    </div>
  );
};

export default InterviewStep;
