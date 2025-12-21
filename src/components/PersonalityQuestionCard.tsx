/**
 * PersonalityQuestionCard - Big Five personality assessment question component
 *
 * Displays a single question with a 5-point Likert scale (Strongly Disagree to Strongly Agree)
 * Matches the platform's warm grey design language with proper theming.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

interface PersonalityQuestionCardProps {
  questionId: string;
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  dimension: string;
  selectedValue: number | null;
  onAnswer: (questionId: string, value: number) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  showProgress?: boolean;
}

const SCALE_OPTIONS = [
  { value: 1, label: 'Strongly Disagree', shortLabel: 'SD' },
  { value: 2, label: 'Disagree', shortLabel: 'D' },
  { value: 3, label: 'Neutral', shortLabel: 'N' },
  { value: 4, label: 'Agree', shortLabel: 'A' },
  { value: 5, label: 'Strongly Agree', shortLabel: 'SA' },
];

const DIMENSION_LABELS: Record<string, string> = {
  extraversion: 'Energy & Social Style',
  openness: 'Curiosity & Imagination',
  conscientiousness: 'Structure & Planning',
  agreeableness: 'Empathy & Values',
  neuroticism: 'Emotional Patterns',
};

export function PersonalityQuestionCard({
  questionId,
  questionNumber,
  totalQuestions,
  questionText,
  dimension,
  selectedValue,
  onAnswer,
  onNext,
  onPrevious,
  isFirst = false,
  isLast = false,
  showProgress = true,
}: PersonalityQuestionCardProps) {
  const { theme } = useTheme();
  const progress = (questionNumber / totalQuestions) * 100;

  // Theme-aware colors
  const colors = {
    bg: theme === 'dark' ? '#1a1a18' : '#fafaf9',
    cardBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.9)',
    border: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
    accent: theme === 'dark' ? '#C1C0B6' : '#44403c',
    accentBg: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(68, 64, 60, 0.1)',
    buttonBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.8)' : 'rgba(255, 255, 255, 0.9)',
    buttonHover: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(68, 64, 60, 0.1)',
    progressBg: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  };

  const handleSelect = (value: number) => {
    onAnswer(questionId, value);
    // Auto-advance after a short delay if not the last question
    if (!isLast && onNext) {
      setTimeout(() => onNext(), 300);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Progress bar */}
      {showProgress && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm" style={{ color: colors.textSecondary }}>
              Question {questionNumber} of {totalQuestions}
            </span>
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: colors.accent }}
            >
              {DIMENSION_LABELS[dimension] || dimension}
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: colors.progressBg }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: colors.accent }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Question card */}
      <div
        className="rounded-2xl p-8"
        style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.border}`,
        }}
      >
        <h2
          className="text-xl md:text-2xl text-center mb-8 leading-relaxed"
          style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
        >
          {questionText}
        </h2>

        {/* Likert scale */}
        <div className="space-y-4">
          {/* Desktop: horizontal buttons */}
          <div className="hidden md:flex justify-center gap-3">
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="flex flex-col items-center justify-center w-24 h-24 rounded-xl transition-all duration-200 hover:scale-105"
                style={{
                  backgroundColor: selectedValue === option.value ? colors.accent : colors.buttonBg,
                  border: `2px solid ${selectedValue === option.value ? colors.accent : colors.border}`,
                  color: selectedValue === option.value
                    ? (theme === 'dark' ? '#1a1a18' : '#fff')
                    : colors.text,
                }}
              >
                <span className="text-2xl font-bold">{option.value}</span>
                <span className="text-xs mt-1 text-center px-1">{option.shortLabel}</span>
              </button>
            ))}
          </div>

          {/* Mobile: vertical list */}
          <div className="md:hidden space-y-2">
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: selectedValue === option.value ? colors.accent : colors.buttonBg,
                  border: `2px solid ${selectedValue === option.value ? colors.accent : colors.border}`,
                  color: selectedValue === option.value
                    ? (theme === 'dark' ? '#1a1a18' : '#fff')
                    : colors.text,
                }}
              >
                <span className="font-medium">{option.label}</span>
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: selectedValue === option.value
                      ? 'rgba(255, 255, 255, 0.2)'
                      : colors.accentBg,
                  }}
                >
                  {option.value}
                </span>
              </button>
            ))}
          </div>

          {/* Scale labels for desktop */}
          <div
            className="hidden md:flex justify-between text-xs px-2"
            style={{ color: colors.textSecondary }}
          >
            <span>Strongly Disagree</span>
            <span>Strongly Agree</span>
          </div>
        </div>

        {/* Navigation buttons */}
        <div
          className="flex justify-between mt-8 pt-6"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <button
            onClick={onPrevious}
            disabled={isFirst}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              color: isFirst ? colors.textSecondary : colors.text,
              opacity: isFirst ? 0.5 : 1,
              cursor: isFirst ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>

          {isLast ? (
            <button
              onClick={onNext}
              disabled={selectedValue === null}
              className="px-6 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: selectedValue === null ? colors.accentBg : colors.accent,
                color: selectedValue === null
                  ? colors.textSecondary
                  : (theme === 'dark' ? '#1a1a18' : '#fff'),
                cursor: selectedValue === null ? 'not-allowed' : 'pointer',
              }}
            >
              Complete Assessment
            </button>
          ) : (
            <button
              onClick={onNext}
              disabled={selectedValue === null}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                color: selectedValue === null ? colors.textSecondary : colors.text,
                opacity: selectedValue === null ? 0.5 : 1,
                cursor: selectedValue === null ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default PersonalityQuestionCard;
