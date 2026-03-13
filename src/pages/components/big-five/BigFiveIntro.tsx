/**
 * BigFiveIntro - Intro phase for the Big Five Assessment
 *
 * Displays domain preview, assessment version selection (50 or 120 questions),
 * and resume notice if the user has previous progress.
 */

import React from 'react';
import { ChevronRight, Zap, BookOpen } from 'lucide-react';
import { DOMAIN_INFO, type AssessmentVersion } from './bigFiveTypes';

interface BigFiveIntroProps {
  colors: Record<string, string>;
  questionsAnswered: number;
  startAssessment: (version: AssessmentVersion) => void;
}

export function BigFiveIntro({ colors, questionsAnswered, startAssessment }: BigFiveIntroProps) {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-6">
        <div
          className="p-4 rounded-2xl"
          style={{
            backgroundColor: colors.accentBg,
            border: `1px solid ${colors.border}`
          }}
        >
          <img src="/images/backgrounds/flower-hero.png" alt="Twin Me" className="w-12 h-12 object-contain drop-shadow-md" />
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
    </div>
  );
}
