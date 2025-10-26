import React from 'react';
import { CheckCircle, Circle, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'locked';
  path?: string;
}

interface OnboardingProgressProps {
  currentStepId?: string;
  connectedPlatforms?: number;
  hasCreatedTwin?: boolean;
  hasSetPrivacy?: boolean;
  className?: string;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  currentStepId = 'connect',
  connectedPlatforms = 0,
  hasCreatedTwin = false,
  hasSetPrivacy = false,
  className = ''
}) => {
  const navigate = useNavigate();

  // Dynamic step status based on actual progress
  const steps: OnboardingStep[] = [
    {
      id: 'connect',
      title: 'Connect Platforms',
      description: `${connectedPlatforms > 0 ? `${connectedPlatforms} connected` : 'Connect your first platform'}`,
      status: connectedPlatforms >= 3 ? 'completed' :
              connectedPlatforms > 0 ? 'current' :
              currentStepId === 'connect' ? 'current' : 'locked',
      path: '/get-started'
    },
    {
      id: 'privacy',
      title: 'Set Privacy Controls',
      description: 'Configure what to reveal',
      status: hasSetPrivacy ? 'completed' :
              connectedPlatforms > 0 ? 'current' : 'locked',
      path: '/privacy-settings'
    },
    {
      id: 'soul',
      title: 'Discover Soul Signature',
      description: 'View your insights',
      status: connectedPlatforms >= 3 ? 'current' : 'locked',
      path: '/soul-signature'
    },
    {
      id: 'twin',
      title: 'Create Your Twin',
      description: hasCreatedTwin ? 'Twin created' : 'Build your digital twin',
      status: hasCreatedTwin ? 'completed' :
              connectedPlatforms >= 3 ? 'current' : 'locked',
      path: '/talk-to-twin'
    }
  ];

  const handleStepClick = (step: OnboardingStep) => {
    if (step.status !== 'locked' && step.path) {
      navigate(step.path);
    }
  };

  const getCompletionPercentage = () => {
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    return (completedSteps / steps.length) * 100;
  };

  return (
    <div className={`bg-card border border-border rounded-2xl p-6 ${className}`}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-foreground">
            Getting Started Progress
          </h3>
          <span className="text-sm text-muted-foreground">
            {Math.round(getCompletionPercentage())}% Complete
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#D97706] to-[#FFA500] transition-all duration-500"
            style={{ width: `${getCompletionPercentage()}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            onClick={() => handleStepClick(step)}
            className={`
              flex items-center gap-3 p-3 rounded-lg transition-all duration-200
              ${step.status === 'locked'
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer hover:bg-muted'
              }
              ${step.status === 'current' ? 'bg-[#D97706]/5 border border-[#D97706]/20' : ''}
            `}
          >
            {/* Step Icon */}
            <div className="flex-shrink-0">
              {step.status === 'completed' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : step.status === 'current' ? (
                <div className="relative">
                  <Circle className="w-6 h-6 text-[#D97706]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#D97706] rounded-full animate-pulse" />
                  </div>
                </div>
              ) : (
                <Lock className="w-5 h-5 text-gray-400" />
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-medium ${
                  step.status === 'completed' ? 'text-muted-foreground' :
                  step.status === 'current' ? 'text-foreground' :
                  'text-muted-foreground/50'
                }`}>
                  {step.title}
                </h4>
                {step.status === 'current' && (
                  <span className="text-xs px-2 py-0.5 bg-[#D97706]/10 text-[#D97706] rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${
                step.status === 'locked' ? 'text-muted-foreground/50' : 'text-muted-foreground'
              }`}>
                {step.description}
              </p>
            </div>

            {/* Step Number */}
            <div className={`
              flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
              ${step.status === 'completed' ? 'bg-green-100 text-green-600' :
                step.status === 'current' ? 'bg-[#D97706]/10 text-[#D97706]' :
                'bg-muted text-muted-foreground'
              }
            `}>
              {index + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Call to Action */}
      {getCompletionPercentage() < 100 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">
            💡 Complete all steps to unlock your full soul signature
          </p>
          {steps.find(s => s.status === 'current') && (
            <button
              onClick={() => {
                const currentStep = steps.find(s => s.status === 'current');
                if (currentStep?.path) {
                  navigate(currentStep.path);
                }
              }}
              className="w-full py-2 px-4 bg-[#D97706] text-white rounded-lg text-sm font-medium hover:bg-[#B45309] transition-colors"
            >
              Continue Setup →
            </button>
          )}
        </div>
      )}

      {/* Completion Message */}
      {getCompletionPercentage() === 100 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Setup Complete!</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Your digital twin is ready to interact
          </p>
        </div>
      )}
    </div>
  );
};

export default OnboardingProgress;