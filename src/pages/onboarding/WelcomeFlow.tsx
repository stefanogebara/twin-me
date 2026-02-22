import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { onboardingAPI, OnboardingQuestion, OnboardingAnswers } from '@/services/apiService';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  SkipForward,
  Loader2,
  // Icons for question options
  Sunrise,
  Coffee,
  Moon,
  MoonStar,
  Sun,
  SunDim,
  VolumeX,
  Headphones,
  Disc3,
  Music,
  Target,
  Scale,
  Brain,
  Leaf,
  Dumbbell,
  Smartphone,
  Users,
  CloudRain,
  Rainbow,
  Layers,
  Minus,
  Zap,
  Smile,
  BatteryLow,
  HelpCircle,
  Search,
  Home,
  Gift,
  Flame,
  Activity,
  Mic,
  Armchair,
  Rocket,
  Wind,
  ClipboardList,
  Gamepad2,
  LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Icon mapping for dynamic rendering
const iconMap: Record<string, LucideIcon> = {
  Sunrise,
  Coffee,
  Moon,
  MoonStar,
  Sun,
  SunDim,
  VolumeX,
  Headphones,
  Disc3,
  Music,
  Target,
  Scale,
  Sparkles,
  Brain,
  Leaf,
  Dumbbell,
  Smartphone,
  Users,
  CloudRain,
  Rainbow,
  Layers,
  Minus,
  Zap,
  Smile,
  BatteryLow,
  HelpCircle,
  Search,
  Home,
  Gift,
  Flame,
  Activity,
  Mic,
  Armchair,
  Rocket,
  Wind,
  ClipboardList,
  Gamepad2
};

// Component to render icon by name
const OptionIcon: React.FC<{ iconName?: string; className?: string; style?: React.CSSProperties }> = ({
  iconName,
  className = "w-5 h-5",
  style
}) => {
  if (!iconName) return null;
  const IconComponent = iconMap[iconName];
  if (!IconComponent) return null;
  return <IconComponent className={className} style={style} />;
};

/**
 * PersonalityAssessment Component
 *
 * A beautiful, 16personalities-style onboarding assessment that learns
 * about the user to personalize their music recommendations.
 */

interface WelcomeFlowProps {
  initialStep?: number;
}

