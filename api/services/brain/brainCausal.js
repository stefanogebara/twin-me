/**
 * Brain Causal Reasoning Methods - Phase 4
 *
 * Causal edge creation, causality analysis, causal chain traversal,
 * causal summary, and upgrade from correlation to causation.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('Braincausal');
import {
  CAUSAL_TYPES,
  CORRELATIONAL_TYPES,
  CAUSAL_CONFIDENCE_THRESHOLDS
} from './brainConstants.js';

/**
 * Create a causal edge between two nodes
 * Causal edges have directionality - source causes/enables/triggers target
 * @param {string} userId
 * @param {string} sourceNodeId
 * @param {string} targetNodeId
 * @param {Object} options - { causalType, confidence, evidence, context, temporalLag }
 * @param {Object} deps - { connectNodes, strengthenEdge }
 */
export async function createCausalEdge(userId, sourceNodeId, targetNodeId, options = {}, deps) {
  const {
    causalType = 'causes',
    confidence = 0.5,
    evidence = [],
    context = null,
    temporalLag = null
  } = options;

  const { connectNodes, strengthenEdge } = deps;

  // Validate causal type
  if (!CAUSAL_TYPES.includes(causalType)) {
    throw new Error(`Invalid causal type: ${causalType}. Must be one of: ${CAUSAL_TYPES.join(', ')}`);
  }

  // Create edge with causal metadata
  const edge = await connectNodes(userId, sourceNodeId, targetNodeId, {
    relationship_type: causalType,
    context,
    evidence: [
      ...evidence,
      {
        timestamp: new Date().toISOString(),
        type: 'causal_assertion',
        confidence,
        temporal_lag: temporalLag
      }
    ]
  });

  // Update edge strength based on confidence
  await strengthenEdge(userId, sourceNodeId, targetNodeId, confidence - 0.5);

  log.info(`Created causal edge: ${sourceNodeId} --${causalType}--> ${targetNodeId} (confidence: ${confidence})`);
  return edge;
}

/**
 * Analyze if a correlational relationship might be causal
 * Uses temporal precedence, consistency, and strength as heuristics
 */
