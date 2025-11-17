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
import { useTheme } from '@/contexts/ThemeContext';
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

export function RecommendationsSidebar({
  recommendations,
  insights = [],
  isOpen,
  onClose,
  onApplyRecommendation
}: RecommendationsSidebarProps) {
  const { theme } = useTheme();
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'music': return Music;
      case 'video': return Video;
      default: return Lightbulb;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return theme === 'dark' ? '#4ade80' : '#16a34a';
    if (confidence >= 0.6) return theme === 'dark' ? '#fbbf24' : '#ca8a04';
    return theme === 'dark' ? '#f87171' : '#dc2626';
  };

  const getSignificanceColor = (significance: 'high' | 'medium' | 'low') => {
    switch (significance) {
      case 'high': return theme === 'dark' ? '#4ade80' : '#16a34a';
      case 'medium': return theme === 'dark' ? '#fbbf24' : '#ca8a04';
      case 'low': return theme === 'dark' ? '#f87171' : '#dc2626';
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => onClose()}
        className="fixed right-0 top-1/2 -translate-y-1/2 p-3 rounded-l-xl transition-all hover:scale-110 z-50"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
          color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
        }}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    );
  }

  const hasContent = recommendations.length > 0 || insights.length > 0;

  return (
    <div
      className="fixed right-0 top-0 h-screen w-96 border-l overflow-y-auto z-50 transition-transform duration-300"
      style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA',
        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)'
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.9)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(12px)'
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }} />
          <h2 className="text-base font-semibold" style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}>
            Recommendations
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-opacity-80 transition-colors"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            color: theme === 'dark' ? '#C1C0B6' : '#57534e'
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {!hasContent ? (
          <div className="text-center py-12">
            <Sparkles className="w-12 h-12 mx-auto mb-4" style={{
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : '#d6d3d1'
            }} />
            <p className="text-sm" style={{
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
            }}>
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
                  style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>Key Insights</span>
                    <Badge className="text-xs" style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>
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
                        className="p-4 rounded-lg border"
                        style={{
                          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(255, 255, 255, 0.8)',
                          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Badge className="text-xs capitalize" style={{
                            backgroundColor: getSignificanceColor(insight.significance) + '20',
                            color: getSignificanceColor(insight.significance),
                            border: `1px solid ${getSignificanceColor(insight.significance)}40`
                          }}>
                            {insight.significance}
                          </Badge>
                          <span className="text-xs" style={{
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                          }}>
                            {insight.evidence.occurrences} occurrences
                          </span>
                        </div>
                        <p className="text-sm mb-2" style={{
                          color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                        }}>
                          {insight.insight}
                        </p>
                        {insight.recommendation && (
                          <p className="text-xs mt-2 pt-2" style={{
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c',
                            borderTop: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`
                          }}>
                            💡 {insight.recommendation}
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
                theme={theme}
                getConfidenceColor={getConfidenceColor}
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
                theme={theme}
                getConfidenceColor={getConfidenceColor}
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
                theme={theme}
                getConfidenceColor={getConfidenceColor}
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
  theme: 'light' | 'dark';
  getConfidenceColor: (confidence: number) => string;
}

function RecommendationGroup({
  type,
  icon: Icon,
  title,
  recommendations,
  isExpanded,
  onToggle,
  onApply,
  theme,
  getConfidenceColor
}: RecommendationGroupProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between mb-3 text-sm font-medium"
        style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span>{title}</span>
          <Badge className="text-xs" style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}>
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
              className="p-4 rounded-lg border transition-all hover:scale-[1.01]"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium flex-1" style={{
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}>
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

              <p className="text-xs mb-3" style={{
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c'
              }}>
                {rec.description}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-xs" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                }}>
                  via {rec.sourceAgent.replace('Agent', '')}
                </span>

                {rec.url && (
                  <Button
                    onClick={() => {
                      window.open(rec.url, '_blank');
                      onApply?.(rec);
                    }}
                    size="sm"
                    className="h-7 text-xs"
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
