/**
 * RecommendationsSidebar Component
 *
 * Displays orchestrator recommendations in a collapsible sidebar.
 * Shows music, video, and actionable recommendations with confidence scores.
 *
 * Features:
 * - Collapsible sidebar with smooth animations
 * - Grouped recommendations by type
 * - Confidence indicators
 * - Agent attribution
 * - Click to apply/open recommendations
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Music, Video, Lightbulb, ExternalLink, ChevronRight,
  ChevronLeft, Sparkles, TrendingUp, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { OrchestratorRecommendation, OrchestratorInsight } from '@/hooks/useOrchestrator';

interface RecommendationsSidebarProps {
  recommendations: OrchestratorRecommendation[];
  insights?: OrchestratorInsight[];
  isOpen: boolean;
  onClose: () => void;
  onApplyRecommendation?: (recommendation: OrchestratorRecommendation) => void;
}

const glassCard = {
  backgroundColor: 'rgba(255, 255, 255, 0.18)',
  backdropFilter: 'blur(10px) saturate(140%)',
  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
  border: '1px solid rgba(255, 255, 255, 0.45)',
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return '#16a34a';
  if (confidence >= 0.6) return '#ca8a04';
  return '#dc2626';
};

const getSignificanceColor = (significance: 'high' | 'medium' | 'low'): string => {
  switch (significance) {
    case 'high': return '#16a34a';
    case 'medium': return '#ca8a04';
    case 'low': return '#dc2626';
  }
};

export function RecommendationsSidebar({
  recommendations,
  insights = [],
  isOpen,
  onClose,
  onApplyRecommendation
}: RecommendationsSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['music', 'video', 'insights'])
  );

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Group recommendations by type
  const musicRecommendations = recommendations.filter(r => r.type === 'music');
  const videoRecommendations = recommendations.filter(r => r.type === 'video');
  const actionRecommendations = recommendations.filter(r =>
    r.type === 'action' || r.type === 'content' || r.type === 'insight'
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => onClose()}
        className="fixed right-0 top-1/2 -translate-y-1/2 p-3 rounded-l-xl transition-all hover:scale-110 z-50"
        style={{
          ...glassCard,
          color: '#8A857D'
        }}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    );
  }

  const hasContent = recommendations.length > 0 || insights.length > 0;

  return (
    <div
      className="fixed right-0 top-0 h-screen w-96 overflow-y-auto z-50 transition-transform duration-300"
      style={{
        backgroundColor: '#F7F7F3',
        borderLeft: '1px solid rgba(255, 255, 255, 0.45)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)'
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between"
        style={{
          backgroundColor: 'rgba(247, 247, 243, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(12px)'
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: '#1F1C18' }} />
          <h2 className="text-base font-semibold" style={{ color: '#1F1C18' }}>
            Recommendations
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg transition-colors hover:bg-white/40"
          style={{ color: '#8A857D' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {!hasContent ? (
          <div className="text-center py-12">
            <Sparkles className="w-12 h-12 mx-auto mb-4" style={{ color: '#8A857D', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: '#8A857D' }}>
              Ask your twin for recommendations
            </p>
          </div>
        ) : (
          <>
            {/* Key Insights */}
            {insights.length > 0 && (
              <div>
                <button
                  onClick={() => toggleGroup('insights')}
                  className="w-full flex items-center justify-between mb-3 text-sm font-medium"
                  style={{ color: '#1F1C18' }}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>Key Insights</span>
                    <Badge
                      className="text-xs"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.08)',
                        color: '#1F1C18'
                      }}
                    >
                      {insights.length}
                    </Badge>
                  </div>
                  <ChevronRight
                    className={cn(
                      "w-4 h-4 transition-transform",
                      expandedGroups.has('insights') && "rotate-90"
                    )}
                  />
                </button>

                {expandedGroups.has('insights') && (
                  <div className="space-y-3">
                    {insights.map((insight, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl"
                        style={glassCard}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Badge
                            className="text-xs capitalize"
                            style={{
                              backgroundColor: getSignificanceColor(insight.significance) + '20',
                              color: getSignificanceColor(insight.significance),
                              border: `1px solid ${getSignificanceColor(insight.significance)}40`
                            }}
                          >
                            {insight.significance}
                          </Badge>
                          <span className="text-xs" style={{ color: '#8A857D' }}>
                            {insight.evidence.occurrences} occurrences
                          </span>
                        </div>
                        <p className="text-sm mb-2" style={{ color: '#1F1C18' }}>
                          {insight.insight}
                        </p>
                        {insight.recommendation && (
                          <p
                            className="text-xs mt-2 pt-2"
                            style={{
                              color: '#8A857D',
                              borderTop: '1px solid rgba(255, 255, 255, 0.45)'
                            }}
                          >
                            {insight.recommendation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Music Recommendations */}
            {musicRecommendations.length > 0 && (
              <RecommendationGroup
                type="music"
                icon={Music}
                title="Music"
                recommendations={musicRecommendations}
                isExpanded={expandedGroups.has('music')}
                onToggle={() => toggleGroup('music')}
                onApply={onApplyRecommendation}
              />
            )}

            {/* Video Recommendations */}
            {videoRecommendations.length > 0 && (
              <RecommendationGroup
                type="video"
                icon={Video}
                title="Videos"
                recommendations={videoRecommendations}
                isExpanded={expandedGroups.has('video')}
                onToggle={() => toggleGroup('video')}
                onApply={onApplyRecommendation}
              />
            )}

            {/* Action Recommendations */}
            {actionRecommendations.length > 0 && (
              <RecommendationGroup
                type="action"
                icon={Lightbulb}
                title="Suggestions"
                recommendations={actionRecommendations}
                isExpanded={expandedGroups.has('action')}
                onToggle={() => toggleGroup('action')}
                onApply={onApplyRecommendation}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Recommendation Group Component
interface RecommendationGroupProps {
  type: string;
  icon: React.ElementType;
  title: string;
  recommendations: OrchestratorRecommendation[];
  isExpanded: boolean;
  onToggle: () => void;
  onApply?: (recommendation: OrchestratorRecommendation) => void;
}

function RecommendationGroup({
  type,
  icon: Icon,
  title,
  recommendations,
  isExpanded,
  onToggle,
  onApply,
}: RecommendationGroupProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between mb-3 text-sm font-medium"
        style={{ color: '#1F1C18' }}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span>{title}</span>
          <Badge
            className="text-xs"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
              color: '#1F1C18'
            }}
          >
            {recommendations.length}
          </Badge>
        </div>
        <ChevronRight
          className={cn(
            "w-4 h-4 transition-transform",
            isExpanded && "rotate-90"
          )}
        />
      </button>

      {isExpanded && (
        <div className="space-y-3">
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl transition-all hover:scale-[1.01]"
              style={glassCard}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium flex-1" style={{ color: '#1F1C18' }}>
                  {rec.title}
                </h4>
                <Badge
                  className="text-xs shrink-0"
                  style={{
                    backgroundColor: getConfidenceColor(rec.confidence) + '20',
                    color: getConfidenceColor(rec.confidence),
                    border: `1px solid ${getConfidenceColor(rec.confidence)}40`
                  }}
                >
                  {Math.round(rec.confidence * 100)}%
                </Badge>
              </div>

              <p className="text-xs mb-3" style={{ color: '#8A857D' }}>
                {rec.description}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#8A857D', opacity: 0.7 }}>
                  via {rec.sourceAgent.replace('Agent', '')}
                </span>

                {rec.url && (
                  <Button
                    onClick={() => {
                      window.open(rec.url, '_blank');
                      onApply?.(rec);
                    }}
                    size="sm"
                    className="h-7 text-xs btn-cta-app"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
