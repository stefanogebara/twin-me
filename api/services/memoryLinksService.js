/**
 * A-MEM Zettelkasten Memory Links
 * =================================
 * Auto-links related memories using cosine similarity when reflections are written.
 * Based on: "A-MEM: Agentic Memory for LLM Agents" (Xu et al., 2025)
 *
 * Implements a Zettelkasten-style note graph on top of the memory stream:
 * - When a reflection is written, it is automatically linked to semantically
 *   similar memories (cosine similarity >= 0.75) via the memory_links table.
 * - Reflection-source links record which memories an expert reflection was
 *   derived from (strength = 1.0, link_type = 'reflection_source').
 * - Linked memories can be traversed for graph-based context retrieval.
 *
 * All writes are fire-and-forget (non-blocking) — link failures never
 * surface to the caller and do not affect the main reflection pipeline.
 */

import { supabaseAdmin } from './database.js';

const LINK_THRESHOLD = 0.75; // cosine similarity threshold for auto-linking
const MAX_LINKS_PER_MEMORY = 10; // max links created per memory

// ====================================================================
// Auto-link via cosine similarity (called after reflection write)
// ====================================================================

/**
 * Auto-link a new memory to existing related memories via cosine similarity.
 * Uses the find_similar_memories_for_linking RPC (pgvector <=> operator).
 *
 * Called after a reflection is written. Non-blocking — wrap caller in
 * try/catch and do not await.
 *
 * @param {string} memoryId - The newly written memory's UUID
 * @param {string} userId
 * @param {number[]} embedding - 1536-dimensional float array
 */
export async function autoLinkMemory(memoryId, userId, embedding) {
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) return;

  try {
    const { data: similar, error } = await supabaseAdmin.rpc('find_similar_memories_for_linking', {
      p_memory_id: memoryId,
      p_user_id: userId,
      p_embedding: embedding,
      p_threshold: LINK_THRESHOLD,
      p_limit: MAX_LINKS_PER_MEMORY,
    });

    if (error) {
      console.warn('[MemoryLinks] RPC error:', error.message);
      return;
    }

    if (!similar?.length) return;

    const links = similar.map(m => ({
      user_id: userId,
      source_memory_id: memoryId,
      target_memory_id: m.id,
      link_type: 'semantic',
      strength: m.similarity,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('memory_links')
      .upsert(links, { onConflict: 'source_memory_id,target_memory_id', ignoreDuplicates: true });

    if (insertError) {
      console.warn('[MemoryLinks] upsert error:', insertError.message);
      return;
    }

    console.log(`[MemoryLinks] Linked memory ${memoryId} to ${similar.length} related memories`);
  } catch (err) {
    console.warn('[MemoryLinks] autoLinkMemory error:', err.message);
  }
}

// ====================================================================
// Reflection-source links (causal provenance)
// ====================================================================

/**
 * Mark reflection-source links: connect a reflection to the memories it
 * was derived from. Strength is 1.0 (definitive provenance, not probabilistic).
 *
 * Called from reflectionEngine when grounding_ids are available.
 *
 * @param {string} reflectionId - UUID of the stored reflection memory
 * @param {string} userId
 * @param {string[]} sourceIds - UUIDs of the evidence memories
 */
export async function linkReflectionToSources(reflectionId, userId, sourceIds) {
  if (!sourceIds?.length) return;

  try {
    const links = sourceIds.map(sourceId => ({
      user_id: userId,
      source_memory_id: reflectionId,
      target_memory_id: sourceId,
      link_type: 'reflection_source',
      strength: 1.0,
    }));

    const { error } = await supabaseAdmin
      .from('memory_links')
      .upsert(links, { onConflict: 'source_memory_id,target_memory_id', ignoreDuplicates: true });

    if (error) {
      console.warn('[MemoryLinks] linkReflectionToSources error:', error.message);
    }
  } catch (err) {
    console.warn('[MemoryLinks] linkReflectionToSources error:', err.message);
  }
}

// ====================================================================
// Graph traversal (read path)
// ====================================================================

/**
 * Get linked memories for a given memory ID (for graph traversal).
 * Returns links ordered by strength descending.
 *
 * @param {string} memoryId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>} Array of { link_type, strength, target: { id, content, memory_type, importance_score, created_at } }
 */
export async function getLinkedMemories(memoryId, userId, limit = 5) {
  const { data, error } = await supabaseAdmin
    .from('memory_links')
    .select(`
      link_type, strength,
      target:target_memory_id (id, content, memory_type, importance_score, created_at)
    `)
    .eq('source_memory_id', memoryId)
    .eq('user_id', userId)
    .order('strength', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
