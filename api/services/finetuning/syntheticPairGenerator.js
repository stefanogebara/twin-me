/**
 * Synthetic Preference Pair Generator
 * ====================================
 * DPO Phase 2: Generates synthetic chosen/rejected pairs from historical prompts.
 *
 * For each user prompt from twin_messages:
 *   1. Generate 4 oracle draft candidates at varying temperatures
 *   2. Embed all candidates
 *   3. Compare to personality embedding centroid
 *   4. Chosen = highest cosine similarity, Rejected = lowest
 *   5. Skip if similarity gap < 0.03 (near-ties)
 *   6. Insert into preference_pairs with source='synthetic'
 *
 * Uses TIER_EXTRACTION (Mistral Small) to keep costs low.
 */

import { complete, TIER_EXTRACTION } from '../../services/llmGateway.js';
import { generateEmbedding } from '../../services/embeddingService.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('SyntheticPairGen');

const MAX_BATCH_SIZE = 50;
const MIN_SIMILARITY_GAP = 0.03;
const TEMPERATURES = [0.5, 0.7, 0.9, 1.1];
const PROGRESS_LOG_INTERVAL = 10;

/**
 * Compute cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Build an oracle system prompt from OCEAN scores.
 * @param {{ openness: number, conscientiousness: number, extraversion: number, agreeableness: number, neuroticism: number }} ocean
 * @returns {string}
 */
function buildOracleSystemPrompt(ocean) {
  const o = ocean.openness?.toFixed(2) ?? '0.50';
  const c = ocean.conscientiousness?.toFixed(2) ?? '0.50';
  const e = ocean.extraversion?.toFixed(2) ?? '0.50';
  const a = ocean.agreeableness?.toFixed(2) ?? '0.50';
  const n = ocean.neuroticism?.toFixed(2) ?? '0.50';

  return [
    'You are a personality oracle for a digital twin.',
    "Based on this person's personality profile, write a 2nd-person behavioral observation about them.",
    `OCEAN: Openness ${o}, Conscientiousness ${c}, Extraversion ${e}, Agreeableness ${a}, Neuroticism ${n}`,
    'Write in 2nd person ("You..."). Be specific and insightful. 2-3 sentences.',
  ].join('\n');
}

/**
 * Fetch the user's personality profile (OCEAN + centroid).
 * @param {string} userId
 * @returns {{ oceanScores: object, centroid: number[] } | null}
 */
async function fetchPersonalityProfile(userId) {
  const { data: profile, error } = await supabaseAdmin
    .from('user_personality_profiles')
    .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, personality_embedding')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.error('Failed to fetch personality profile', { userId: userId.slice(0, 8), error: error.message });
    return null;
  }

  if (!profile) {
    log.warn('No personality profile found', { userId: userId.slice(0, 8) });
    return null;
  }

  if (!profile.personality_embedding) {
    log.warn('Personality profile has no embedding centroid', { userId: userId.slice(0, 8) });
    return null;
  }

  return {
    oceanScores: {
      openness: profile.openness,
      conscientiousness: profile.conscientiousness,
      extraversion: profile.extraversion,
      agreeableness: profile.agreeableness,
      neuroticism: profile.neuroticism,
    },
    centroid: profile.personality_embedding,
  };
}

/**
 * Fetch historical user prompts from twin_messages.
 * Returns diverse recent prompts (role='user'), ordered by recency.
 * @param {string} userId
 * @param {number} limit
 * @returns {string[]}
 */
async function fetchHistoricalPrompts(userId, limit) {
  const { data, error } = await supabaseAdmin
    .from('twin_messages')
    .select('content')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(limit * 2); // Fetch extra to filter duplicates/short prompts

  if (error) {
    log.error('Failed to fetch historical prompts', { userId: userId.slice(0, 8), error: error.message });
    return [];
  }

  if (!data || data.length === 0) {
    log.warn('No historical prompts found', { userId: userId.slice(0, 8) });
    return [];
  }

  // Deduplicate and filter out very short prompts
  const seen = new Set();
  const prompts = [];

  for (const row of data) {
    const content = (row.content || '').trim();
    if (content.length < 10) continue;

    const normalized = content.toLowerCase();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    prompts.push(content);

    if (prompts.length >= limit) break;
  }

  return prompts;
}

/**
 * Generate 4 oracle candidates for a single prompt at varying temperatures.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {string} userId
 * @returns {string[]} Array of 4 candidate responses (some may be empty on error)
 */
async function generateCandidates(systemPrompt, userPrompt, userId) {
  const candidates = [];

  for (const temp of TEMPERATURES) {
    try {
      const result = await complete({
        tier: TIER_EXTRACTION,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 256,
        temperature: temp,
        userId,
        serviceName: 'synthetic-pair-gen',
      });

      candidates.push(result.content || '');
    } catch (err) {
      log.warn('Candidate generation failed', { temp, error: err.message });
      candidates.push('');
    }
  }

  return candidates;
}

