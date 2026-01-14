/**
 * BigFiveAssessment - IPIP-NEO-120 Big Five Personality Assessment
 *
 * Scientific Big Five assessment using public domain IPIP-NEO questions
 * with T-score normalization and percentile calculation.
 *
 * Domains: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
 * 30 facets (6 per domain), 120 questions total
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Brain,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Target,
  TrendingUp,
  BookOpen,
  Zap,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Types
interface BigFiveQuestion {
  id: string;
  domain: string;
  facet: number;
  facetName: string;
  text: string;
  keyed: string;
  order: number;
  answered?: boolean;
  previousValue?: number | null;
}

interface DomainScore {
  raw: number;
  tScore: number;
  percentile: number;
  label: string;
  interpretation: string;
}

interface BigFiveScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  domains: {
    openness: DomainScore;
    conscientiousness: DomainScore;
    extraversion: DomainScore;
    agreeableness: DomainScore;
    neuroticism: DomainScore;
  };
}

interface FacetScore {
  id: string;
  name: string;
  domain: string;
  tScore: number;
  percentile: number;
}

type AssessmentPhase = 'intro' | 'questions' | 'calculating' | 'results';
type AssessmentVersion = '120' | '50';

// Scale options for 5-point Likert
const SCALE_OPTIONS = [
  { value: 1, label: 'Very Inaccurate', shortLabel: 'VI' },
  { value: 2, label: 'Moderately Inaccurate', shortLabel: 'MI' },
  { value: 3, label: 'Neither Accurate Nor Inaccurate', shortLabel: 'N' },
  { value: 4, label: 'Moderately Accurate', shortLabel: 'MA' },
  { value: 5, label: 'Very Accurate', shortLabel: 'VA' },
];

// Domain info with colors and icons
const DOMAIN_INFO: Record<string, { name: string; color: string; description: string }> = {
  O: {
    name: 'Openness',
    color: '#8b5cf6',
    description: 'Openness to new experiences, creativity, and intellectual curiosity'
  },
  C: {
    name: 'Conscientiousness',
    color: '#22c55e',
    description: 'Organization, dependability, and self-discipline'
  },
  E: {
    name: 'Extraversion',
    color: '#f59e0b',
    description: 'Sociability, assertiveness, and positive emotions'
  },
  A: {
    name: 'Agreeableness',
    color: '#06b6d4',
    description: 'Cooperation, trust, and helpfulness toward others'
  },
  N: {
    name: 'Neuroticism',
    color: '#ef4444',
    description: 'Tendency to experience negative emotions and stress'
  }
};

export function BigFiveAssessment() {
  const { token } = useAuth();
  const { theme } = useTheme();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<AssessmentPhase>('intro');
  const [version, setVersion] = useState<AssessmentVersion>('120');
  const [questions, setQuestions] = useState<BigFiveQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Map<string, number>>(new Map());
  const [scores, setScores] = useState<BigFiveScores | null>(null);
  const [facets, setFacets] = useState<FacetScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

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

  // Fetch questions
  const fetchQuestions = useCallback(async (assessmentVersion: AssessmentVersion) => {
    const authToken = token || localStorage.getItem('auth_token');

    // Allow demo mode without authentication
    if (!authToken && !isDemoMode) {
      setError('Authentication required. Please log in.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(
        `${API_URL}/big-five/questions?version=${assessmentVersion}`,
        { headers }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch questions: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setQuestions(data.questions);
        setQuestionsAnswered(data.questionsAnswered || 0);

        // Load previous responses
        if (data.questions) {
          const previousMap = new Map<string, number>();
          data.questions.forEach((q: BigFiveQuestion) => {
            if (q.previousValue) {
              previousMap.set(q.id, q.previousValue);
            }
          });
          if (previousMap.size > 0) {
            setResponses(previousMap);
          }
        }
      } else {
        throw new Error(data.error || 'Failed to load questions');
      }
    } catch (err) {
      console.error('[BigFive] Error fetching questions:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, isDemoMode]);

  // Submit responses
  const submitResponses = async (isFinal = false) => {
    setPhase('calculating');

    const authToken = token || localStorage.getItem('auth_token');

    // In demo mode, use calculate-preview endpoint which doesn't save to database
    if (!authToken && !isDemoMode) {
      setError('Authentication required');
      setPhase('questions');
      return;
    }

    try {
      const responsesArray = Array.from(responses.entries()).map(([questionId, value]) => ({
        questionId,
        value,
      }));

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Use calculate-preview for demo mode (or authenticated users can use responses endpoint)
      const endpoint = isDemoMode && !authToken
        ? `${API_URL}/big-five/calculate-preview`
        : `${API_URL}/big-five/responses`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          responses: responsesArray,
          final: isFinal || responses.size >= questions.length
        }),
      });

      if (!response.ok) throw new Error('Failed to submit responses');

      const data = await response.json();
      if (data.success) {
        setScores(data.scores);
        setQuestionsAnswered(data.questionsAnswered || responses.size);

        // Fetch facet scores (only for authenticated users)
        if (authToken) {
          await fetchFacets();
        }

        setPhase('results');
      } else {
        throw new Error(data.error || 'Failed to process responses');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPhase('questions');
    }
  };

  // Fetch facet scores
  const fetchFacets = async () => {
    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) return;

    try {
      const response = await fetch(`${API_URL}/big-five/facets`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.facets) {
          setFacets(data.facets);
        }
      }
    } catch (err) {
      console.error('[BigFive] Error fetching facets:', err);
    }
  };

  // Handle answer selection
  const handleAnswer = (questionId: string, value: number) => {
    setResponses((prev) => {
      const newResponses = new Map(prev);
      newResponses.set(questionId, value);
      return newResponses;
    });
  };

  // Auto-advance after answer
  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      submitResponses(true);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // Start assessment
  const startAssessment = (assessmentVersion: AssessmentVersion) => {
    setVersion(assessmentVersion);
    setPhase('questions');
    fetchQuestions(assessmentVersion);
  };

  // Retake assessment - reset all state and go back to intro
  const retakeAssessment = () => {
    setPhase('intro');
    setQuestions([]);
    setCurrentIndex(0);
    setResponses(new Map());
    setScores(null);
    setFacets([]);
    setError(null);
    setQuestionsAnswered(0);
  };

  // Current question
  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: colors.bg }}>
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
                  <Target className="w-12 h-12" style={{ color: colors.accent }} />
                </div>
              </div>

              <h1
                className="text-3xl md:text-4xl mb-4"
                style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
              >
                Big Five Personality Assessment
              </h1>

              <p className="text-lg max-w-xl mx-auto mb-4" style={{ color: colors.textSecondary }}>
                Discover your personality profile using the scientifically validated IPIP-NEO assessment.
              </p>

              <p className="text-sm max-w-lg mx-auto mb-8" style={{ color: colors.textSecondary }}>
                Based on the Five Factor Model with T-score normalization against a population of 619,000+ respondents.
              </p>

              {/* Domain Preview */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {Object.entries(DOMAIN_INFO).map(([code, info]) => (
                  <div
                    key={code}
                    className="flex items-center gap-2 px-3 py-2 rounded-full text-sm"
                    style={{
                      backgroundColor: `${info.color}20`,
                      color: info.color
                    }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: info.color }} />
                    {info.name}
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {/* Short Form */}
                <button
                  onClick={() => startAssessment('50')}
                  className="group p-6 rounded-2xl transition-all text-left hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Zap className="w-5 h-5" style={{ color: colors.accent }} />
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: colors.accent }}
                    >
                      Quick Assessment
                    </span>
                  </div>
                  <h3 className="text-lg mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                    5-minute snapshot
                  </h3>
                  <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                    50 questions for a quick personality overview. Good for getting started.
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
                  onClick={() => startAssessment('120')}
                  className="group p-6 rounded-2xl transition-all text-left hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <BookOpen className="w-5 h-5" style={{ color: colors.accent }} />
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: colors.accent }}
                    >
                      Full Assessment
                    </span>
                  </div>
                  <h3 className="text-lg mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                    15-minute complete profile
                  </h3>
                  <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                    120 questions for detailed personality analysis with 30 facet scores.
                  </p>
                  <div
                    className="flex items-center text-sm transition-colors"
                    style={{ color: colors.textSecondary }}
                  >
                    Start now <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              </div>

              {/* Resume notice */}
              {questionsAnswered > 0 && (
                <p className="text-sm mt-6" style={{ color: colors.textSecondary }}>
                  You have {questionsAnswered} questions answered. Your progress will be saved.
                </p>
              )}
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
                    onClick={() => fetchQuestions(version)}
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
                <div className="max-w-2xl mx-auto">
                  {/* Progress bar */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm" style={{ color: colors.textSecondary }}>
                        Question {currentIndex + 1} of {questions.length}
                      </span>
                      <span className="text-sm" style={{ color: colors.textSecondary }}>
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: colors.accentBg }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: DOMAIN_INFO[currentQuestion.domain]?.color || colors.accent }}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>

                  {/* Domain badge */}
                  <div className="flex justify-center mb-4">
                    <span
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${DOMAIN_INFO[currentQuestion.domain]?.color || colors.accent}20`,
                        color: DOMAIN_INFO[currentQuestion.domain]?.color || colors.accent
                      }}
                    >
                      {DOMAIN_INFO[currentQuestion.domain]?.name || currentQuestion.domain} - {currentQuestion.facetName}
                    </span>
                  </div>

                  {/* Question card */}
                  <motion.div
                    key={currentQuestion.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-2xl p-6 mb-6"
                    style={{
                      backgroundColor: colors.cardBg,
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    <p
                      className="text-xl md:text-2xl text-center mb-8"
                      style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
                    >
                      {currentQuestion.text}
                    </p>

                    {/* Scale options */}
                    <div className="space-y-3">
                      {SCALE_OPTIONS.map((option) => {
                        const isSelected = responses.get(currentQuestion.id) === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              handleAnswer(currentQuestion.id, option.value);
                              // Auto-advance after small delay
                              setTimeout(() => handleNext(), 200);
                            }}
                            className={`w-full py-4 px-6 rounded-xl transition-all flex items-center justify-between ${
                              isSelected ? 'scale-[1.02]' : 'hover:scale-[1.01]'
                            }`}
                            style={{
                              backgroundColor: isSelected
                                ? DOMAIN_INFO[currentQuestion.domain]?.color || colors.accent
                                : colors.accentBg,
                              color: isSelected
                                ? '#fff'
                                : colors.text,
                              border: `1px solid ${isSelected ? 'transparent' : colors.border}`
                            }}
                          >
                            <span className="font-medium">{option.label}</span>
                            {isSelected && <Check className="w-5 h-5" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Navigation */}
                  <div className="flex justify-between">
                    <button
                      onClick={handlePrevious}
                      disabled={currentIndex === 0}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all disabled:opacity-30"
                      style={{
                        backgroundColor: colors.accentBg,
                        color: colors.text
                      }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>

                    <button
                      onClick={() => {
                        if (currentIndex === questions.length - 1) {
                          submitResponses(true);
                        } else {
                          handleNext();
                        }
                      }}
                      disabled={!responses.has(currentQuestion.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all disabled:opacity-30"
                      style={{
                        backgroundColor: responses.has(currentQuestion.id) ? colors.accent : colors.accentBg,
                        color: responses.has(currentQuestion.id) ? (theme === 'dark' ? '#1a1a18' : '#fff') : colors.text
                      }}
                    >
                      {currentIndex === questions.length - 1 ? 'See Results' : 'Next'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
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
              <h2
                className="text-2xl mb-2"
                style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
              >
                Calculating Your Profile
              </h2>
              <p style={{ color: colors.textSecondary }}>
                Normalizing scores against population data...
              </p>
            </motion.div>
          )}

          {/* Results Phase */}
          {phase === 'results' && scores && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4"
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e'
                  }}
                >
                  <Check className="w-4 h-4" />
                  Assessment Complete
                </div>
                <h1
                  className="text-3xl md:text-4xl mb-2"
                  style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                >
                  Your Big Five Profile
                </h1>
                <p style={{ color: colors.textSecondary }}>
                  Based on {questionsAnswered} questions with T-score normalization
                </p>
              </div>

              {/* Domain Scores */}
              <div
                className="rounded-2xl p-6 mb-6"
                style={{
                  backgroundColor: colors.cardBg,
                  border: `1px solid ${colors.border}`
                }}
              >
                <h3
                  className="text-lg mb-6"
                  style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                >
                  Personality Dimensions
                </h3>
                <div className="space-y-6">
                  {Object.entries(scores.domains || {}).map(([domain, data]) => {
                    const domainCode = domain[0].toUpperCase() as keyof typeof DOMAIN_INFO;
                    const info = DOMAIN_INFO[domainCode];
                    if (!data || !info) return null;

                    return (
                      <DomainScoreBar
                        key={domain}
                        domain={domain}
                        info={info}
                        data={data}
                        colors={colors}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Facet Details (expandable) */}
              {facets.length > 0 && (
                <div
                  className="rounded-2xl p-6 mb-6"
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <h3
                    className="text-lg mb-4"
                    style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                  >
                    Facet Scores (30 traits)
                  </h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {facets.map((facet) => {
                      const info = DOMAIN_INFO[facet.domain];
                      return (
                        <div
                          key={facet.id}
                          className="p-3 rounded-lg"
                          style={{
                            backgroundColor: `${info?.color || colors.accent}10`,
                            border: `1px solid ${info?.color || colors.accent}30`
                          }}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium" style={{ color: colors.text }}>
                              {facet.name}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${info?.color || colors.accent}20`,
                                color: info?.color || colors.accent
                              }}
                            >
                              {facet.percentile}th
                            </span>
                          </div>
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: colors.accentBg }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${facet.percentile}%`,
                                backgroundColor: info?.color || colors.accent
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Interpretations */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {Object.entries(scores.domains || {}).slice(0, 4).map(([domain, data]) => {
                  const domainCode = domain[0].toUpperCase();
                  const info = DOMAIN_INFO[domainCode as keyof typeof DOMAIN_INFO];
                  if (!data || !info) return null;

                  return (
                    <div
                      key={domain}
                      className="rounded-xl p-4"
                      style={{
                        backgroundColor: colors.cardBg,
                        border: `1px solid ${colors.border}`
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: info.color }}
                        />
                        <h4
                          className="font-medium"
                          style={{ color: info.color }}
                        >
                          {info.name}
                        </h4>
                        <span
                          className="text-xs ml-auto"
                          style={{ color: colors.textSecondary }}
                        >
                          {data.label}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {data.interpretation}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={() => navigate('/soul-signature')}
                  className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: colors.accent,
                    color: theme === 'dark' ? '#1a1a18' : '#fff'
                  }}
                >
                  View Soul Signature
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-6 py-3 rounded-xl font-medium transition-all"
                  style={{
                    backgroundColor: colors.accentBg,
                    color: colors.text
                  }}
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={retakeAssessment}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'transparent',
                    color: colors.textSecondary,
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake Assessment
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Domain score bar component
function DomainScoreBar({
  domain,
  info,
  data,
  colors
}: {
  domain: string;
  info: { name: string; color: string; description: string };
  data: DomainScore;
  colors: Record<string, string>;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: info.color }} />
          <span className="font-medium" style={{ color: colors.text }}>
            {info.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            T-Score: {data.tScore}
          </span>
          <span
            className="text-sm font-medium px-2 py-0.5 rounded"
            style={{
              backgroundColor: `${info.color}20`,
              color: info.color
            }}
          >
            {data.percentile}th percentile
          </span>
        </div>
      </div>
      <div
        className="h-3 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.accentBg }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: info.color }}
          initial={{ width: 0 }}
          animate={{ width: `${data.percentile}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
      <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
        {info.description}
      </p>
    </div>
  );
}

export default BigFiveAssessment;
