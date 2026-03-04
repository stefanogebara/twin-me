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
// ====================================================================
// STDP co-retrieval link strengthening
// ====================================================================

/**
 * Strengthen links between co-cited memories (STDP-inspired).
 * Memories cited together in a twin response wire together:
 * - Creates 'co_citation' links at strength 0.3 if they don't exist
 * - Increments existing co_citation links by 0.1 (capped at 1.0)
 * - Max 15 pairs per call to prevent combinatorial explosion
 *
 * @param {string} userId
 * @param {string[]} citedIds - Memory IDs cited in the same response
 */
export async function strengthenCoCitedLinks(userId, citedIds) {
  if (!citedIds || citedIds.length < 2) return;

  // Generate pairs (max 15 to avoid n^2 explosion with many citations)
  const pairs = [];
  for (let i = 0; i < citedIds.length && pairs.length < 15; i++) {
    for (let j = i + 1; j < citedIds.length && pairs.length < 15; j++) {
      pairs.push([citedIds[i], citedIds[j]]);
    }
  }

  try {
    for (const [sourceId, targetId] of pairs) {
      // Try to fetch existing link
      const { data: existing } = await supabaseAdmin
        .from('memory_links')
        .select('id, strength')
        .eq('source_memory_id', sourceId)
        .eq('target_memory_id', targetId)
        .maybeSingle();

      if (existing) {
        // Increment strength by 0.1, cap at 1.0
        const newStrength = Math.min(1.0, existing.strength + 0.1);
        await supabaseAdmin
          .from('memory_links')
          .update({ strength: newStrength, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        // Create new co_citation link at 0.3
        await supabaseAdmin
          .from('memory_links')
          .upsert({
            user_id: userId,
            source_memory_id: sourceId,
            target_memory_id: targetId,
            link_type: 'co_citation',
            strength: 0.3,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'source_memory_id,target_memory_id', ignoreDuplicates: false });
      }
    }

    console.log(`[MemoryLinks] STDP: strengthened ${pairs.length} co-citation pairs`);
  } catch (err) {
    console.warn('[MemoryLinks] strengthenCoCitedLinks error:', err.message);
  }
}

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
