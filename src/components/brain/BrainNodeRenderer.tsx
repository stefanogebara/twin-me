/**
 * Brain Node Renderer
 *
 * Handles node icon/label/color rendering logic for the 3D brain graph.
 * Includes category configuration, source type info, abstraction levels,
 * freshness config, context config, and Three.js node creation.
 */

import * as THREE from 'three';
import {
  Music,
  Briefcase,
  Users,
  Palette,
  Heart,
  BookOpen,
  Star,
  Network,
  CheckCircle,
  Clock,
  AlertTriangle,
  Info
} from 'lucide-react';

// ─── Shared Types ──────────────────────────────────────────────

export interface NodeEvidenceData {
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
  dimension?: string;
  dimension_label?: string;
  score?: number;
  description?: string;
  sample_size?: number;
  memory_type?: string;
  context?: string;
  trigger?: string;
  archetype?: string;
  trait_category?: string;
}

export interface NodeTemporalData {
  freshness: 'fresh' | 'aging' | 'stale' | 'unknown';
  daysSinceUpdate: number | null;
  daysUntilStale: number | null;
  lastReinforced: string | null;
  decayedConfidence: number;
}

export interface BrainNode {
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
  source_type?: 'intrinsic' | 'extrinsic' | 'inferred';
  description?: string;
  created_at?: string;
  last_updated?: string;
  data?: NodeEvidenceData;
  abstraction_level?: number;
  temporal?: NodeTemporalData;
  opacity?: number;
}

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  context?: string;
  width: number;
  color: string;
  label: string;
  evidence?: Array<{
    type?: string;
    from_level?: number;
    to_level?: number;
    derivation?: string;
    temporal_lag?: number;
  }>;
  isProvenance?: boolean;
  isCausal?: boolean;
  isCorrelational?: boolean;
  causal?: {
    isCausal: boolean;
    isCorrelational: boolean;
    directional: boolean;
    temporalLag?: number | null;
  };
}

export interface Cluster {
  id: string;
  label: string;
  color: string;
  nodeCount: number;
  avgConfidence: number;
}

export interface BrainHealth {
  total_nodes: number;
  total_edges: number;
  avg_confidence: number;
  avg_edge_strength: number;
  category_distribution: Record<string, number>;
  health_score: number;
}

export interface VisualizationData {
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
    causal?: {
      causalEdges: number;
      correlationalEdges: number;
      otherEdges: number;
      causalRatio: number;
      byType: Record<string, number>;
    };
  };
}

export interface KnowledgeGap {
  category?: string;
  level?: number;
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
  count?: number;
  examples?: string[];
}

export interface LearningSuggestion {
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

export interface KnowledgeGapsData {
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

export interface GraphNode extends BrainNode {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  strength: number;
  color: string;
  label: string;
  isCausal?: boolean;
  isCorrelational?: boolean;
  causal?: {
    isCausal: boolean;
    isCorrelational: boolean;
    directional: boolean;
    temporalLag?: number | null;
  };
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ─── Configuration Constants ───────────────────────────────────

export const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; gradient: string; hex: number }> = {
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

export const SOURCE_TYPE_INFO: Record<string, { label: string; description: string; color: string }> = {
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

export const ABSTRACTION_LEVELS: Record<number, { label: string; description: string; color: string; icon: string }> = {
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

export const FRESHNESS_CONFIG: Record<string, { label: string; description: string; color: string; icon: React.ElementType }> = {
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

export const CONTEXT_CONFIG: Record<string, { label: string; description: string; color: string; icon: React.ElementType }> = {
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

// ─── Node Rendering Functions ──────────────────────────────────

export function generateNodeDescription(node: BrainNode): string {
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

export function createTextSprite(text: string, color: string): THREE.Sprite {
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

  const displayText = text.length > 20 ? text.slice(0, 18) + '...' : text;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillText(displayText, canvas.width / 2 + 2, canvas.height / 2 + 2);

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

export function createNodeThreeObject(node: GraphNode): THREE.Group {
  const config = CATEGORY_CONFIG[node.category] || CATEGORY_CONFIG.personal;
  const size = Math.max(4, (node.strength || 0.5) * 12);

  const group = new THREE.Group();

  const baseOpacity = node.opacity ?? 1.0;
  const temporalOpacity = node.temporal?.freshness === 'stale' ? 0.4 :
                           node.temporal?.freshness === 'aging' ? 0.7 : baseOpacity;

  const effectiveConfidence = node.temporal?.decayedConfidence ?? node.confidence;

  const sphereGeometry = new THREE.SphereGeometry(size, 16, 16);
  const sphereMaterial = new THREE.MeshPhongMaterial({
    color: config.hex,
    transparent: true,
    opacity: (0.3 + (effectiveConfidence * 0.5)) * temporalOpacity,
    shininess: 100
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  group.add(sphere);

  const coreGeometry = new THREE.SphereGeometry(size * 0.5, 12, 12);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: config.hex,
    transparent: true,
    opacity: 0.8
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  group.add(core);

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

  const sprite = createTextSprite(node.label, config.color);
  sprite.position.set(0, size + 8, 0);
  group.add(sprite);

  return group;
}
