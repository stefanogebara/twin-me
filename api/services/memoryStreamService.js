/**
 * Memory Stream Service
 * =====================
 * Unified memory layer inspired by Generative Agents (Park et al., UIST 2023).
 *
 * Architecture:
 *   - All observations (conversations, platform data, facts) flow into a single
 *     memory stream in `user_memories` with vector embeddings.
 *   - Retrieval uses three-factor scoring:
 *       score = 0.3 * recency_decay + 0.3 * importance/10 + 0.4 * cosine_similarity
 *   - Reflections (higher-level insights) are stored back as memories and become
 *     retrievable in future queries, creating a recursive self-improvement loop.
 *
 * Usage:
 *   import { addMemory, retrieveMemories } from './memoryStreamService.js';
 *   await addMemory(userId, "Listened to Radiohead at 11pm", 'observation', { source: 'spotify' });
 *   const relevant = await retrieveMemories(userId, "How does this person cope with stress?", 10);
 */

import { generateEmbedding, vectorToString } from './embeddingService.js';
import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { supabaseAdmin } from './database.js';

// ====================================================================
// Importance Rating
// ====================================================================

const IMPORTANCE_PROMPT = `On a scale of 1-10 (1=mundane like "said hello", 5=moderately interesting like "enjoys cooking", 10=deeply significant like "career change" or "breakup"), rate this memory's importance to understanding who this person is. Return ONLY the number.

Memory: "{content}"

Rating:`;

/**
 * Rate a memory's importance 1-10 using the cheapest LLM tier.
 * Cost: ~$0.0001 per call.
 */
async function rateImportance(content) {
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: IMPORTANCE_PROMPT.replace('{content}', content.substring(0, 300))
      }],
      maxTokens: 5,
      temperature: 0,
      serviceName: 'memoryStream-importance'
    });

    const text = (result.content || '').trim();
    const score = parseInt(text);
    return (score >= 1 && score <= 10) ? score : 5;
  } catch (error) {
    console.warn('[MemoryStream] Importance rating failed, defaulting to 5:', error.message);
    return 5;
  }
}

// ====================================================================
// Write Path
// ====================================================================

/**
 * Add a memory to the unified memory stream.
 *
 * @param {string} userId - User UUID
 * @param {string} content - Natural language memory content
 * @param {string} memoryType - 'conversation' | 'fact' | 'platform_data' | 'observation' | 'reflection'
 * @param {object} metadata - Additional context (source, platform, etc.)
 * @param {object} options - { skipEmbedding, skipImportance, importanceScore }
 * @returns {object} { id, importance_score } or null on failure
 */
async function addMemory(userId, content, memoryType = 'observation', metadata = {}, options = {}) {
  if (!content || !userId) return null;

  try {
    // Generate embedding and importance score in parallel
    const [embedding, importanceScore] = await Promise.all([
      options.skipEmbedding ? null : generateEmbedding(content),
      options.skipImportance ? (options.importanceScore || 5) : rateImportance(content),
    ]);

    const record = {
      user_id: userId,
      memory_type: memoryType,
      content: content.substring(0, 2000),
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
      importance_score: importanceScore,
      last_accessed_at: new Date().toISOString(),
    };

    // Add embedding if generated
    if (embedding) {
      record.embedding = vectorToString(embedding);
    }

    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .insert(record)
      .select('id, importance_score')
      .single();

    if (error) {
      console.error('[MemoryStream] Failed to store memory:', error.message);
      return null;
    }

    console.log(`[MemoryStream] Stored memory (type=${memoryType}, importance=${importanceScore}, hasEmbedding=${!!embedding}) for user ${userId}`);
    return data;
  } catch (error) {
    console.error('[MemoryStream] addMemory error:', error.message);
    return null;
  }
}

/**
 * Store a conversation exchange as a memory.
 * Generates a natural-language summary for embedding.
 */
async function addConversationMemory(userId, userMessage, assistantResponse, metadata = {}) {
  const summary = `User said: "${userMessage.substring(0, 200)}". Twin responded about: ${assistantResponse.substring(0, 150)}`;
  return addMemory(userId, summary, 'conversation', {
    source: 'twin_chat',
    userMessage: userMessage.substring(0, 500),
    assistantResponse: assistantResponse.substring(0, 500),
    ...metadata,
  });
}

