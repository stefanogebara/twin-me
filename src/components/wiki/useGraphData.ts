/**
 * useGraphData Hook
 * Transforms wiki pages + platform connections into graph nodes + edges.
 * All computation is client-side -- no additional API calls.
 */

import { useMemo } from 'react';
import type { WikiPage } from '@/services/api/wikiAPI';
import type { GraphData, DomainNode, PlatformNode, GraphEdge } from './graphTypes';
import { DOMAIN_CONFIG, PLATFORM_CONFIG, PLATFORM_KEYWORDS, NODE_SIZE } from './graphConstants';

/**
 * Parse [[domain:X]] cross-references from markdown content.
 * Returns deduplicated edges with strength based on mention count.
 */
function parseCrossRefs(sourceDomain: string, contentMd: string): GraphEdge[] {
  const counts = new Map<string, number>();
  const regex = /\[\[domain:(\w+)(?:\|[^\]]+)?\]\]/g;
  let match;

  while ((match = regex.exec(contentMd)) !== null) {
    const target = match[1];
    if (target !== sourceDomain && DOMAIN_CONFIG[target]) {
      counts.set(target, (counts.get(target) || 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([target, count]) => ({
    source: sourceDomain,
    target,
    type: 'crossref' as const,
    strength: Math.min(count / 5, 1.0),
  }));
}

/**
 * Infer platform-to-domain edges by scanning wiki content for platform keywords.
 */
function inferPlatformEdges(
  domainId: string,
  contentMd: string,
  connectedPlatforms: string[],
): GraphEdge[] {
  const lower = contentMd.toLowerCase();
  const edges: GraphEdge[] = [];

  for (const platform of connectedPlatforms) {
    const keywords = PLATFORM_KEYWORDS[platform];
    if (!keywords) continue;

    const matchCount = keywords.reduce(
      (sum, kw) => sum + (lower.includes(kw) ? 1 : 0),
      0,
    );

    if (matchCount > 0) {
      edges.push({
        source: platform,
        target: domainId,
        type: 'platform',
        strength: Math.min(matchCount / 4, 1.0),
      });
    }
  }

  return edges;
}

/**
 * Build complete graph data from wiki pages + connected platforms.
 */
export function useGraphData(
  wikiPages: WikiPage[] | undefined,
  connectedProviders: string[],
): GraphData {
  return useMemo(() => {
    if (!wikiPages || wikiPages.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nodes: (DomainNode | PlatformNode)[] = [];
    const edges: GraphEdge[] = [];
    const edgeSet = new Set<string>();

    // 1. Build domain nodes
    for (const page of wikiPages) {
      const config = DOMAIN_CONFIG[page.domain];
      if (!config) continue;

      nodes.push({
        id: page.domain,
        type: 'domain',
        label: config.label,
        color: config.color,
        size: NODE_SIZE.domain,
        domain: page.domain,
        contentMd: page.content_md,
        version: page.version,
        compiledAt: page.compiled_at,
        crossrefCount: 0,
      });
    }

    // 2. Parse cross-reference edges (deduplicate bidirectional)
    for (const page of wikiPages) {
      const crossRefs = parseCrossRefs(page.domain, page.content_md);
      for (const edge of crossRefs) {
        const key = [String(edge.source), String(edge.target)].sort().join('->');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push(edge);

          const sourceNode = nodes.find(n => n.id === edge.source) as DomainNode | undefined;
          if (sourceNode) sourceNode.crossrefCount++;
        }
      }
    }

    // 3. Build platform nodes (only connected ones)
    for (const provider of connectedProviders) {
      const config = PLATFORM_CONFIG[provider];
      if (!config) continue;

      nodes.push({
        id: provider,
        type: 'platform',
        label: config.label,
        color: config.color,
        size: NODE_SIZE.platform,
        platformId: provider,
      });
    }

    // 4. Infer platform-to-domain edges
    for (const page of wikiPages) {
      const platformEdges = inferPlatformEdges(page.domain, page.content_md, connectedProviders);
      for (const edge of platformEdges) {
        const key = `${String(edge.source)}->${String(edge.target)}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push(edge);
        }
      }
    }

    return { nodes, edges };
  }, [wikiPages, connectedProviders]);
}
