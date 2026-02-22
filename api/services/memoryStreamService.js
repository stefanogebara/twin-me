/**
 * Memory Stream Service
 * =====================
 * Unified memory layer inspired by Generative Agents (Park et al., UIST 2023).
 *
 * Architecture:
 *   - All observations (conversations, platform data, facts) flow into a single
 *     memory stream in `user_memories` with vector embeddings.
 *   - Retrieval uses three-factor scoring with equal weights and min-max
 *     normalization (Park et al., Generative Agents, UIST 2023):
 *       score = norm(recency) + norm(importance) + norm(relevance)
 *     where norm() applies min-max normalization to [0,1] across all candidate memories.
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
    // Use regex to extract leading digit in case LLM adds explanatory text
    const match = text.match(/^(\d+)/);
    const score = match ? parseInt(match[1], 10) : NaN;
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
const VALID_MEMORY_TYPES = new Set(['conversation', 'fact', 'platform_data', 'observation', 'reflection']);

async function addMemory(userId, content, memoryType = 'observation', metadata = {}, options = {}) {
  if (!content || !userId) return null;
  if (!VALID_MEMORY_TYPES.has(memoryType)) {
    console.error(`[MemoryStream] Invalid memory type: "${memoryType}". Allowed: ${[...VALID_MEMORY_TYPES].join(', ')}`);
    return null;
  }

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
 * Store a conversation exchange as two separate per-utterance memories.
 *
 * Inspired by Generative Agents (Park et al.) where each utterance is stored
 * as its own observation so that individual statements get distinct importance
 * scores and can be retrieved independently for better semantic matching.
 *
 * @returns {{ userMemory, twinMemory }} - Both memory records (or null on failure)
 */
