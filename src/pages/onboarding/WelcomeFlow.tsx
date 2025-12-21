import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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
 * PersonalityQuestionnaire Component
 *
 * A beautiful, 16personalities-style onboarding quiz that learns
 * about the user to personalize their music recommendations.
 */

interface WelcomeFlowProps {
  initialStep?: number;
}

const WelcomeFlow: React.FC<WelcomeFlowProps> = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();

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
      console.error('Error skipping questionnaire:', err);
      setError('Failed to skip questionnaire');
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
        style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}
      >
        <div className="text-center">
          <Loader2
            className="w-8 h-8 animate-spin mx-auto mb-4"
            style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }}
          />
          <p style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Loading your personalization quiz...
          </p>
        </div>
      </div>
    );
  }

  if (hasCompleted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}
      >
        <div className="text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Quiz completed! Redirecting...
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
        style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}
      >
        <div className="max-w-lg w-full">
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(231, 229, 228, 0.6)',
              boxShadow: theme === 'dark' ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: theme === 'dark'
                  ? 'linear-gradient(135deg, rgba(193, 192, 182, 0.2), rgba(193, 192, 182, 0.1))'
                  : 'linear-gradient(135deg, rgba(12, 10, 9, 0.1), rgba(12, 10, 9, 0.05))',
                border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(12, 10, 9, 0.1)'
              }}
            >
              <Sparkles className="w-8 h-8" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
            </div>

            <h1
              className="text-2xl font-semibold mb-3"
              style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
            >
              Let's personalize your experience
            </h1>

            <p
              className="mb-6 leading-relaxed"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}
            >
              Answer {questions.length} quick questions so your twin can learn how you work,
              focus, and recharge. This helps us recommend music that truly fits your style.
            </p>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => setShowIntro(false)}
                className="w-full py-6 text-lg rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#FAFAFA'
                }}
              >
                Start Quiz
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>

              <Button
                onClick={handleSkip}
                variant="ghost"
                className="transition-colors"
                style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
                disabled={submitting}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip for now
              </Button>
            </div>

            <p
              className="text-xs mt-4"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
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
      style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}
    >
      {/* Progress header */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-sm"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            Question {currentQuestion + 1} of {questions.length}
          </span>
          <span
            className="text-sm"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            {progress}% complete
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question card */}
      <div className="max-w-2xl mx-auto">
        <div
          className="rounded-2xl p-8"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(231, 229, 228, 0.6)',
            boxShadow: theme === 'dark' ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
          }}
        >
          {/* Category badge */}
          <div className="mb-6">
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(12, 10, 9, 0.05)',
                color: theme === 'dark' ? '#C1C0B6' : '#57534e'
              }}
            >
              {question?.category}
            </span>
          </div>

          {/* Question */}
          <h2
            className="text-xl md:text-2xl font-medium mb-8 leading-relaxed"
            style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
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
                      ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#e7e5e4'),
                    backgroundColor: isSelected
                      ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(12, 10, 9, 0.03)')
                      : (theme === 'dark' ? 'rgba(35, 35, 32, 0.5)' : 'rgba(255, 255, 255, 0.8)'),
                    boxShadow: isSelected ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  <div className="flex items-center gap-3">
                    {option.icon && (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: isSelected
                            ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(12, 10, 9, 0.08)')
                            : (theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)')
                        }}
                      >
                        <OptionIcon
                          iconName={option.icon}
                          className="w-5 h-5"
                          style={{
                            color: isSelected
                              ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                              : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c')
                          }}
                        />
                      </div>
                    )}
                    <span
                      className="font-medium"
                      style={{
                        color: isSelected
                          ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                          : (theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e')
                      }}
                    >
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check
                        className="w-5 h-5 ml-auto"
                        style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
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
            style={{ borderTop: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid #e7e5e4' }}
          >
            <Button
              onClick={handlePrevious}
              variant="ghost"
              disabled={currentQuestion === 0}
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e' }}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {isLastQuestion && allAnswered ? (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-8 transition-all duration-200"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#FAFAFA'
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Complete Quiz
                    <Sparkles className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentQuestion(prev => prev + 1)}
                disabled={!isAnswered || isLastQuestion}
                variant="ghost"
                style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e' }}
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
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}
            >
              Skip questionnaire
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div
            className="mt-4 p-4 rounded-xl text-center"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(254, 242, 242, 0.8)',
              border: theme === 'dark' ? '1px solid rgba(220, 38, 38, 0.2)' : '1px solid #fecaca',
              color: theme === 'dark' ? '#fca5a5' : '#b91c1c'
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