/**
 * Embed all non-empty candidates and compute cosine similarity to centroid.
 * Returns array of { index, text, similarity } sorted by similarity descending.
 * @param {string[]} candidates
 * @param {number[]} centroid
 * @returns {{ index: number, text: string, similarity: number }[]}
 */
async function scoreCandidates(candidates, centroid) {
  const scored = [];

  for (let i = 0; i < candidates.length; i++) {
    const text = candidates[i];
    if (!text || text.trim().length === 0) continue;

    const embedding = await generateEmbedding(text);
    if (!embedding) continue;

    const similarity = cosineSimilarity(embedding, centroid);
    scored.push({ index: i, text, similarity });
  }

  // Sort by similarity descending (highest first)
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored;
}

/**
 * Compute quality score from similarity gap.
 * Range: [0.2, 0.5] — higher gap = higher quality.
 * @param {number} gap
 * @returns {number}
 */
function computeQualityScore(gap) {
  return 0.2 + 0.3 * Math.min(1.0, gap / 0.15);
}

/**
 * Generate synthetic preference pairs from historical prompts.
 *
 * @param {string} userId
 * @param {number} [batchSize=50] - Number of prompts to process (max 50)
 * @returns {{ generated: number, skipped: number, avgGap: number }}
 */
export async function generateSyntheticPairs(userId, batchSize = 50) {
  const effectiveBatchSize = Math.min(Math.max(1, batchSize), MAX_BATCH_SIZE);

  log.info('Starting synthetic pair generation', {
    userId: userId.slice(0, 8),
    batchSize: effectiveBatchSize,
  });

  // 1. Fetch personality profile
  const profile = await fetchPersonalityProfile(userId);
  if (!profile) {
    return { generated: 0, skipped: 0, avgGap: 0 };
  }

  const systemPrompt = buildOracleSystemPrompt(profile.oceanScores);
  const centroid = profile.centroid;

  // 2. Fetch historical prompts
  const prompts = await fetchHistoricalPrompts(userId, effectiveBatchSize);
  if (prompts.length === 0) {
    log.warn('No prompts to process', { userId: userId.slice(0, 8) });
    return { generated: 0, skipped: 0, avgGap: 0 };
  }

  log.info('Fetched prompts for processing', {
    userId: userId.slice(0, 8),
    promptCount: prompts.length,
  });

  let generated = 0;
  let skipped = 0;
  let totalGap = 0;

  // 3. Process prompts sequentially to avoid rate limits
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];

    try {
      // Log progress every PROGRESS_LOG_INTERVAL prompts
      if ((i + 1) % PROGRESS_LOG_INTERVAL === 0) {
        log.info('Synthetic pair generation progress', {
          userId: userId.slice(0, 8),
          processed: i + 1,
          total: prompts.length,
          generated,
          skipped,
        });
      }

      // Generate 4 candidates at different temperatures
      const candidates = await generateCandidates(systemPrompt, prompt, userId);

      // Embed and score all candidates against personality centroid
      const scored = await scoreCandidates(candidates, centroid);

      // Need at least 2 valid scored candidates
      if (scored.length < 2) {
        skipped++;
        continue;
      }

      const chosen = scored[0]; // highest similarity
      const rejected = scored[scored.length - 1]; // lowest similarity
      const gap = chosen.similarity - rejected.similarity;

      // Skip near-ties
      if (gap < MIN_SIMILARITY_GAP) {
        skipped++;
        continue;
      }

      const qualityScore = computeQualityScore(gap);

      // Insert preference pair
      const { error: insertError } = await supabaseAdmin
        .from('preference_pairs')
        .insert({
          user_id: userId,
          prompt_messages: [{ role: 'user', content: prompt }],
          chosen_response: chosen.text,
          rejected_response: rejected.text,
          chosen_similarity: chosen.similarity,
          rejected_similarity: rejected.similarity,
          similarity_gap: gap,
          source: 'synthetic',
          quality_score: qualityScore,
        });

      if (insertError) {
        log.warn('Failed to insert synthetic pair', {
          promptIndex: i,
          error: insertError.message,
        });
        skipped++;
        continue;
      }

      generated++;
      totalGap += gap;
    } catch (err) {
      log.warn('Error processing prompt', {
        promptIndex: i,
        error: err.message,
      });
      skipped++;
    }
  }

  const avgGap = generated > 0 ? Math.round((totalGap / generated) * 10000) / 10000 : 0;

  log.info('Synthetic pair generation complete', {
    userId: userId.slice(0, 8),
    generated,
    skipped,
    avgGap,
    totalProcessed: prompts.length,
  });

  return { generated, skipped, avgGap };
}