async function addConversationMemory(userId, userMessage, assistantResponse, metadata = {}) {
  const [userMemory, twinMemory] = await Promise.all([
    addMemory(userId, `User said: "${userMessage.substring(0, 500)}"`, 'conversation', {
      role: 'user',
      source: 'twin_chat',
      ...metadata,
    }),
    addMemory(userId, `Twin responded: "${assistantResponse.substring(0, 500)}"`, 'conversation', {
      role: 'assistant',
      source: 'twin_chat',
      ...metadata,
    }),
  ]);

  return { userMemory, twinMemory };
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
// Retrieval Weight Presets
// ====================================================================

/**
 * Context-dependent retrieval weights inspired by Paper 2 (Park et al., 2024).
 *
 * Paper 2 uses [recency=0, relevance=1, importance=0.5] — relevance dominant,
 * recency disabled — because interview data doesn't age meaningfully.
 *
 * For TwinMe, different query contexts benefit from different weight balances:
 * - Identity queries (who is this person) → relevance dominant, recency low
 * - Recent activity queries (what just happened) → recency dominant
 * - Reflection queries (deeper patterns) → relevance + importance, recency off
 * - General conversation (default) → balanced weights
 */
const RETRIEVAL_WEIGHTS = {
  // Default: equal weights (original Generative Agents behavior)
  default: { recency: 1.0, importance: 1.0, relevance: 1.0 },

  // Identity: who is this person? Relevance dominant, recency low.
  // Used by: twin summary generation, personality queries
  identity: { recency: 0.2, importance: 0.8, relevance: 1.0 },

  // Recent: what's happening now? Recency dominant, relevance still matters.
  // Used by: proactive insights, "how are you?" type queries
  recent: { recency: 1.0, importance: 0.5, relevance: 0.7 },

  // Reflection: deep pattern analysis. Paper 2 style — no recency bias.
  // Used by: reflection engine expert personas
  reflection: { recency: 0.0, importance: 0.5, relevance: 1.0 },
};

// ====================================================================
// Read Path
// ====================================================================

/**
 * Retrieve memories using three-factor scoring with min-max normalization
 * and context-dependent weights:
 *   score = w_recency * norm(recency) + w_importance * norm(importance) + w_relevance * norm(relevance)
 *
 * Each factor is normalized to [0,1] via min-max across all candidate memories.
 * Weights can be customized per-call or via named presets.
 *
 * Uses the `search_memory_stream` RPC function in Supabase.
 *
 * @param {string} userId - User UUID
 * @param {string} query - Natural language query for semantic search
 * @param {number} limit - Max results to return (default 10)
 * @param {object|string} weights - Weight preset name ('identity'|'recent'|'reflection'|'default')
 *                                   or object { recency, importance, relevance }
 * @returns {Array} Scored and ranked memories
 */
async function retrieveMemories(userId, query, limit = 10, weights = 'default') {
  if (!userId || !query) return [];

  // Resolve weight preset
  const w = typeof weights === 'string'
    ? (RETRIEVAL_WEIGHTS[weights] || RETRIEVAL_WEIGHTS.default)
    : { ...RETRIEVAL_WEIGHTS.default, ...weights };

  // Validate weight values to prevent NaN/division-by-zero in scoring
  if (typeof w.recency !== 'number' || typeof w.importance !== 'number' || typeof w.relevance !== 'number') {
    console.warn('[MemoryStream] Invalid weight types, falling back to defaults');
    Object.assign(w, RETRIEVAL_WEIGHTS.default);
  }

  try {
    // Generate query embedding for semantic search
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      console.warn('[MemoryStream] Could not generate query embedding, falling back to keyword search');
      return fallbackKeywordSearch(userId, query, limit);
    }

    // Call the three-factor scoring RPC function with weights
    const { data, error } = await supabaseAdmin.rpc('search_memory_stream', {
      p_user_id: userId,
      p_query_embedding: vectorToString(queryEmbedding),
      p_limit: limit,
      p_decay_factor: 0.995,
      p_weight_recency: w.recency,
      p_weight_importance: w.importance,
      p_weight_relevance: w.relevance,
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

    const weightLabel = typeof weights === 'string' ? weights : 'custom';
    console.log(`[MemoryStream] Retrieved ${data.length} memories (weights=${weightLabel}, top score: ${data[0].score?.toFixed(3)})`);
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
 * Retrieve a diverse mix of memories by type to prevent reflection dominance.
 *
 * Problem: A single retrieveMemories(30) call returns ~27 reflections and
 * ~3 observations because reflections have high importance scores (7-9) AND
 * are frequently accessed (high recency). Facts and platform_data never surface.
 *
 * Solution: Run 3 parallel queries with per-type budgets:
 *   - Reflections (15): semantic search with 'identity' weights (relevance-dominant)
 *   - Facts (8): direct query by importance_score (most salient facts)
 *   - Platform data (7): direct query by recency (freshest activity observations)
 *
 * @param {string} userId
 * @param {string} query - Used for reflection semantic search
 * @param {object} [budgets] - Override default per-type limits
 * @returns {Array} Combined memories: up to 30 total with guaranteed type diversity
 */
async function retrieveDiverseMemories(userId, query, budgets = {}) {
  const { reflections: maxReflections = 15, facts: maxFacts = 8, platformData: maxPlatformData = 7 } = budgets;

  const SELECT_COLS = 'id, content, memory_type, importance_score, metadata, created_at, last_accessed_at';

  const [reflectionResults, factResults, platformResults] = await Promise.all([
    // Reflections: semantic search over-fetches, then we cap at maxReflections
    retrieveMemories(userId, query, maxReflections * 2, 'identity').catch(err => {
      console.warn('[MemoryStream] Diverse reflections fetch failed:', err.message);
      return [];
    }),

    // Facts: top by importance (most salient facts about the user)
    supabaseAdmin
      .from('user_memories')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .order('importance_score', { ascending: false })
      .limit(maxFacts)
      .then(({ data, error }) => {
        if (error) console.warn('[MemoryStream] Diverse facts fetch failed:', error.message);
        return data || [];
      }),

    // Platform data: most recent activity observations
    supabaseAdmin
      .from('user_memories')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .order('created_at', { ascending: false })
      .limit(maxPlatformData)
      .then(({ data, error }) => {
        if (error) console.warn('[MemoryStream] Diverse platform_data fetch failed:', error.message);
        return data || [];
      }),
  ]);

  // Cap reflections: take only the top N from the over-fetched semantic results
  const topReflections = reflectionResults
    .filter(m => m.memory_type === 'reflection')
    .slice(0, maxReflections);

  const combined = [...topReflections, ...factResults, ...platformResults];
  console.log(
    `[MemoryStream] Diverse retrieval: ${topReflections.length} reflections, ` +
    `${factResults.length} facts, ${platformResults.length} platform_data`
  );
  return combined;
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

// ====================================================================
// Conversation Fact Extraction
// ====================================================================

const FACT_EXTRACTION_PROMPT = `Extract 0-3 factual statements about this person from their message. Return a JSON array of strings. Only include clear facts, not opinions or greetings.

Message: "{message}"

JSON array:`;

/**
 * Extract factual statements from a user's chat message and store them as memories.
 * Uses TIER_EXTRACTION (Mistral Small) for cheap, fast extraction.
 * Skips messages shorter than 20 characters.
 *
 * @param {string} userId - User UUID
 * @param {string} userMessage - The user's chat message
 * @returns {Array} Array of stored fact memory records (or empty)
 */
async function extractConversationFacts(userId, userMessage) {
  if (!userId || !userMessage || userMessage.length < 20) return [];

  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: FACT_EXTRACTION_PROMPT.replace('{message}', userMessage.substring(0, 500))
      }],
      maxTokens: 200,
      temperature: 0,
      serviceName: 'memoryStream-factExtraction'
    });

    const text = (result.content || '').trim();

    // Parse the JSON array from the response
    let facts;
    try {
      // Handle cases where the LLM wraps in markdown code blocks
      const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      facts = JSON.parse(cleaned);
    } catch {
      console.warn('[MemoryStream] Could not parse fact extraction response:', text.substring(0, 100));
      return [];
    }

    if (!Array.isArray(facts) || facts.length === 0) return [];

    // Store each fact as a memory (max 3)
    const stored = [];
    for (const fact of facts.slice(0, 3)) {
      if (typeof fact === 'string' && fact.trim().length > 0) {
        const mem = await addMemory(userId, fact.trim(), 'fact', { source: 'conversation_extraction' });
        if (mem) stored.push(mem);
      }
    }

    if (stored.length > 0) {
      console.log(`[MemoryStream] Extracted ${stored.length} facts from conversation for user ${userId}`);
    }

    return stored;
  } catch (error) {
    console.error('[MemoryStream] extractConversationFacts error:', error.message);
    return [];
  }
}