const WelcomeFlow: React.FC<WelcomeFlowProps> = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch questions and status on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Get questions and existing answers in parallel
        const [questionsData, answersData] = await Promise.all([
          onboardingAPI.getQuestions(),
          onboardingAPI.getAnswers()
        ]);

        setQuestions(questionsData.questions);

        if (answersData.hasCompleted) {
          setHasCompleted(true);
          // Redirect to dashboard if already completed
          navigate('/dashboard');
          return;
        }

        // Restore any existing answers
        if (answersData.answers && Object.keys(answersData.answers).length > 0) {
          setAnswers(answersData.answers);
          // Find the first unanswered question
          const firstUnanswered = questionsData.questions.findIndex(
            q => !answersData.answers[q.id]
          );
          if (firstUnanswered > 0) {
            setCurrentQuestion(firstUnanswered);
            setShowIntro(false);
          }
        }
      } catch (err) {
        console.error('Error fetching onboarding data:', err);
        setError('Failed to load questions');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleAnswer = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));

    // Auto-advance after a brief delay for visual feedback
    setTimeout(() => {
      if (currentQuestion < questions.length - 1) {
        setCurrentQuestion(prev => prev + 1);
      }
    }, 300);
  }, [currentQuestion, questions.length]);

  const handlePrevious = useCallback(() => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  }, [currentQuestion]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await onboardingAPI.saveAnswers(answers);

      // Show success state briefly then redirect
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      console.error('Error saving answers:', err);
      setError('Failed to save your answers');
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      setSubmitting(true);
      await onboardingAPI.skip();
      navigate('/dashboard');
    } catch (err) {
      console.error('Error skipping assessment:', err);
      setError('Failed to skip assessment');
      setSubmitting(false);
    }
  };

  const progress = questions.length > 0
    ? Math.round((Object.keys(answers).length / questions.length) * 100)
    : 0;

  const allAnswered = questions.length > 0 && Object.keys(answers).length === questions.length;

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#F7F7F3' }}
      >
        <div className="text-center">
          <Loader2
            className="w-8 h-8 animate-spin mx-auto mb-4"
            style={{ color: '#8A857D' }}
          />
          <p style={{ color: '#8A857D' }}>
            Loading your personalization assessment...
          </p>
        </div>
      </div>
    );
  }

  if (hasCompleted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#F7F7F3' }}
      >
        <div className="text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p style={{ color: '#8A857D' }}>
            Assessment completed! Redirecting...
          </p>
        </div>
      </div>
    );
  }

  // Intro screen
  if (showIntro) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: '#F7F7F3' }}
      >
        <div className="max-w-lg w-full">
          <div className="glass-card p-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(12, 10, 9, 0.1), rgba(12, 10, 9, 0.05))',
                border: '1px solid rgba(12, 10, 9, 0.1)'
              }}
            >
              <Sparkles className="w-8 h-8" style={{ color: '#1F1C18' }} />
            </div>

            <h1
              className="heading-serif text-2xl font-semibold mb-3"
            >
              Let's personalize your experience
            </h1>

            <p
              className="mb-6 leading-relaxed"
              style={{ color: '#8A857D' }}
            >
              Answer {questions.length} quick questions so your twin can learn how you work,
              focus, and recharge. This helps us recommend music that truly fits your style.
            </p>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => setShowIntro(false)}
                className="btn-cta-app w-full py-6 text-lg rounded-xl transition-all duration-200"
              >
                Start Assessment
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>

              <Button
                onClick={handleSkip}
                variant="ghost"
                className="transition-colors"
                style={{ color: '#8A857D' }}
                disabled={submitting}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip for now
              </Button>
            </div>

            <p
              className="text-xs mt-4"
              style={{ color: '#8A857D' }}
            >
              Takes about 2 minutes
            </p>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const isAnswered = question && answers[question.id];
  const isLastQuestion = currentQuestion === questions.length - 1;

  return (
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: '#F7F7F3' }}
    >
      {/* Progress header */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-sm"
            style={{ color: '#8A857D' }}
          >
            Question {currentQuestion + 1} of {questions.length}
          </span>
          <span
            className="text-sm"
            style={{ color: '#8A857D' }}
          >
            {progress}% complete
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question card */}
      <div className="max-w-2xl mx-auto">
        <div className="glass-card p-8">
          {/* Category badge */}
          <div className="mb-6">
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'rgba(12, 10, 9, 0.05)',
                color: '#8A857D'
              }}
            >
              {question?.category}
            </span>
          </div>

          {/* Question */}
          <h2
            className="heading-serif text-xl md:text-2xl mb-8 leading-relaxed"
          >
            {question?.question}
          </h2>

          {/* Options */}
          <div className="space-y-3">
            {question?.options.map((option) => {
              const isSelected = answers[question.id] === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(question.id, option.value)}
                  className="w-full text-left p-4 rounded-xl border-2 transition-all duration-200"
                  style={{
                    borderColor: isSelected
                      ? '#1F1C18'
                      : '#e7e5e4',
                    backgroundColor: isSelected
                      ? 'rgba(12, 10, 9, 0.03)'
                      : 'rgba(255, 255, 255, 0.8)',
                    boxShadow: isSelected ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  <div className="flex items-center gap-3">
                    {option.icon && (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: isSelected
                            ? 'rgba(12, 10, 9, 0.08)'
                            : 'rgba(12, 10, 9, 0.04)'
                        }}
                      >
                        <OptionIcon
                          iconName={option.icon}
                          className="w-5 h-5"
                          style={{
                            color: isSelected ? '#1F1C18' : '#8A857D'
                          }}
                        />
                      </div>
                    )}
                    <span
                      className="font-medium"
                      style={{
                        color: isSelected ? '#1F1C18' : '#8A857D'
                      }}
                    >
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check
                        className="w-5 h-5 ml-auto"
                        style={{ color: '#1F1C18' }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Navigation */}
          <div
            className="flex items-center justify-between mt-8 pt-6"
            style={{ borderTop: '1px solid rgba(0, 0, 0, 0.08)' }}
          >
            <Button
              onClick={handlePrevious}
              variant="ghost"
              disabled={currentQuestion === 0}
              style={{ color: '#8A857D' }}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {isLastQuestion && allAnswered ? (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-cta-app px-8 transition-all duration-200"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Complete Assessment
                    <Sparkles className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentQuestion(prev => prev + 1)}
                disabled={!isAnswered || isLastQuestion}
                variant="ghost"
                style={{ color: '#8A857D' }}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Skip link */}
          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              disabled={submitting}
              className="text-xs transition-colors"
              style={{ color: '#8A857D' }}
            >
              Skip assessment
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div
            className="mt-4 p-4 rounded-xl text-center"
            style={{
              backgroundColor: 'rgba(254, 242, 242, 0.8)',
              border: '1px solid #fecaca',
              color: '#b91c1c'
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomeFlow;