/**
 * Store a platform observation as a memory.
 */
async function addPlatformObservation(userId, content, platform, metadata = {}) {
  return addMemory(userId, content, 'platform_data', {
    source: platform,
    platform,
    ...metadata,
  });
}

/**
 * Store a reflection (higher-level insight) as a memory.
 * Reflections get high importance scores (7-9) since they're synthesized insights.
 */
async function addReflection(userId, content, evidenceIds = [], metadata = {}) {
  return addMemory(userId, content, 'reflection', {
    source: 'reflection_engine',
    evidence_memory_ids: evidenceIds,
    ...metadata,
  }, {
    importanceScore: Math.min(9, Math.max(7, Math.round(content.length / 50))),
    skipImportance: true,
  });
}

// ====================================================================
// Read Path
// ====================================================================

/**
 * Retrieve memories using three-factor scoring:
 *   score = 0.3 * recency + 0.3 * importance + 0.4 * relevance
 *
 * Uses the `search_memory_stream` RPC function in Supabase.
 *
 * @param {string} userId - User UUID
 * @param {string} query - Natural language query for semantic search
 * @param {number} limit - Max results to return (default 10)
 * @returns {Array} Scored and ranked memories
 */
async function retrieveMemories(userId, query, limit = 10) {
  if (!userId || !query) return [];

  try {
    // Generate query embedding for semantic search
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      console.warn('[MemoryStream] Could not generate query embedding, falling back to keyword search');
      return fallbackKeywordSearch(userId, query, limit);
    }

    // Call the three-factor scoring RPC function
    const { data, error } = await supabaseAdmin.rpc('search_memory_stream', {
      p_user_id: userId,
      p_query_embedding: vectorToString(queryEmbedding),
      p_limit: limit,
      p_decay_factor: 0.995,
    });

    if (error) {
      console.error('[MemoryStream] Vector search failed:', error.message);
      return fallbackKeywordSearch(userId, query, limit);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Touch accessed memories (update last_accessed_at) - non-blocking
    const memoryIds = data.map(m => m.id);
    supabaseAdmin.rpc('touch_memories', { p_memory_ids: memoryIds })
      .then(() => {})
      .catch(err => console.warn('[MemoryStream] Failed to touch memories:', err.message));

    console.log(`[MemoryStream] Retrieved ${data.length} memories (top score: ${data[0].score?.toFixed(3)})`);
    return data;
  } catch (error) {
    console.error('[MemoryStream] retrieveMemories error:', error.message);
    return fallbackKeywordSearch(userId, query, limit);
  }
}

/**
 * Fallback keyword search for when embeddings are unavailable.
 * Same logic as the original mem0Service.searchMemories.
 */
async function fallbackKeywordSearch(userId, query, limit = 10) {
  try {
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (keywords.length === 0) return [];

    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, memory_type, importance_score, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data
      .map(mem => {
        const content = (mem.content || '').toLowerCase();
        const keywordScore = keywords.reduce((acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0);
        return { ...mem, score: keywordScore / keywords.length };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.error('[MemoryStream] Fallback search failed:', error.message);
    return [];
  }
}

/**
 * Get the sum of importance scores for recent memories.
 * Used to determine when to trigger reflections.
 */
async function getRecentImportanceSum(userId, hoursAgo = 2) {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_recent_importance_sum', {
      p_user_id: userId,
      p_hours_ago: hoursAgo,
    });

    if (error) {
      console.warn('[MemoryStream] Could not get importance sum:', error.message);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.warn('[MemoryStream] getRecentImportanceSum error:', error.message);
    return 0;
  }
}

/**
 * Get recent memories for reflection generation.
 * Returns the N most recent memories ordered by creation time.
 */
async function getRecentMemories(userId, limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, memory_type, importance_score, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[MemoryStream] getRecentMemories failed:', error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[MemoryStream] getRecentMemories error:', error.message);
    return [];
  }
}

export {
  addMemory,
  addConversationMemory,
  addPlatformObservation,
  addReflection,
  retrieveMemories,
  getRecentImportanceSum,
  getRecentMemories,
  rateImportance,
};
