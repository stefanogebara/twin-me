/**
 * BigFiveAssessment - IPIP-NEO-120 Big Five Personality Assessment
 *
 * Scientific Big Five assessment using public domain IPIP-NEO questions
 * with T-score normalization and percentile calculation.
 *
 * Domains: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
 * 30 facets (6 per domain), 120 questions total
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';

import type {
  BigFiveQuestion,
  BigFiveScores,
  FacetScore,
  AssessmentPhase,
  AssessmentVersion,
} from './components/big-five/bigFiveTypes';
import { BigFiveIntro } from './components/big-five/BigFiveIntro';
import { BigFiveQuestions } from './components/big-five/BigFiveQuestions';
import { BigFiveResults } from './components/big-five/BigFiveResults';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Design system colors — light mode only
const colors = {
  bg: '#fcf6ef',
  cardBg: 'rgba(255, 255, 255, 0.55)',
  border: 'rgba(0, 0, 0, 0.08)',
  text: '#000000',
  textSecondary: '#8A857D',
  accent: '#000000',
  accentBg: 'rgba(0, 0, 0, 0.06)',
};

export function BigFiveAssessment() {
  const { token } = useAuth();
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

  // Fetch questions (works with or without auth - backend uses optionalAuth)
  const fetchQuestions = useCallback(async (assessmentVersion: AssessmentVersion) => {
    const authToken = token || localStorage.getItem('auth_token');

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
  }, [token]);

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

  // Submit responses
  const submitResponses = async (isFinal = false) => {
    setPhase('calculating');

    const authToken = token || localStorage.getItem('auth_token');

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

      // Use calculate-preview for unauthenticated users (no data saved to DB)
      // Use responses endpoint for authenticated users (saves to DB)
      const endpoint = authToken
        ? `${API_URL}/big-five/responses`
        : `${API_URL}/big-five/calculate-preview`;

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
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm mb-6 transition-colors hover:opacity-80"
          style={{ fontFamily: 'var(--font-body)', color: colors.textSecondary }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <AnimatePresence mode="wait">
          {/* Intro Phase */}
          {phase === 'intro' && (
            <BigFiveIntro
              colors={colors}
              questionsAnswered={questionsAnswered}
              startAssessment={startAssessment}
            />
          )}

          {/* Questions Phase */}
          {phase === 'questions' && (
            <BigFiveQuestions
              colors={colors}
              theme="light"
              loading={loading}
              error={error}
              currentQuestion={currentQuestion}
              currentIndex={currentIndex}
              questions={questions}
              responses={responses}
              progress={progress}
              version={version}
              fetchQuestions={fetchQuestions}
              handleAnswer={handleAnswer}
              handleNext={handleNext}
              handlePrevious={handlePrevious}
              submitResponses={submitResponses}
            />
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
                  <div className="animate-pulse"><Clay3DIcon name="brain" size={48} /></div>
                </div>
              </div>
              <h2
                className="heading-serif text-2xl mb-2"
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
            <BigFiveResults
              colors={colors}
              theme="light"
              scores={scores}
              facets={facets}
              questionsAnswered={questionsAnswered}
              navigate={navigate}
              retakeAssessment={retakeAssessment}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default BigFiveAssessment;
