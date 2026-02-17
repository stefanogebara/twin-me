/**
 * Brain Edge Operations
 *
 * Edge CRUD: connectNodes, getNodeEdges, getNeighbors.
 */

import { supabaseAdmin } from '../database.js';
import { RELATIONSHIP_TYPES } from './brainConstants.js';

/**
 * Connect two nodes with a relationship
 */
export async function connectNodes(userId, fromNodeId, toNodeId, edgeData = {}, logActivity) {
  const {
    relationship_type = RELATIONSHIP_TYPES.CORRELATES_WITH,
    strength = 0.5,
    confidence = 0.5,
    context = null,
    evidence = []
  } = edgeData;

  // Check if edge exists
  const { data: existing } = await supabaseAdmin
    .from('brain_edges')
    .select('id, strength, confidence, evidence, observation_count')
    .eq('user_id', userId)
    .eq('from_node_id', fromNodeId)
    .eq('to_node_id', toNodeId)
    .eq('relationship_type', relationship_type)
    .eq('context', context)
    .single();

  if (existing) {
    // Strengthen existing edge
    const newStrength = Math.min(1.0, existing.strength + 0.05);
    const newConfidence = Math.min(1.0, existing.confidence + 0.05);
    const mergedEvidence = [...(existing.evidence || []), ...evidence].slice(-20);

    const { data, error } = await supabaseAdmin
      .from('brain_edges')
      .update({
        strength: newStrength,
        confidence: newConfidence,
        evidence: mergedEvidence,
        observation_count: existing.observation_count + 1,
        last_observed: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(userId, 'edge_strengthened', 'edge', existing.id, {
      previous_strength: existing.strength,
      new_strength: newStrength
    });

    console.log(`[TwinsBrain] Strengthened edge: ${relationship_type} (strength: ${newStrength.toFixed(2)})`);
    return data;
  }

  // Create new edge
  const { data, error } = await supabaseAdmin
    .from('brain_edges')
    .insert({
      user_id: userId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      relationship_type,
      strength,
      confidence,
      context,
      evidence
    })
    .select()
    .single();

  if (error) throw error;

  await logActivity(userId, 'edge_created', 'edge', data.id, {
    relationship_type,
    from_node_id: fromNodeId,
    to_node_id: toNodeId
  });

  console.log(`[TwinsBrain] Created edge: ${relationship_type}`);
  return data;
}

/**
 * Get all edges for a node
 */
export async function getNodeEdges(userId, nodeId) {
  const { data, error } = await supabaseAdmin
    .from('brain_edges')
    .select(`
      *,
      from_node:brain_nodes!brain_edges_from_node_id_fkey(id, label, node_type, category),
      to_node:brain_nodes!brain_edges_to_node_id_fkey(id, label, node_type, category)
    `)
    .eq('user_id', userId)
    .or(`from_node_id.eq.${nodeId},to_node_id.eq.${nodeId}`)
    .order('strength', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get neighbors of a node (connected nodes)
 */
export async function getNeighbors(userId, nodeId, relationshipType = null) {
  const { data, error } = await supabaseAdmin
    .rpc('get_brain_neighbors', {
      p_user_id: userId,
      p_node_id: nodeId,
      p_relationship_type: relationshipType
    });

  if (error) throw error;
  return data;
}
