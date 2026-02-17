import React from 'react';
import {
  Sparkles,
  X,
  Info,
  ExternalLink,
  Layers,
  Brain,
  Star
} from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import {
  type GraphNode,
  CATEGORY_CONFIG,
  SOURCE_TYPE_INFO,
  ABSTRACTION_LEVELS,
  FRESHNESS_CONFIG,
} from '@/components/brain/BrainNodeRenderer';

interface NodeDetailsPanelProps {
  selectedNode: GraphNode;
  textColor: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  subtleBg: string;
  onClose: () => void;
  children?: React.ReactNode;
}

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({
  selectedNode,
  textColor,
  textSecondary,
  textMuted,
  textFaint,
  subtleBg,
  onClose,
  children,
}) => {
  return (
    <GlassPanel className="!p-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: `${CATEGORY_CONFIG[selectedNode.category]?.color || '#DDA0DD'}20`
            }}
          >
            {(() => {
              const Icon = CATEGORY_CONFIG[selectedNode.category]?.icon || Star;
              return <Icon className="w-7 h-7" style={{ color: CATEGORY_CONFIG[selectedNode.category]?.color || '#DDA0DD' }} />;
            })()}
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: textColor }}>
              {selectedNode.label}
            </h3>
            <p className="text-sm mb-3" style={{ color: textSecondary }}>
              {selectedNode.description}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-lg text-sm capitalize" style={{ backgroundColor: subtleBg, color: textSecondary }}>
                {selectedNode.type}
              </span>
              <span className="px-3 py-1 rounded-lg text-sm capitalize" style={{ backgroundColor: subtleBg, color: textSecondary }}>
                {selectedNode.category}
              </span>
              {selectedNode.platform && (
                <span className="px-3 py-1 rounded-lg text-sm capitalize flex items-center gap-1" style={{ backgroundColor: subtleBg, color: textSecondary }}>
                  <ExternalLink className="w-3 h-3" />
                  via {selectedNode.platform}
                </span>
              )}
              {selectedNode.abstraction_level && ABSTRACTION_LEVELS[selectedNode.abstraction_level] && (
                <span
                  className="px-3 py-1 rounded-lg text-sm flex items-center gap-1.5 font-medium"
                  style={{
                    backgroundColor: `${ABSTRACTION_LEVELS[selectedNode.abstraction_level].color}20`,
                    color: ABSTRACTION_LEVELS[selectedNode.abstraction_level].color
                  }}
                >
                  <Layers className="w-3 h-3" />
                  {ABSTRACTION_LEVELS[selectedNode.abstraction_level].label}
                </span>
              )}
              {selectedNode.temporal && FRESHNESS_CONFIG[selectedNode.temporal.freshness] && (
                <span
                  className="px-3 py-1 rounded-lg text-sm flex items-center gap-1.5 font-medium"
                  style={{
                    backgroundColor: `${FRESHNESS_CONFIG[selectedNode.temporal.freshness].color}20`,
                    color: FRESHNESS_CONFIG[selectedNode.temporal.freshness].color
                  }}
                >
                  {(() => {
                    const FIcon = FRESHNESS_CONFIG[selectedNode.temporal.freshness].icon;
                    return <FIcon className="w-3 h-3" />;
                  })()}
                  {FRESHNESS_CONFIG[selectedNode.temporal.freshness].label}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg transition-colors hover:bg-opacity-80"
          style={{ backgroundColor: subtleBg }}
        >
          <X className="w-5 h-5" style={{ color: textMuted }} />
        </button>
      </div>

      {/* Source Type Explanation */}
      <div
        className="mt-4 p-4 rounded-xl"
        style={{
          backgroundColor: SOURCE_TYPE_INFO[selectedNode.source_type || 'inferred']?.color + '10',
          border: `1px solid ${SOURCE_TYPE_INFO[selectedNode.source_type || 'inferred']?.color}30`
        }}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: SOURCE_TYPE_INFO[selectedNode.source_type || 'inferred']?.color }} />
          <div>
            <h4 className="font-medium" style={{ color: SOURCE_TYPE_INFO[selectedNode.source_type || 'inferred']?.color }}>
              {SOURCE_TYPE_INFO[selectedNode.source_type || 'inferred']?.label}
            </h4>
            <p className="text-sm mt-1" style={{ color: textSecondary }}>
              {SOURCE_TYPE_INFO[selectedNode.source_type || 'inferred']?.description}
            </p>
          </div>
        </div>
      </div>

      {/* Abstraction Level Explanation (Phase 2) */}
      {selectedNode.abstraction_level && ABSTRACTION_LEVELS[selectedNode.abstraction_level] && (
        <div
          className="mt-4 p-4 rounded-xl"
          style={{
            backgroundColor: ABSTRACTION_LEVELS[selectedNode.abstraction_level].color + '10',
            border: `1px solid ${ABSTRACTION_LEVELS[selectedNode.abstraction_level].color}30`
          }}
        >
          <div className="flex items-start gap-3">
            <Layers className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ABSTRACTION_LEVELS[selectedNode.abstraction_level].color }} />
            <div>
              <h4 className="font-medium flex items-center gap-2" style={{ color: ABSTRACTION_LEVELS[selectedNode.abstraction_level].color }}>
                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: ABSTRACTION_LEVELS[selectedNode.abstraction_level].color + '30' }}>
                  {ABSTRACTION_LEVELS[selectedNode.abstraction_level].icon}
                </span>
                {ABSTRACTION_LEVELS[selectedNode.abstraction_level].label}
              </h4>
              <p className="text-sm mt-1" style={{ color: textSecondary }}>
                {ABSTRACTION_LEVELS[selectedNode.abstraction_level].description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Temporal Dynamics Section (Phase 3) */}
      {selectedNode.temporal && selectedNode.temporal.freshness !== 'unknown' && (
        <div
          className="mt-4 p-4 rounded-xl"
          style={{
            backgroundColor: FRESHNESS_CONFIG[selectedNode.temporal.freshness].color + '10',
            border: `1px solid ${FRESHNESS_CONFIG[selectedNode.temporal.freshness].color}30`
          }}
        >
          <div className="flex items-start gap-3">
            {(() => {
              const FIcon = FRESHNESS_CONFIG[selectedNode.temporal.freshness].icon;
              return <FIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: FRESHNESS_CONFIG[selectedNode.temporal.freshness].color }} />;
            })()}
            <div className="flex-1">
              <h4 className="font-medium" style={{ color: FRESHNESS_CONFIG[selectedNode.temporal.freshness].color }}>
                Knowledge Freshness: {FRESHNESS_CONFIG[selectedNode.temporal.freshness].label}
              </h4>
              <p className="text-sm mt-1" style={{ color: textSecondary }}>
                {FRESHNESS_CONFIG[selectedNode.temporal.freshness].description}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                {selectedNode.temporal.daysSinceUpdate !== null && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Age</span>
                    <p className="text-lg font-bold" style={{ color: textColor }}>
                      {selectedNode.temporal.daysSinceUpdate} days
                    </p>
                  </div>
                )}
                {selectedNode.temporal.freshness !== 'stale' && selectedNode.temporal.daysUntilStale !== null && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Until Stale</span>
                    <p className="text-lg font-bold" style={{ color: textColor }}>
                      {selectedNode.temporal.daysUntilStale} days
                    </p>
                  </div>
                )}
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Decayed Conf.</span>
                  <p className="text-lg font-bold" style={{ color: textColor }}>
                    {Math.round(selectedNode.temporal.decayedConfidence * 100)}%
                  </p>
                </div>
              </div>
              {selectedNode.temporal.lastReinforced && (
                <p className="text-xs mt-2" style={{ color: textMuted }}>
                  Last reinforced: {new Date(selectedNode.temporal.lastReinforced).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evidence Section */}
      {selectedNode.data?.evidence && (
        <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: subtleBg }}>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: textColor }}>
            <Info className="w-4 h-4" />
            Evidence & Provenance
          </h4>

          {selectedNode.data.evidence.interpretation && (
            <p className="text-sm mb-3 italic" style={{ color: textSecondary }}>
              "{selectedNode.data.evidence.interpretation}"
            </p>
          )}

          {selectedNode.data.evidence.description && (
            <p className="text-sm mb-3" style={{ color: textSecondary }}>
              {selectedNode.data.evidence.description}
            </p>
          )}

          {selectedNode.data.evidence.raw_evidence && (
            <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: 'rgba(78, 205, 196, 0.1)' }}>
              <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Observed Evidence:</span>
              <p className="text-sm mt-1" style={{ color: '#4ECDC4' }}>
                {selectedNode.data.evidence.raw_evidence}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {(selectedNode.data.evidence.sample_size || selectedNode.data.sample_size) && (
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Data Points</span>
                <p className="text-lg font-bold" style={{ color: textColor }}>
                  {selectedNode.data.evidence.sample_size || selectedNode.data.sample_size}
                </p>
              </div>
            )}

            {selectedNode.data.evidence.platforms_analyzed && selectedNode.data.evidence.platforms_analyzed.length > 0 && (
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Platforms</span>
                <p className="text-sm font-medium capitalize" style={{ color: textColor }}>
                  {selectedNode.data.evidence.platforms_analyzed.join(', ')}
                </p>
              </div>
            )}

            {selectedNode.data.evidence.source && (
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Source</span>
                <p className="text-sm font-medium capitalize" style={{ color: textColor }}>
                  {selectedNode.data.evidence.source.replace(/_/g, ' ')}
                </p>
              </div>
            )}

            {selectedNode.data.evidence.observations && (
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Observations</span>
                <p className="text-lg font-bold" style={{ color: textColor }}>
                  {selectedNode.data.evidence.observations}
                </p>
              </div>
            )}

            {selectedNode.data.evidence.questionnaire && (
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Assessment</span>
                <p className="text-sm font-medium" style={{ color: textColor }}>
                  {selectedNode.data.evidence.questionnaire}
                </p>
              </div>
            )}

            {selectedNode.data.evidence.last_updated && (
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Last Updated</span>
                <p className="text-sm font-medium" style={{ color: textColor }}>
                  {new Date(selectedNode.data.evidence.last_updated).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Personality Score (for Big Five nodes) */}
      {selectedNode.data?.dimension && (
        <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(78, 205, 196, 0.1)', border: '1px solid rgba(78, 205, 196, 0.2)' }}>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: '#4ECDC4' }}>
            <Brain className="w-4 h-4" />
            Big Five Personality Dimension
          </h4>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm capitalize" style={{ color: textSecondary }}>
              {selectedNode.data.dimension_label || selectedNode.data.dimension}
            </span>
            <span className="text-xl font-bold" style={{ color: '#4ECDC4' }}>
              {selectedNode.data.score}/100
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(78, 205, 196, 0.2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${selectedNode.data.score}%`,
                backgroundColor: '#4ECDC4'
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: textMuted }}>
            {selectedNode.data.description}
          </p>
        </div>
      )}

      {/* Confidence & Strength Bars */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: textMuted }}>Confidence Level</span>
            <span className="font-medium" style={{ color: textColor }}>{Math.round(selectedNode.confidence * 100)}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: subtleBg }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${selectedNode.confidence * 100}%`,
                backgroundColor: CATEGORY_CONFIG[selectedNode.category]?.color || '#DDA0DD'
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: textFaint }}>
            {selectedNode.data?.evidence?.confidence
              ? `${selectedNode.data.evidence.confidence}% from ${selectedNode.data.evidence.source || 'analysis'}`
              : 'Based on frequency and consistency of data signals'}
          </p>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: textMuted }}>Strength</span>
            <span className="font-medium" style={{ color: textColor }}>{Math.round(selectedNode.strength * 100)}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: subtleBg }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${selectedNode.strength * 100}%`,
                backgroundColor: CATEGORY_CONFIG[selectedNode.category]?.color || '#DDA0DD'
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: textFaint }}>
            How central this is to your identity profile
          </p>
        </div>
      </div>

      {children}
    </GlassPanel>
  );
};
