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
import { traverseLinksForRetrieval, getCoCitationBoosts } from './memoryLinksService.js';
import { getFeatureFlags } from './featureFlagsService.js';
import { bm25ScoreBatch, extractKeywords } from './bm25Service.js';

import { createLogger } from './logger.js';

const log = createLogger('MemoryStream');

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
    log.warn('Importance rating failed, defaulting to 5', { error });
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
const VALID_MEMORY_TYPES = new Set(['conversation', 'fact', 'platform_data', 'observation', 'reflection', 'procedure']);

// Ebbinghaus-inspired decay stability (in days) per memory type.
// Higher = decays slower. Used by the weekly forgetting cron.
const DECAY_RATE_BY_TYPE = { conversation: 14, platform_data: 7, fact: 30, reflection: 90 };

// GUM: Default confidence priors by memory type.
// Platform data is high-confidence (directly observed), conversations are lower
// (user may be speculative), facts and reflections inherit from options or default.
const CONFIDENCE_BY_TYPE = { platform_data: 0.90, observation: 0.90, conversation: 0.75, fact: 0.70, reflection: 0.70 };

// S5.1: Proposition revision — memory types where we prefer UPDATE over INSERT when
// a very similar memory already exists (threshold higher than dedup to be conservative).
const REVISION_TYPES = new Set(['reflection', 'fact']);
const REVISION_SIMILARITY_THRESHOLD = 0.90;

// ====================================================================
// Dynamic Alpha Blending (CL1-inspired)
// ====================================================================

/**
 * Compute alpha weight for a memory based on confidence, importance, and citation frequency.
 * Alpha determines how prominently a memory appears in the twin's context:
 * - alpha >= 0.4: full text (up to 250 chars)
 * - 0.2 <= alpha < 0.4: truncated with "(less certain)" note
 * - alpha < 0.2: omitted entirely
 *
 * Formula: confidence * (importance/10) * min(1, 0.5 + 0.1 * retrieval_count)
 *
 * @param {Object} memory - Memory object with confidence, importance_score, retrieval_count
 * @returns {number} Alpha value 0.0-1.0
 */
export function computeAlpha(memory) {
  const confidence = memory.confidence ?? 0.7;
  const importance = (memory.importance_score ?? 5) / 10;
  // P5: Citation boost raised from 0.7→0.85 baseline so first-retrieval memories
  // aren't unfairly penalized (importance=7, conf=0.7, count=0 → alpha 0.416 vs old 0.343)
  const citationBoost = Math.min(1.0, 0.85 + 0.05 * (memory.retrieval_count ?? 0));
  return confidence * importance * citationBoost;
}

/**
 * S5.1: Check if a very similar memory already exists for the same type.
 * If so, update its confidence + last_accessed_at instead of inserting a duplicate.
 * Returns the existing memory's {id} if revised, or null if no revision happened.
 */
async function maybeReviseExistingMemory(userId, content, memoryType, embedding, options) {
  if (!REVISION_TYPES.has(memoryType) || !embedding) return null;

  try {
    const { data: recent } = await supabaseAdmin
      .from('user_memories')
      .select('id, embedding, confidence, importance_score, revision_count')
      .eq('user_id', userId)
      .eq('memory_type', memoryType)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!recent || recent.length === 0) return null;

    for (const row of recent) {
      const existingVec = parseVec(row.embedding);
      if (!existingVec) continue;

      const sim = cosineSim(embedding, existingVec);
      if (sim < REVISION_SIMILARITY_THRESHOLD) continue;

      // Found a very similar existing memory — update it instead of inserting
      const updates = {
        last_accessed_at: new Date().toISOString(),
        // Boost confidence slightly (clamp to 1.0)
        confidence: Math.min(1.0, (row.confidence ?? 0.7) + 0.05),
        // Track revision frequency
        revision_count: (row.revision_count ?? 0) + 1,
      };
      if (options.reasoning) {
        updates.reasoning = options.reasoning.substring(0, 1000);
      }

      const { error } = await supabaseAdmin
        .from('user_memories')
        .update(updates)
        .eq('id', row.id);

      if (!error) {
        log.info('S5.1 Revised existing memory', { memoryType, cosine: sim.toFixed(3), id: row.id });
        return { id: row.id, importance_score: row.importance_score };
      }
    }

    return null;
  } catch (err) {
    log.warn('Proposition revision check failed (non-fatal)', { error: err });
    return null;
  }
}

// GUM Task 1: Bayesian contradiction detection
// Finds memories in the 0.75-0.90 cosine band (below the hard revision threshold),
// asks Mistral Small to classify each as CONFIRMS / CONTRADICTS / UNRELATED,
// then adjusts confidence accordingly. Fire-and-forget — does not block INSERT.
const GUM_LOWER_BAND = 0.75;
const GUM_UPPER_BAND = 0.90; // exclusive (>= 0.90 is handled by maybeReviseExistingMemory)
const GUM_CONFIRM_DELTA = 0.10;
const GUM_CONTRADICT_DELTA = -0.15;
const GUM_MAX_LLM_CALLS = 3; // cap LLM calls per write to control cost

const GUM_CLASSIFY_PROMPT = `You are a fact-checker comparing two statements about the same person.

Statement A (existing belief): "{existing}"
Statement B (new observation): "{new}"

Does Statement B CONFIRM, CONTRADICT, or is it UNRELATED to Statement A?
Reply with exactly one word: CONFIRMS, CONTRADICTS, or UNRELATED.`;