// ====================================================================
// Memory Stats Helper
// ====================================================================

/**
 * Get memory statistics for a user, grouped by memory type.
 *
 * @param {string} userId - User UUID
 * @returns {{ total: number, byType: { fact, reflection, platform_data, conversation, observation } }}
 */
async function getMemoryStats(userId) {
  const defaultStats = { total: 0, byType: { fact: 0, reflection: 0, platform_data: 0, conversation: 0, observation: 0 } };
  if (!userId) return defaultStats;

  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('memory_type')
      .eq('user_id', userId)
      .limit(5000); // Cap to prevent OOM for power users — callers only need approximate counts

    if (error || !data) {
      console.warn('[MemoryStream] getMemoryStats query failed:', error?.message);
      return defaultStats;
    }

    const byType = { fact: 0, reflection: 0, platform_data: 0, conversation: 0, observation: 0 };
    for (const row of data) {
      const t = row.memory_type;
      if (t in byType) {
        byType[t]++;
      }
    }

    return { total: data.length, byType };
  } catch (error) {
    console.error('[MemoryStream] getMemoryStats error:', error.message);
    return defaultStats;
  }
}

export {
  addMemory,
  addConversationMemory,
  addPlatformObservation,
  addReflection,
  retrieveMemories,
  retrieveDiverseMemories,
  getRecentImportanceSum,
  getRecentMemories,
  rateImportance,
  extractConversationFacts,
  getMemoryStats,
  RETRIEVAL_WEIGHTS,
};
