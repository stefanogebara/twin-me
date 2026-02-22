/**
 * Assessment Status Card
 *
 * Shows the user's personality assessment status and provides
 * entry points to take assessments (quick or comprehensive).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '@/components/layout/PageLayout';
import {
  Brain,
  Sparkles,
  CheckCircle,
  ChevronRight,
  Clock,
  Target,
  Zap,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssessmentStatusCardProps {
  /** Whether the quick (MBTI-style) assessment is complete */
  quickAssessmentComplete?: boolean;
  /** MBTI code if available (e.g., "INFJ") */
  mbtiCode?: string | null;
  /** Whether the full Big Five assessment is complete */
  bigFiveComplete?: boolean;
  /** Big Five scores if available */
  bigFiveScores?: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  } | null;
  /** Whether we have behavioral data from platforms */
  hasBehavioralData?: boolean;
  /** Number of connected platforms */
  connectedPlatforms?: number;
  className?: string;
}

const AssessmentStatusCard: React.FC<AssessmentStatusCardProps> = ({
  quickAssessmentComplete = false,
  mbtiCode,
  bigFiveComplete = false,
  bigFiveScores,
  hasBehavioralData = false,
  connectedPlatforms = 0,
  className = ''
}) => {
  const navigate = useNavigate();

  const textColor = '#1F1C18';
  const textSecondary = '#8A857D';
  const accentColor = '#2D2722';

  // Determine overall assessment status
  const hasAnyAssessment = quickAssessmentComplete || bigFiveComplete;
  const hasFullData = bigFiveComplete && hasBehavioralData;

  // Calculate a "data richness" score
  const getDataRichnessLabel = () => {
    if (hasFullData && connectedPlatforms >= 2) return { label: 'Excellent', color: '#1F1C18' };
    if (bigFiveComplete || (quickAssessmentComplete && hasBehavioralData)) return { label: 'Good', color: '#4a4540' };
    if (quickAssessmentComplete || hasBehavioralData) return { label: 'Basic', color: '#6b635e' };
    return { label: 'Not Started', color: '#8A857D' };
  };

  const dataRichness = getDataRichnessLabel();

  // For new users with no data
  if (!hasAnyAssessment && !hasBehavioralData) {
    return (
      <GlassPanel className={`!p-6 ${className}`}>
        <div className="text-center">
          {/* Header */}
          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(45, 39, 34, 0.08)' }}
          >
            <Brain className="w-8 h-8" style={{ color: accentColor }} />
          </div>

          <h3
            className="text-xl mb-2"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 500,
              color: textColor
            }}
          >
            Discover Your Soul Signature
          </h3>

          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: textSecondary }}>
            Take a quick personality assessment to get started. Combined with your connected platforms,
            we&apos;ll create a unique portrait of who you authentically are.
          </p>

          {/* Quick Start Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
            {/* Quick Assessment */}
            <button
              onClick={() => navigate('/personality')}
              className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: 'rgba(45, 39, 34, 0.06)',
                border: '1px solid rgba(45, 39, 34, 0.12)'
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5" style={{ color: accentColor }} />
                <span className="font-medium" style={{ color: textColor }}>Quick Start</span>
              </div>
              <p className="text-xs" style={{ color: textSecondary }}>
                15 questions &middot; ~3 min
              </p>
            </button>

            {/* Full Assessment */}
            <button
              onClick={() => navigate('/big-five')}
              className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.02)',
                border: '1px solid rgba(0, 0, 0, 0.06)'
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5" style={{ color: textSecondary }} />
                <span className="font-medium" style={{ color: textColor }}>Deep Dive</span>
              </div>
              <p className="text-xs" style={{ color: textSecondary }}>
                120 questions &middot; ~15 min
              </p>
            </button>
          </div>

          <p className="text-xs mt-4" style={{ color: textSecondary }}>
            Pro tip: Connect Spotify or other platforms first for richer insights!
          </p>
        </div>
      </GlassPanel>
    );
  }

  // For users with some data
  return (
    <GlassPanel className={`!p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(45, 39, 34, 0.08)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: accentColor }} />
          </div>
          <div>
            <h3
              className="text-base"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: textColor
              }}
            >
              Your Assessment Profile
            </h3>
            <p className="text-xs" style={{ color: textSecondary }}>
              Data richness:{' '}
              <span style={{ color: dataRichness.color, fontWeight: 500 }}>
                {dataRichness.label}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Quick Assessment Status */}
        <div
          className="p-3 rounded-lg"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
            border: quickAssessmentComplete
              ? '1px solid rgba(45, 39, 34, 0.15)'
              : '1px solid transparent'
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {quickAssessmentComplete ? (
                <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
              ) : (
                <Clock className="w-4 h-4" style={{ color: textSecondary }} />
              )}
              <span className="text-xs font-medium" style={{ color: textColor }}>
                Quick Assessment
              </span>
            </div>
            {quickAssessmentComplete && (
              <button
                onClick={() => navigate('/personality')}
                className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                style={{ color: textSecondary }}
                title="Retake assessment"
              >
                <RefreshCw className="w-3 h-3" />
                Retake
              </button>
            )}
          </div>
          {quickAssessmentComplete && mbtiCode ? (
            <p className="text-lg font-semibold" style={{ color: accentColor }}>
              {mbtiCode}
            </p>
          ) : (
            <p className="text-xs" style={{ color: textSecondary }}>
              Not completed
            </p>
          )}
        </div>

        {/* Big Five Status */}
        <div
          className="p-3 rounded-lg"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
            border: bigFiveComplete
              ? '1px solid rgba(45, 39, 34, 0.15)'
              : '1px solid transparent'
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {bigFiveComplete ? (
                <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
              ) : (
                <Clock className="w-4 h-4" style={{ color: textSecondary }} />
              )}
              <span className="text-xs font-medium" style={{ color: textColor }}>
                Big Five (IPIP-120)
              </span>
            </div>
            {bigFiveComplete && (
              <button
                onClick={() => navigate('/big-five')}
                className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                style={{ color: textSecondary }}
                title="Retake assessment"
              >
                <RefreshCw className="w-3 h-3" />
                Retake
              </button>
            )}
          </div>
          {bigFiveComplete && bigFiveScores ? (
            <div className="flex gap-1">
              {['O', 'C', 'E', 'A', 'N'].map((trait) => (
                <span
                  key={trait}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(45, 39, 34, 0.08)',
                    color: accentColor
                  }}
                >
                  {trait}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: textSecondary }}>
              Not completed
            </p>
          )}
        </div>
      </div>

      {/* Behavioral Data Status */}
      <div
        className="p-3 rounded-lg mb-4"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
          border: hasBehavioralData
            ? '1px solid rgba(45, 39, 34, 0.15)'
            : '1px solid transparent'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasBehavioralData ? (
              <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
            ) : (
              <Clock className="w-4 h-4" style={{ color: textSecondary }} />
            )}
            <span className="text-xs font-medium" style={{ color: textColor }}>
              Behavioral Data
            </span>
          </div>
          <span className="text-xs" style={{ color: hasBehavioralData ? accentColor : textSecondary }}>
            {connectedPlatforms > 0
              ? `${connectedPlatforms} data source${connectedPlatforms !== 1 ? 's' : ''}`
              : hasBehavioralData
                ? 'Assessment data available'
                : 'No platforms connected'
            }
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!quickAssessmentComplete && (
          <Button
            onClick={() => navigate('/personality')}
            size="sm"
            className="flex-1"
            style={{
              backgroundColor: accentColor,
              color: '#F7F7F3'
            }}
          >
            <Zap className="w-4 h-4 mr-1" />
            Take Quick Assessment
          </Button>
        )}
        {!bigFiveComplete && (
          <Button
            onClick={() => navigate('/big-five')}
            size="sm"
            className="flex-1"
            style={{
              backgroundColor: quickAssessmentComplete ? accentColor : 'rgba(45, 39, 34, 0.08)',
              color: quickAssessmentComplete ? '#F7F7F3' : accentColor,
              border: 'none'
            }}
          >
            <Target className="w-4 h-4 mr-1" />
            {quickAssessmentComplete ? 'Take Full Assessment' : 'Full Assessment'}
          </Button>
        )}
        {quickAssessmentComplete && bigFiveComplete && (
          <Button
            onClick={() => navigate('/get-started')}
            size="sm"
            className="flex-1"
            style={{
              backgroundColor: 'rgba(45, 39, 34, 0.08)',
              color: accentColor,
              border: 'none'
            }}
          >
            Connect More Platforms
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>

      {/* Improvement tip */}
      {!hasFullData && (
        <p className="text-xs text-center mt-3" style={{ color: textSecondary }}>
          {!bigFiveComplete
            ? 'Complete the full assessment for more accurate personality insights'
            : !hasBehavioralData
              ? 'Connect platforms to see how your behavior matches your assessment'
              : 'Connect more platforms for richer behavioral data'
          }
        </p>
      )}
    </GlassPanel>
  );
};

export default AssessmentStatusCard;
