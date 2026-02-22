/**
 * useBrainGraphData Hook
 *
 * Handles data fetching, transformation, and graph node/edge creation
 * for the Brain Explorer visualization.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  type BrainNode,
  type BrainEdge,
  type BrainHealth,
  type VisualizationData,
  type KnowledgeGapsData,
  type LearningSuggestion,
  type GraphNode,
  type GraphLink,
  type GraphData,
  generateNodeDescription,
} from '@/components/brain/BrainNodeRenderer';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3004';

function getCategoryColorForContext(category: string): string {
  const colors: Record<string, string> = {
    entertainment: '#FF6B6B', professional: '#4ECDC4', social: '#45B7D1',
    creative: '#96CEB4', health: '#FFEAA7', personal: '#DDA0DD', learning: '#98D8C8'
  };
  return colors[category] || '#888888';
}

function getEdgeColorForContext(type: string): string {
  const colors: Record<string, string> = {
    correlates_with: '#6C5CE7', leads_to: '#00B894', evolved_from: '#FDCB6E',
    contradicts: '#D63031', reinforces: '#0984E3', similar_to: '#A29BFE',
    causes: '#E74C3C', enables: '#F39C12', triggers: '#9B59B6', inhibits: '#34495E'
  };
  return colors[type] || '#888888';
}

export function useBrainGraphData() {
  const { authToken: token } = useAuth();
  const navigate = useNavigate();

  const [visualization, setVisualization] = useState<VisualizationData | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGapsData | null>(null);
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>('global');

  // Edge upgrade state
  const [upgradingEdge, setUpgradingEdge] = useState<string | null>(null);
  const [selectedCausalType, setSelectedCausalType] = useState<string>('causes');
  const [edgeUpgradeLoading, setEdgeUpgradeLoading] = useState(false);

  // Context expression state
  const [nodeContextExpressions, setNodeContextExpressions] = useState<Record<string, { level: number; notes?: string }>>({});
  const [contextExpressionLoading, setContextExpressionLoading] = useState(false);

  // Fetch brain data - context-aware (Phase 4)
  const fetchBrainData = useCallback(async (context: string = 'global') => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      const vizEndpoint = context === 'global'
        ? `${API_BASE}/twins-brain/visualization?minConfidence=0.3`
        : `${API_BASE}/twins-brain/context/${context}/graph?minConfidence=0.3`;

      const [vizRes, healthRes, gapsRes, suggestionsRes] = await Promise.all([
        fetch(vizEndpoint, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null),
        fetch(`${API_BASE}/twins-brain/health`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null),
        fetch(`${API_BASE}/twins-brain/knowledge-gaps`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null),
        fetch(`${API_BASE}/twins-brain/learning-suggestions`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic API response shape
      let vizData: any = { visualization: { nodes: [], edges: [], clusters: [], stats: { nodeCount: 0, edgeCount: 0, clusterCount: 0 } } };
      if (vizRes && vizRes.ok) {
        vizData = await vizRes.json();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic API response shape
      let healthData: any = { success: true, health: { total_nodes: 0, total_edges: 0, avg_confidence: 0, avg_edge_strength: 0, category_distribution: {}, health_score: 0 } };
      if (healthRes && healthRes.ok) {
        healthData = await healthRes.json();
      }

      if (context !== 'global' && vizData.nodes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- node shape comes from dynamic API
        const contextNodes = vizData.nodes.map((node: any) => ({
          ...node,
          id: node.id,
          label: node.label,
          type: node.node_type,
          category: node.category,
          platform: node.platform,
          confidence: node.contextualConfidence ?? node.confidence,
          data: node.data,
          abstraction_level: node.data?.abstraction_level || 2,
          temporal: {
            freshness: 'fresh',
            daysSinceUpdate: 0,
            daysUntilStale: 14,
            decayedConfidence: node.contextualConfidence ?? node.confidence
          },
          size: 10 + ((node.contextualConfidence ?? node.confidence) * 15) + ((node.data?.abstraction_level || 2) * 3),
          color: getCategoryColorForContext(node.category),
          opacity: node.contextualOpacity ?? (node.expressionLevel < 0.5 ? 0.5 : 1.0),
          group: node.category,
          expressionLevel: node.expressionLevel,
          contextNotes: node.contextNotes,
          isContextRelevant: node.isContextRelevant
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge shape comes from dynamic API
        const contextEdges = (vizData.edges || []).map((edge: any) => ({
          id: edge.id,
          source: edge.from_node_id,
          target: edge.to_node_id,
          type: edge.relationship_type,
          strength: edge.contextualStrength ?? edge.strength,
          color: getEdgeColorForContext(edge.relationship_type),
          label: edge.relationship_type?.replace(/_/g, ' ') || '',
          width: 1 + ((edge.contextualStrength ?? edge.strength) * 3),
          isCausal: ['causes', 'enables', 'triggers', 'inhibits'].includes(edge.relationship_type),
          isCorrelational: ['correlates_with', 'similar_to'].includes(edge.relationship_type)
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cluster accumulator with dynamic node props
        const clusters: Record<string, any> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- node shape comes from dynamic API
        contextNodes.forEach((node: any) => {
          if (!clusters[node.category]) {
            clusters[node.category] = {
              id: node.category,
              label: node.category.charAt(0).toUpperCase() + node.category.slice(1),
              color: node.color,
              nodeCount: 0,
              avgConfidence: 0
            };
          }
          clusters[node.category].nodeCount++;
          clusters[node.category].avgConfidence += node.confidence;
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cluster accumulator with dynamic shape
        Object.values(clusters).forEach((cluster: any) => {
          cluster.avgConfidence = cluster.nodeCount > 0 ? cluster.avgConfidence / cluster.nodeCount : 0;
        });

        setVisualization({
          nodes: contextNodes,
          edges: contextEdges,
          clusters: Object.values(clusters),
          stats: {
            nodeCount: contextNodes.length,
            edgeCount: contextEdges.length,
            clusterCount: Object.keys(clusters).length,
            temporal: vizData.stats?.temporal,
            causal: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge shape comes from dynamic API
              causalEdges: contextEdges.filter((e: any) => e.isCausal).length,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge shape comes from dynamic API
              correlationalEdges: contextEdges.filter((e: any) => e.isCorrelational).length,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge shape comes from dynamic API
              otherEdges: contextEdges.filter((e: any) => !e.isCausal && !e.isCorrelational).length,
              causalRatio: contextEdges.length > 0
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge shape comes from dynamic API
                ? contextEdges.filter((e: any) => e.isCausal).length / contextEdges.length
                : 0,
              byType: {}
            }
          }
        });
      } else {
        setVisualization(vizData.visualization);
      }

      setHealth(healthData.health);

      if (gapsRes && gapsRes.ok) {
        const gapsData = await gapsRes.json();
        setKnowledgeGaps(gapsData);
      }

      if (suggestionsRes && suggestionsRes.ok) {
        const suggestionsData = await suggestionsRes.json();
        setSuggestions(suggestionsData.suggestions || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Get edges connected to a specific node
  const getNodeEdges = useCallback((nodeId: string): { incoming: BrainEdge[]; outgoing: BrainEdge[] } => {
    if (!visualization) return { incoming: [], outgoing: [] };
    const incoming = visualization.edges.filter(e => e.target === nodeId);
    const outgoing = visualization.edges.filter(e => e.source === nodeId);
    return { incoming, outgoing };
  }, [visualization]);

  // Upgrade a correlational edge to causal
  const upgradeEdgeToCausal = async (edgeId: string, causalType: string, confidence: number = 0.7) => {
    if (!token) return;
    setEdgeUpgradeLoading(true);
    try {
      const response = await fetch(`${API_BASE}/twins-brain/edges/upgrade-to-causal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          edgeId,
          causalType,
          confidence,
          evidence: { source: 'user_marked', timestamp: new Date().toISOString() }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to upgrade edge');
      }

      await fetchBrainData(selectedContext);
      setUpgradingEdge(null);
    } catch (err) {
      console.error('Error upgrading edge:', err);
    } finally {
      setEdgeUpgradeLoading(false);
    }
  };

  // Get node label by ID
  const getNodeLabel = (nodeId: string): string => {
    const node = visualization?.nodes.find(n => n.id === nodeId);
    return node?.label || nodeId;
  };

  // Fetch context expressions for a node
  const fetchNodeContextExpressions = async (nodeId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/twins-brain/nodes/${nodeId}/context`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const expressions: Record<string, { level: number; notes?: string }> = {};
        (data.expressions || []).forEach((expr: { context: string; expression_level: number; context_notes?: string }) => {
          expressions[expr.context] = { level: expr.expression_level, notes: expr.context_notes };
        });
        setNodeContextExpressions(expressions);
      }
    } catch (err) {
      console.error('Error fetching context expressions:', err);
    }
  };

  // Set context expression for a node
  const setContextExpression = async (nodeId: string, context: string, level: number, notes?: string) => {
    if (!token) return;
    setContextExpressionLoading(true);
    try {
      const response = await fetch(`${API_BASE}/twins-brain/nodes/${nodeId}/context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ context, expressionLevel: level, notes })
      });

      if (!response.ok) {
        throw new Error('Failed to set context expression');
      }

      await fetchNodeContextExpressions(nodeId);
      if (selectedContext !== 'global') {
        await fetchBrainData(selectedContext);
      }
    } catch (err) {
      console.error('Error setting context expression:', err);
    } finally {
      setContextExpressionLoading(false);
    }
  };

  // Handle learning suggestion clicks
  const handleSuggestionClick = useCallback((suggestion: LearningSuggestion) => {
    switch (suggestion.type) {
      case 'connect_platform':
        if (suggestion.action.platform) {
          navigate(`/get-started?connect=${suggestion.action.platform}`);
        } else {
          navigate('/get-started');
        }
        break;
      case 'refresh_knowledge':
        if (suggestion.action.platform) {
          alert(`Refreshing ${suggestion.action.platform} data... This feature will sync your latest data.`);
        }
        break;
      case 'generate_abstraction':
        navigate('/soul-signature');
        break;
      case 'answer_questions':
        navigate('/questions');
        break;
      default:
        break;
    }
  }, [navigate]);

  // Fetch data on mount and when context changes
  useEffect(() => {
    fetchBrainData(selectedContext);
  }, [fetchBrainData, selectedContext]);

  // Transform data for force-graph-3d
  const graphData = useMemo<GraphData>(() => {
    if (!visualization) return { nodes: [], links: [] };

    const filteredNodes = filterCategory
      ? visualization.nodes.filter(n => n.category === filterCategory)
      : visualization.nodes;

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    const filteredLinks: GraphLink[] = visualization.edges
      .filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
        strength: e.strength,
        color: e.color,
        label: e.label,
        isCausal: e.isCausal || false,
        isCorrelational: e.isCorrelational || false,
        causal: e.causal
      }));

    const nodesWithSourceType: GraphNode[] = filteredNodes.map(node => ({
      ...node,
      data: node.data,
      source_type: node.platform ? 'intrinsic' : (node.confidence > 0.7 ? 'extrinsic' : 'inferred'),
      description: generateNodeDescription(node)
    }));

    return {
      nodes: nodesWithSourceType,
      links: filteredLinks
    };
  }, [visualization, filterCategory]);

  return {
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
  };
}
