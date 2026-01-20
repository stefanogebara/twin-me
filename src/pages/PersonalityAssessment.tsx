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

// Get color for personality type
function getTypeColor(code: string): { primary: string; secondary: string } {
  // Extract base type (e.g., "INFP" from "INFP-A")
  const baseType = code?.replace(/-[AT]$/, '').toUpperCase() || '';
  return TYPE_COLORS[baseType] || { primary: '#C1C0B6', secondary: '#A8A79E' };
}

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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              {/* Animated background gradient based on personality type */}
              <div
                className="absolute inset-0 -z-10 opacity-30 blur-3xl"
                style={{
                  background: `radial-gradient(ellipse at top, ${getTypeColor(result.archetype.code).primary}40, transparent 50%),
                               radial-gradient(ellipse at bottom right, ${getTypeColor(result.archetype.code).secondary}30, transparent 50%)`
                }}
              />

              {/* Success badge */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-8"
              >
                <div
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1))',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.3)'
                  }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4, type: 'spring', stiffness: 500 }}
                  >
                    <Check className="w-4 h-4" />
                  </motion.div>
                  Quick Pulse Complete!
                </div>
              </motion.div>

              {/* Personality Type Hero Section */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="text-center mb-10"
              >
                {/* Large animated type code */}
                <div className="relative inline-block mb-4">
                  <motion.div
                    className="text-6xl md:text-8xl font-bold tracking-wider"
                    style={{
                      background: `linear-gradient(135deg, ${getTypeColor(result.archetype.code).primary}, ${getTypeColor(result.archetype.code).secondary})`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontFamily: 'var(--font-heading)',
                      textShadow: `0 0 60px ${getTypeColor(result.archetype.code).primary}40`
                    }}
                  >
                    {result.archetype.fullCode || result.archetype.code}
                  </motion.div>
                  {/* Animated glow ring */}
                  <motion.div
                    className="absolute -inset-4 rounded-full -z-10"
                    style={{
                      background: `radial-gradient(circle, ${getTypeColor(result.archetype.code).primary}20, transparent 70%)`
                    }}
                    animate={{
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 0.8, 0.5]
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>

                {/* Type name and title */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-2xl md:text-3xl mb-2"
                  style={{
                    color: getTypeColor(result.archetype.code).primary,
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600
                  }}
                >
                  {result.archetype.name}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-lg italic"
                  style={{ color: colors.textSecondary }}
                >
                  "{result.archetype.title}"
                </motion.p>
              </motion.div>

              {/* Animated Dimension Bars */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-3xl p-6 md:p-8 mb-8"
                style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(135deg, rgba(45, 45, 41, 0.8), rgba(35, 35, 31, 0.6))'
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(250, 250, 249, 0.8))',
                  border: `1px solid ${colors.border}`,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <h3 className="text-lg font-medium mb-6 text-center" style={{ color: colors.text }}>
                  Your Personality Spectrum
                </h3>
                <div className="space-y-6">
                  {(() => {
                    // Support both Big Five keys and MBTI keys
                    const dimensionConfig: Array<{ key: string; altKey?: string; low: string; high: string; lowLabel: string; highLabel: string; color: string }> = [
                      { key: 'extraversion', altKey: 'mind', low: 'I', high: 'E', lowLabel: 'Introverted', highLabel: 'Extraverted', color: '#4F9DA6' },
                      { key: 'openness', altKey: 'energy', low: 'S', high: 'N', lowLabel: 'Observant', highLabel: 'Intuitive', color: '#E8B86D' },
                      { key: 'agreeableness', altKey: 'nature', low: 'T', high: 'F', lowLabel: 'Thinking', highLabel: 'Feeling', color: '#00A878' },
                      { key: 'conscientiousness', altKey: 'tactics', low: 'P', high: 'J', lowLabel: 'Prospecting', highLabel: 'Judging', color: '#7B68EE' },
                      { key: 'neuroticism', altKey: 'identity', low: 'T', high: 'A', lowLabel: 'Turbulent', highLabel: 'Assertive', color: '#FF6B6B' }
                    ];

                    const scores = result.scores as Record<string, number>;

                    return dimensionConfig.map((config, index) => {
                      // Try primary key first, then alternative key
                      let score = scores[config.key];
                      if (score === undefined && config.altKey) {
                        score = scores[config.altKey];
                      }
                      // Default to 50 if still undefined
                      if (score === undefined) score = 50;
                      const percentage = Math.round(score > 1 ? score : score * 100);
                      const isHighPole = percentage >= 50;

                      return (
                        <motion.div
                          key={config.key}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 + index * 0.1 }}
                          className="relative"
                        >
                          {/* Labels */}
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                                style={{
                                  backgroundColor: !isHighPole ? config.color : `${config.color}30`,
                                  color: !isHighPole ? '#fff' : config.color
                                }}
                              >
                                {config.low}
                              </span>
                              <span className="text-sm" style={{ color: !isHighPole ? colors.text : colors.textSecondary }}>
                                {config.lowLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm" style={{ color: isHighPole ? colors.text : colors.textSecondary }}>
                                {config.highLabel}
                              </span>
                              <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                                style={{
                                  backgroundColor: isHighPole ? config.color : `${config.color}30`,
                                  color: isHighPole ? '#fff' : config.color
                                }}
                              >
                                {config.high}
                              </span>
                            </div>
                          </div>

                          {/* Progress bar with indicator */}
                          <div className="relative">
                            <div
                              className="h-3 rounded-full overflow-hidden"
                              style={{ backgroundColor: `${config.color}20` }}
                            >
                              {/* Center marker */}
                              <div
                                className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 z-10"
                                style={{ backgroundColor: colors.border }}
                              />
                              {/* Filled bar from center */}
                              <motion.div
                                className="absolute h-full rounded-full"
                                style={{
                                  backgroundColor: config.color,
                                  left: percentage >= 50 ? '50%' : `${percentage}%`,
                                  right: percentage >= 50 ? `${100 - percentage}%` : '50%'
                                }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.8 + index * 0.1, duration: 0.5 }}
                              />
                            </div>

                            {/* Percentage indicator */}
                            <motion.div
                              className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
                              style={{ left: `${percentage}%`, transform: 'translate(-50%, -50%)' }}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 1 + index * 0.1, type: 'spring', stiffness: 300 }}
                            >
                              <div
                                className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                                style={{
                                  backgroundColor: theme === 'dark' ? '#1a1a18' : '#fff',
                                  borderColor: config.color,
                                  color: config.color
                                }}
                              >
                                {percentage}
                              </div>
                            </motion.div>
                          </div>
                        </motion.div>
                      );
                    });
                  })()}
                </div>
              </motion.div>

              {/* Description card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="rounded-2xl p-6 mb-8"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <p className="text-base leading-relaxed" style={{ color: colors.text }}>
                  {result.archetype.description}
                </p>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="flex flex-col sm:flex-row gap-4 justify-center mb-8"
              >
                <button
                  onClick={() => setPhase('results')}
                  className="group px-8 py-4 rounded-2xl font-medium transition-all hover:scale-[1.02] relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${getTypeColor(result.archetype.code).primary}, ${getTypeColor(result.archetype.code).secondary})`,
                    color: '#fff',
                    boxShadow: `0 4px 20px ${getTypeColor(result.archetype.code).primary}40`
                  }}
                >
                  <span className="relative z-10">See Full Results</span>
                </button>
                <button
                  onClick={() => navigate('/soul-signature')}
                  className="px-8 py-4 rounded-2xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.accentBg,
                    color: colors.text,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  View Soul Signature
                </button>
              </motion.div>

              {/* Deep assessment prompt */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="rounded-2xl p-5 text-center"
                style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(135deg, rgba(193, 192, 182, 0.05), rgba(193, 192, 182, 0.02))'
                    : 'linear-gradient(135deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.01))',
                  border: `1px dashed ${colors.border}`
                }}
              >
                <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                  Want even more accurate insights? Complete 48 more questions for a detailed profile.
                </p>
                <button
                  onClick={continueDeepAssessment}
                  className="text-sm font-medium transition-all hover:gap-3 inline-flex items-center gap-2"
                  style={{ color: getTypeColor(result.archetype.code).primary }}
                >
                  Take Deep Assessment <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
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