async function applyGumBayesianRevision(userId, newContent, newEmbedding, memoryType) {
  if (!newEmbedding) return;
  // Only run on types where contradictions are meaningful
  if (!REVISION_TYPES.has(memoryType)) return;

  try {
    const { data: candidates } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, embedding, confidence')
      .eq('user_id', userId)
      .eq('memory_type', memoryType)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!candidates || candidates.length === 0) return;

    let llmCalls = 0;
    const updates = [];

    for (const row of candidates) {
      if (llmCalls >= GUM_MAX_LLM_CALLS) break;

      const existingVec = parseVec(row.embedding);
      if (!existingVec) continue;

      const sim = cosineSim(newEmbedding, existingVec);
      if (sim < GUM_LOWER_BAND || sim >= GUM_UPPER_BAND) continue;

      // In band — classify with LLM
      llmCalls++;
      try {
        const result = await complete({
          tier: TIER_EXTRACTION,
          messages: [{
            role: 'user',
            content: GUM_CLASSIFY_PROMPT
              .replace('{existing}', row.content.substring(0, 200))
              .replace('{new}', newContent.substring(0, 200)),
          }],
          maxTokens: 10,
          temperature: 0.0,
          serviceName: 'gum-bayesian-classify',
        });

        const verdict = (result.content || '').trim().toUpperCase();
        let delta = 0;
        if (verdict.startsWith('CONFIRMS')) delta = GUM_CONFIRM_DELTA;
        else if (verdict.startsWith('CONTRADICTS')) delta = GUM_CONTRADICT_DELTA;
        else continue; // UNRELATED — no update

        const currentConf = row.confidence ?? 0.7;
        const newConf = Math.min(0.95, Math.max(0.10, currentConf + delta));
        updates.push({ id: row.id, confidence: newConf, verdict });
      } catch {
        // Non-fatal — skip this candidate
      }
    }

    // Apply updates (non-blocking batch)
    for (const u of updates) {
      // Update confidence + bump revision_count via raw SQL (JS client can't do col + 1)
      supabaseAdmin.rpc('update_memory_confidence', {
        p_memory_id: u.id,
        p_new_confidence: u.confidence,
      })
        .then(() => log.info('GUM confidence updated', { verdict: u.verdict, confidence: u.confidence.toFixed(2), id: u.id }))
        .catch(() => {});

      // GUM Step 4: Contradiction cascade — when a memory is contradicted,
      // reduce confidence of downstream reflections that cite it via grounding_ids
      if (u.verdict === 'CONTRADICTS') {
        cascadeContradiction(u.id).catch(() => {});
      }
    }
  } catch (err) {
    // Fully non-fatal
    log.warn('Bayesian revision check failed (non-fatal)', { error: err });
  }
}

/**
 * GUM Step 4: Contradiction cascade.
 * When a source memory is contradicted, reflections that cite it (via grounding_ids)
 * should lose some confidence too — belief propagation from GUM Paper 3.
 */
async function cascadeContradiction(contradictedId) {
  try {
    const { data: downstream } = await supabaseAdmin
      .from('user_memories')
      .select('id, confidence')
      .eq('memory_type', 'reflection')
      .contains('grounding_ids', [contradictedId]);

    if (!downstream || downstream.length === 0) return;

    for (const row of downstream) {
      const newConf = Math.max(0.30, (row.confidence ?? 0.7) - 0.05);
      supabaseAdmin.from('user_memories')
        .update({ confidence: newConf })
        .eq('id', row.id)
        .then(() => log.info('Cascade: reflection confidence updated', { id: row.id, confidence: newConf.toFixed(2) }))
        .catch(() => {});
    }
    log.info('Contradiction cascade complete', { affectedReflections: downstream.length });
  } catch (err) {
    log.warn('Contradiction cascade failed (non-fatal)', { error: err });
  }
}

async function addMemory(userId, content, memoryType = 'observation', metadata = {}, options = {}) {
  if (!content || !userId) return null;
  if (!VALID_MEMORY_TYPES.has(memoryType)) {
    log.error('Invalid memory type', { memoryType, allowed: [...VALID_MEMORY_TYPES] });
    return null;
  }

  try {
    // M2: Exact-content dedup — skip insert if identical content exists for this user within 24h
    if (!options.skipDedup) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from('user_memories')
        .select('id')
        .eq('user_id', userId)
        .eq('content', content.substring(0, 2000))
        .gte('created_at', twentyFourHoursAgo)
        .limit(1);
      if (existing && existing.length > 0) {
        log.info('Skipped duplicate memory', { memoryType, userId, existingId: existing[0].id });
        return existing[0];
      }
    }

    // Generate embedding and importance score in parallel
    let [embedding, importanceScore] = await Promise.all([
      options.skipEmbedding ? null : generateEmbedding(content),
      options.skipImportance ? (options.importanceScore || 5) : rateImportance(content),
    ]);

    // Floor: platform_data gets importance 6 (ensures surfacing alongside reflections 7-9)
    // Conversations keep floor 4 (protects from early archival)
    if (memoryType === 'platform_data' && importanceScore < 6) {
      importanceScore = 6;
    } else if (memoryType === 'conversation' && importanceScore < 4) {
      importanceScore = 4;
    }

    // S5.1: Proposition revision — for reflection/fact types, prefer UPDATE over INSERT
    // when a very similar memory (cosine > 0.90) already exists
    if (!options.skipRevision && embedding) {
      const revised = await maybeReviseExistingMemory(userId, content, memoryType, embedding, options);
      if (revised) return revised; // Return existing memory ID — no new insert
    }

    // GUM Task 1: Bayesian contradiction detection — fire-and-forget, does not block INSERT
    // Updates confidence of related memories in the 0.75–0.90 cosine band
    if (embedding && !options.skipRevision) {
      applyGumBayesianRevision(userId, content, embedding, memoryType).catch(() => {});
    }

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
      decay_rate: DECAY_RATE_BY_TYPE[memoryType] ?? 7,
    };

    // GUM: Set confidence from explicit option or per-type prior
    record.confidence = options.confidence !== undefined
      ? options.confidence
      : (CONFIDENCE_BY_TYPE[memoryType] ?? 0.70);
    if (options.reasoning) record.reasoning = options.reasoning.substring(0, 1000);
    if (options.grounding_ids && Array.isArray(options.grounding_ids)) {
      record.grounding_ids = options.grounding_ids;
    }

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
      log.error('Failed to store memory', { error });
      return null;
    }

    log.info('Stored memory', { memoryType, importance: importanceScore, hasEmbedding: !!embedding, userId });
    return data;
  } catch (error) {
    log.error('addMemory error', { error });
    return null;
  }
}

/**
 * S5.2: Post-reflection source decay.
 * After the reflection engine abstracts source memories into higher-level reflections,
 * decay the importance of those source memories by 40% so they stop competing with
 * the reflections they produced.
 *
 * Floor: importance score never drops below 1.
 * Protected: memories with importance ≥ 8 or retrieval_count ≥ 3 are skipped.
 *
 * @param {string} userId
 * @param {string[]} evidenceIds - IDs of source memories to decay
 * @returns {Promise<number>} Number of memories decayed
 */
