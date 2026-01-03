/**
 * PersonalityAssessment - 16personalities-style MBTI assessment page
 *
 * 5 dimensions: Mind (I/E), Energy (S/N), Nature (T/F), Tactics (J/P), Identity (A/T)
 * Matches the platform's warm grey design language with proper theming.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, ChevronRight, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PersonalityQuestionCard } from '@/components/PersonalityQuestionCard';
import {
  DEMO_MBTI_QUESTIONS,
  generateDemoPersonalityResult
} from '@/services/demoDataService';

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
    fullCode?: string; // e.g., "ENFP-T" with identity suffix
    name: string;
    title: string;
    description: string;
    identity?: string; // "A" or "T"
    identityLabel?: string; // "Assertive" or "Turbulent"
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

// Demo questions imported from centralized demoDataService.ts
// DEMO_MBTI_QUESTIONS, generateDemoPersonalityResult

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
    // Demo mode: use local demo questions
    if (isDemoMode) {
      setLoading(true);
      // Simulate loading delay for better UX
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

    try {
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

    // Demo mode: calculate results locally
    if (isDemoMode) {
      // Simulate calculation delay
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

              <h1
                className="text-3xl md:text-4xl mb-4"
                style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
              >
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
                  <h3 className="text-lg mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                    2-minute snapshot
                  </h3>
                  <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                    15 key questions for a quick personality profile. Perfect for getting started.
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
                  <h3 className="text-lg mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
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
                  key={currentQuestion.id} // Force re-mount on question change to clear focus states
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
              <h2 className="text-2xl mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                Analyzing Your Responses
              </h2>
              <p style={{ color: colors.textSecondary }}>
                Mapping your unique personality signature...
              </p>
            </motion.div>
          )}

          {/* Deep Prompt Phase - Shows Quick Pulse results with option to go deeper */}
          {phase === 'deep-prompt' && result && (
            <motion.div
              key="deep-prompt"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Success header */}
              <div className="text-center mb-6">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4"
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e'
                  }}
                >
                  <Check className="w-4 h-4" />
                  Quick Pulse Complete!
                </div>
                <h2 className="text-3xl md:text-4xl mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                  {result.archetype.fullCode || result.archetype.code}
                </h2>
                <h3 className="text-xl mb-1" style={{ color: colors.accent, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                  {result.archetype.name}
                </h3>
                <p className="italic" style={{ color: colors.textSecondary }}>
                  {result.archetype.title}
                </p>
              </div>

              {/* Quick results preview card */}
              <div
                className="rounded-2xl p-6 mb-6"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <p className="leading-relaxed mb-4" style={{ color: colors.text }}>
                  {result.archetype.description}
                </p>

                {/* Quick MBTI dimension preview */}
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(result.scores || {})
                    .filter(([dimension]) => !dimension.endsWith('_ci'))
                    .slice(0, 5)
                    .map(([dimension, score]) => {
                      const percentage = Math.round((score as number) > 1 ? (score as number) : (score as number) * 100);
                      // Get MBTI letter based on score (>50% = positive pole)
                      const mbtiLetters: Record<string, { low: string; high: string }> = {
                        mind: { low: 'I', high: 'E' },
                        energy: { low: 'S', high: 'N' },
                        nature: { low: 'T', high: 'F' },
                        tactics: { low: 'P', high: 'J' },
                        identity: { low: 'T', high: 'A' },
                        // Legacy Big Five mapping
                        extraversion: { low: 'I', high: 'E' },
                        openness: { low: 'S', high: 'N' },
                        agreeableness: { low: 'T', high: 'F' },
                        conscientiousness: { low: 'P', high: 'J' },
                        neuroticism: { low: 'T', high: 'A' },
                      };
                      const poles = mbtiLetters[dimension] || { low: '?', high: '?' };
                      const letter = percentage >= 50 ? poles.high : poles.low;
                      return (
                        <div key={dimension} className="text-center">
                          <div
                            className="text-lg font-bold"
                            style={{ color: colors.accent }}
                          >
                            {letter}
                          </div>
                          <div
                            className="text-sm"
                            style={{ color: colors.textSecondary }}
                          >
                            {percentage}%
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Action buttons - Equal prominence */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                <button
                  onClick={() => setPhase('results')}
                  className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.accent,
                    color: theme === 'dark' ? '#1a1a18' : '#fff'
                  }}
                >
                  See Full Results
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.accentBg,
                    color: colors.text
                  }}
                >
                  Continue to Dashboard
                </button>
              </div>

              {/* Optional: Go deeper prompt */}
              <div
                className="rounded-xl p-4 text-center"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  border: `1px dashed ${colors.border}`
                }}
              >
                <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                  Want even more accurate insights? Complete 48 more questions for a detailed profile.
                </p>
                <button
                  onClick={continueDeepAssessment}
                  className="text-sm font-medium transition-colors hover:underline"
                  style={{ color: colors.accent }}
                >
                  Take Deep Assessment →
                </button>
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
                <h1 className="text-4xl md:text-5xl mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                  {result.archetype.fullCode || result.archetype.code}
                </h1>
                <h2 className="text-xl mb-2" style={{ color: colors.accent, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
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

              {/* MBTI Dimension Scores */}
              <div
                className="rounded-2xl p-6 mb-6"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <h3 className="text-lg mb-4" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                  Your Personality Dimensions
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
                  <h3 className="text-lg mb-3" style={{ color: '#22c55e', fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
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
                  <h3 className="text-lg mb-3" style={{ color: '#f59e0b', fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
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

// Dimension bar component - MBTI style
function DimensionBar({ dimension, score, colors }: { dimension: string; score: number; colors: Record<string, string> }) {
  // MBTI dimension labels with pole names
  const labels: Record<string, { name: string; low: string; high: string; letter: string }> = {
    // New MBTI dimensions
    mind: { name: 'Mind (I/E)', low: 'Introverted', high: 'Extraverted', letter: score >= 50 ? 'E' : 'I' },
    energy: { name: 'Energy (S/N)', low: 'Observant', high: 'Intuitive', letter: score >= 50 ? 'N' : 'S' },
    nature: { name: 'Nature (T/F)', low: 'Thinking', high: 'Feeling', letter: score >= 50 ? 'F' : 'T' },
    tactics: { name: 'Tactics (J/P)', low: 'Prospecting', high: 'Judging', letter: score >= 50 ? 'J' : 'P' },
    identity: { name: 'Identity (A/T)', low: 'Turbulent', high: 'Assertive', letter: score >= 50 ? 'A' : 'T' },
    // Legacy Big Five mapping (for backward compatibility)
    extraversion: { name: 'Mind (I/E)', low: 'Introverted', high: 'Extraverted', letter: score >= 50 ? 'E' : 'I' },
    openness: { name: 'Energy (S/N)', low: 'Observant', high: 'Intuitive', letter: score >= 50 ? 'N' : 'S' },
    agreeableness: { name: 'Nature (T/F)', low: 'Thinking', high: 'Feeling', letter: score >= 50 ? 'F' : 'T' },
    conscientiousness: { name: 'Tactics (J/P)', low: 'Prospecting', high: 'Judging', letter: score >= 50 ? 'J' : 'P' },
    neuroticism: { name: 'Identity (A/T)', low: 'Turbulent', high: 'Assertive', letter: score >= 50 ? 'A' : 'T' },
  };

  const info = labels[dimension] || { name: dimension, low: 'Low', high: 'High', letter: '?' };
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
