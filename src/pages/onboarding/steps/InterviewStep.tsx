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
    <div className="min-h-screen bg-[#FAFAFA]">
      <DeepInterview
        enrichmentContext={enrichmentContext}
        onComplete={() => onComplete()}
        onSkip={onSkip}
      />
    </div>
  );
};

export default InterviewStep;