async function decaySourceMemories(userId, evidenceIds) {
  if (!evidenceIds || evidenceIds.length === 0) return 0;

  try {
    // Single RPC call: SQL filters eligible rows + decays in one query (no N+1)
    const { data: decayed, error } = await supabaseAdmin.rpc('bulk_decay_memories', {
      p_user_id: userId,
      p_memory_ids: evidenceIds,
      p_decay_factor: 0.8,
    });

    if (error) throw error;
    const count = decayed?.length ?? 0;
    log.info('S5.2 Decayed source memories', { count, userId });
    return count;
  } catch (err) {
    log.warn('Source decay failed (non-fatal)', { error: err });
    return 0;
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
  // Time-of-day context tagging (S2.3: cognitive science — emotional weight of late-night messages)
  const hour = new Date().getHours();
  const isLateNight = hour >= 22 || hour < 4;
  const timeContext = isLateNight ? 'late_night' : hour < 8 ? 'early_morning' : null;
  const taggedMeta = timeContext ? { ...metadata, context: timeContext } : metadata;

  const [userMemory, twinMemory] = await Promise.all([
    addMemory(userId, userMessage.substring(0, 500), 'conversation', {
      role: 'user',
      source: 'twin_chat',
      ...taggedMeta,
    }),
    addMemory(userId, assistantResponse.substring(0, 500), 'conversation', {
      role: 'assistant',
      source: 'twin_chat',
      ...taggedMeta,
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
async function addReflection(userId, content, evidenceIds = [], metadata = {}, options = {}) {
  return addMemory(userId, content, 'reflection', {
    source: 'reflection_engine',
    evidence_memory_ids: evidenceIds,
    ...metadata,
  }, {
    importanceScore: Math.min(9, Math.max(7, Math.round(content.length / 50))),
    skipImportance: true,
    ...(options.reasoning ? { reasoning: options.reasoning } : {}),
    ...(options.grounding_ids ? { grounding_ids: options.grounding_ids } : {}),
    ...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
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
// Retrieval weights, MMR params, and memory budgets are imported from twin-config.js
// so the research agent can tune them without touching this file.
import { RETRIEVAL_WEIGHTS, MMR_LAMBDA, TYPE_DIVERSITY_WEIGHT, SEMANTIC_DIVERSITY_WEIGHT, TEMPORAL_DIVERSITY_WEIGHT, MEMORY_CONTEXT_BUDGETS, HYDE_ENABLED, BM25_BLEND_WEIGHT, BM25_K1, BM25_B, TCM_WEIGHT, TCM_DRIFT_RATE, STDP_CORETRIEVAL_BOOST, MIN_COSINE_SIMILARITY, LLM_RERANKER_ENABLED } from '../../twin-research/twin-config.js';

// ====================================================================
// MMR Reranking (Maximum Marginal Relevance)
// ====================================================================

/**
 * Parse a stringified vector "[0.1,0.2,...]" → Float32Array.
 * Returns null if parsing fails.
 */
function parseVec(embeddingStr) {
  if (!embeddingStr || typeof embeddingStr !== 'string') return null;
  try {
    return embeddingStr.slice(1, -1).split(',').map(Number);
  } catch {
    return null;
  }
}

/**
 * Dot-product cosine similarity between two equal-length float arrays.
 */
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

/**
 * Maximum Marginal Relevance reranking.
 * Iteratively selects candidates that maximize:
 *   MMR(d) = λ * relevance(d) - (1-λ) * max_sim(d, selected)
 *
 * This promotes diversity — avoids returning 5 nearly-identical jazz memories
 * when there are more varied memories that are also relevant.
 *
 * @param {Array} candidates - Memories from RPC (must have .score and .embedding)
 * @param {number} finalLimit - How many to return
 * @param {number} lambda - Trade-off (0=pure diversity, 1=pure relevance)
 * @returns {Array} Reranked memories (embedding stripped from output)
 */
function mmrRerank(candidates, finalLimit, lambda = MMR_LAMBDA) {
  if (candidates.length <= finalLimit) return candidates.map(stripEmbedding);

  const selected = [];
  const remaining = candidates.map((c, i) => ({ ...c, _idx: i }));

  while (selected.length < finalLimit && remaining.length > 0) {
    let bestScore = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const relevance = cand.score || 0;

      // Max cosine similarity to any already-selected memory
      let maxSim = 0;
      if (selected.length > 0) {
        const candVec = parseVec(cand.embedding);
        if (candVec) {
          for (const sel of selected) {
            const selVec = parseVec(sel.embedding);
            if (selVec) {
              const sim = cosineSim(candVec, selVec);
              if (sim > maxSim) maxSim = sim;
            }
          }
        }
      }

      // Type diversity penalty: penalize candidates whose type is already over-represented
      let typePenalty = 0;
      if (selected.length > 0 && cand.memory_type && TYPE_DIVERSITY_WEIGHT > 0) {
        const sameTypeCount = selected.filter(s => s.memory_type === cand.memory_type).length;
        typePenalty = TYPE_DIVERSITY_WEIGHT * (sameTypeCount / selected.length);
      }

      // Temporal diversity bonus: boost memories from underrepresented time buckets
      let temporalBonus = 0;
      if (selected.length > 0 && TEMPORAL_DIVERSITY_WEIGHT > 0 && cand.created_at) {
        const now = Date.now();
        const candAge = now - new Date(cand.created_at).getTime();
        const WEEK = 7 * 24 * 3600_000;
        const MONTH = 30 * 24 * 3600_000;
        const candBucket = candAge < WEEK ? 'recent' : candAge < MONTH ? 'medium' : 'archive';
        const bucketCounts = { recent: 0, medium: 0, archive: 0 };
        for (const s of selected) {
          const sAge = now - new Date(s.created_at).getTime();
          const sBucket = sAge < WEEK ? 'recent' : sAge < MONTH ? 'medium' : 'archive';
          bucketCounts[sBucket]++;
        }
        const bucketShare = bucketCounts[candBucket] / selected.length;
        temporalBonus = TEMPORAL_DIVERSITY_WEIGHT * Math.max(0, 0.5 - bucketShare);
      }

      // Semantic diversity penalty: penalize high cosine similarity within same type
      let semanticPenalty = 0;
      if (selected.length > 0 && SEMANTIC_DIVERSITY_WEIGHT > 0 && cand.memory_type) {
        const sameTypeSelected = selected.filter(s => s.memory_type === cand.memory_type);
        if (sameTypeSelected.length > 0) {
          const candVecSem = parseVec(cand.embedding);
          if (candVecSem) {
            let simSum = 0;
            let simCount = 0;
            for (const s of sameTypeSelected) {
              const sVec = parseVec(s.embedding);
              if (sVec) { simSum += cosineSim(candVecSem, sVec); simCount++; }
            }
            if (simCount > 0) semanticPenalty = SEMANTIC_DIVERSITY_WEIGHT * (simSum / simCount);
          }
        }
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim - typePenalty - semanticPenalty + temporalBonus;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected.map(stripEmbedding);
}

/** Remove embedding from memory object before returning to callers. */
function stripEmbedding({ embedding: _emb, _idx, ...rest }) { return rest; }

// ====================================================================
// HyDE (Hypothetical Document Embedding)
// ====================================================================

// Simple LRU cache for HyDE results (avoids duplicate LLM calls for same query)
const hydeCache = new Map();
const HYDE_CACHE_MAX = 100;

/**
 * Generate a hypothetical memory that would answer the query.
 * The embedding of this hypothetical memory is semantically closer
 * to real memories than a bare question embedding (HyDE technique).
 * Cost: ~$0.0001 per call (TIER_EXTRACTION).
 */
async function generateHypotheticalMemory(query) {
  // Check cache first
  if (hydeCache.has(query)) return hydeCache.get(query);

  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: `You are a memory stream for a person. Given this query, write a realistic 80-word memory/observation that would answer it. Write ONLY the memory text, nothing else.\n\nQuery: "${query}"\n\nMemory:`,
      }],
      max_tokens: 150,
      temperature: 0.3,
      serviceName: 'memoryStream-hyde',
    });

    const hydeText = result?.content?.trim();
    if (!hydeText) return null;

    // Cache with eviction
    if (hydeCache.size >= HYDE_CACHE_MAX) {
      const firstKey = hydeCache.keys().next().value;
      hydeCache.delete(firstKey);
    }
    hydeCache.set(query, hydeText);

    return hydeText;
  } catch (err) {
    log.warn('HyDE generation failed (non-fatal)', { error: err.message });
    return null;
  }
}

// ====================================================================
// Read Path
// ====================================================================

/**
 * Retrieve memories using three-factor scoring with min-max normalization
 * and context-dependent weights, followed by MMR diversity reranking.
 *
 *   score = w_recency * norm(recency) + w_importance * norm(importance) + w_relevance * norm(relevance)
 *
 * The RPC now uses type-differentiated Ebbinghaus decay:
 *   recency = EXP(-0.1053 * hours / stability_hours)
 * where stability_hours: conversation=72, platform_data=168, fact=720, reflection=2160.
 *
 * After scoring, MMR reranking promotes diversity by penalizing candidates
 * that are too similar to already-selected memories (λ=0.5 by default).
 *
 * @param {string} userId - User UUID
 * @param {string} query - Natural language query for semantic search
 * @param {number} limit - Max results to return (default 10)
 * @param {object|string} weights - Weight preset name or object { recency, importance, relevance }
 * @returns {Array} Scored, ranked, and diversity-reranked memories
 */
async function retrieveMemories(userId, query, limit = 10, weights = 'default', options = {}) {
  if (!userId || !query) return [];

  // Resolve weight preset
  const w = typeof weights === 'string'
    ? (RETRIEVAL_WEIGHTS[weights] || RETRIEVAL_WEIGHTS.default)
    : { ...RETRIEVAL_WEIGHTS.default, ...weights };

  if (typeof w.recency !== 'number' || typeof w.importance !== 'number' || typeof w.relevance !== 'number') {
    log.warn('Invalid weight types, falling back to defaults');
    Object.assign(w, RETRIEVAL_WEIGHTS.default);
  }

  try {
    // Generate query embedding + optional HyDE embedding in parallel
    // skipHyDE: callers doing bulk signal gathering pass this to avoid 1-3s LLM overhead per call
    const useHyDE = HYDE_ENABLED && !options.skipHyDE;
    const hydeText = useHyDE ? await generateHypotheticalMemory(query) : null;
    const embeddingPromises = [generateEmbedding(query)];
    if (hydeText) embeddingPromises.push(generateEmbedding(hydeText));
    const [queryEmbedding, hydeEmbedding] = await Promise.all(embeddingPromises);

    if (!queryEmbedding) {
      log.warn('Could not generate query embedding, falling back to keyword search');
      return fallbackKeywordSearch(userId, query, limit);
    }

    const rpcParams = {
      p_user_id: userId,
      p_limit: limit * 3,
      p_decay_factor: 0.995,
      p_weight_recency: w.recency,
      p_weight_importance: w.importance,
      p_weight_relevance: w.relevance,
    };

    // Run vector search with query embedding (+ HyDE embedding if available)
    const searchPromises = [
      supabaseAdmin.rpc('search_memory_stream', {
        ...rpcParams,
        p_query_embedding: vectorToString(queryEmbedding),
      }),
    ];
    if (hydeEmbedding) {
      searchPromises.push(
        supabaseAdmin.rpc('search_memory_stream', {
          ...rpcParams,
          p_query_embedding: vectorToString(hydeEmbedding),
        }),
      );
    }
    const searchResults = await Promise.all(searchPromises);

    // Check for errors
    if (searchResults[0].error) {
      log.error('Vector search failed', { error: searchResults[0].error });
      return fallbackKeywordSearch(userId, query, limit);
    }

    // Merge results: interleave query + HyDE results, dedup by ID
    let data;
    if (searchResults.length > 1 && searchResults[1].data?.length > 0) {
      const seen = new Set();
      const merged = [];
      const qData = searchResults[0].data || [];
      const hData = searchResults[1].data || [];
      const maxLen = Math.max(qData.length, hData.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < qData.length && !seen.has(qData[i].id)) {
          seen.add(qData[i].id);
          merged.push(qData[i]);
        }
        if (i < hData.length && !seen.has(hData[i].id)) {
          seen.add(hData[i].id);
          merged.push(hData[i]);
        }
      }
      data = merged.slice(0, limit * 3);
      log.info('HyDE merge', { queryResults: qData.length, hydeResults: hData.length, merged: data.length });
    } else {
      data = searchResults[0].data;
    }

    if (!data || data.length === 0) return [];

    // GUM: confidence weighting is now baked into SQL scoring (search_memory_stream RPC
    // multiplies by COALESCE(confidence, 0.7) before ORDER BY). No post-RPC adjustment needed.

    // --- Post-retrieval cosine similarity filter ---
    // Drop candidates with raw cosine similarity below threshold to reduce noise.
    if (MIN_COSINE_SIMILARITY > 0 && queryEmbedding && data.length > 0) {
      const qVec = typeof queryEmbedding === 'string' ? parseVec(queryEmbedding) : queryEmbedding;
      if (qVec) {
        const before = data.length;
        data = data.filter(m => {
          if (!m.embedding) return true; // keep memories without embeddings (graph-injected etc)
          const mVec = typeof m.embedding === 'string' ? parseVec(m.embedding) : m.embedding;
          if (!mVec) return true;
          const sim = cosineSim(qVec, mVec);
          return sim >= MIN_COSINE_SIMILARITY;
        });
        if (data.length < before) {
          log.info('Cosine filter', { before, after: data.length, threshold: MIN_COSINE_SIMILARITY });
        }
      }
    }

    // --- BM25 lexical rescoring (TiMem, arXiv 2601.02845) ---
    // Catches exact named entities, dates, and precise phrases that cosine similarity misses.
    if (BM25_BLEND_WEIGHT > 0 && data.length > 0) {
      const keywords = extractKeywords(query);
      if (keywords.length > 0) {
        const documents = data.map(m => m.content || '');
        const lexicalScores = bm25ScoreBatch(query, documents, { k1: BM25_K1, b: BM25_B });
        const maxLex = Math.max(...lexicalScores);
        const minLex = Math.min(...lexicalScores);
        const range = maxLex - minLex || 1;
        for (let i = 0; i < data.length; i++) {
          const normLex = (lexicalScores[i] - minLex) / range;
          data[i].score = (1 - BM25_BLEND_WEIGHT) * data[i].score + BM25_BLEND_WEIGHT * normLex;
        }
        data.sort((a, b) => b.score - a.score);
      }
    }

    // --- TCM contextual scoring (TRIBE v2-inspired) ---
    // Memories similar to the running context vector get a relevance boost.
    if (TCM_WEIGHT > 0 && options.contextVector && data.length > 0) {
      for (const mem of data) {
        if (mem.embedding) {
          const memVec = typeof mem.embedding === 'string'
            ? JSON.parse(mem.embedding) : mem.embedding;
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < Math.min(memVec.length, options.contextVector.length); i++) {
            dot += memVec[i] * options.contextVector[i];
            normA += memVec[i] * memVec[i];
            normB += options.contextVector[i] * options.contextVector[i];
          }
          const denom = Math.sqrt(normA) * Math.sqrt(normB);
          const contextSim = denom > 0 ? dot / denom : 0;
          mem.score += TCM_WEIGHT * contextSim;
        }
      }
      data.sort((a, b) => b.score - a.score);
    }

    // --- STDP co-retrieval importance boost ---
    // Memories frequently co-cited together get an importance bonus.
    if (STDP_CORETRIEVAL_BOOST > 0 && data.length >= 2) {
      try {
        const candidateIds = data.slice(0, Math.min(data.length, 30)).map(m => m.id);
        const boosts = await getCoCitationBoosts(userId, candidateIds);
        for (const mem of data) {
          const boost = boosts.get(mem.id) || 0;
          if (boost > 0) mem.score += boost;
        }
        data.sort((a, b) => b.score - a.score);
      } catch (e) {
        log.warn('STDP co-retrieval boost failed (non-fatal)', { error: e.message });
      }
    }

    // Apply MMR reranking for diversity (strips embedding from output)
    const reranked = mmrRerank(data, limit);

    // --- LLM reranker pass (optional, feature-flagged) ---
    if (LLM_RERANKER_ENABLED && reranked.length > limit) {
      try {
        const { rerankerPass } = await import('./memoryReranker.js');
        const llmReranked = await rerankerPass(query, reranked, limit);
        reranked.length = 0;
        reranked.push(...llmReranked);
      } catch (e) {
        log.warn('LLM reranker failed (non-fatal)', { error: e.message });
      }
    }

    // Graph traversal: augment vector results with strength-weighted linked memories
    // Default ON — validated by twin-research experiments (2026-03-10)
    let graphCount = 0;
    try {
      const flags = await getFeatureFlags(userId);
      if (flags?.graphRetrieval !== false) {
        const seedIds = reranked.slice(0, 5).map(m => m.id);
        const existingIdSet = new Set(reranked.map(m => m.id));
        const linked = await traverseLinksForRetrieval(userId, seedIds, existingIdSet, 5);
        if (linked.length > 0) {
          const topScore = reranked[0]?.score ?? 1.0;
          for (const { memory, linkStrength } of linked) {
            // Score proportional to link strength, capped below top vector result
            memory.score = Math.min(
              topScore * 0.8,
              (memory.importance_score ?? 5) / 10 * linkStrength
            );
            memory.source = 'graph_traversal';
            reranked.push(memory);
          }
          reranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          reranked.splice(limit); // trim back to requested limit
          graphCount = linked.length;
        }
      }
    } catch (graphErr) {
      log.warn('Graph traversal failed (non-fatal)', { error: graphErr });
    }

    // Platform activity weighting: boost memories from high-activity platforms
    // Uses activity_score (0-100) from platform_connections, computed every 30 min
    try {
      const { data: activityData } = await supabaseAdmin
        .from('platform_connections')
        .select('platform, activity_score')
        .eq('user_id', userId);
      if (activityData?.length > 0) {
        const scoreMap = Object.fromEntries(activityData.map(a => [a.platform, a.activity_score || 0]));
        for (const mem of reranked) {
          const platform = mem.metadata?.source || mem.metadata?.platform;
          if (platform && scoreMap[platform] !== undefined) {
            // weighted = score * (0.5 + 0.5 * activity/100)
            // Floor of 0.5 prevents zeroing out inactive platform memories
            mem.score = (mem.score ?? 0) * (0.5 + 0.5 * scoreMap[platform] / 100);
          }
        }
        reranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }
    } catch (e) {
      log.warn('Platform activity weighting failed (non-fatal)', { error: e.message });
    }

    // Touch accessed memories (update last_accessed_at) - non-blocking
    const memoryIds = reranked.map(m => m.id);
    supabaseAdmin.rpc('touch_memories', { p_memory_ids: memoryIds })
      .then(() => {})
      .catch(err => log.warn('Failed to touch memories', { error: err }));

    // Build updated TCM context vector for callers that chain retrievals
    if (TCM_WEIGHT > 0 && reranked.length > 0) {
      const retrievedVecs = data.slice(0, limit)
        .filter(m => m.embedding)
        .map(m => typeof m.embedding === 'string' ? JSON.parse(m.embedding) : m.embedding);
      if (retrievedVecs.length > 0) {
        const dim = retrievedVecs[0].length;
        const avgVec = new Array(dim).fill(0);
        for (const v of retrievedVecs) {
          for (let i = 0; i < dim; i++) avgVec[i] += v[i];
        }
        for (let i = 0; i < dim; i++) avgVec[i] /= retrievedVecs.length;

        if (options.contextVector) {
          const updated = new Array(dim);
          for (let i = 0; i < dim; i++) {
            updated[i] = TCM_DRIFT_RATE * options.contextVector[i] + (1 - TCM_DRIFT_RATE) * avgVec[i];
          }
          reranked._tcmContextVector = updated;
        } else {
          reranked._tcmContextVector = avgVec;
        }
      }
    }

    const weightLabel = typeof weights === 'string' ? weights : 'custom';
    log.info('Retrieved memories', { count: reranked.length, weights: weightLabel, candidates: data.length, graphLinked: graphCount, topScore: reranked[0]?.score?.toFixed(3) });
    return reranked;
  } catch (error) {
    log.error('retrieveMemories error', { error });
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
    log.error('Fallback search failed', { error });
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
      log.warn('Could not get importance sum', { error });
      return 0;
    }

    return data || 0;
  } catch (error) {
    log.warn('getRecentImportanceSum error', { error });
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
 * @param {string} [reflectionWeights='identity'] - Weight preset for reflection retrieval (e.g., 'identity', 'default', 'recent')
 * @returns {Array} Combined memories: up to 30 total with guaranteed type diversity
 */
// In-memory cache for diverse memory retrieval results (2-minute TTL)
// Prevents redundant pgvector searches during burst conversations
const _diverseMemoryCache = new Map();
const DIVERSE_CACHE_TTL_MS = 2 * 60 * 1000;

async function retrieveDiverseMemories(userId, query, budgets = {}, reflectionWeights = 'identity', options = {}) {
  // Check cache — key by userId + query hash (first 100 chars normalized)
  const queryKey = `${userId}_${query.slice(0, 100).toLowerCase().replace(/\s+/g, '_')}`;
  const cached = _diverseMemoryCache.get(queryKey);
  if (cached && (Date.now() - cached.ts) < DIVERSE_CACHE_TTL_MS) {
    log.debug('Diverse memory cache HIT', { userId, queryLen: query.length });
    return cached.data;
  }
  const {
    reflections: maxReflections = 15,
    facts: maxFacts = MEMORY_CONTEXT_BUDGETS.facts,
    platformData: maxPlatformData = MEMORY_CONTEXT_BUDGETS.platform_data ?? 4,
    conversations: maxConversations = MEMORY_CONTEXT_BUDGETS.conversations
  } = budgets;

  const SELECT_COLS = 'id, content, memory_type, importance_score, metadata, created_at, last_accessed_at';

  const [reflectionResults, factResults, platformResults, conversationResults] = await Promise.all([
    // Reflections: semantic search over-fetches, then we cap at maxReflections
    retrieveMemories(userId, query, maxReflections * 2, reflectionWeights, options).catch(err => {
      log.warn('Diverse reflections fetch failed', { error: err });
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
        if (error) log.warn('Diverse facts fetch failed', { error });
        return data || [];
      }),

    // Platform data: most recent activity observations (reduced from 7→4, live data already injected by fetchTwinContext)
    supabaseAdmin
      .from('user_memories')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .order('created_at', { ascending: false })
      .limit(maxPlatformData)
      .then(({ data, error }) => {
        if (error) log.warn('Diverse platform_data fetch failed', { error });
        return data || [];
      }),

    // P3: Conversation memories — hybrid semantic + direct retrieval
    // Semantic search was dominated by reflections, so we use a mixed approach:
    //   60% semantic (via retrieveMemories, post-filtered to conversations)
    //   40% direct by importance (most significant exchanges)
    maxConversations > 0
      ? (async () => {
          const semanticBudget = Math.ceil(maxConversations * 0.6);
          const directBudget = maxConversations - semanticBudget;

          const [semanticRes, directRes] = await Promise.all([
            // Semantic: over-fetch and filter to conversation type
            retrieveMemories(userId, query, semanticBudget * 4, 'default')
              .then(results => results.filter(m => m.memory_type === 'conversation').slice(0, semanticBudget))
              .catch(err => {
                log.warn('Semantic conversation fetch failed', { error: err });
                return [];
              }),
            // Direct: top by importance
            supabaseAdmin
              .from('user_memories')
              .select(SELECT_COLS)
              .eq('user_id', userId)
              .eq('memory_type', 'conversation')
              .order('importance_score', { ascending: false })
              .limit(directBudget)
              .then(({ data, error }) => {
                if (error) log.warn('Direct conversation fetch failed', { error });
                return data || [];
              }),
          ]);

          // Merge and dedup
          const seen = new Set();
          const merged = [];
          for (const m of [...semanticRes, ...directRes]) {
            if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
          }
          return merged.slice(0, maxConversations);
        })()
      : Promise.resolve([]),
  ]);

  // Cap reflections: take only the top N from the over-fetched semantic results
  const topReflections = reflectionResults
    .filter(m => m.memory_type === 'reflection')
    .slice(0, maxReflections);

  const combined = [...topReflections, ...factResults, ...platformResults, ...conversationResults];

  // Graph expansion: expand context using Zettelkasten memory_links (A-MEM, Xu et al., 2025)
  // Fetches 1-hop linked memories for the top retrieved reflections to enrich context
  const expanded = await _expandWithMemoryLinks(userId, combined, 5).catch(err => {
    log.warn('Graph expansion failed', { error: err });
    return combined;
  });

  log.info('Diverse retrieval complete', {
    reflections: topReflections.length,
    facts: factResults.length,
    platformData: platformResults.length,
    conversations: conversationResults.length,
    graphLinked: expanded.length - combined.length,
  });

  // Cache result for burst conversations (2-minute TTL)
  _diverseMemoryCache.set(queryKey, { data: expanded, ts: Date.now() });
  // Evict old entries (max 50 cached queries)
  if (_diverseMemoryCache.size > 50) {
    const oldest = [..._diverseMemoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) _diverseMemoryCache.delete(oldest[0]);
  }

  return expanded;
}

/**
 * Graph expansion helper: fetch 1-hop linked memories via memory_links.
 * Seeds from the top 3 retrieved memories; adds up to maxLinked new unique memories.
 * Non-blocking — caller wraps in .catch() to swallow failures.
 */
async function _expandWithMemoryLinks(userId, memories, maxLinked = 5) {
  if (!memories.length) return memories;

  // Use top 3 retrieved memories as seeds for link traversal
  const sourceIds = memories.slice(0, 3).map(m => m.id);
  const existingIds = new Set(memories.map(m => m.id));

  const { data: links, error } = await supabaseAdmin
    .from('memory_links')
    .select('target_memory_id, strength')
    .eq('user_id', userId)
    .in('source_memory_id', sourceIds)
    .order('strength', { ascending: false })
    .limit(30);

  if (error || !links?.length) return memories;

  // Deduplicate target IDs and exclude already-retrieved memories
  const newIds = [...new Set(links.map(l => l.target_memory_id))]
    .filter(id => !existingIds.has(id))
    .slice(0, maxLinked);

  if (!newIds.length) return memories;

  const { data: linkedMems, error: fetchErr } = await supabaseAdmin
    .from('user_memories')
    .select('id, content, memory_type, importance_score, metadata, created_at, last_accessed_at')
    .in('id', newIds);

  if (fetchErr || !linkedMems?.length) return memories;

  return [...memories, ...linkedMems];
}

/**
 * Get recent memories for reflection generation.
 * Returns the N most recent memories ordered by creation time.
 */
async function getRecentMemories(userId, limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, memory_type, importance_score, metadata, created_at, confidence')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('getRecentMemories failed', { error });
      return [];
    }

    return data || [];
  } catch (error) {
    log.error('getRecentMemories error', { error });
    return [];
  }
}

// ====================================================================
// Conversation Fact Extraction
// ====================================================================

const FACT_EXTRACTION_PROMPT = `Extract 0-3 factual statements about this person from their message. Return a JSON array of plain strings (not objects). Only include clear facts, not opinions or greetings. Return [] if no clear facts.

Categories to extract (when explicitly mentioned):
- Personal interests, hobbies, habits
- Professional identity: job title, company, projects, skills, career goals
- Goals and aspirations mentioned explicitly
- Relationships mentioned (family, friends, colleagues by role)
- Lifestyle facts (location, diet, routine, preferences)

Examples:
Input: "I love hiking every weekend"
Output: ["User enjoys hiking regularly on weekends"]

Input: "I'm a senior engineer at Stripe working on payments infrastructure"
Output: ["User is a senior engineer at Stripe", "User works on payments infrastructure"]

Input: "My sister just got married and I'm really close with my family"
Output: ["User has a sister who recently got married", "User is close with their family"]

Input: "hey how are you"
Output: []

Message: "{message}"

JSON array:`;

const FACT_DEDUP_COSINE_THRESHOLD = 0.92;

/**
 * Normalize a raw fact value from LLM output.
 * Handles plain strings and JSON-object formats like {"fact":"...","category":"..."}.
 */
function normalizeFact(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    // Try to parse if it looks like a JSON object string
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return (parsed.fact || parsed.content || parsed.statement || '').trim();
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof raw === 'object' && raw !== null) {
    return (raw.fact || raw.content || raw.statement || '').trim();
  }
  return '';
}

/**
 * Returns true if a semantically similar fact already exists for this user.
 * Primary: cosine similarity on stored embeddings (threshold 0.92).
 * Fallback: exact content match.
 */
async function isDuplicateFact(userId, factText) {
  try {
    // Exact match check first (fast, no LLM call)
    const { data: exact } = await supabaseAdmin
      .from('user_memories')
      .select('id')
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .eq('content', factText)
      .limit(1);
    if (exact && exact.length > 0) {
      log.info('Fact dedup: exact match found, skipping');
      return true;
    }

    // Semantic similarity check: compare against recent facts
    const { data: recentFacts } = await supabaseAdmin
      .from('user_memories')
      .select('content, embedding')
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200); // Widened from 50 → 200 to catch duplicates from months ago

    if (!recentFacts || recentFacts.length === 0) return false;

    const newVec = await generateEmbedding(factText);
    if (!newVec) return false;

    for (const row of recentFacts) {
      if (!row.embedding) continue;
      try {
        const existingVec = row.embedding.slice(1, -1).split(',').map(Number);
        if (existingVec.length !== newVec.length) continue;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < newVec.length; i++) {
          dot += newVec[i] * existingVec[i];
          normA += newVec[i] * newVec[i];
          normB += existingVec[i] * existingVec[i];
        }
        const sim = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
        if (sim > FACT_DEDUP_COSINE_THRESHOLD) {
          log.info('Fact dedup: cosine similarity exceeded threshold, skipping', { cosine: sim.toFixed(3), threshold: FACT_DEDUP_COSINE_THRESHOLD, fact: factText.substring(0, 60) });
          return true;
        }
      } catch {
        // skip malformed embeddings
      }
    }
    return false;
  } catch (error) {
    log.warn('isDuplicateFact error', { error });
    return false; // fail open — store it if dedup check fails
  }
}