export async function analyzeCausality(userId, sourceNodeId, targetNodeId) {
  // Get both nodes
  const { data: sourceNode } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('id', sourceNodeId)
    .eq('user_id', userId)
    .single();

  const { data: targetNode } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('id', targetNodeId)
    .eq('user_id', userId)
    .single();

  if (!sourceNode || !targetNode) {
    throw new Error('One or both nodes not found');
  }

  // Get existing edge
  const { data: edge } = await supabaseAdmin
    .from('brain_edges')
    .select('*')
    .eq('user_id', userId)
    .or(`and(from_node_id.eq.${sourceNodeId},to_node_id.eq.${targetNodeId}),and(from_node_id.eq.${targetNodeId},to_node_id.eq.${sourceNodeId})`)
    .single();

  const analysis = {
    sourceNode: { id: sourceNodeId, label: sourceNode.label, type: sourceNode.node_type },
    targetNode: { id: targetNodeId, label: targetNode.label, type: targetNode.node_type },
    currentRelationship: edge?.relationship_type || 'none',
    causalityScore: 0,
    factors: [],
    recommendation: null
  };

  // Factor 1: Temporal Precedence (source created before target suggests causation direction)
  const sourceDate = new Date(sourceNode.created_at);
  const targetDate = new Date(targetNode.created_at);
  if (sourceDate < targetDate) {
    analysis.factors.push({
      name: 'temporal_precedence',
      score: 0.2,
      detail: 'Source node was created before target node'
    });
    analysis.causalityScore += 0.2;
  }

  // Factor 2: Edge Strength (strong correlations more likely to be causal)
  if (edge && edge.strength >= 0.7) {
    analysis.factors.push({
      name: 'strong_correlation',
      score: 0.25,
      detail: `Strong correlation (${edge.strength.toFixed(2)}) suggests causal link`
    });
    analysis.causalityScore += 0.25;
  } else if (edge && edge.strength >= 0.5) {
    analysis.factors.push({
      name: 'moderate_correlation',
      score: 0.15,
      detail: `Moderate correlation (${edge.strength.toFixed(2)})`
    });
    analysis.causalityScore += 0.15;
  }

  // Factor 3: Node Type Compatibility (certain types more likely to be causal)
  const causalPairs = [
    ['behavior', 'pattern'],      // Behaviors cause patterns
    ['interest', 'behavior'],     // Interests cause behaviors
    ['trait', 'preference'],      // Traits cause preferences
    ['pattern', 'fact']           // Patterns lead to facts
  ];
  const isPotentialCausal = causalPairs.some(
    ([src, tgt]) => sourceNode.node_type === src && targetNode.node_type === tgt
  );
  if (isPotentialCausal) {
    analysis.factors.push({
      name: 'type_compatibility',
      score: 0.2,
      detail: `${sourceNode.node_type} -> ${targetNode.node_type} is a typical causal pattern`
    });
    analysis.causalityScore += 0.2;
  }

  // Factor 4: Evidence consistency (multiple pieces of evidence)
  if (edge?.evidence && edge.evidence.length >= 3) {
    analysis.factors.push({
      name: 'evidence_consistency',
      score: 0.2,
      detail: `${edge.evidence.length} pieces of supporting evidence`
    });
    analysis.causalityScore += 0.2;
  }

  // Factor 5: Same platform data (cross-platform is less likely causal)
  if (sourceNode.platform && sourceNode.platform === targetNode.platform) {
    analysis.factors.push({
      name: 'same_platform',
      score: 0.15,
      detail: `Both from ${sourceNode.platform} - same data source increases causal likelihood`
    });
    analysis.causalityScore += 0.15;
  }

  // Generate recommendation
  if (analysis.causalityScore >= CAUSAL_CONFIDENCE_THRESHOLDS.STRONG) {
    analysis.recommendation = {
      action: 'upgrade_to_causal',
      suggestedType: 'causes',
      confidence: 'high',
      message: 'Strong evidence suggests this is a causal relationship'
    };
  } else if (analysis.causalityScore >= CAUSAL_CONFIDENCE_THRESHOLDS.MODERATE) {
    analysis.recommendation = {
      action: 'consider_upgrade',
      suggestedType: 'enables',
      confidence: 'moderate',
      message: 'Moderate evidence for causation - consider upgrading with more evidence'
    };
  } else if (analysis.causalityScore >= CAUSAL_CONFIDENCE_THRESHOLDS.WEAK) {
    analysis.recommendation = {
      action: 'monitor',
      suggestedType: null,
      confidence: 'low',
      message: 'Weak causal signal - keep as correlation, monitor for more evidence'
    };
  } else {
    analysis.recommendation = {
      action: 'keep_correlation',
      suggestedType: null,
      confidence: 'none',
      message: 'No significant causal evidence - relationship appears correlational'
    };
  }

  return analysis;
}

/**
 * Trace causal chain from a source node
 * Follows causal edges to find downstream effects
 */
export async function getCausalChain(userId, sourceNodeId, { maxDepth = 5, direction = 'downstream' } = {}) {
  const visited = new Set();
  const chain = [];

  const traverse = async (nodeId, depth, path) => {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    // Get node info
    const { data: node } = await supabaseAdmin
      .from('brain_nodes')
      .select('id, label, node_type, category')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    if (!node) return;

    // Get causal edges
    const edgeQuery = direction === 'downstream'
      ? supabaseAdmin
          .from('brain_edges')
          .select('*, target:brain_nodes!brain_edges_to_node_id_fkey(id, label, node_type)')
          .eq('user_id', userId)
          .eq('from_node_id', nodeId)
          .in('relationship_type', CAUSAL_TYPES)
      : supabaseAdmin
          .from('brain_edges')
          .select('*, source:brain_nodes!brain_edges_from_node_id_fkey(id, label, node_type)')
          .eq('user_id', userId)
          .eq('to_node_id', nodeId)
          .in('relationship_type', CAUSAL_TYPES);

    const { data: edges } = await edgeQuery;

    for (const edge of edges || []) {
      const nextNode = direction === 'downstream' ? edge.target : edge.source;
      if (!nextNode || visited.has(nextNode.id)) continue;

      const chainLink = {
        from: { id: node.id, label: node.label, type: node.node_type },
        to: { id: nextNode.id, label: nextNode.label, type: nextNode.type },
        relationship: edge.relationship_type,
        strength: edge.strength,
        depth: depth,
        path: [...path, node.label]
      };
      chain.push(chainLink);

      await traverse(nextNode.id, depth + 1, [...path, node.label]);
    }
  };

  await traverse(sourceNodeId, 0, []);

  return {
    sourceNodeId,
    direction,
    maxDepth,
    chain,
    totalLinks: chain.length,
    maxDepthReached: Math.max(0, ...chain.map(c => c.depth))
  };
}

