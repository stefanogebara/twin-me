/**
 * Brain Graph Queries
 *
 * Graph-level queries: getBrainGraph, getBrainHealth, getBrainSummary.
 */

import { supabaseAdmin } from '../database.js';

/**
 * Get the full brain graph for a user
 */
export async function getBrainGraph(userId, { minConfidence = 0.3, minEdgeStrength = 0.3 } = {}) {
  // Get all nodes
  const { data: nodes, error: nodesError } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false });

  if (nodesError) throw nodesError;

  // Get all edges
  const { data: edges, error: edgesError } = await supabaseAdmin
    .from('brain_edges')
    .select('*')
    .eq('user_id', userId)
    .gte('strength', minEdgeStrength)
    .order('strength', { ascending: false });

  if (edgesError) throw edgesError;

  return { nodes, edges };
}

/**
 * Calculate brain health score
 */
export async function getBrainHealth(userId) {
  const { data, error } = await supabaseAdmin
    .rpc('calculate_brain_health', { p_user_id: userId });

  if (error) throw error;
  return data?.[0] || {
    total_nodes: 0,
    total_edges: 0,
    avg_confidence: 0,
    avg_edge_strength: 0,
    category_distribution: {},
    health_score: 0
  };
}

/**
 * Get brain summary statistics
 */
export async function getBrainSummary(userId) {
  const health = await getBrainHealth(userId);

  // Get top nodes by category
  const { data: topNodes } = await supabaseAdmin
    .from('brain_nodes')
    .select('label, node_type, category, confidence')
    .eq('user_id', userId)
    .gte('confidence', 0.7)
    .order('confidence', { ascending: false })
    .limit(10);

  // Get recent activity
  const { data: recentActivity } = await supabaseAdmin
    .from('brain_activity_log')
    .select('activity_type, entity_type, change_data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    health,
    topNodes: topNodes || [],
    recentActivity: recentActivity || []
  };
}
