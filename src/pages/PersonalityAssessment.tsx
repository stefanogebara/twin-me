/**
 * PersonalityAssessment - 16personalities-style Big Five assessment page
 *
 * Matches the platform's warm grey design language with proper theming.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, ChevronRight, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { PersonalityQuestionCard } from '@/components/PersonalityQuestionCard';

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
    name: string;
    title: string;
    description: string;
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

export function PersonalityAssessment() {
  const { token } = useAuth();
  const { theme } = useTheme();
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
    const authToken = token || localStorage.getItem('auth_token');

    if (!authToken) {
      console.log('[PersonalityAssessment] No token available');
      setError('Authentication required. Please refresh the page.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[PersonalityAssessment] Fetching questions with mode:', assessmentMode);
      const response = await fetch(
        `http://localhost:3001/api/personality/questions?mode=${assessmentMode}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch questions: ${response.status}`);
      }

      const data = await response.json();
      console.log('[PersonalityAssessment] Received questions:', data.questions?.length);
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
  }, [token]);

  // Submit responses
  const submitResponses = async () => {
    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) return;

    setPhase('calculating');

    try {
      const responsesArray = Array.from(responses.entries()).map(([question_id, value]) => ({
        question_id,
        value,
      }));

      console.log('[PersonalityAssessment] Submitting', responsesArray.length, 'responses');
      const response = await fetch('http://localhost:3001/api/personality/responses', {
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

  // Handle answer selection
  const handleAnswer = (questionId: string, value: number) => {
    setResponses((prev) => new Map(prev).set(questionId, value));
  };

  // Navigation
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

  // Start assessment
  const startAssessment = (assessmentMode: AssessmentMode) => {
    setMode(assessmentMode);
    setPhase('questions');
    fetchQuestions(assessmentMode);
  };

  // Continue with deep assessment
  const continueDeepAssessment = () => {
    setMode('deep');
    setCurrentIndex(0);
    setPhase('questions');
    fetchQuestions('deep');
  };

  // Current question
  const currentQuestion = questions[currentIndex];

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: colors.bg }}
    >
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {/* Intro Phase */}
          {phase === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="flex justify-center mb-6">
                <div
                  className="p-4 rounded-2xl"
                  style={{
                    backgroundColor: colors.accentBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <Brain className="w-12 h-12" style={{ color: colors.accent }} />
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: colors.text }}>
                Discover Your Soul Signature
              </h1>

              <p className="text-lg max-w-xl mx-auto mb-8" style={{ color: colors.textSecondary }}>
                Answer questions honestly to uncover your unique personality archetype.
                There are no right or wrong answers - just be yourself.
              </p>

              <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {/* Quick Pulse */}
                <button
                  onClick={() => startAssessment('quick_pulse')}
                  className="group p-6 rounded-2xl transition-all text-left hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className="w-5 h-5" style={{ color: colors.accent }} />
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: colors.accent }}
                    >
                      Quick Pulse
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
                    2-minute snapshot
                  </h3>
                  <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                    12 key questions for a quick personality profile. Perfect for getting started.
                  </p>
                  <div
                    className="flex items-center text-sm transition-colors"
                    style={{ color: colors.textSecondary }}
                  >
                    Start now <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </button>

                {/* Full Assessment */}
                <button
                  onClick={() => startAssessment('full')}
                  className="group p-6 rounded-2xl transition-all text-left hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Brain className="w-5 h-5" style={{ color: colors.accent }} />
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: colors.accent }}
                    >
                      Deep Dive
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
                    10-minute complete profile
                  </h3>
                  <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                    60 comprehensive questions for the most accurate personality insights.
                  </p>
                  <div
                    className="flex items-center text-sm transition-colors"
                    style={{ color: colors.textSecondary }}
                  >
                    Start now <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {/* Questions Phase */}
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
                  questionId={currentQuestion.id}
                  questionNumber={currentIndex + 1}
                  totalQuestions={questions.length}
                  questionText={currentQuestion.question}
                  dimension={currentQuestion.dimension}
                  selectedValue={responses.get(currentQuestion.id) || null}
                  onAnswer={handleAnswer}
                  onNext={handleNext}
                  onPrevious={handlePrevious}
                  isFirst={currentIndex === 0}
                  isLast={currentIndex === questions.length - 1}
                />
              ) : null}
            </motion.div>
          )}

          {/* Calculating Phase */}
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
                  <Brain className="w-12 h-12 animate-pulse" style={{ color: colors.accent }} />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>
                Analyzing Your Responses
              </h2>
              <p style={{ color: colors.textSecondary }}>
                Mapping your unique personality signature...
              </p>
            </motion.div>
          )}

          {/* Deep Prompt Phase */}
          {phase === 'deep-prompt' && result && (
            <motion.div
              key="deep-prompt"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              {/* Quick result preview */}
              <div className="mb-8">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4"
                  style={{
                    backgroundColor: colors.accentBg,
                    color: colors.accent
                  }}
                >
                  <Check className="w-4 h-4" />
                  Quick Pulse Complete
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: colors.text }}>
                  You're an <span style={{ color: colors.accent }}>{result.archetype.code}</span>
                </h2>
                <p style={{ color: colors.textSecondary }}>{result.archetype.title}</p>
              </div>

              {/* Continue prompt */}
              <div
                className="rounded-2xl p-8 max-w-xl mx-auto mb-8"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
                  Want a more accurate profile?
                </h3>
                <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
                  Complete 48 additional questions to refine your results and unlock deeper insights
                  about your personality facets.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={continueDeepAssessment}
                    className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                    style={{
                      backgroundColor: colors.accent,
                      color: theme === 'dark' ? '#1a1a18' : '#fff'
                    }}
                  >
                    Continue Deep Assessment
                  </button>
                  <button
                    onClick={() => setPhase('results')}
                    className="px-6 py-3 rounded-xl font-medium transition-all"
                    style={{
                      backgroundColor: colors.accentBg,
                      color: colors.text
                    }}
                  >
                    View Results Now
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Results Phase */}
          {phase === 'results' && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Archetype header */}
              <div className="text-center mb-8">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4"
                  style={{
                    backgroundColor: colors.accentBg,
                    color: colors.accent
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  Your Soul Signature
                </div>
                <h1 className="text-4xl md:text-5xl font-bold mb-2" style={{ color: colors.text }}>
                  {result.archetype.code}
                </h1>
                <h2 className="text-xl mb-2" style={{ color: colors.accent }}>
                  {result.archetype.name}
                </h2>
                <p className="italic" style={{ color: colors.textSecondary }}>
                  {result.archetype.title}
                </p>
              </div>

              {/* Description */}
              <div
                className="rounded-2xl p-6 mb-6"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <p className="leading-relaxed" style={{ color: colors.text }}>
                  {result.archetype.description}
                </p>
              </div>

              {/* Big Five Scores */}
              <div
                className="rounded-2xl p-6 mb-6"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <h3 className="text-lg font-semibold mb-4" style={{ color: colors.text }}>
                  Your Big Five Profile
                </h3>
                <div className="space-y-4">
                  {Object.entries(result.scores || {})
                    .filter(([dimension]) => !dimension.endsWith('_ci')) // Filter out confidence intervals
                    .map(([dimension, score]) => (
                      <DimensionBar key={dimension} dimension={dimension} score={score as number} colors={colors} />
                    ))}
                </div>
              </div>

              {/* Insights */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {/* Strengths */}
                <div
                  className="rounded-2xl p-6"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <h3 className="text-lg font-semibold mb-3" style={{ color: '#22c55e' }}>
                    Strengths
                  </h3>
                  <ul className="space-y-2">
                    {(result.insights?.strengths || []).map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.text }}>
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Growth Areas */}
                <div
                  className="rounded-2xl p-6"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <h3 className="text-lg font-semibold mb-3" style={{ color: '#f59e0b' }}>
                    Growth Areas
                  </h3>
                  <ul className="space-y-2">
                    {(result.insights?.growthAreas || []).map((area, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.text }}>
                        <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Completion info */}
              <div className="text-center text-sm mb-8" style={{ color: colors.textSecondary }}>
                Based on {result.questionsAnswered} of {result.totalQuestions} questions ({result.completionPercentage}% complete)
              </div>

              {/* Actions */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.accent,
                    color: theme === 'dark' ? '#1a1a18' : '#fff'
                  }}
                >
                  Continue to Dashboard
                </button>
                {result.completionPercentage < 100 && (
                  <button
                    onClick={continueDeepAssessment}
                    className="px-6 py-3 rounded-xl font-medium transition-all"
                    style={{
                      backgroundColor: colors.accentBg,
                      color: colors.text
                    }}
                  >
                    Refine Results
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Dimension bar component
function DimensionBar({ dimension, score, colors }: { dimension: string; score: number; colors: Record<string, string> }) {
  const labels: Record<string, { name: string; low: string; high: string }> = {
    extraversion: { name: 'Extraversion', low: 'Introvert', high: 'Extravert' },
    openness: { name: 'Openness', low: 'Practical', high: 'Imaginative' },
    conscientiousness: { name: 'Conscientiousness', low: 'Flexible', high: 'Organized' },
    agreeableness: { name: 'Agreeableness', low: 'Analytical', high: 'Empathetic' },
    neuroticism: { name: 'Emotional Reactivity', low: 'Calm', high: 'Sensitive' },
  };

  const info = labels[dimension] || { name: dimension, low: 'Low', high: 'High' };
  // Scores from backend are already on 0-100 scale
  const percentage = Math.round(score > 1 ? score : score * 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium" style={{ color: colors.text }}>{info.name}</span>
        <span className="text-sm" style={{ color: colors.textSecondary }}>{percentage}%</span>
      </div>
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.accentBg }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.accent }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: colors.textSecondary }}>{info.low}</span>
        <span className="text-xs" style={{ color: colors.textSecondary }}>{info.high}</span>
      </div>
    </div>
  );
}

export default PersonalityAssessment;
