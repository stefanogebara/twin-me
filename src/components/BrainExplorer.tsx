/**
 * Brain Explorer Component
 *
 * An immersive 3D visualization of your Twin's Brain - the unified knowledge graph
 * that captures everything unique about you. Uses WebGL/Three.js for stunning
 * interactive 3D force-directed graphs.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph3D, { ForceGraph3DInstance } from 'react-force-graph-3d';
import * as THREE from 'three';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassPanel } from '@/components/layout/PageLayout';
import {
  Brain,
  Sparkles,
  RefreshCw,
  Zap,
  Network,
  Eye,
  Maximize2,
  Minimize2,
  Music,
  Briefcase,
  Users,
  Palette,
  Heart,
  BookOpen,
  Star,
  TrendingUp,
  Activity,
  Layers,
  X,
  Info,
  ExternalLink,
  Clock,
  AlertTriangle,
  CheckCircle,
  GitBranch
} from 'lucide-react';

// Evidence data structure for rich node descriptions
interface NodeEvidenceData {
  evidence?: {
    interpretation?: string;
    description?: string;
    raw_evidence?: string;
    sample_size?: number;
    platforms_analyzed?: string[];
    source?: string;
    observations?: number;
    questionnaire?: string;
    last_updated?: string;
    confidence?: number;
  };
  // For Big Five personality dimension nodes
  dimension?: string;
  dimension_label?: string;
  score?: number;
  description?: string;
  sample_size?: number;
  // For MoltBot semantic memories
  memory_type?: string;
  context?: string;
  trigger?: string;
  // For soul signature traits
  archetype?: string;
  trait_category?: string;
}

// Temporal dynamics data (Phase 3)
interface NodeTemporalData {
  freshness: 'fresh' | 'aging' | 'stale' | 'unknown';
  daysSinceUpdate: number | null;
  daysUntilStale: number | null;
  lastReinforced: string | null;
  decayedConfidence: number;
}

// Types for the brain graph
interface BrainNode {
  id: string;
  label: string;
  type: string;
  category: string;
  platform?: string;
  confidence: number;
  strength: number;
  size: number;
  color: string;
  group: string;
  // Additional fields for rich tooltips
  source_type?: 'intrinsic' | 'extrinsic' | 'inferred';
  description?: string;
  created_at?: string;
  last_updated?: string;
  // Rich evidence data from backend
  data?: NodeEvidenceData;
  // Hierarchical abstraction level (Phase 2)
  abstraction_level?: number; // 1=Facts, 2=Preferences, 3=Traits, 4=Core Identity
  // Temporal dynamics (Phase 3)
  temporal?: NodeTemporalData;
  opacity?: number;
}

interface BrainEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  context?: string;
  width: number;
  color: string;
  label: string;
  // Provenance chain data (Phase 2)
  evidence?: Array<{
    type?: string;
    from_level?: number;
    to_level?: number;
    derivation?: string;
    temporal_lag?: number;
  }>;
  isProvenance?: boolean;
  // Causal reasoning data (Phase 4)
  isCausal?: boolean;
  isCorrelational?: boolean;
  causal?: {
    isCausal: boolean;
    isCorrelational: boolean;
    directional: boolean;
    temporalLag?: number | null;
  };
}

interface Cluster {
  id: string;
  label: string;
  color: string;
  nodeCount: number;
  avgConfidence: number;
}

interface BrainHealth {
  total_nodes: number;
  total_edges: number;
  avg_confidence: number;
  avg_edge_strength: number;
  category_distribution: Record<string, number>;
  health_score: number;
}

interface VisualizationData {
  nodes: BrainNode[];
  edges: BrainEdge[];
  clusters: Cluster[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    clusterCount: number;
    temporal?: {
      fresh: number;
      aging: number;
      stale: number;
      unknown: number;
      avgDecayedConfidence: number;
    };
    // Causal reasoning stats (Phase 4)
    causal?: {
      causalEdges: number;
      correlationalEdges: number;
      otherEdges: number;
      causalRatio: number;
      byType: Record<string, number>;
    };
  };
}

// Knowledge gaps and learning suggestions (Phase 3)
interface KnowledgeGap {
  category?: string;
  level?: number;
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
  count?: number;
  examples?: string[];
}

interface LearningSuggestion {
  type: 'connect_platform' | 'refresh_knowledge' | 'generate_abstraction' | 'answer_questions';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: {
    type: string;
    platform?: string;
    category?: string;
    nodeType?: string;
  };
  examples?: string[];
}

interface KnowledgeGapsData {
  gapScore: number;
  gapLevel: 'high' | 'medium' | 'low';
  summary: {
    categoryGaps: number;
    levelGaps: number;
    staleKnowledge: number;
    lowConfidenceNodes: number;
    isolatedNodes: number;
    suggestedPlatforms: number;
  };
}

// Graph data format for react-force-graph-3d
interface GraphNode extends BrainNode {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  strength: number;
  color: string;
  label: string;
  // Causal reasoning properties (Phase 4)
  isCausal?: boolean;
  isCorrelational?: boolean;
  causal?: {
    isCausal: boolean;
    isCorrelational: boolean;
    directional: boolean;
    temporalLag?: number | null;
  };
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3004';

// Category icons and colors matching the platform design
const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; gradient: string; hex: number }> = {
  entertainment: {
    icon: Music,
    color: '#FF6B6B',
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E8E 100%)',
    hex: 0xFF6B6B
  },
  professional: {
    icon: Briefcase,
    color: '#4ECDC4',
    gradient: 'linear-gradient(135deg, #4ECDC4 0%, #6EE7DF 100%)',
    hex: 0x4ECDC4
  },
  social: {
    icon: Users,
    color: '#45B7D1',
    gradient: 'linear-gradient(135deg, #45B7D1 0%, #67C9E1 100%)',
    hex: 0x45B7D1
  },
  creative: {
    icon: Palette,
    color: '#96CEB4',
    gradient: 'linear-gradient(135deg, #96CEB4 0%, #B8DFC8 100%)',
    hex: 0x96CEB4
  },
  health: {
    icon: Heart,
    color: '#FFEAA7',
    gradient: 'linear-gradient(135deg, #FFEAA7 0%, #FFF3C4 100%)',
    hex: 0xFFEAA7
  },
  learning: {
    icon: BookOpen,
    color: '#98D8C8',
    gradient: 'linear-gradient(135deg, #98D8C8 0%, #B8E8D8 100%)',
    hex: 0x98D8C8
  },
  personal: {
    icon: Star,
    color: '#DDA0DD',
    gradient: 'linear-gradient(135deg, #DDA0DD 0%, #E8B8E8 100%)',
    hex: 0xDDA0DD
  }
};

// Source type explanations for the tooltip
const SOURCE_TYPE_INFO: Record<string, { label: string; description: string; color: string }> = {
  intrinsic: {
    label: 'Intrinsic Data',
    description: 'Directly extracted from your connected platforms - this is what you actually did/consumed',
    color: '#4ECDC4'
  },
  extrinsic: {
    label: 'Extrinsic Data',
    description: 'Derived from patterns and behaviors - what your actions reveal about you',
    color: '#FF6B6B'
  },
  inferred: {
    label: 'AI Inferred',
    description: 'Intelligently inferred by AI analysis of multiple data sources',
    color: '#DDA0DD'
  }
};

// Abstraction level hierarchy (Phase 2)
const ABSTRACTION_LEVELS: Record<number, { label: string; description: string; color: string; icon: string }> = {
  1: {
    label: 'Raw Fact',
    description: 'Direct observation or learned fact from data',
    color: '#74B9FF',
    icon: 'L1'
  },
  2: {
    label: 'Preference',
    description: 'Behavioral pattern or preference derived from facts',
    color: '#A29BFE',
    icon: 'L2'
  },
  3: {
    label: 'Trait',
    description: 'Personality trait or characteristic aggregated from preferences',
    color: '#FF7675',
    icon: 'L3'
  },
  4: {
    label: 'Core Identity',
    description: 'High-level identity archetype synthesized from traits',
    color: '#FDCB6E',
    icon: 'L4'
  }
};

// Freshness status configuration (Phase 3 - Temporal Dynamics)
const FRESHNESS_CONFIG: Record<string, { label: string; description: string; color: string; icon: React.ElementType }> = {
  fresh: {
    label: 'Fresh',
    description: 'Recently reinforced with new data',
    color: '#00B894',
    icon: CheckCircle
  },
  aging: {
    label: 'Aging',
    description: 'Getting stale - could use reinforcement',
    color: '#FDCB6E',
    icon: Clock
  },
  stale: {
    label: 'Stale',
    description: 'No recent data - confidence has decayed',
    color: '#D63031',
    icon: AlertTriangle
  },
  unknown: {
    label: 'Unknown',
    description: 'No temporal data available',
    color: '#636E72',
    icon: Info
  }
};

// Context configuration (Phase 4 - Multi-Context Personalities)
const CONTEXT_CONFIG: Record<string, { label: string; description: string; color: string; icon: React.ElementType }> = {
  global: {
    label: 'Global',
    description: 'Universal traits that apply everywhere',
    color: '#6C5CE7',
    icon: Network
  },
  work: {
    label: 'Work',
    description: 'Professional/work environment persona',
    color: '#4ECDC4',
    icon: Briefcase
  },
  personal: {
    label: 'Personal',
    description: 'Home and family environment',
    color: '#DDA0DD',
    icon: Star
  },
  social: {
    label: 'Social',
    description: 'Friends and social gatherings',
    color: '#45B7D1',
    icon: Users
  },
  creative: {
    label: 'Creative',
    description: 'Artistic and creative pursuits',
    color: '#96CEB4',
    icon: Palette
  },
  learning: {
    label: 'Learning',
    description: 'Educational and learning contexts',
    color: '#98D8C8',
    icon: BookOpen
  },
  health: {
    label: 'Health',
    description: 'Health and fitness contexts',
    color: '#FFEAA7',
    icon: Heart
  },
  romantic: {
    label: 'Romantic',
    description: 'Dating and romantic contexts',
    color: '#FF6B6B',
    icon: Heart
  }
};

const BrainExplorer: React.FC = () => {
  const { authToken: token } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const graphRef = useRef<ForceGraph3DInstance>();
  const containerRef = useRef<HTMLDivElement>(null);

  const [visualization, setVisualization] = useState<VisualizationData | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  // Phase 3: Active Learning
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGapsData | null>(null);
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  // Phase 4: Multi-Context Personalities
  const [selectedContext, setSelectedContext] = useState<string>('global');
  // Phase 4: Causal Edge Management
  const [showEdgesPanel, setShowEdgesPanel] = useState(false);
  const [upgradingEdge, setUpgradingEdge] = useState<string | null>(null);
  const [selectedCausalType, setSelectedCausalType] = useState<string>('causes');
  const [edgeUpgradeLoading, setEdgeUpgradeLoading] = useState(false);
  // Phase 4: Context Expression Management
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [contextExpressionLevel, setContextExpressionLevel] = useState<number>(1.0);
  const [contextNotes, setContextNotes] = useState<string>('');
  const [contextExpressionLoading, setContextExpressionLoading] = useState(false);
  const [nodeContextExpressions, setNodeContextExpressions] = useState<Record<string, { level: number; notes?: string }>>({});

  // Theme-aware colors (matching the platform)
  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const textFaint = theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e';
  const subtleBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const bgColor = theme === 'dark' ? '#1a1a1a' : '#f8f8f8';

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

  // Fetch brain data - context-aware (Phase 4)
  const fetchBrainData = useCallback(async (context: string = 'global') => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      // Use context-specific endpoint if not global
      const vizEndpoint = context === 'global'
        ? `${API_BASE}/twins-brain/visualization?minConfidence=0.3`
        : `${API_BASE}/twins-brain/context/${context}/graph?minConfidence=0.3`;

      const [vizRes, healthRes, gapsRes, suggestionsRes] = await Promise.all([
        fetch(vizEndpoint, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/twins-brain/health`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/twins-brain/knowledge-gaps`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/twins-brain/learning-suggestions`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!vizRes.ok || !healthRes.ok) {
        throw new Error('Failed to fetch brain data');
      }

      const vizData = await vizRes.json();
      const healthData = await healthRes.json();

      // Transform context-specific response to match visualization format
      if (context !== 'global' && vizData.nodes) {
        // Context endpoint returns nodes/edges directly, transform to visualization format
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
          // Context-specific properties
          expressionLevel: node.expressionLevel,
          contextNotes: node.contextNotes,
          isContextRelevant: node.isContextRelevant
        }));

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

        // Build clusters from context nodes
        const clusters: Record<string, any> = {};
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
              causalEdges: contextEdges.filter((e: any) => e.isCausal).length,
              correlationalEdges: contextEdges.filter((e: any) => e.isCorrelational).length,
              otherEdges: contextEdges.filter((e: any) => !e.isCausal && !e.isCorrelational).length,
              causalRatio: contextEdges.length > 0
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

      // Knowledge gaps might not be available if routes aren't updated yet
      if (gapsRes.ok) {
        const gapsData = await gapsRes.json();
        setKnowledgeGaps(gapsData);
      }

      if (suggestionsRes.ok) {
        const suggestionsData = await suggestionsRes.json();
        setSuggestions(suggestionsData.suggestions || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Helper functions for context-specific colors
  const getCategoryColorForContext = (category: string): string => {
    const colors: Record<string, string> = {
      entertainment: '#FF6B6B', professional: '#4ECDC4', social: '#45B7D1',
      creative: '#96CEB4', health: '#FFEAA7', personal: '#DDA0DD', learning: '#98D8C8'
    };
    return colors[category] || '#888888';
  };

  const getEdgeColorForContext = (type: string): string => {
    const colors: Record<string, string> = {
      correlates_with: '#6C5CE7', leads_to: '#00B894', evolved_from: '#FDCB6E',
      contradicts: '#D63031', reinforces: '#0984E3', similar_to: '#A29BFE',
      causes: '#E74C3C', enables: '#F39C12', triggers: '#9B59B6', inhibits: '#34495E'
    };
    return colors[type] || '#888888';
  };

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

      // Refresh data to show updated edge
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

      // Refresh context expressions
      await fetchNodeContextExpressions(nodeId);
      setEditingContext(null);
      // Refresh main data if viewing a specific context
      if (selectedContext !== 'global') {
        await fetchBrainData(selectedContext);
      }
    } catch (err) {
      console.error('Error setting context expression:', err);
    } finally {
      setContextExpressionLoading(false);
    }
  };

  // Fetch context expressions when a node is selected
  useEffect(() => {
    if (selectedNode) {
      fetchNodeContextExpressions(selectedNode.id);
    } else {
      setNodeContextExpressions({});
    }
  }, [selectedNode?.id, token]);

  // Handle learning suggestion clicks
  const handleSuggestionClick = useCallback((suggestion: LearningSuggestion) => {
    switch (suggestion.type) {
      case 'connect_platform':
        // Navigate to platform connections page
        if (suggestion.action.platform) {
          navigate(`/get-started?connect=${suggestion.action.platform}`);
        } else {
          navigate('/get-started');
        }
        break;
      case 'refresh_knowledge':
        // Trigger data refresh - could call an API endpoint
        if (suggestion.action.platform) {
          console.log(`Refreshing data for platform: ${suggestion.action.platform}`);
          // Could trigger: fetch(`${API_BASE}/platforms/${suggestion.action.platform}/refresh`)
          alert(`Refreshing ${suggestion.action.platform} data... This feature will sync your latest data.`);
        }
        break;
      case 'generate_abstraction':
        // Navigate to soul signature to see generated insights
        navigate('/soul-signature');
        break;
      case 'answer_questions':
        // Navigate to questions/quiz page
        navigate('/questions');
        break;
      default:
        console.log('Unknown suggestion type:', suggestion.type);
    }
  }, [navigate]);

  // Fetch data on mount and when context changes
  useEffect(() => {
    fetchBrainData(selectedContext);
  }, [fetchBrainData, selectedContext]);

  // Transform data for force-graph-3d
  const graphData = useMemo<GraphData>(() => {
    if (!visualization) return { nodes: [], links: [] };

    // Filter nodes if category filter is active
    const filteredNodes = filterCategory
      ? visualization.nodes.filter(n => n.category === filterCategory)
      : visualization.nodes;

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    // Transform edges to links format (includes causal properties from Phase 4)
    const filteredLinks: GraphLink[] = visualization.edges
      .filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
        strength: e.strength,
        color: e.color,
        label: e.label,
        // Causal reasoning properties (Phase 4)
        isCausal: e.isCausal || false,
        isCorrelational: e.isCorrelational || false,
        causal: e.causal
      }));

    // Add source_type and preserve data field for evidence display
    const nodesWithSourceType: GraphNode[] = filteredNodes.map(node => ({
      ...node,
      // Explicitly preserve data field for evidence display
      data: node.data,
      source_type: node.platform ? 'intrinsic' : (node.confidence > 0.7 ? 'extrinsic' : 'inferred'),
      description: generateNodeDescription(node)
    }));

    return {
      nodes: nodesWithSourceType,
      links: filteredLinks
    };
  }, [visualization, filterCategory]);

  // Generate a description for nodes based on their data
  function generateNodeDescription(node: BrainNode): string {
    const typeDescriptions: Record<string, string> = {
      interest: `You have a strong interest in ${node.label.toLowerCase()}`,
      behavior: `You frequently engage in ${node.label.toLowerCase()} activities`,
      trait: `${node.label} is a core part of your personality`,
      preference: `You consistently prefer ${node.label.toLowerCase()}`,
      skill: `You demonstrate skill in ${node.label.toLowerCase()}`,
      pattern: `${node.label} is a recurring pattern in your behavior`,
      fact: `Your twin has learned: ${node.label}`
    };
    return typeDescriptions[node.type] || `${node.label} is part of your unique identity`;
  }

  // Custom node rendering with Three.js
  const createNodeThreeObject = useCallback((node: GraphNode) => {
    const config = CATEGORY_CONFIG[node.category] || CATEGORY_CONFIG.personal;
    const size = Math.max(4, (node.strength || 0.5) * 12);

    // Create a group to hold the node elements
    const group = new THREE.Group();

    // Apply temporal-based opacity (Phase 3)
    // Use node.opacity from backend or calculate from freshness
    const baseOpacity = node.opacity ?? 1.0;
    const temporalOpacity = node.temporal?.freshness === 'stale' ? 0.4 :
                           node.temporal?.freshness === 'aging' ? 0.7 : baseOpacity;

    // Use decayed confidence if available for more accurate size
    const effectiveConfidence = node.temporal?.decayedConfidence ?? node.confidence;

    // Main sphere
    const sphereGeometry = new THREE.SphereGeometry(size, 16, 16);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: config.hex,
      transparent: true,
      opacity: (0.3 + (effectiveConfidence * 0.5)) * temporalOpacity,
      shininess: 100
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);

    // Inner glowing core
    const coreGeometry = new THREE.SphereGeometry(size * 0.5, 12, 12);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: config.hex,
      transparent: true,
      opacity: 0.8
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    // Add outer glow ring for high-confidence nodes
    if (node.confidence > 0.7) {
      const ringGeometry = new THREE.TorusGeometry(size * 1.2, size * 0.15, 8, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: config.hex,
        transparent: true,
        opacity: 0.3
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    // Add sprite label
    const sprite = createTextSprite(node.label, config.color);
    sprite.position.set(0, size + 8, 0);
    group.add(sprite);

    return group;
  }, []);

  // Create text sprite for labels
  function createTextSprite(text: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = 48;

    canvas.width = 512;
    canvas.height = 128;

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate long labels
    const displayText = text.length > 20 ? text.slice(0, 18) + '...' : text;

    // Draw text shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(displayText, canvas.width / 2 + 2, canvas.height / 2 + 2);

    // Draw text
    ctx.fillStyle = color;
    ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(40, 10, 1);

    return sprite;
  }

  // Handle node click
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(selectedNode?.id === node.id ? null : node);

    // Zoom to node
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

  // Section header component (matching Dashboard style)
  const SectionHeader = ({ title, icon: Icon }: { title: string; icon?: React.ElementType }) => (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="w-1 h-5 rounded-full"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
            : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
        }}
      />
      {Icon && <Icon className="w-4 h-4" style={{ color: textMuted }} />}
      <h3
        className="text-sm uppercase tracking-wider"
        style={{ color: textMuted }}
      >
        {title}
      </h3>
    </div>
  );

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

  if (error) {
    return (
      <GlassPanel className="text-center py-12">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)'
        }}>
          <Zap className="w-8 h-8" style={{ color: '#EF4444' }} />
        </div>
        <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--font-heading)', color: textColor }}>
          Connection Lost
        </h3>
        <p className="mb-6" style={{ color: textSecondary }}>
          {error}
        </p>
        <button
          onClick={() => fetchBrainData(selectedContext)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl mx-auto transition-all hover:scale-[1.02]"
          style={{ backgroundColor: subtleBg, color: textColor }}
        >
          <RefreshCw className="w-4 h-4" />
          Reconnect
        </button>
      </GlassPanel>
    );
  }

  const healthPercentage = Math.round((health?.health_score || 0) * 100);

  return (
    <div className={`space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : ''}`}>
      {/* Header with Health Score */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl md:text-4xl mb-2"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              color: textColor
            }}
          >
            Your Twin's Brain
          </h2>
          <p style={{ color: textSecondary }}>
            An immersive 3D map of your interests, patterns, and connections
          </p>
        </div>

        {/* Health Score Badge & Controls */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke={subtleBg}
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke={healthPercentage > 70 ? '#4ECDC4' : healthPercentage > 40 ? '#FFEAA7' : '#FF6B6B'}
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${healthPercentage * 2.26} 226`}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold" style={{ color: textColor }}>{healthPercentage}%</span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>Health</span>
            </div>
          </div>

          <button
            onClick={() => fetchBrainData(selectedContext)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
            style={{ backgroundColor: subtleBg, color: textColor }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassPanel className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(78, 205, 196, 0.1)'
            }}>
              <Network className="w-5 h-5" style={{ color: '#4ECDC4' }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: textColor }}>
                {health?.total_nodes || 0}
              </div>
              <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
                Knowledge Nodes
              </div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(69, 183, 209, 0.1)'
            }}>
              <Zap className="w-5 h-5" style={{ color: '#45B7D1' }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: textColor }}>
                {health?.total_edges || 0}
              </div>
              <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
                Connections
              </div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(150, 206, 180, 0.1)'
            }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#96CEB4' }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: textColor }}>
                {Math.round((health?.avg_confidence || 0) * 100)}%
              </div>
              <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
                Avg Confidence
              </div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(221, 160, 221, 0.1)'
            }}>
              <Layers className="w-5 h-5" style={{ color: '#DDA0DD' }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: textColor }}>
                {visualization?.clusters.length || 0}
              </div>
              <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
                Categories
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Causal Reasoning Stats (Phase 4) */}
      {visualization?.stats?.causal && (visualization.stats.causal.causalEdges > 0 || visualization.stats.causal.correlationalEdges > 0) && (
        <GlassPanel className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" style={{ color: '#E74C3C' }} />
              <span className="text-sm font-medium" style={{ color: textColor }}>Relationship Types</span>
            </div>
            <span className="text-xs px-2 py-1 rounded-lg" style={{
              backgroundColor: 'rgba(231, 76, 60, 0.1)',
              color: '#E74C3C'
            }}>
              {Math.round(visualization.stats.causal.causalRatio * 100)}% causal
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(231, 76, 60, 0.08)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E74C3C' }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Causal</span>
              </div>
              <div className="text-xl font-bold" style={{ color: '#E74C3C' }}>
                {visualization.stats.causal.causalEdges}
              </div>
              <div className="text-xs mt-1" style={{ color: textMuted }}>
                cause → effect
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(108, 92, 231, 0.08)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6C5CE7' }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Correlational</span>
              </div>
              <div className="text-xl font-bold" style={{ color: '#6C5CE7' }}>
                {visualization.stats.causal.correlationalEdges}
              </div>
              <div className="text-xs mt-1" style={{ color: textMuted }}>
                co-occurrence
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(150, 206, 180, 0.08)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#96CEB4' }} />
                <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Other</span>
              </div>
              <div className="text-xl font-bold" style={{ color: '#96CEB4' }}>
                {visualization.stats.causal.otherEdges}
              </div>
              <div className="text-xs mt-1" style={{ color: textMuted }}>
                structural
              </div>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Active Learning Suggestions (Phase 3) */}
      {suggestions.length > 0 && (
        <GlassPanel className="!p-5">
          <SectionHeader title="Learning Opportunities" icon={Sparkles} />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.slice(0, 6).map((suggestion, index) => {
              const priorityColors = {
                high: { bg: 'rgba(214, 48, 49, 0.1)', border: 'rgba(214, 48, 49, 0.3)', text: '#D63031' },
                medium: { bg: 'rgba(253, 203, 110, 0.1)', border: 'rgba(253, 203, 110, 0.3)', text: '#FDCB6E' },
                low: { bg: 'rgba(0, 184, 148, 0.1)', border: 'rgba(0, 184, 148, 0.3)', text: '#00B894' }
              };
              const colors = priorityColors[suggestion.priority];

              const typeIcons = {
                connect_platform: ExternalLink,
                refresh_knowledge: RefreshCw,
                generate_abstraction: Brain,
                answer_questions: Info
              };
              const Icon = typeIcons[suggestion.type] || Sparkles;

              return (
                <div
                  key={index}
                  className="p-4 rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
                  style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colors.border }}
                    >
                      <Icon className="w-4 h-4" style={{ color: colors.text }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate" style={{ color: textColor }}>
                          {suggestion.title}
                        </h4>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                          style={{ backgroundColor: colors.border, color: colors.text }}
                        >
                          {suggestion.priority}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2" style={{ color: textSecondary }}>
                        {suggestion.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {knowledgeGaps && (
            <div className="mt-4 flex items-center gap-4 text-xs" style={{ color: textMuted }}>
              <span>Knowledge Gap Score: <strong style={{ color: knowledgeGaps.gapLevel === 'high' ? '#D63031' : knowledgeGaps.gapLevel === 'medium' ? '#FDCB6E' : '#00B894' }}>
                {knowledgeGaps.gapScore}
              </strong></span>
              <span>•</span>
              <span>Missing categories: {knowledgeGaps.summary.categoryGaps}</span>
              <span>•</span>
              <span>Stale nodes: {knowledgeGaps.summary.staleKnowledge}</span>
            </div>
          )}
        </GlassPanel>
      )}

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory(null)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex items-center gap-2`}
          style={{
            backgroundColor: !filterCategory ? 'rgba(193, 192, 182, 0.2)' : subtleBg,
            color: !filterCategory ? textColor : textMuted,
            border: !filterCategory ? '1px solid rgba(193, 192, 182, 0.3)' : '1px solid transparent'
          }}
        >
          <Eye className="w-4 h-4" />
          All Categories
        </button>
        {visualization?.clusters.map(cluster => {
          const config = CATEGORY_CONFIG[cluster.id] || CATEGORY_CONFIG.personal;
          const Icon = config.icon;
          const isActive = filterCategory === cluster.id;

          return (
            <button
              key={cluster.id}
              onClick={() => setFilterCategory(isActive ? null : cluster.id)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex items-center gap-2"
              style={{
                backgroundColor: isActive ? `${config.color}20` : subtleBg,
                color: isActive ? config.color : textMuted,
                border: isActive ? `1px solid ${config.color}40` : '1px solid transparent'
              }}
            >
              <Icon className="w-4 h-4" />
              {cluster.label}
              <span className="text-xs opacity-70">({cluster.nodeCount})</span>
            </button>
          );
        })}
      </div>

      {/* Context Selector (Phase 4) */}
      <GlassPanel className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7' }} />
            <span className="text-sm font-medium" style={{ color: textColor }}>Personality Context</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-lg" style={{
            backgroundColor: `${CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7'}20`,
            color: CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7'
          }}>
            {CONTEXT_CONFIG[selectedContext]?.label || 'Global'} View
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: textMuted }}>
          Your personality may express differently in various contexts. Select a context to see how your traits vary.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CONTEXT_CONFIG).map(([contextId, config]) => {
            const Icon = config.icon;
            const isActive = selectedContext === contextId;
            return (
              <button
                key={contextId}
                onClick={() => setSelectedContext(contextId)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] flex items-center gap-1.5"
                style={{
                  backgroundColor: isActive ? `${config.color}20` : 'rgba(193, 192, 182, 0.05)',
                  color: isActive ? config.color : textMuted,
                  border: isActive ? `1px solid ${config.color}40` : '1px solid transparent'
                }}
              >
                <Icon className="w-3 h-3" />
                {config.label}
              </button>
            );
          })}
        </div>
      </GlassPanel>

      {/* 3D Visualization */}
      <GlassPanel className="!p-2 relative overflow-hidden">
        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg transition-all hover:scale-110"
          style={{ backgroundColor: subtleBg, color: textColor }}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>

        {/* Instructions */}
        <div
          className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ backgroundColor: subtleBg, color: textMuted }}
        >
          <Info className="w-3 h-3" />
          <span>Drag to rotate • Scroll to zoom • Click nodes for details</span>
        </div>

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
            nodeThreeObject={createNodeThreeObject}
            nodeThreeObjectExtend={false}
            linkColor={(link: GraphLink) => link.color || '#666666'}
            linkWidth={(link: GraphLink) => Math.max(0.5, link.strength * 3)}
            linkOpacity={0.4}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleColor={(link: GraphLink) => link.color || '#4ECDC4'}
            // Show arrows on causal edges (Phase 4)
            linkDirectionalArrowLength={(link: GraphLink) => link.isCausal ? 6 : 0}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={(link: GraphLink) => link.color || '#E74C3C'}
            // Make causal links curved for better visualization
            linkCurvature={(link: GraphLink) => link.isCausal ? 0.15 : 0}
            onNodeClick={handleNodeClick}
            onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
            enableNodeDrag={true}
            enableNavigationControls={true}
            showNavInfo={false}
            nodeLabel={() => ''} // We use custom labels in nodeThreeObject
            warmupTicks={50}
            cooldownTicks={100}
          />
        </div>

        {/* Hover Tooltip */}
        {hoveredNode && !selectedNode && (
          <div
            className="absolute bottom-4 left-4 z-10 max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
          >
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

      {/* Selected Node Details Panel - Enhanced with Evidence */}
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
                  {/* Abstraction Level Badge */}
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
                  {/* Freshness Badge (Phase 3) */}
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

              {/* Interpretation (for personality nodes) */}
              {selectedNode.data.evidence.interpretation && (
                <p className="text-sm mb-3 italic" style={{ color: textSecondary }}>
                  "{selectedNode.data.evidence.interpretation}"
                </p>
              )}

              {/* Evidence description */}
              {selectedNode.data.evidence.description && (
                <p className="text-sm mb-3" style={{ color: textSecondary }}>
                  {selectedNode.data.evidence.description}
                </p>
              )}

              {/* Raw evidence for soul signature traits */}
              {selectedNode.data.evidence.raw_evidence && (
                <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: 'rgba(78, 205, 196, 0.1)' }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Observed Evidence:</span>
                  <p className="text-sm mt-1" style={{ color: '#4ECDC4' }}>
                    {selectedNode.data.evidence.raw_evidence}
                  </p>
                </div>
              )}

              {/* Metadata grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                {/* Sample size */}
                {(selectedNode.data.evidence.sample_size || selectedNode.data.sample_size) && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Data Points</span>
                    <p className="text-lg font-bold" style={{ color: textColor }}>
                      {selectedNode.data.evidence.sample_size || selectedNode.data.sample_size}
                    </p>
                  </div>
                )}

                {/* Platforms analyzed */}
                {selectedNode.data.evidence.platforms_analyzed && selectedNode.data.evidence.platforms_analyzed.length > 0 && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Platforms</span>
                    <p className="text-sm font-medium capitalize" style={{ color: textColor }}>
                      {selectedNode.data.evidence.platforms_analyzed.join(', ')}
                    </p>
                  </div>
                )}

                {/* Source type */}
                {selectedNode.data.evidence.source && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Source</span>
                    <p className="text-sm font-medium capitalize" style={{ color: textColor }}>
                      {selectedNode.data.evidence.source.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}

                {/* Observation count for patterns */}
                {selectedNode.data.evidence.observations && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Observations</span>
                    <p className="text-lg font-bold" style={{ color: textColor }}>
                      {selectedNode.data.evidence.observations}
                    </p>
                  </div>
                )}

                {/* Questionnaire version */}
                {selectedNode.data.evidence.questionnaire && (
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(193, 192, 182, 0.05)' }}>
                    <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Assessment</span>
                    <p className="text-sm font-medium" style={{ color: textColor }}>
                      {selectedNode.data.evidence.questionnaire}
                    </p>
                  </div>
                )}

                {/* Last updated */}
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
                {showEdgesPanel ? '▲' : '▼'}
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
                              {isCausal ? '⚡ Causal' : isCorrelational ? '≈ Correlational' : '○ Other'}
                            </span>
                            <span className="text-xs" style={{ color: textMuted }}>
                              {edge.direction === 'incoming' ? '← from' : '→ to'}
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

                        {/* Upgrade to causal option for non-causal edges */}
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
                {showContextPanel ? '▲' : '▼'}
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
      {health?.category_distribution && Object.keys(health.category_distribution).length > 0 && (
        <GlassPanel className="!p-5">
          <SectionHeader title="Knowledge Distribution" icon={Activity} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(health.category_distribution).map(([category, count]) => {
              const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.personal;
              const Icon = config.icon;
              const percentage = Math.round((count / (health?.total_nodes || 1)) * 100);

              return (
                <div
                  key={category}
                  className="p-4 rounded-xl text-center transition-all hover:scale-[1.02] cursor-pointer"
                  style={{
                    backgroundColor: `${config.color}10`,
                    border: `1px solid ${config.color}20`
                  }}
                  onClick={() => setFilterCategory(filterCategory === category ? null : category)}
                >
                  <div
                    className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: config.color }} />
                  </div>
                  <div className="text-xl font-bold" style={{ color: config.color }}>
                    {count}
                  </div>
                  <div className="text-xs capitalize" style={{ color: textMuted }}>
                    {category}
                  </div>
                  <div className="text-xs mt-1" style={{ color: textFaint }}>
                    {percentage}%
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      )}

      {/* Understanding Your Brain */}
      <div className="grid md:grid-cols-3 gap-4">
        <GlassPanel className="!p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(78, 205, 196, 0.1)'
            }}>
              <Brain className="w-5 h-5" style={{ color: '#4ECDC4' }} />
            </div>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Intrinsic vs Extrinsic
            </h4>
          </div>
          <p className="text-sm" style={{ color: textSecondary }}>
            <span style={{ color: '#4ECDC4' }}>Intrinsic data</span> is directly from your activity (songs played, events attended).{' '}
            <span style={{ color: '#FF6B6B' }}>Extrinsic data</span> is what these patterns reveal about your personality.
          </p>
        </GlassPanel>

        <GlassPanel className="!p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(150, 206, 180, 0.1)'
            }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#96CEB4' }} />
            </div>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Confidence Levels
            </h4>
          </div>
          <p className="text-sm" style={{ color: textSecondary }}>
            Confidence is calculated from data frequency, consistency across time, and correlation with other verified traits. Higher confidence = more data points supporting this insight.
          </p>
        </GlassPanel>

        <GlassPanel className="!p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              backgroundColor: 'rgba(221, 160, 221, 0.1)'
            }}>
              <Sparkles className="w-5 h-5" style={{ color: '#DDA0DD' }} />
            </div>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              3D Exploration
            </h4>
          </div>
          <p className="text-sm" style={{ color: textSecondary }}>
            Nodes closer together share stronger connections. Particle streams show active relationships. Click any node to dive deeper into what your AI twin has learned about you.
          </p>
        </GlassPanel>
      </div>
    </div>
  );
};

export default BrainExplorer;
