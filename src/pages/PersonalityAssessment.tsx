/**
 * PersonalityAssessment - 16personalities-style MBTI assessment page
 *
 * 5 dimensions: Mind (I/E), Energy (S/N), Nature (T/F), Tactics (J/P), Identity (A/T)
 * Matches the platform's warm grey design language with proper theming.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PersonalityQuestionCard } from '@/components/PersonalityQuestionCard';
import {
  DEMO_MBTI_QUESTIONS,
  generateDemoPersonalityResult
} from '@/services/demoDataService';
import { AssessmentIntro } from '@/pages/components/personality/AssessmentIntro';
import { QuickPulseResults } from '@/pages/components/personality/QuickPulseResults';
import { FullAssessmentResults } from '@/pages/components/personality/FullAssessmentResults';

interface Question {
  id: string;
  dimension: string;
  facet: string;
  question: string;
  order: number;
}

interface PersonalityScores {
  extraversion: number;
  openness: number;
  conscientiousness: number;
  agreeableness: number;
  neuroticism: number;
}

interface AssessmentResult {
  scores: PersonalityScores;
  archetype: {
    code: string;
    fullCode?: string;
    name: string;
    title: string;
    description: string;
    identity?: string;
    identityLabel?: string;
  };
  insights: {
    strengths: string[];
    growthAreas: string[];
    summary: string;
  };
  questionsAnswered: number;
  totalQuestions: number;
  completionPercentage: number;
}

type AssessmentMode = 'quick_pulse' | 'deep' | 'full';
type AssessmentPhase = 'intro' | 'questions' | 'calculating' | 'results' | 'deep-prompt';

// Personality type color palettes (inspired by 16personalities)
const TYPE_COLORS: Record<string, { primary: string; secondary: string }> = {
  // Analysts - Purple
  INTJ: { primary: '#88619A', secondary: '#9B6FA8' },
  INTP: { primary: '#88619A', secondary: '#9B6FA8' },
  ENTJ: { primary: '#88619A', secondary: '#9B6FA8' },
  ENTP: { primary: '#88619A', secondary: '#9B6FA8' },
  // Diplomats - Green
  INFJ: { primary: '#33A474', secondary: '#4DB88A' },
  INFP: { primary: '#33A474', secondary: '#4DB88A' },
  ENFJ: { primary: '#33A474', secondary: '#4DB88A' },
  ENFP: { primary: '#33A474', secondary: '#4DB88A' },
  // Sentinels - Blue
  ISTJ: { primary: '#4298B5', secondary: '#5AACCA' },
  ISFJ: { primary: '#4298B5', secondary: '#5AACCA' },
  ESTJ: { primary: '#4298B5', secondary: '#5AACCA' },
  ESFJ: { primary: '#4298B5', secondary: '#5AACCA' },
  // Explorers - Yellow/Orange
  ISTP: { primary: '#DDA448', secondary: '#E5B86D' },
  ISFP: { primary: '#DDA448', secondary: '#E5B86D' },
  ESTP: { primary: '#DDA448', secondary: '#E5B86D' },
  ESFP: { primary: '#DDA448', secondary: '#E5B86D' },
};

function getTypeColor(code: string): { primary: string; secondary: string } {
  const baseType = code?.replace(/-[AT]$/, '').toUpperCase() || '';
  return TYPE_COLORS[baseType] || { primary: '#C1C0B6', secondary: '#A8A79E' };
}

export function PersonalityAssessment() {
  const { token } = useAuth();
  const { theme } = useTheme();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<AssessmentPhase>('intro');
  const [mode, setMode] = useState<AssessmentMode>('quick_pulse');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Map<string, number>>(new Map());
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme-aware colors
  const colors = {
    bg: theme === 'dark' ? '#1a1a18' : '#fafaf9',
    cardBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.9)',
    border: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
    accent: theme === 'dark' ? '#C1C0B6' : '#44403c',
    accentBg: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(68, 64, 60, 0.1)',
  };

  // Fetch questions based on mode
  const fetchQuestions = useCallback(async (assessmentMode: AssessmentMode) => {
    if (isDemoMode) {
      setLoading(true);
      setTimeout(() => {
        setQuestions(DEMO_MBTI_QUESTIONS);
        setLoading(false);
      }, 500);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');

    if (!authToken) {
      setError('Authentication required. Please refresh the page.');
      return;
    }

    setLoading(true);
    setError(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';
    try {
      const response = await fetch(
        `${API_URL}/personality/questions?mode=${assessmentMode}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch questions: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setQuestions(data.questions);
      } else {
        throw new Error(data.error || 'Failed to load questions');
      }
    } catch (err) {
      console.error('[PersonalityAssessment] Error fetching questions:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, isDemoMode]);

  // Submit responses
  const submitResponses = async () => {
    setPhase('calculating');

    if (isDemoMode) {
      setTimeout(() => {
        const demoResult = generateDemoPersonalityResult(responses);
        setResult(demoResult);
        setPhase(mode === 'quick_pulse' ? 'deep-prompt' : 'results');
      }, 1500);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Authentication required');
      setPhase('questions');
      return;
    }

    try {
      const responsesArray = Array.from(responses.entries()).map(([question_id, value]) => ({
        question_id,
        value,
      }));

      const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';
      const response = await fetch(`${API_URL}/personality/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ responses: responsesArray }),
      });

      if (!response.ok) throw new Error('Failed to submit responses');

      const data = await response.json();
      if (data.success) {
        setResult({
          scores: data.scores,
          archetype: data.archetype,
          insights: data.insights,
          questionsAnswered: data.questionsAnswered,
          totalQuestions: data.totalQuestions,
          completionPercentage: data.completionPercentage,
        });
        setPhase(mode === 'quick_pulse' ? 'deep-prompt' : 'results');
      } else {
        throw new Error(data.error || 'Failed to process responses');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPhase('questions');
    }
  };

  const handleAnswer = (questionId: string, value: number) => {
    setResponses((prev) => new Map(prev).set(questionId, value));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      submitResponses();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const startAssessment = (assessmentMode: AssessmentMode) => {
    setMode(assessmentMode);
    setPhase('questions');
    fetchQuestions(assessmentMode);
  };

  const continueDeepAssessment = () => {
    setMode('deep');
    setCurrentIndex(0);
    setPhase('questions');
    fetchQuestions('deep');
  };

  const currentQuestion = questions[currentIndex];

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: colors.bg }}
    >
      <div className="max-w-4xl mx-auto">

        <AnimatePresence mode="wait">
          {phase === 'intro' && (
            <AssessmentIntro
              colors={colors}
              onStartAssessment={startAssessment}
            />
          )}

          {phase === 'questions' && (
            <motion.div
              key="questions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: colors.accent }} />
                  <p style={{ color: colors.textSecondary }}>Loading questions...</p>
                </div>
              ) : error ? (
                <div className="text-center py-20">
                  <p className="text-red-400 mb-4">{error}</p>
                  <button
                    onClick={() => fetchQuestions(mode)}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: colors.cardBg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    Try Again
                  </button>
                </div>
              ) : currentQuestion ? (
                <PersonalityQuestionCard
                  key={currentQuestion.id}
                  questionId={currentQuestion.id}
                  questionNumber={currentIndex + 1}
                  totalQuestions={questions.length}
                  questionText={currentQuestion.question}
                  dimension={currentQuestion.dimension}
                  selectedValue={responses.get(currentQuestion.id) ?? null}
                  onAnswer={handleAnswer}
                  onNext={handleNext}
                  onPrevious={handlePrevious}
                  isFirst={currentIndex === 0}
                  isLast={currentIndex === questions.length - 1}
                />
              ) : null}
            </motion.div>
          )}

          {phase === 'calculating' && (
            <motion.div
              key="calculating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="relative mb-6">
                <div
                  className="p-6 rounded-full"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <div className="animate-pulse"><Clay3DIcon name="brain" size={48} /></div>
                </div>
              </div>
              <h2 className="text-2xl mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                Analyzing Your Responses
              </h2>
              <p style={{ color: colors.textSecondary }}>
                Mapping your unique personality signature...
              </p>
            </motion.div>
          )}

          {phase === 'deep-prompt' && result && (
            <QuickPulseResults
              result={result}
              theme={theme}
              colors={colors}
              typeColor={getTypeColor(result.archetype.code)}
              onSeeFullResults={() => setPhase('results')}
              onContinueDeep={continueDeepAssessment}
            />
          )}

          {phase === 'results' && result && (
            <FullAssessmentResults
              result={result}
              theme={theme}
              colors={colors}
              onContinueDeep={continueDeepAssessment}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default PersonalityAssessment;
