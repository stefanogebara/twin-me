/**
 * Brain Multi-Context Personality Methods - Phase 4
 *
 * Context-specific expression levels, context-filtered graph views,
 * personality summary across contexts, and context pattern detection.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('Braincontext');
import {
  NODE_TYPES,
  CATEGORIES,
  CONTEXT_TYPES,
  CONTEXT_EXPRESSION
} from './brainConstants.js';

/**
 * Set context-specific expression level for a node
 * A node might be "enhanced" in work context but "suppressed" in social context
 */
export async function setNodeContextExpression(userId, nodeId, context, expressionLevel, notes = null, logActivity) {
  // Validate context
  if (!Object.values(CONTEXT_TYPES).includes(context)) {
    throw new Error(`Invalid context: ${context}. Valid contexts: ${Object.values(CONTEXT_TYPES).join(', ')}`);
  }

  // Get node
  const { data: node, error: nodeError } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .single();

  if (nodeError || !node) {
    throw new Error('Node not found');
  }

  // Update node data with context expression
  const contextExpressions = node.data?.context_expressions || {};
  contextExpressions[context] = {
    level: expressionLevel,
    notes,
    updated_at: new Date().toISOString()
  };

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('brain_nodes')
    .update({
      data: {
        ...node.data,
        context_expressions: contextExpressions
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', nodeId)
    .select()
    .single();

  if (updateError) throw updateError;

  await logActivity(userId, 'context_expression_set', 'node', nodeId, {
    context,
    expression_level: expressionLevel,
    notes
  });

  log.info(`Set context expression: node ${nodeId} = ${expressionLevel} in ${context}`);
  return updated;
}

/**
 * Get all context expressions for a node
 */
export async function getNodeContextExpressions(userId, nodeId) {
  const { data: node, error } = await supabaseAdmin
    .from('brain_nodes')
    .select('id, label, data')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .single();

  if (error || !node) {
    throw new Error('Node not found');
  }

  return {
    nodeId: node.id,
    label: node.label,
    contextExpressions: node.data?.context_expressions || {},
    availableContexts: Object.values(CONTEXT_TYPES)
  };
}

/**
 * Get brain graph filtered/modified for a specific context
 * Nodes with expression levels in that context are adjusted
 */
export async function getBrainGraphForContext(userId, context, options = {}, deps) {
  const { minConfidence = 0.3, minEdgeStrength = 0.3 } = options;
  const { getBrainGraph } = deps;

  // Get base graph
  const { nodes, edges } = await getBrainGraph(userId, { minConfidence, minEdgeStrength });

  // Apply context-specific modifiers
  const contextNodes = nodes.map(node => {
    const contextExpr = node.data?.context_expressions?.[context];
    const expressionLevel = contextExpr?.level || CONTEXT_EXPRESSION.NORMAL;

    // Adjust confidence based on expression level
    const contextualConfidence = Math.min(1, node.confidence * expressionLevel);

    // Determine if node should be visible in this context
    const isRelevant = contextExpr || context === CONTEXT_TYPES.GLOBAL;

    return {
      ...node,
      contextualConfidence,
      expressionLevel,
      contextNotes: contextExpr?.notes || null,
      isContextRelevant: isRelevant,
      // Visual modifiers for frontend
      contextualSize: node.size ? node.size * expressionLevel : undefined,
      contextualOpacity: expressionLevel < 0.5 ? 0.4 : (expressionLevel > 1 ? 1 : 0.7)
    };
  });

  // Filter out nodes that are suppressed below visibility threshold
  const visibleNodes = contextNodes.filter(n => n.expressionLevel >= 0.2);

  // Adjust edges based on connected nodes' expression levels
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const contextEdges = edges
    .filter(e => visibleNodeIds.has(e.from_node_id) && visibleNodeIds.has(e.to_node_id))
    .map(edge => {
      const sourceNode = visibleNodes.find(n => n.id === edge.from_node_id);
      const targetNode = visibleNodes.find(n => n.id === edge.to_node_id);
      const avgExpression = ((sourceNode?.expressionLevel || 1) + (targetNode?.expressionLevel || 1)) / 2;

      return {
        ...edge,
        contextualStrength: edge.strength * avgExpression
      };
    });

  return {
    context,
    nodes: visibleNodes,
    edges: contextEdges,
    stats: {
      totalNodes: nodes.length,
      visibleNodes: visibleNodes.length,
      hiddenNodes: nodes.length - visibleNodes.length,
      nodesWithContextData: nodes.filter(n => n.data?.context_expressions?.[context]).length
    }
  };
}

/**
 * Get a summary of how personality varies across contexts
 */
export async function getContextPersonalitySummary(userId) {
  const { data: nodes, error } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId)
    .in('node_type', [NODE_TYPES.TRAIT, NODE_TYPES.PREFERENCE, NODE_TYPES.BEHAVIOR]);

  if (error) throw error;

  const summary = {
    contexts: {},
    nodesWithContextData: 0,
    topContextualTraits: {}
  };

  // Initialize all contexts
  Object.values(CONTEXT_TYPES).forEach(ctx => {
    summary.contexts[ctx] = {
      nodeCount: 0,
      enhancedNodes: [],
      suppressedNodes: [],
      avgExpression: 0,
      totalExpression: 0
    };
  });

  // Analyze each node
  for (const node of nodes || []) {
    const contextExpr = node.data?.context_expressions;
    if (!contextExpr) continue;

    summary.nodesWithContextData++;

    for (const [ctx, expr] of Object.entries(contextExpr)) {
      if (!summary.contexts[ctx]) continue;

      summary.contexts[ctx].nodeCount++;
      summary.contexts[ctx].totalExpression += expr.level || 1;

      if (expr.level >= CONTEXT_EXPRESSION.ENHANCED) {
        summary.contexts[ctx].enhancedNodes.push({
          id: node.id,
          label: node.label,
          level: expr.level,
          notes: expr.notes
        });
      } else if (expr.level <= CONTEXT_EXPRESSION.SUPPRESSED) {
        summary.contexts[ctx].suppressedNodes.push({
          id: node.id,
          label: node.label,
          level: expr.level,
          notes: expr.notes
        });
      }
    }
  }

  // Calculate averages
  Object.keys(summary.contexts).forEach(ctx => {
    const context = summary.contexts[ctx];
    context.avgExpression = context.nodeCount > 0
      ? context.totalExpression / context.nodeCount
      : 1.0;
    delete context.totalExpression;

    // Sort enhanced and suppressed by expression level
    context.enhancedNodes.sort((a, b) => b.level - a.level);
    context.suppressedNodes.sort((a, b) => a.level - b.level);

    // Keep only top 5 each
    context.enhancedNodes = context.enhancedNodes.slice(0, 5);
    context.suppressedNodes = context.suppressedNodes.slice(0, 5);
  });

  return summary;
}

/**
 * Detect context patterns from behavioral data
 * Analyzes when/where behaviors occur to suggest context assignments
 */
export async function detectContextPatterns(userId) {
  // Get all behavior and pattern nodes
  const { data: nodes, error } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId)
    .in('node_type', [NODE_TYPES.BEHAVIOR, NODE_TYPES.PATTERN]);

  if (error) throw error;

  const suggestions = [];

  for (const node of nodes || []) {
    const platform = node.platform?.toLowerCase();
    const category = node.category;
    const label = node.label?.toLowerCase() || '';

    // Suggest contexts based on platform
    if (platform === 'github' || platform === 'linkedin' || platform === 'teams') {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.WORK,
        confidence: 0.8,
        reason: `Platform ${platform} is typically work-related`
      });
    }

    if (platform === 'spotify' || platform === 'netflix') {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.PERSONAL,
        confidence: 0.7,
        reason: `Platform ${platform} is typically personal entertainment`
      });
    }

    if (platform === 'discord' || platform === 'reddit') {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.SOCIAL,
        confidence: 0.6,
        reason: `Platform ${platform} is typically social interaction`
      });
    }

    // Suggest contexts based on category
    if (category === CATEGORIES.HEALTH) {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.HEALTH,
        confidence: 0.9,
        reason: 'Node is in health category'
      });
    }

    if (category === CATEGORIES.CREATIVE) {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.CREATIVE,
        confidence: 0.8,
        reason: 'Node is in creative category'
      });
    }

    if (category === CATEGORIES.LEARNING) {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.LEARNING,
        confidence: 0.8,
        reason: 'Node is in learning category'
      });
    }

    // Keyword-based suggestions
    if (label.includes('meeting') || label.includes('project') || label.includes('deadline')) {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.WORK,
        confidence: 0.7,
        reason: 'Keywords suggest work context'
      });
    }

    if (label.includes('friend') || label.includes('party') || label.includes('hangout')) {
      suggestions.push({
        nodeId: node.id,
        label: node.label,
        suggestedContext: CONTEXT_TYPES.SOCIAL,
        confidence: 0.7,
        reason: 'Keywords suggest social context'
      });
    }
  }

  // Remove duplicates (keep highest confidence)
  const uniqueSuggestions = {};
  for (const s of suggestions) {
    const key = `${s.nodeId}-${s.suggestedContext}`;
    if (!uniqueSuggestions[key] || uniqueSuggestions[key].confidence < s.confidence) {
      uniqueSuggestions[key] = s;
    }
  }

  return {
    suggestions: Object.values(uniqueSuggestions).sort((a, b) => b.confidence - a.confidence),
    availableContexts: Object.values(CONTEXT_TYPES)
  };
}

/**
 * Batch apply context expressions based on suggestions
 */
export async function applyContextSuggestions(userId, suggestions, deps) {
  const { setNodeContextExpressionFn } = deps;

  const results = {
    applied: 0,
    failed: 0,
    errors: []
  };

  for (const suggestion of suggestions) {
    try {
      await setNodeContextExpressionFn(
        userId,
        suggestion.nodeId,
        suggestion.suggestedContext,
        CONTEXT_EXPRESSION.ENHANCED,
        `Auto-detected: ${suggestion.reason}`
      );
      results.applied++;
    } catch (err) {
      results.failed++;
      results.errors.push({
        nodeId: suggestion.nodeId,
        error: err.message
      });
    }
  }

  log.info(`Applied ${results.applied} context suggestions, ${results.failed} failed`);
  return results;
}