/**
 * Extract factual statements from a user's chat message and store them as memories.
 * Uses TIER_EXTRACTION (Mistral Small) for cheap, fast extraction.
 * Skips messages shorter than 20 characters. Deduplicates against existing facts.
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
      const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      facts = JSON.parse(cleaned);
    } catch {
      log.warn('Could not parse fact extraction response', { response: text.substring(0, 100) });
      return [];
    }

    if (!Array.isArray(facts) || facts.length === 0) return [];

    // Store each fact as a memory (max 3), with deduplication + contamination blocklist
    // Block known false claims that re-appear from LLM hallucination or stale data
    const CONTAMINATION_BLOCKLIST = [
      'classic jazz', 'miles davis', 'prefers jazz', 'jazz music', 'jazz, particularly',
      'chet baker', 'john coltrane', 'thelonious monk',
    ];

    const stored = [];
    for (const raw of facts.slice(0, 3)) {
      const factText = normalizeFact(raw);
      if (!factText || factText.length < 10) continue;

      // Block contaminated claims
      const lower = factText.toLowerCase();
      if (CONTAMINATION_BLOCKLIST.some(term => lower.includes(term))) {
        log.warn('Blocked contaminated fact', { userId, fact: factText.slice(0, 80) });
        continue;
      }

      const isDupe = await isDuplicateFact(userId, factText);
      if (isDupe) continue;

      const mem = await addMemory(userId, factText, 'fact', { source: 'conversation_extraction' });
      if (mem) stored.push(mem);
    }

    if (stored.length > 0) {
      log.info('Extracted new facts from conversation', { count: stored.length, userId });
    }

    return stored;
  } catch (error) {
    log.error('extractConversationFacts error', { error });
    return [];
  }
}

// ====================================================================
// Communication Style Extraction
// ====================================================================

const COMMUNICATION_STYLE_PROMPT = `Analyze this message from the user. Extract 1-2 SHORT facts about their communication style IF the message is long enough to reveal patterns. Focus on:
- Formality (casual/formal/mixed)
- Characteristic phrases or expressions they use
- Sentence structure (fragments/complete/stream-of-consciousness)
- Tone (direct/indirect/humorous/analytical)
- Vocabulary complexity

Message: "{message}"

Return ONLY if you can extract something specific and non-generic. Format: ["fact1", "fact2"] or [] if nothing to extract.
Do NOT extract facts about the topic — only about HOW they communicate.`;

/**
 * Extract communication style facts from a user message and store as memories.
 * Only runs for messages >= 30 characters. Fire-and-forget — caller does not await.
 *
 * @param {string} userId - User UUID
 * @param {string} userMessage - The user's chat message
 * @returns {Promise<void>}
 */
