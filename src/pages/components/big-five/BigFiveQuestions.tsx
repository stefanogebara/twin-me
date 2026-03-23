/**
 * BigFiveQuestions - Questions phase for the Big Five Assessment
 *
 * Displays the current question with a Likert scale, progress bar,
 * domain badge, and navigation controls.
 */

import React from 'react';
import { ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import {
  SCALE_OPTIONS,
  DOMAIN_INFO,
  type BigFiveQuestion,
  type AssessmentVersion
} from './bigFiveTypes';

interface BigFiveQuestionsProps {
  colors: Record<string, string>;
  theme?: string; // kept for backward compat with parent, unused (light-mode only)
  loading: boolean;
  error: string | null;
  currentQuestion: BigFiveQuestion | undefined;
  currentIndex: number;
  questions: BigFiveQuestion[];
  responses: Map<string, number>;
  progress: number;
  version: AssessmentVersion;
  fetchQuestions: (version: AssessmentVersion) => void;
  handleAnswer: (questionId: string, value: number) => void;
  handleNext: () => void;
  handlePrevious: () => void;
  submitResponses: (isFinal?: boolean) => void;
}

export function BigFiveQuestions({
  colors,
  theme: _theme,
  loading,
  error,
  currentQuestion,
  currentIndex,
  questions,
  responses,
  progress,
  version,
  fetchQuestions,
  handleAnswer,
  handleNext,
  handlePrevious,
  submitResponses,
}: BigFiveQuestionsProps) {
  return (
    <div>
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
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  backgroundColor: DOMAIN_INFO[currentQuestion.domain]?.color || colors.accent,
                  width: `${progress}%`,
                }}
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
          <div
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
          </div>

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
              aria-label="Previous question"
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
                color: responses.has(currentQuestion.id) ? '#fff' : colors.text
              }}
            >
              {currentIndex === questions.length - 1 ? 'See Results' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
