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
    <div className="h-screen flex flex-col" >
      <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto px-6 py-10 min-h-0">
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
