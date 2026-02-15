/**
 * Brain Explorer Component
 *
 * An immersive 3D visualization of your Twin's Brain - the unified knowledge graph
 * that captures everything unique about you. Uses WebGL/Three.js for stunning
 * interactive 3D force-directed graphs.
 *
 * Orchestrates sub-components:
 * - BrainNodeRenderer: Node rendering, types, and config constants
 * - BrainControls: UI controls, filters, stats, and legend
 * - useBrainGraphData: Data fetching and graph transformation
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import ForceGraph3D, { ForceGraph3DInstance } from 'react-force-graph-3d';
import {
  Brain,
  Sparkles,
  RefreshCw,
  Zap,
  X,
  Info,
  ExternalLink,
  Layers,
  GitBranch,
  Star
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassPanel } from '@/components/layout/PageLayout';

// Sub-components and hook
import {
  type GraphNode,
  type GraphLink,
  CATEGORY_CONFIG,
  SOURCE_TYPE_INFO,
  ABSTRACTION_LEVELS,
  FRESHNESS_CONFIG,
  CONTEXT_CONFIG,
  createNodeThreeObject,
} from '@/components/brain/BrainNodeRenderer';
import {
  useBrainThemeColors,
  BrainHeader,
  BrainStatsRow,
  CausalStatsPanel,
  LearningSuggestionsPanel,
  CategoryFilters,
  ContextSelector,
  FullscreenToggle,
  GraphInstructions,
  CategoryDistribution,
  UnderstandingSection,
} from '@/components/brain/BrainControls';
import { useBrainGraphData } from '@/hooks/useBrainGraphData';

const BrainExplorer: React.FC = () => {
  const { theme } = useTheme();
  const graphRef = useRef<ForceGraph3DInstance>();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    textColor, textSecondary, textMuted, textFaint, subtleBg, bgColor
  } = useBrainThemeColors();

  const {
    visualization,
    health,
    loading,
    error,
    filterCategory,
    setFilterCategory,
    knowledgeGaps,
    suggestions,
    selectedContext,
    setSelectedContext,
    graphData,
    fetchBrainData,
    getNodeEdges,
    upgradeEdgeToCausal,
    getNodeLabel,
    fetchNodeContextExpressions,
    setContextExpression,
    handleSuggestionClick,
    upgradingEdge,
    setUpgradingEdge,
    selectedCausalType,
    setSelectedCausalType,
    edgeUpgradeLoading,
    nodeContextExpressions,
    setNodeContextExpressions,
    contextExpressionLoading,
  } = useBrainGraphData();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Phase 4: Edge & Context panel toggles
  const [showEdgesPanel, setShowEdgesPanel] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [contextExpressionLevel, setContextExpressionLevel] = useState<number>(1.0);
  const [contextNotes, setContextNotes] = useState<string>('');

  // Update dimensions when container changes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 800,
          height: isFullscreen ? window.innerHeight - 120 : Math.max(500, rect.height)
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isFullscreen]);

  // Fetch context expressions when a node is selected
  useEffect(() => {
    if (selectedNode) {
      fetchNodeContextExpressions(selectedNode.id);
    } else {
      setNodeContextExpressions({});
    }
  }, [selectedNode?.id]);

  // Memoized node three object creator (stable callback)
  const nodeThreeObjectCallback = useCallback((node: GraphNode) => {
    return createNodeThreeObject(node);
  }, []);

  // Handle node click
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(selectedNode?.id === node.id ? null : node);

    if (graphRef.current) {
      const distance = 150;
      const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);

      graphRef.current.cameraPosition(
        { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
        { x: node.x || 0, y: node.y || 0, z: node.z || 0 },
        1000
      );
    }
  }, [selectedNode]);

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 800,
          height: !isFullscreen ? window.innerHeight - 120 : Math.max(500, rect.height)
        });
      }
    }, 100);
  }, [isFullscreen]);

  // ─── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-full animate-pulse" style={{
            background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.3) 0%, rgba(221, 160, 221, 0.3) 100%)'
          }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Brain className="w-10 h-10 animate-pulse" style={{ color: '#4ECDC4' }} />
          </div>
        </div>
        <p className="text-lg" style={{ color: textSecondary }}>
          Mapping your neural pathways in 3D...
        </p>
        <p className="text-sm" style={{ color: textMuted }}>
          Building your interactive knowledge universe
        </p>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────

  if (error) {
    return (
      <GlassPanel className="text-center py-12">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
          backgroundColor: 'rgba(139, 92, 246, 0.1)'
        }}>
          <Brain className="w-8 h-8" style={{ color: '#8B5CF6' }} />
        </div>
        <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--font-heading)', color: textColor }}>
          Your Twin's Brain is Empty
        </h3>
        <p className="mb-6" style={{ color: textSecondary }}>
          Start chatting with your twin and connecting data sources to build knowledge.
        </p>
        <button
          onClick={() => fetchBrainData(selectedContext)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl mx-auto transition-all hover:scale-[1.02]"
          style={{ backgroundColor: subtleBg, color: textColor }}
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </GlassPanel>
    );
  }

  // ─── Main Render ───────────────────────────────────────────

  return (
    <div className={`space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : ''}`}>
      {/* Header with Health Score */}
      <BrainHeader
        health={health}
        selectedContext={selectedContext}
        onRefresh={() => fetchBrainData(selectedContext)}
      />

      {/* Stats Row */}
      <BrainStatsRow health={health} visualization={visualization} />

      {/* Causal Reasoning Stats (Phase 4) */}
      <CausalStatsPanel visualization={visualization} />

      {/* Active Learning Suggestions (Phase 3) */}
      <LearningSuggestionsPanel
        suggestions={suggestions}
        knowledgeGaps={knowledgeGaps}
        onSuggestionClick={handleSuggestionClick}
      />

      {/* Category Filters */}
      <CategoryFilters
        visualization={visualization}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
      />

      {/* Context Selector (Phase 4) */}
      <ContextSelector
        selectedContext={selectedContext}
        setSelectedContext={setSelectedContext}
      />

      {/* 3D Visualization */}
      <GlassPanel className="!p-2 relative overflow-hidden">
        <FullscreenToggle isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        <GraphInstructions />

        {/* 3D Graph Container */}
        <div
          ref={containerRef}
          className="w-full rounded-xl overflow-hidden"
          style={{
            height: isFullscreen ? 'calc(100vh - 280px)' : '600px',
            minHeight: '500px'
          }}
        >
          <ForceGraph3D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={bgColor}
            nodeThreeObject={nodeThreeObjectCallback}
            nodeThreeObjectExtend={false}
            linkColor={(link: GraphLink) => link.color || '#666666'}
            linkWidth={(link: GraphLink) => Math.max(0.5, link.strength * 3)}
            linkOpacity={0.4}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleColor={(link: GraphLink) => link.color || '#4ECDC4'}
            linkDirectionalArrowLength={(link: GraphLink) => link.isCausal ? 6 : 0}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={(link: GraphLink) => link.color || '#E74C3C'}
            linkCurvature={(link: GraphLink) => link.isCausal ? 0.15 : 0}
            onNodeClick={handleNodeClick}
            onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
            enableNodeDrag={true}
            enableNavigationControls={true}
            showNavInfo={false}
            nodeLabel={() => ''}
            warmupTicks={50}
            cooldownTicks={100}
          />
        </div>

        {/* Hover Tooltip */}
        {hoveredNode && !selectedNode && (
          <div className="absolute bottom-4 left-4 z-10 max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
            <GlassPanel className="!p-4 !bg-opacity-95 backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: `${CATEGORY_CONFIG[hoveredNode.category]?.color || '#DDA0DD'}20`
                  }}
                >
                  {(() => {
                    const Icon = CATEGORY_CONFIG[hoveredNode.category]?.icon || Star;
                    return <Icon className="w-5 h-5" style={{ color: CATEGORY_CONFIG[hoveredNode.category]?.color || '#DDA0DD' }} />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate" style={{ color: textColor }}>
                    {hoveredNode.label}
                  </h4>
                  <p className="text-xs mt-1" style={{ color: textSecondary }}>
                    {hoveredNode.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: SOURCE_TYPE_INFO[hoveredNode.source_type || 'inferred']?.color + '20',
                        color: SOURCE_TYPE_INFO[hoveredNode.source_type || 'inferred']?.color
                      }}
                    >
                      {SOURCE_TYPE_INFO[hoveredNode.source_type || 'inferred']?.label}
                    </span>
                    <span className="text-xs" style={{ color: textMuted }}>
                      {Math.round(hoveredNode.confidence * 100)}% confident
                    </span>
                  </div>
                </div>
              </div>
            </GlassPanel>
          </div>
        )}
      </GlassPanel>

      {/* Selected Node Details Panel */}
      {selectedNode && (
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
              onClick={() => setSelectedNode(null)}
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

          {/* Causal Relationships Section (Phase 4) */}
          <div className="mt-6">
            <button
              onClick={() => setShowEdgesPanel(!showEdgesPanel)}
              className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
              style={{
                backgroundColor: 'rgba(108, 92, 231, 0.1)',
                border: '1px solid rgba(108, 92, 231, 0.2)'
              }}
            >
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" style={{ color: '#6C5CE7' }} />
                <span className="font-medium" style={{ color: '#6C5CE7' }}>Relationships</span>
              </div>
              <span className="text-sm" style={{ color: textMuted }}>
                {showEdgesPanel ? '\u25B2' : '\u25BC'}
              </span>
            </button>

            {showEdgesPanel && (
              <div className="mt-3 space-y-4">
                {(() => {
                  const { incoming, outgoing } = getNodeEdges(selectedNode.id);
                  const allEdges = [...incoming.map(e => ({ ...e, direction: 'incoming' as const })),
                                   ...outgoing.map(e => ({ ...e, direction: 'outgoing' as const }))];

                  if (allEdges.length === 0) {
                    return (
                      <p className="text-sm text-center py-4" style={{ color: textMuted }}>
                        No relationships found for this node
                      </p>
                    );
                  }

                  return allEdges.map((edge) => {
                    const isCausal = ['causes', 'enables', 'triggers', 'inhibits'].includes(edge.type);
                    const isCorrelational = ['correlates_with', 'similar_to'].includes(edge.type);
                    const connectedNodeId = edge.direction === 'incoming' ? edge.source : edge.target;
                    const connectedLabel = getNodeLabel(connectedNodeId);

                    return (
                      <div
                        key={edge.id}
                        className="p-3 rounded-lg"
                        style={{
                          backgroundColor: isCausal ? 'rgba(231, 76, 60, 0.1)' :
                                          isCorrelational ? 'rgba(162, 155, 254, 0.1)' :
                                          'rgba(193, 192, 182, 0.05)',
                          border: `1px solid ${isCausal ? 'rgba(231, 76, 60, 0.2)' :
                                               isCorrelational ? 'rgba(162, 155, 254, 0.2)' :
                                               'rgba(193, 192, 182, 0.1)'}`
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isCausal ? 'bg-red-500/20 text-red-400' :
                              isCorrelational ? 'bg-purple-500/20 text-purple-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {isCausal ? '\u26A1 Causal' : isCorrelational ? '\u2248 Correlational' : '\u25CB Other'}
                            </span>
                            <span className="text-xs" style={{ color: textMuted }}>
                              {edge.direction === 'incoming' ? '\u2190 from' : '\u2192 to'}
                            </span>
                          </div>
                          <span className="text-xs" style={{ color: textFaint }}>
                            {Math.round(edge.strength * 100)}% strength
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-sm" style={{ color: textColor }}>
                            {connectedLabel}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{
                            backgroundColor: edge.color + '20',
                            color: edge.color
                          }}>
                            {edge.type.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {!isCausal && (
                          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(193, 192, 182, 0.1)' }}>
                            {upgradingEdge === edge.id ? (
                              <div className="space-y-2">
                                <select
                                  value={selectedCausalType}
                                  onChange={(e) => setSelectedCausalType(e.target.value)}
                                  className="w-full p-2 rounded text-sm bg-transparent border"
                                  style={{
                                    color: textColor,
                                    borderColor: 'rgba(193, 192, 182, 0.2)',
                                    backgroundColor: subtleBg
                                  }}
                                >
                                  <option value="causes">Causes (A directly causes B)</option>
                                  <option value="enables">Enables (A makes B possible)</option>
                                  <option value="triggers">Triggers (A initiates B)</option>
                                  <option value="inhibits">Inhibits (A suppresses B)</option>
                                </select>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => upgradeEdgeToCausal(edge.id, selectedCausalType)}
                                    disabled={edgeUpgradeLoading}
                                    className="flex-1 px-3 py-1.5 rounded text-sm font-medium transition-all"
                                    style={{
                                      backgroundColor: '#E74C3C',
                                      color: 'white',
                                      opacity: edgeUpgradeLoading ? 0.5 : 1
                                    }}
                                  >
                                    {edgeUpgradeLoading ? 'Upgrading...' : 'Confirm'}
                                  </button>
                                  <button
                                    onClick={() => setUpgradingEdge(null)}
                                    className="px-3 py-1.5 rounded text-sm font-medium transition-all"
                                    style={{
                                      backgroundColor: subtleBg,
                                      color: textMuted
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setUpgradingEdge(edge.id)}
                                className="text-xs flex items-center gap-1 hover:underline"
                                style={{ color: '#E74C3C' }}
                              >
                                <Zap className="w-3 h-3" />
                                Mark as causal relationship
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Context Expression Section (Phase 4) */}
          <div className="mt-6">
            <button
              onClick={() => setShowContextPanel(!showContextPanel)}
              className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
              style={{
                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                border: '1px solid rgba(155, 89, 182, 0.2)'
              }}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" style={{ color: '#9B59B6' }} />
                <span className="font-medium" style={{ color: '#9B59B6' }}>Context Expression</span>
              </div>
              <span className="text-sm" style={{ color: textMuted }}>
                {showContextPanel ? '\u25B2' : '\u25BC'}
              </span>
            </button>

            {showContextPanel && (
              <div className="mt-3 space-y-3">
                <p className="text-xs" style={{ color: textMuted }}>
                  Set how this trait expresses in different life contexts
                </p>

                {Object.entries(CONTEXT_CONFIG).map(([ctx, config]) => {
                  const Icon = config.icon;
                  const expression = nodeContextExpressions[ctx];
                  const levelLabels: Record<number, string> = {
                    0.2: 'Suppressed',
                    0.5: 'Reduced',
                    1.0: 'Normal',
                    1.5: 'Enhanced',
                    2.0: 'Dominant'
                  };

                  return (
                    <div
                      key={ctx}
                      className="p-3 rounded-lg"
                      style={{
                        backgroundColor: expression ? `${config.color}10` : subtleBg,
                        border: `1px solid ${expression ? config.color + '30' : 'rgba(193, 192, 182, 0.1)'}`
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: config.color }} />
                          <span className="text-sm font-medium" style={{ color: textColor }}>
                            {config.label}
                          </span>
                          {expression && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{
                              backgroundColor: config.color + '20',
                              color: config.color
                            }}>
                              {levelLabels[expression.level] || `${expression.level}x`}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (editingContext === ctx) {
                              setEditingContext(null);
                            } else {
                              setEditingContext(ctx);
                              setContextExpressionLevel(expression?.level || 1.0);
                              setContextNotes(expression?.notes || '');
                            }
                          }}
                          className="text-xs px-2 py-1 rounded transition-all hover:opacity-80"
                          style={{
                            backgroundColor: editingContext === ctx ? config.color : 'transparent',
                            color: editingContext === ctx ? 'white' : config.color,
                            border: `1px solid ${config.color}`
                          }}
                        >
                          {editingContext === ctx ? 'Cancel' : expression ? 'Edit' : 'Set'}
                        </button>
                      </div>

                      {editingContext === ctx && (
                        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: 'rgba(193, 192, 182, 0.1)' }}>
                          <div>
                            <label className="text-xs block mb-2" style={{ color: textMuted }}>
                              Expression Level
                            </label>
                            <div className="flex gap-2 flex-wrap">
                              {[
                                { value: 0.2, label: 'Suppressed', desc: '20%' },
                                { value: 0.5, label: 'Reduced', desc: '50%' },
                                { value: 1.0, label: 'Normal', desc: '100%' },
                                { value: 1.5, label: 'Enhanced', desc: '150%' },
                                { value: 2.0, label: 'Dominant', desc: '200%' }
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => setContextExpressionLevel(opt.value)}
                                  className="text-xs px-2 py-1 rounded transition-all"
                                  style={{
                                    backgroundColor: contextExpressionLevel === opt.value ? config.color : subtleBg,
                                    color: contextExpressionLevel === opt.value ? 'white' : textMuted,
                                    border: `1px solid ${contextExpressionLevel === opt.value ? config.color : 'rgba(193, 192, 182, 0.2)'}`
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-xs block mb-2" style={{ color: textMuted }}>
                              Notes (optional)
                            </label>
                            <input
                              type="text"
                              value={contextNotes}
                              onChange={(e) => setContextNotes(e.target.value)}
                              placeholder="Why does this trait express differently here?"
                              className="w-full p-2 rounded text-sm bg-transparent border"
                              style={{
                                color: textColor,
                                borderColor: 'rgba(193, 192, 182, 0.2)',
                                backgroundColor: subtleBg
                              }}
                            />
                          </div>

                          <button
                            onClick={() => setContextExpression(selectedNode.id, ctx, contextExpressionLevel, contextNotes)}
                            disabled={contextExpressionLoading}
                            className="w-full px-3 py-2 rounded text-sm font-medium transition-all"
                            style={{
                              backgroundColor: config.color,
                              color: 'white',
                              opacity: contextExpressionLoading ? 0.5 : 1
                            }}
                          >
                            {contextExpressionLoading ? 'Saving...' : 'Save Expression'}
                          </button>
                        </div>
                      )}

                      {expression?.notes && editingContext !== ctx && (
                        <p className="text-xs mt-2 italic" style={{ color: textFaint }}>
                          "{expression.notes}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlassPanel>
      )}

      {/* Category Distribution */}
      <CategoryDistribution
        health={health}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
      />

      {/* Understanding Your Brain */}
      <UnderstandingSection />
    </div>
  );
};

export default BrainExplorer;
