/**
 * BigFiveResults - Results phase for the Big Five Assessment
 *
 * Displays domain scores with bars, facet details, interpretations,
 * and action buttons (view soul signature, dashboard, retake).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw } from 'lucide-react';
import { DOMAIN_INFO, type BigFiveScores, type DomainScore, type FacetScore } from './bigFiveTypes';

interface BigFiveResultsProps {
  colors: Record<string, string>;
  theme?: string; // kept for backward compat with parent, unused (light-mode only)
  scores: BigFiveScores;
  facets: FacetScore[];
  questionsAnswered: number;
  navigate: (path: string) => void;
  retakeAssessment: () => void;
}

export function BigFiveResults({
  colors,
  theme: _theme,
  scores,
  facets,
  questionsAnswered,
  navigate,
  retakeAssessment,
}: BigFiveResultsProps) {
  return (
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
          className="text-3xl md:text-4xl mb-2 heading-serif"
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
            color: '#fff'
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
