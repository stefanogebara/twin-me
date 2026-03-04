/**
 * Retrospective Memory Citation (RMM-inspired)
 * =============================================
 * After the twin responds, a cheap extraction call identifies which memories
 * from the context window actually drove the response. This enables:
 * - STDP-style co-retrieval link strengthening (memories cited together wire together)
 * - Retrieval count bumps on cited memories (reinforcement learning)
 * - Dynamic alpha blending (citation frequency informs memory prominence)
 *
 * Based on: "Retrospective Memory Model" (ACL 2025)
 * Cost: ~$0.001/call via TIER_EXTRACTION (Mistral Small)
 */

import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { supabaseAdmin } from './database.js';

/**
 * Extract which memories were cited (used) in a twin response.
 *
 * @param {Array<{id: string, content: string}>} memoriesInContext - Memories that were in the context window
 * @param {string} twinResponse - The assistant's response text
 * @param {string} userId - For cost tracking
 * @returns {Promise<string[]>} Array of cited memory IDs (validated against input)
 */
export async function extractCitations(memoriesInContext, twinResponse, userId) {
  if (!memoriesInContext?.length || !twinResponse) return [];

  // Build numbered list for the LLM
  const numberedMemories = memoriesInContext.map((m, i) =>
    `[${i + 1}] ${m.content.substring(0, 300)}`
  ).join('\n');

  const result = await complete({
    tier: TIER_EXTRACTION,
    system: 'You identify which memories were used to generate a response. Return ONLY a JSON array of numbers (1-indexed) corresponding to memories that clearly influenced the response. If none were used, return []. Be conservative — only cite memories with clear evidence in the response.',
    messages: [
      {
        role: 'user',
        content: `MEMORIES IN CONTEXT:\n${numberedMemories}\n\nTWIN RESPONSE:\n${twinResponse.substring(0, 1000)}\n\nWhich memory numbers (1-indexed) were clearly used in this response? Return JSON array only.`,
      },
    ],
    maxTokens: 128,
    temperature: 0,
    userId,
    serviceName: 'citation-extraction',
  });

  // Parse the JSON array from LLM response
  const text = result?.content || result?.text || '';
  const match = text.match(/\[[\d\s,]*\]/);
  if (!match) return [];

  try {
    const indices = JSON.parse(match[0]);
    // Validate: only keep valid 1-indexed numbers within range
    const validIds = indices
      .filter(i => Number.isInteger(i) && i >= 1 && i <= memoriesInContext.length)
      .map(i => memoriesInContext[i - 1].id);

    // Deduplicate
    return [...new Set(validIds)];
  } catch {
    return [];
  }
}

/**
 * Bump retrieval_count for cited memories.
 * Uses a simple UPDATE — the touch_memories RPC already handles last_accessed_at
 * but doesn't increment retrieval_count selectively for citations.
 *
 * @param {string[]} memoryIds - Cited memory IDs
 */
export async function incrementCitationCounts(memoryIds) {
  if (!memoryIds?.length) return;

  // Batch update: increment retrieval_count for all cited memories
  const { error } = await supabaseAdmin.rpc('increment_retrieval_counts', {
    p_memory_ids: memoryIds,
  });

  if (error) {
    // Fallback: individual updates if RPC doesn't exist yet
    if (error.message?.includes('function') || error.code === '42883') {
      console.warn('[Citations] RPC not found, falling back to individual updates');
      for (const id of memoryIds) {
        // Fetch current count, then increment
        const { data: mem } = await supabaseAdmin
          .from('user_memories')
          .select('retrieval_count')
          .eq('id', id)
          .single()
          .catch(() => ({ data: null }));
        if (mem) {
          await supabaseAdmin
            .from('user_memories')
            .update({ retrieval_count: (mem.retrieval_count || 0) + 1 })
            .eq('id', id)
            .catch(() => {});
        }
      }
    } else {
      console.warn('[Citations] incrementCitationCounts error:', error.message);
    }
  }
}

/**
 * Full citation pipeline: extract → store in metadata → bump counts → return IDs.
 * Designed to be called fire-and-forget after twin response.
 *
 * @param {Object} params
 * @param {Array<{id: string, content: string}>} params.memoriesInContext
 * @param {string} params.twinResponse
 * @param {string} params.userId
 * @param {string} params.conversationId
 * @param {string} params.messageContent - The assistant message content (for finding the twin_messages row)
 * @returns {Promise<string[]>} Cited memory IDs
 */
export async function runCitationPipeline({ memoriesInContext, twinResponse, userId, conversationId }) {
  if (!memoriesInContext?.length || !twinResponse) return [];

  try {
    const citedIds = await extractCitations(memoriesInContext, twinResponse, userId);

    if (citedIds.length === 0) return [];

    console.log(`[Citations] Extracted ${citedIds.length} citations from ${memoriesInContext.length} memories`);

    // Store cited_memory_ids in the most recent assistant message's metadata
    if (conversationId) {
      const { data: msg } = await supabaseAdmin
        .from('twin_messages')
        .select('id, metadata')
        .eq('conversation_id', conversationId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (msg) {
        const updatedMetadata = { ...(msg.metadata || {}), cited_memory_ids: citedIds };
        await supabaseAdmin
          .from('twin_messages')
          .update({ metadata: updatedMetadata })
          .eq('id', msg.id);
      }
    }

    // Bump retrieval counts on cited memories
    await incrementCitationCounts(citedIds);

    return citedIds;
  } catch (err) {
    console.warn('[Citations] Pipeline error:', err.message);
    return [];
  }
}
