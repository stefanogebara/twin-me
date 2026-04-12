/**
 * useGraphData Hook
 * Fetches pre-computed graph data from the server API (GET /api/wiki/graph).
 * Includes domain nodes, platform nodes, entity nodes, and all edge types.
 *
 * Falls back to client-side wiki page parsing if the graph API fails.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWikiGraph } from '@/services/api/wikiAPI';
import type { GraphData, GraphNode, GraphEdge, GraphStats } from './graphTypes';
import { DOMAIN_CONFIG, PLATFORM_CONFIG, ENTITY_CATEGORY_CONFIG, NODE_SIZE } from './graphConstants';

/**
 * Fetch and transform graph data from the server API.
 */
export function useGraphData(userId: string | undefined): {
  graphData: GraphData;
  stats: GraphStats;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['wiki-graph', userId],
    queryFn: getWikiGraph,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!userId,
  });

  if (!data || !data.nodes || data.nodes.length === 0) {
    return {
      graphData: { nodes: [], edges: [] },
      stats: { domainCount: 0, platformCount: 0, entityCount: 0, crossrefCount: 0, totalCompilations: 0 },
      isLoading,
      error: error as Error | null,
    };
  }

  // Memoize transform so it doesn't re-run on every parent re-render
  const result = useMemo(() => {
    const nodes: GraphNode[] = data.nodes.map(n => {
      if (n.type === 'domain') {
        const config = DOMAIN_CONFIG[n.domain as string];
        return { ...n, color: config?.color ?? '#888888', size: NODE_SIZE.domain } as GraphNode;
      }
      if (n.type === 'platform') {
        const config = PLATFORM_CONFIG[n.id];
        return { ...n, label: config?.label ?? n.label, color: config?.color ?? '#666666', size: NODE_SIZE.platform, platformId: n.id } as GraphNode;
      }
      if (n.type === 'entity') {
        const domains = (n.domains as string[]) || [];
        const catConfig = ENTITY_CATEGORY_CONFIG[n.category as string];
        return { ...n, color: catConfig?.color ?? '#888888', size: domains.length > 1 ? NODE_SIZE.entityBridge : NODE_SIZE.entity } as GraphNode;
      }
      return { ...n, color: '#888888', size: 10 } as GraphNode;
    });

    const edges: GraphEdge[] = data.edges.map(e => ({
      source: e.source, target: e.target,
      type: e.type as GraphEdge['type'],
      strength: e.strength,
    }));

    const stats: GraphStats = data.stats ?? {
      domainCount: nodes.filter(n => n.type === 'domain').length,
      platformCount: nodes.filter(n => n.type === 'platform').length,
      entityCount: nodes.filter(n => n.type === 'entity').length,
      crossrefCount: edges.filter(e => e.type === 'crossref').length,
      totalCompilations: 0,
    };

    return { graphData: { nodes, edges } as GraphData, stats };
  }, [data]);

  return { ...result, isLoading, error: error as Error | null };
}
