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
import { Brain, RefreshCw, Star } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';

import {
  type GraphNode,
  type GraphLink,
  CATEGORY_CONFIG,
  SOURCE_TYPE_INFO,
  createNodeThreeObject,
} from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from '@/components/brain/BrainTheme';
import { BrainHeader } from '@/components/brain/BrainHeader';
import { BrainStatsRow } from '@/components/brain/BrainStatsRow';
import { CausalStatsPanel } from '@/components/brain/CausalStatsPanel';
import { LearningSuggestionsPanel } from '@/components/brain/LearningSuggestionsPanel';
import { CategoryFilters, CategoryDistribution } from '@/components/brain/CategoryFilters';
import { ContextSelector } from '@/components/brain/ContextSelector';
import { FullscreenToggle, GraphInstructions } from '@/components/brain/BrainOverlays';
import { UnderstandingSection } from '@/components/brain/UnderstandingSection';
import { NodeDetailsPanel } from '@/components/brain/NodeDetailsPanel';
import { RelationshipsPanel } from '@/components/brain/RelationshipsPanel';
import { ContextExpressionPanel } from '@/components/brain/ContextExpressionPanel';
import { useBrainGraphData } from '@/hooks/useBrainGraphData';

const BrainExplorer: React.FC = () => {
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
        <NodeDetailsPanel
          selectedNode={selectedNode}
          textColor={textColor}
          textSecondary={textSecondary}
          textMuted={textMuted}
          textFaint={textFaint}
          subtleBg={subtleBg}
          onClose={() => setSelectedNode(null)}
        >
          <RelationshipsPanel
            selectedNodeId={selectedNode.id}
            showEdgesPanel={showEdgesPanel}
            onToggleEdgesPanel={() => setShowEdgesPanel(!showEdgesPanel)}
            getNodeEdges={getNodeEdges}
            getNodeLabel={getNodeLabel}
            upgradingEdge={upgradingEdge}
            setUpgradingEdge={setUpgradingEdge}
            selectedCausalType={selectedCausalType}
            setSelectedCausalType={setSelectedCausalType}
            upgradeEdgeToCausal={upgradeEdgeToCausal}
            edgeUpgradeLoading={edgeUpgradeLoading}
            textColor={textColor}
            textMuted={textMuted}
            textFaint={textFaint}
            subtleBg={subtleBg}
          />
          <ContextExpressionPanel
            selectedNodeId={selectedNode.id}
            showContextPanel={showContextPanel}
            onToggleContextPanel={() => setShowContextPanel(!showContextPanel)}
            editingContext={editingContext}
            setEditingContext={setEditingContext}
            contextExpressionLevel={contextExpressionLevel}
            setContextExpressionLevel={setContextExpressionLevel}
            contextNotes={contextNotes}
            setContextNotes={setContextNotes}
            nodeContextExpressions={nodeContextExpressions}
            setContextExpression={setContextExpression}
            contextExpressionLoading={contextExpressionLoading}
            textColor={textColor}
            textMuted={textMuted}
            textFaint={textFaint}
            subtleBg={subtleBg}
          />
        </NodeDetailsPanel>
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