/**
 * Get summary of causal vs correlational edges
 */
export async function getCausalSummary(userId) {
  // Get all edges
  const { data: edges, error } = await supabaseAdmin
    .from('brain_edges')
    .select('relationship_type, strength')
    .eq('user_id', userId);

  if (error) throw error;

  const summary = {
    totalEdges: edges?.length || 0,
    causal: {
      count: 0,
      types: {},
      avgStrength: 0
    },
    correlational: {
      count: 0,
      types: {},
      avgStrength: 0
    },
    other: {
      count: 0,
      types: {}
    }
  };

  let causalStrengthSum = 0;
  let correlationalStrengthSum = 0;

  for (const edge of edges || []) {
    const type = edge.relationship_type;

    if (CAUSAL_TYPES.includes(type)) {
      summary.causal.count++;
      summary.causal.types[type] = (summary.causal.types[type] || 0) + 1;
      causalStrengthSum += edge.strength || 0;
    } else if (CORRELATIONAL_TYPES.includes(type)) {
      summary.correlational.count++;
      summary.correlational.types[type] = (summary.correlational.types[type] || 0) + 1;
      correlationalStrengthSum += edge.strength || 0;
    } else {
      summary.other.count++;
      summary.other.types[type] = (summary.other.types[type] || 0) + 1;
    }
  }

  summary.causal.avgStrength = summary.causal.count > 0
    ? causalStrengthSum / summary.causal.count
    : 0;
  summary.correlational.avgStrength = summary.correlational.count > 0
    ? correlationalStrengthSum / summary.correlational.count
    : 0;
  summary.causalRatio = summary.totalEdges > 0
    ? summary.causal.count / summary.totalEdges
    : 0;

  return summary;
}

/**
 * Upgrade a correlational edge to causal based on new evidence
 */
export async function upgradeToCausal(userId, sourceNodeId, targetNodeId, options = {}, logActivity) {
  const {
    causalType = 'causes',
    evidence = [],
    reason = null
  } = options;

  // Find existing edge
  const { data: edge, error: findError } = await supabaseAdmin
    .from('brain_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('from_node_id', sourceNodeId)
    .eq('to_node_id', targetNodeId)
    .single();

  if (findError || !edge) {
    throw new Error('Edge not found between these nodes');
  }

  // Validate it's currently correlational
  if (CAUSAL_TYPES.includes(edge.relationship_type)) {
    throw new Error('Edge is already causal');
  }

  // Update to causal type
  const updatedEvidence = [
    ...(edge.evidence || []),
    ...evidence,
    {
      timestamp: new Date().toISOString(),
      type: 'causality_upgrade',
      from_type: edge.relationship_type,
      to_type: causalType,
      reason
    }
  ];

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('brain_edges')
    .update({
      relationship_type: causalType,
      evidence: updatedEvidence,
      updated_at: new Date().toISOString()
    })
    .eq('id', edge.id)
    .select()
    .single();

  if (updateError) throw updateError;

  await logActivity(userId, 'edge_upgraded_to_causal', 'edge', edge.id, {
    from_type: edge.relationship_type,
    to_type: causalType,
    reason
  });

  log.info(`Upgraded edge to causal: ${edge.relationship_type} -> ${causalType}`);
  return updated;
}
