/**
 * Knowledge Graph Type Definitions
 */

export type GraphNodeType = 'domain' | 'platform' | 'entity';
export type GraphEdgeType = 'crossref' | 'platform' | 'entity';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  color: string;
  size: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface DomainNode extends GraphNode {
  type: 'domain';
  domain: string;
  contentMd: string;
  version: number;
  compiledAt: string;
  crossrefCount: number;
}

export interface PlatformNode extends GraphNode {
  type: 'platform';
  platformId: string;
}

export interface EntityNode extends GraphNode {
  type: 'entity';
  category: string;
  domains: string[];
  confidence: number;
  mentionCount: number;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: GraphEdgeType;
  strength: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type SelectedNode = DomainNode | PlatformNode | EntityNode | null;

export interface GraphStats {
  domainCount: number;
  platformCount: number;
  entityCount: number;
  crossrefCount: number;
  totalCompilations: number;
}