async function extractCommunicationStyle(userId, userMessage) {
  if (!userId || !userMessage || userMessage.length < 30) return;

  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: COMMUNICATION_STYLE_PROMPT.replace('{message}', userMessage.substring(0, 500))
      }],
      maxTokens: 150,
      temperature: 0,
      serviceName: 'memoryStream-commStyle'
    });

    const text = (result.content || '').trim();

    let facts;
    try {
      const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      facts = JSON.parse(cleaned);
    } catch {
      return;
    }

    if (!Array.isArray(facts) || facts.length === 0) return;

    for (const raw of facts.slice(0, 2)) {
      const factText = normalizeFact(raw);
      if (!factText || factText.length < 10) continue;

      const isDupe = await isDuplicateFact(userId, factText);
      if (isDupe) continue;

      await addMemory(userId, factText, 'fact', {
        source: 'communication_style',
        extracted_from: 'conversation',
      }, {
        importanceScore: 4,
        skipImportance: true,
      });
    }

    log.info('Communication style extraction ran', { userId });
  } catch (error) {
    log.warn('extractCommunicationStyle error (non-fatal)', { error });
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

  // Redis cache (30min TTL) — memory counts change slowly (cron every 15-30min)
  const cacheKey = `memstats:${userId}`;
  try {
    const { get: cacheGet, set: cacheSet } = await import('./redisClient.js');
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const types = ['fact', 'reflection', 'platform_data', 'conversation', 'observation'];
    const countResults = await Promise.all(
      types.map(t =>
        supabaseAdmin
          .from('user_memories')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('memory_type', t)
      )
    );

    const byType = { fact: 0, reflection: 0, platform_data: 0, conversation: 0, observation: 0 };
    let total = 0;
    for (let i = 0; i < types.length; i++) {
      const { count, error } = countResults[i];
      if (!error && count != null) {
        byType[types[i]] = count;
        total += count;
      }
    }

    const result = { total, byType };
    cacheSet(cacheKey, result, 1800).catch(() => {}); // 30min TTL
    return result;
  } catch (error) {
    log.error('getMemoryStats error', { error });
    return defaultStats;
  }
}

