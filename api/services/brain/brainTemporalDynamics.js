/**
 * Brain Temporal Dynamics - Phase 3
 *
 * Temporal decay, freshness tracking, node reinforcement,
 * and batch platform reinforcement.
 */

import { supabaseAdmin } from '../database.js';
import { DECAY_RATES, MIN_CONFIDENCE_FLOOR, STALENESS_THRESHOLDS } from './brainConstants.js';

/**
 * Calculate the effective confidence of a node accounting for decay
 * @param {Object} node - The node object
 * @returns {number} - The decayed confidence value (0-1)
 */
export function calculateDecayedConfidence(node) {
  const baseConfidence = node.confidence || 0.5;
  const abstractionLevel = node.data?.abstraction_level || 2;
  const decayRate = DECAY_RATES[abstractionLevel] || DECAY_RATES[2];

  // Use last_confirmed or last_updated or created_at for decay calculation
  const lastReinforced = node.last_confirmed || node.last_updated || node.created_at;
  if (!lastReinforced) return baseConfidence;

  const daysSinceReinforcement = (Date.now() - new Date(lastReinforced).getTime()) / (1000 * 60 * 60 * 24);

  // Apply exponential decay: confidence * e^(-rate * days)
  const decayedConfidence = baseConfidence * Math.exp(-decayRate * daysSinceReinforcement);

  // Don't go below the floor
  return Math.max(MIN_CONFIDENCE_FLOOR, decayedConfidence);
}

/**
 * Get the freshness status of a node
 * @param {Object} node - The node object
 * @returns {Object} - Freshness info { status: 'fresh'|'aging'|'stale', daysSinceUpdate, daysUntilStale }
 */
export function getNodeFreshness(node) {
  const abstractionLevel = node.data?.abstraction_level || 2;
  const stalenessThreshold = STALENESS_THRESHOLDS[abstractionLevel] || STALENESS_THRESHOLDS[2];

  const lastReinforced = node.last_confirmed || node.last_updated || node.created_at;
  if (!lastReinforced) {
    return { status: 'unknown', daysSinceUpdate: null, daysUntilStale: null };
  }

  const daysSinceUpdate = (Date.now() - new Date(lastReinforced).getTime()) / (1000 * 60 * 60 * 24);
  const daysUntilStale = Math.max(0, stalenessThreshold - daysSinceUpdate);

  let status = 'fresh';
  if (daysSinceUpdate >= stalenessThreshold) {
    status = 'stale';
  } else if (daysSinceUpdate >= stalenessThreshold * 0.7) {
    status = 'aging';
  }

  return {
    status,
    daysSinceUpdate: Math.round(daysSinceUpdate),
    daysUntilStale: Math.round(daysUntilStale),
    stalenessThreshold,
    lastReinforced
  };
}

/**
 * Reinforce a node with new evidence (boost confidence and reset decay timer)
 * @param {string} userId - User ID
 * @param {string} nodeId - Node ID
 * @param {Object} options - { evidenceSource, confidenceBoost, newEvidence }
 * @param {Function} logActivity - Activity logging function
 * @returns {Promise<Object>} - Updated node
 */
export async function reinforceNode(userId, nodeId, options = {}, logActivity) {
  const {
    evidenceSource = 'manual',
    confidenceBoost = 0.1,
    newEvidence = null
  } = options;

  // Get current node
  const { data: node, error: fetchError } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  // Calculate new confidence (cap at 1.0)
  const currentDecayedConfidence = calculateDecayedConfidence(node);
  const newConfidence = Math.min(1.0, currentDecayedConfidence + confidenceBoost);

  // Prepare reinforcement history
  const reinforcementHistory = node.data?.reinforcement_history || [];
  reinforcementHistory.push({
    timestamp: new Date().toISOString(),
    source: evidenceSource,
    previous_confidence: node.confidence,
    new_confidence: newConfidence,
    evidence: newEvidence
  });

  // Keep only last 20 reinforcement events
  const trimmedHistory = reinforcementHistory.slice(-20);

  // Update the node
  const { data: updatedNode, error: updateError } = await supabaseAdmin
    .from('brain_nodes')
    .update({
      confidence: newConfidence,
      last_updated: new Date().toISOString(),
      last_confirmed: new Date().toISOString(),
      data: {
        ...node.data,
        reinforcement_history: trimmedHistory,
        last_reinforcement_source: evidenceSource
      }
    })
    .eq('id', nodeId)
    .select()
    .single();

  if (updateError) throw updateError;

  await logActivity(userId, 'node_reinforced', 'node', nodeId, {
    previous_confidence: node.confidence,
    new_confidence: newConfidence,
    source: evidenceSource
  }, evidenceSource);

  console.log(`[TwinsBrain] Reinforced node: "${node.label}" (confidence: ${node.confidence.toFixed(2)} -> ${newConfidence.toFixed(2)})`);
  return updatedNode;
}

/**
 * Get all stale nodes that need reinforcement
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of stale nodes with freshness info
 */
export async function getStaleNodes(userId) {
  const { data: allNodes, error } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  const staleNodes = [];
  for (const node of allNodes || []) {
    const freshness = getNodeFreshness(node);
    if (freshness.status === 'stale' || freshness.status === 'aging') {
      staleNodes.push({
        ...node,
        freshness,
        decayed_confidence: calculateDecayedConfidence(node)
      });
    }
  }

  // Sort by staleness (most stale first)
  return staleNodes.sort((a, b) => b.freshness.daysSinceUpdate - a.freshness.daysSinceUpdate);
}

/**
 * Apply decay calculations and get all nodes with temporal info
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Nodes with temporal information added
 */
export async function getNodesWithTemporalInfo(userId) {
  const { data: nodes, error } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  return (nodes || []).map(node => ({
    ...node,
    decayed_confidence: calculateDecayedConfidence(node),
    freshness: getNodeFreshness(node)
  }));
}

/**
 * Batch reinforce nodes from a data source (e.g., when new platform data arrives)
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @param {Array<string>} nodeLabels - Labels of nodes to reinforce
 * @param {Function} reinforceNodeFn - Bound reinforceNode function from the service
 * @returns {Promise<Object>} - Stats about reinforcement
 */
export async function reinforceNodesFromPlatform(userId, platform, nodeLabels, reinforceNodeFn) {
  const stats = { reinforced: 0, notFound: 0 };

  if (nodeLabels.length === 0) {
    return stats;
  }

  const orFilter = nodeLabels.map(l => `label.ilike.%${l}%`).join(',');
  const { data: nodes, error: nodesErr } = await supabaseAdmin
    .from('brain_nodes')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .or(orFilter);

  if (nodesErr) {
    console.warn('[TwinsBrain] Error fetching nodes for reinforcement:', nodesErr.message);
  }

  for (const node of (nodes || [])) {
    await reinforceNodeFn(userId, node.id, {
      evidenceSource: `platform_data:${platform}`,
      confidenceBoost: 0.05
    });
    stats.reinforced++;
  }

  stats.notFound = Math.max(nodeLabels.length - stats.reinforced, 0);

  console.log(`[TwinsBrain] Platform reinforcement (${platform}): ${stats.reinforced} reinforced, ${stats.notFound} not found`);
  return stats;
}
