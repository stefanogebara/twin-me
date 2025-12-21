/**
 * Multi-Step Progress Indicator
 * Purpose: Visual feedback for long-running multi-step operations
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface MultiStepProgressProps {
  steps: Step[];
  currentStepIndex: number;
  stepStatuses?: Record<string, StepStatus>;
  showProgress?: boolean;
  progressValue?: number;
  variant?: 'default' | 'compact';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const MultiStepProgress: React.FC<MultiStepProgressProps> = ({
  steps,
  currentStepIndex,
  stepStatuses = {},
  showProgress = false,
  progressValue = 0,
  variant = 'default',
  orientation = 'vertical',
  className
}) => {
  const getStepStatus = (index: number, stepId: string): StepStatus => {
    if (stepStatuses[stepId]) {
      return stepStatuses[stepId];
    }
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex) return 'active';
    return 'pending';
  };

  const getStepIcon = (status: StepStatus, defaultIcon?: React.ReactNode) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-[hsl(var(--claude-accent))] animate-spin" />;
      case 'error':
        return <Circle className="w-5 h-5 text-red-600" />;
      default:
        return defaultIcon || <Circle className="w-5 h-5 text-[hsl(var(--claude-text-muted))]" />;
    }
  };

  if (variant === 'compact') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-[hsl(var(--claude-text))]">
            Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex]?.title}
          </span>
          <span className="text-[hsl(var(--claude-text-muted))]">
            {Math.round((currentStepIndex / steps.length) * 100)}%
          </span>
        </div>
        <Progress value={(currentStepIndex / steps.length) * 100} className="h-2" />
        {steps[currentStepIndex]?.description && (
          <p className="text-sm text-[hsl(var(--claude-text-muted))]">
            {steps[currentStepIndex].description}
          </p>
        )}
      </div>
    );
  }

  if (orientation === 'horizontal') {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const status = getStepStatus(index, step.id);
            const isLast = index === steps.length - 1;

            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-2 flex-1">
                  {/* Icon */}
                  <div
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all',
                      status === 'completed' && 'bg-green-50 border-green-600',
                      status === 'active' && 'bg-[hsl(var(--claude-accent))]/10 border-[hsl(var(--claude-accent))]',
                      status === 'error' && 'bg-red-50 border-red-600',
                      status === 'pending' && 'bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]'
                    )}
                  >
                    {getStepIcon(status, step.icon)}
                  </div>

                  {/* Label */}
                  <div className="text-center">
                    <p
                      className={cn(
                        'text-sm font-medium transition-colors',
                        status === 'active' && 'text-[hsl(var(--claude-text))]',
                        status === 'completed' && 'text-green-600',
                        status === 'error' && 'text-red-600',
                        status === 'pending' && 'text-[hsl(var(--claude-text-muted))]'
                      )}
                    >
                      {step.title}
                    </p>
                    {step.description && status === 'active' && (
                      <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-1">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Connector Line */}
                {!isLast && (
                  <div className="flex-1 h-0.5 mx-2 mb-8">
                    <div
                      className={cn(
                        'h-full transition-all',
                        index < currentStepIndex ? 'bg-green-600' : 'bg-[hsl(var(--claude-border))]'
                      )}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {showProgress && (
          <Progress value={progressValue} className="h-2" />
        )}
      </div>
    );
  }

  // Vertical orientation (default)
  return (
    <div className={cn('space-y-1', className)}>
      {steps.map((step, index) => {
        const status = getStepStatus(index, step.id);
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="relative">
            <div className="flex items-start gap-4">
              {/* Icon and Connector */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all z-10',
                    status === 'completed' && 'bg-green-50 border-green-600',
                    status === 'active' && 'bg-[hsl(var(--claude-accent))]/10 border-[hsl(var(--claude-accent))]',
                    status === 'error' && 'bg-red-50 border-red-600',
                    status === 'pending' && 'bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]'
                  )}
                >
                  {getStepIcon(status, step.icon)}
                </div>

                {/* Vertical Connector Line */}
                {!isLast && (
                  <div className="w-0.5 h-12 mt-1">
                    <div
                      className={cn(
                        'w-full h-full transition-all',
                        index < currentStepIndex ? 'bg-green-600' : 'bg-[hsl(var(--claude-border))]'
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-8">
                <h4
                  className={cn(
                    'font-medium transition-colors',
                    status === 'active' && 'text-[hsl(var(--claude-text))]',
                    status === 'completed' && 'text-green-600',
                    status === 'error' && 'text-red-600',
                    status === 'pending' && 'text-[hsl(var(--claude-text-muted))]'
                  )}
                >
                  {step.title}
                </h4>
                {step.description && (
                  <p className="text-sm text-[hsl(var(--claude-text-muted))] mt-1">
                    {step.description}
                  </p>
                )}

                {/* Progress bar for active step */}
                {status === 'active' && showProgress && (
                  <Progress value={progressValue} className="h-1.5 mt-3" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Preset configurations for common operations
export const SoulExtractionSteps: Step[] = [
  {
    id: 'connecting',
    title: 'Connecting to Platform',
    description: 'Establishing secure connection...'
  },
  {
    id: 'extracting',
    title: 'Extracting Data',
    description: 'Gathering your digital footprints...'
  },
  {
    id: 'analyzing',
    title: 'Analyzing Patterns',
    description: 'Discovering your unique patterns...'
  },
  {
    id: 'generating',
    title: 'Generating Insights',
    description: 'Creating your soul signature...'
  },
  {
    id: 'complete',
    title: 'Complete',
    description: 'Your soul signature has been updated!'
  }
];

export const OnboardingSteps: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Get started with Twin AI Learn'
  },
  {
    id: 'connect',
    title: 'Connect Platforms',
    description: 'Link your digital life'
  },
  {
    id: 'customize',
    title: 'Customize Privacy',
    description: 'Control what you share'
  },
  {
    id: 'build',
    title: 'Build Your Twin',
    description: 'Create your digital twin'
  },
  {
    id: 'ready',
    title: 'Ready to Go',
    description: 'Start using your twin'
  }
];

export default MultiStepProgress;
