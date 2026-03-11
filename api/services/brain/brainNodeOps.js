/**
 * Brain Node Operations
 *
 * CRUD operations for brain nodes: addNode, getNode, findNodes,
 * getAllNodes, updateNodeConfidence, deleteNode.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('Brainnodeops');

/**
 * Add or update a node in the brain
 * @param {string} userId - User ID
 * @param {Object} nodeData - Node data
 * @param {Function} logActivity - Activity logging function
 * @returns {Promise<Object>} Created/updated node
 */
export async function addNode(userId, nodeData, logActivity) {
  const {
    node_type,
    category,
    label,
    description = null,
    confidence = 0.5,
    strength = 0.5,
    source_type = null,
    source_id = null,
    platform = null,
    data = {},
    tags = [],
    privacy_level = 50
  } = nodeData;

  // Check if node with same label exists for this user
  const { data: existing } = await supabaseAdmin
    .from('brain_nodes')
    .select('id, confidence, strength, data')
    .eq('user_id', userId)
    .eq('label', label)
    .eq('node_type', node_type)
    .single();

  if (existing) {
    // Update existing node - increase confidence and merge data
    const newConfidence = Math.min(1.0, existing.confidence + 0.1);
    const mergedData = { ...existing.data, ...data };

    const { data: updated, error } = await supabaseAdmin
      .from('brain_nodes')
      .update({
        confidence: newConfidence,
        strength: Math.max(existing.strength, strength),
        data: mergedData,
        last_updated: new Date().toISOString(),
        last_confirmed: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await logActivity(userId, 'node_updated', 'node', existing.id, {
      previous_confidence: existing.confidence,
      new_confidence: newConfidence
    }, source_type);

    log.info(`Updated node: "${label}" (confidence: ${newConfidence.toFixed(2)})`);
    return updated;
  }

  // Create new node
  const { data: newNode, error } = await supabaseAdmin
    .from('brain_nodes')
    .insert({
      user_id: userId,
      node_type,
      category,
      label,
      description,
      confidence,
      strength,
      source_type,
      source_id,
      platform,
      data,
      tags,
      privacy_level
    })
    .select()
    .single();

  if (error) throw error;

  // Log activity
  await logActivity(userId, 'node_created', 'node', newNode.id, {
    node_type,
    category,
    label
  }, source_type);

  log.info(`Created node: "${label}" (type: ${node_type}, category: ${category})`);
  return newNode;
}

/**
 * Get a node by ID
 */
export async function getNode(userId, nodeId) {
  const { data, error } = await supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId)
    .eq('id', nodeId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Find nodes by label pattern
 */
export async function findNodes(userId, { labelPattern, nodeType, category, minConfidence = 0, limit = 50 }) {
  let query = supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .limit(limit);

  if (labelPattern) {
    query = query.ilike('label', `%${labelPattern}%`);
  }
  if (nodeType) {
    query = query.eq('node_type', nodeType);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Get all nodes for a user
 */
export async function getAllNodes(userId, { nodeType, category, minConfidence = 0 } = {}) {
  let query = supabaseAdmin
    .from('brain_nodes')
    .select('*')
    .eq('user_id', userId)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false });

  if (nodeType) {
    query = query.eq('node_type', nodeType);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Update node confidence (decay or boost)
 */
export async function updateNodeConfidence(userId, nodeId, delta) {
  const { data: node, error: fetchError } = await supabaseAdmin
    .from('brain_nodes')
    .select('confidence')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  const newConfidence = Math.max(0, Math.min(1, node.confidence + delta));

  const { data, error } = await supabaseAdmin
    .from('brain_nodes')
    .update({
      confidence: newConfidence,
      last_updated: new Date().toISOString()
    })
    .eq('id', nodeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a node (and all its edges)
 */
export async function deleteNode(userId, nodeId, logActivity) {
  const { error } = await supabaseAdmin
    .from('brain_nodes')
    .delete()
    .eq('id', nodeId)
    .eq('user_id', userId);

  if (error) throw error;

  await logActivity(userId, 'node_deleted', 'node', nodeId, {}, 'manual');
  return true;
}