/**
 * Compute Twin Readiness Score (0-100) — "Soul Saturation"
 * Measures how well the twin knows the user based on memory depth and diversity.
 * Target: 10,000 diverse, high-quality memories = 100%
 *
 * @param {string} userId - User UUID
 * @returns {{ score: number, label: string, breakdown: object, total: number, byType: object }}
 */
async function getTwinReadinessScore(userId) {
  try {
    const stats = await getMemoryStats(userId);
    const total = stats.total || 0;
    const byType = stats.byType || {};

    // Factor 1: Volume (40%) — 10,000 memories = full score
    const volumeScore = Math.min(1.0, total / 10000);

    // Factor 2: Type diversity (30%) — how many of 4 types are represented
    const types = ['fact', 'reflection', 'platform_data', 'conversation'];
    const presentTypes = types.filter(t => (byType[t] || 0) >= 10).length;
    const diversityScore = presentTypes / types.length;

    // Factor 3: Reflection depth (30%) — reflections show synthesis happened
    const reflectionCount = byType.reflection || 0;
    const reflectionScore = Math.min(1.0, reflectionCount / 3000);

    const score = Math.round(
      (volumeScore * 0.4 + diversityScore * 0.3 + reflectionScore * 0.3) * 100
    );

    const breakdown = {
      volume: Math.round(volumeScore * 100),
      diversity: Math.round(diversityScore * 100),
      reflection: Math.round(reflectionScore * 100),
    };

    const label = score < 15 ? 'Just getting started'
      : score < 30 ? 'Starting to know you'
      : score < 50 ? 'Getting interesting'
      : score < 70 ? 'Taking shape'
      : score < 85 ? 'Deeply familiar'
      : 'Soul captured';

    return { score, label, breakdown, total, byType };
  } catch (err) {
    log.warn('getTwinReadinessScore error', { error: err });
    return { score: 0, label: 'Just getting started', breakdown: {}, total: 0, byType: {} };
  }
}

/**
 * Archive old low-importance memories for a user.
 * Calls the archive_old_memories Supabase RPC which moves qualifying rows
 * to user_memories_archive. Only runs if user has >5,000 total memories.
 *
 * @param {string} userId - User UUID
 * @returns {number} Count of archived memories (0 if threshold not met)
 */
async function archiveOldMemories(userId) {
  if (!userId) return 0;

  try {
    const { data, error } = await supabaseAdmin.rpc('archive_old_memories', {
      p_user_id: userId,
    });

    if (error) {
      log.warn('archiveOldMemories RPC failed', { error });
      return 0;
    }

    const count = data || 0;
    if (count > 0) {
      log.info('Archived old memories', { count, userId });
    }
    return count;
  } catch (error) {
    log.error('archiveOldMemories error', { error });
    return 0;
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
  extractCommunicationStyle,
  getMemoryStats,
  getTwinReadinessScore,
  archiveOldMemories,
  decaySourceMemories,
  RETRIEVAL_WEIGHTS,
};
