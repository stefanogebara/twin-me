/**
 * Knowledge Graph Type Definitions
 */

export type GraphNodeType = 'domain' | 'platform';
export type GraphEdgeType = 'crossref' | 'platform';

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

export type SelectedNode = DomainNode | PlatformNode | null;

export interface GraphStats {
  domainCount: number;
  platformCount: number;
  crossrefCount: number;
  totalCompilations: number;
}
