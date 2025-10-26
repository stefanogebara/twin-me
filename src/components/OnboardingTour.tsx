import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Shield,
  Brain,
  Users,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  action?: () => void;
  actionText?: string;
  targetElement?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface OnboardingTourProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  onComplete,
  onSkip
}) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [hasSeenTour, setHasSeenTour] = useState(false);

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Your Soul Signature Journey! 🎯',
      description: 'Twin Me helps you discover and share your authentic digital identity. We\'ll create a digital twin that captures not just what you do, but who you truly are.',
      icon: Brain,
    },
    {
      id: 'connect-platforms',
      title: 'Connect Your Digital Universe',
      description: 'Start by connecting platforms that reveal your authentic self - from Spotify and Netflix to GitHub and Discord. Each connection adds depth to your soul signature.',
      icon: Sparkles,
      actionText: 'Connect First Platform',
      targetElement: 'connect-platforms-section'
    },
    {
      id: 'privacy-control',
      title: 'You Control Every Detail',
      description: 'Our revolutionary privacy controls let you decide exactly what to reveal and to whom. Use intensity sliders to share as much or as little as you want.',
      icon: Shield,
      actionText: 'Explore Privacy Settings',
      targetElement: 'privacy-settings'
    },
    {
      id: 'soul-signature',
      title: 'Discover Your Soul Signature',
      description: 'We analyze your digital footprints to find patterns you didn\'t know existed - your curiosities, characteristic behaviors, and what makes you uniquely you.',
      icon: Users,
      actionText: 'View Dashboard',
      action: () => navigate('/dashboard')
    },
    {
      id: 'create-twin',
      title: 'Create Your Digital Twin',
      description: 'Once we\'ve gathered enough data, you can create different twins for different contexts - professional, social, dating, or educational.',
      icon: Brain,
      actionText: 'Start Creating',
      targetElement: 'create-twin-button'
    }
  ];

  useEffect(() => {
    // Check if user has seen the tour
    const tourSeen = localStorage.getItem('onboarding_tour_completed');
    if (tourSeen) {
      setHasSeenTour(true);
      setIsVisible(false);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      highlightElement(steps[currentStep + 1].targetElement);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      highlightElement(steps[currentStep - 1].targetElement);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('onboarding_tour_completed', 'true');
    setIsVisible(false);
    removeHighlights();
    if (onComplete) {
      onComplete();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_tour_skipped', 'true');
    setIsVisible(false);
    removeHighlights();
    if (onSkip) {
      onSkip();
    }
  };

  const highlightElement = (elementId?: string) => {
    // Remove previous highlights
    removeHighlights();

    if (!elementId) return;

    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('onboarding-highlight');

      // Add pulsing animation
      element.style.animation = 'pulse 2s infinite';
    }
  };

  const removeHighlights = () => {
    const highlighted = document.querySelectorAll('.onboarding-highlight');
    highlighted.forEach(el => {
      el.classList.remove('onboarding-highlight');
      (el as HTMLElement).style.animation = '';
    });
  };

  const handleAction = () => {
    const step = steps[currentStep];
    if (step.action) {
      step.action();
    } else if (step.targetElement) {
      const element = document.getElementById(step.targetElement);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.click();
      }
    }
    handleNext();
  };

  const restartTour = () => {
    localStorage.removeItem('onboarding_tour_completed');
    localStorage.removeItem('onboarding_tour_skipped');
    setCurrentStep(0);
    setIsVisible(true);
    setHasSeenTour(false);
    highlightElement(steps[0].targetElement);
  };

  if (!isVisible && !hasSeenTour) return null;

  const CurrentIcon = steps[currentStep].icon;

  return (
    <>
      {/* Restart Tour Button - Always visible if tour was completed/skipped */}
      {hasSeenTour && !isVisible && (
        <button
          onClick={restartTour}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-[#D97706] text-white rounded-lg hover:bg-[#B45309] transition-colors shadow-lg"
          title="Restart the onboarding tour"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">Restart Tour</span>
        </button>
      )}

      {/* Main Tour Modal */}
      {isVisible && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />

          {/* Tour Card */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg">
            <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
              {/* Progress Bar */}
              <div className="h-2 bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-[#D97706] to-[#FFA500] transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                />
              </div>

              {/* Content */}
              <div className="p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#D97706]/10 flex items-center justify-center">
                      <CurrentIcon className="w-6 h-6 text-[#D97706]" />
                    </div>
                    <div className="text-sm text-muted-foreground font-medium">
                      Step {currentStep + 1} of {steps.length}
                    </div>
                  </div>
                  <button
                    onClick={handleSkip}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Skip tour"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-semibold text-foreground mb-3">
                  {steps[currentStep].title}
                </h2>

                {/* Description */}
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  {steps[currentStep].description}
                </p>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  {/* Navigation */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevious}
                      disabled={currentStep === 0}
                      className={`p-2 rounded-lg border transition-colors ${
                        currentStep === 0
                          ? 'border-border text-muted-foreground cursor-not-allowed'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {/* Step Indicators */}
                    <div className="flex items-center gap-1 px-2">
                      {steps.map((_, index) => (
                        <div
                          key={index}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            index === currentStep
                              ? 'bg-[#D97706] w-6'
                              : index < currentStep
                              ? 'bg-[#D97706]/50'
                              : 'bg-muted-foreground/30'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      onClick={handleNext}
                      disabled={currentStep === steps.length - 1}
                      className={`p-2 rounded-lg border transition-colors ${
                        currentStep === steps.length - 1
                          ? 'border-border text-muted-foreground cursor-not-allowed'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-3">
                    {steps[currentStep].actionText && (
                      <button
                        onClick={handleAction}
                        className="flex items-center gap-2 px-4 py-2 bg-[#D97706] text-white rounded-lg hover:bg-[#B45309] transition-colors"
                      >
                        <span>{steps[currentStep].actionText}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}

                    {currentStep === steps.length - 1 && (
                      <button
                        onClick={handleComplete}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Complete Tour</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Global styles for highlights */}
      <style>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(217, 119, 6, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(217, 119, 6, 0);
          }
        }

        .onboarding-highlight {
          position: relative;
          box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.3);
          border-radius: 0.5rem;
          z-index: 30;
        }
      `}</style>
    </>
  );
};

export default OnboardingTour;