/**
 * Twin Fidelity Service
 * =====================
 * Measures how accurately the twin predicts the real user's responses.
 * Extracts behavioral probes from conversation history, generates twin
 * predictions, and computes fidelity via embedding cosine similarity
 * and Spearman rank correlation.
 *
 * Usage:
 *   import { measureTwinFidelity, getLatestFidelity } from './twinFidelityService.js';
 *   const result = await measureTwinFidelity(userId);
 */

import { supabaseAdmin } from './database.js';
import { generateEmbedding } from './embeddingService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { spearmanCorrelation, cosineSimilarity } from './statsUtils.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinFidelity');

/** Keywords that indicate a user expressing a preference or opinion */
const PREFERENCE_KEYWORDS = [
  'prefer', 'like', 'love', 'hate', 'favorite', 'enjoy',
  'choose', 'always', 'never', 'best', 'worst',
];

/** Maximum parallel LLM calls for twin predictions */
const PARALLEL_BATCH_SIZE = 5;

/**
 * Extract behavioral probes from conversation history.
 * Looks for messages where the user expressed preferences, opinions,
 * or strong reactions — these serve as ground truth for fidelity scoring.
 *
 * @param {string} userId
 * @param {number} [limit=30]
 * @returns {Promise<Array<{ stimulus: string, actualResponse: string }>>}
 */
export async function extractBehavioralProbes(userId, limit = 30) {
  log.info('Extracting behavioral probes', { userId, limit });

  // Fetch conversation logs — look for preference-expressing messages
  const { data: conversations, error } = await supabaseAdmin
    .from('mcp_conversation_logs')
    .select('user_message, assistant_message, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    log.error('Failed to fetch conversation logs', { userId, error: error.message });
    return [];
  }

  if (!conversations || conversations.length === 0) {
    log.info('No conversation logs found', { userId });
    return [];
  }

  // Filter for messages containing preference keywords
  const probes = [];
  for (const conv of conversations) {
    if (!conv.user_message || !conv.assistant_message) continue;

    const userMsgLower = conv.user_message.toLowerCase();
    const hasPreference = PREFERENCE_KEYWORDS.some(kw => userMsgLower.includes(kw));

    if (hasPreference) {
      probes.push({
        stimulus: conv.user_message,
        actualResponse: conv.assistant_message,
      });
    }

    if (probes.length >= limit) break;
  }

  log.info('Extracted behavioral probes', { userId, count: probes.length });
  return probes;
}

/**
 * Process a batch of probes in parallel (up to PARALLEL_BATCH_SIZE at a time).
 * @param {Array} batch - array of { probe, contextSummary }
 * @returns {Promise<Array<{ stimulus, actualResponse, predictedResponse, similarity }>>}
 */
async function processProbeBatch(batch) {
  return Promise.all(
    batch.map(async ({ probe, contextSummary }) => {
      try {
        // Generate twin prediction
        const predictionResult = await complete({
          tier: TIER_ANALYSIS,
          messages: [
            {
              role: 'system',
              content: 'You are predicting how a specific person would respond. Be brief and specific (1-2 sentences).',
            },
            {
              role: 'user',
              content: `Based on their personality and behavior patterns, predict how this person would respond to: "${probe.stimulus}"\n\nContext about this person:\n${contextSummary}`,
            },
          ],
          maxTokens: 150,
          temperature: 0.3,
          serviceName: 'twinFidelity-prediction',
        });

        const predictedResponse = predictionResult?.content || '';
        if (!predictedResponse) {
          return null;
        }

        // Embed both responses for cosine similarity
        const [actualEmbedding, predictedEmbedding] = await Promise.all([
          generateEmbedding(probe.actualResponse),
          generateEmbedding(predictedResponse),
        ]);

        const similarity = cosineSimilarity(actualEmbedding, predictedEmbedding);

        return {
          stimulus: probe.stimulus,
          actualResponse: probe.actualResponse,
          predictedResponse,
          similarity,
        };
      } catch (err) {
        log.warn('Failed to process probe', { stimulus: probe.stimulus.slice(0, 80), error: err.message });
        return null;
      }
    })
  );
}

/**
 * Measure twin fidelity for a user.
 * Extracts behavioral probes, generates twin predictions, computes
 * per-probe cosine similarity, and Spearman rank correlation across probes.
 *
 * @param {string} userId
 * @returns {Promise<{ fidelity_score: number, confidence: number, probe_count: number, probes: object[] }>}
 */
export async function measureTwinFidelity(userId) {
  log.info('Measuring twin fidelity', { userId });

  // Extract probes from conversation history
  const probes = await extractBehavioralProbes(userId);

  if (probes.length < 3) {
    log.warn('Insufficient probes for fidelity measurement', { userId, probeCount: probes.length });
    return {
      fidelity_score: 0,
      confidence: 0,
      probe_count: probes.length,
      probes: [],
    };
  }

  // Fetch context about the user (top memories by importance)
  const { data: topMemories, error: memError } = await supabaseAdmin
    .from('user_memories')
    .select('content')
    .eq('user_id', userId)
    .order('importance_score', { ascending: false })
    .limit(20);

  if (memError) {
    log.error('Failed to fetch user memories for context', { userId, error: memError.message });
    throw new Error(`Failed to fetch user context: ${memError.message}`);
  }

  const contextSummary = topMemories
    ? topMemories.map(m => m.content).join('\n')
    : '';

  // Process probes in batches of PARALLEL_BATCH_SIZE
  const processedProbes = [];
  for (let i = 0; i < probes.length; i += PARALLEL_BATCH_SIZE) {
    const batch = probes.slice(i, i + PARALLEL_BATCH_SIZE).map(probe => ({
      probe,
      contextSummary,
    }));

    const batchResults = await processProbeBatch(batch);
    for (const result of batchResults) {
      if (result) {
        processedProbes.push(result);
      }
    }
  }

  if (processedProbes.length < 3) {
    log.warn('Too few successful probes', { userId, processed: processedProbes.length });
    return {
      fidelity_score: 0,
      confidence: 0,
      probe_count: processedProbes.length,
      probes: processedProbes,
    };
  }

  // Compute overall fidelity score (mean cosine similarity)
  const similarities = processedProbes.map(p => p.similarity);
  const meanSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // Compute Spearman rank correlation across probe similarities
  // Use probe index as expected rank (earlier probes from more recent conversations)
  const expectedRanks = similarities.map((_, i) => i + 1);
  const { rho } = spearmanCorrelation(expectedRanks, similarities);

  // Confidence based on probe count (more probes = higher confidence)
  const confidence = Math.min(1, processedProbes.length / 30);

  const fidelityScore = meanSimilarity;

  // Store the result
  const { error: insertError } = await supabaseAdmin
    .from('twin_fidelity_scores')
    .insert({
      user_id: userId,
      fidelity_score: fidelityScore,
      probe_count: processedProbes.length,
      confidence,
      probe_details: {
        probes: processedProbes.map(p => ({
          stimulus: p.stimulus.slice(0, 200),
          similarity: p.similarity,
        })),
        spearman_rho: rho,
        mean_similarity: meanSimilarity,
      },
      method: 'behavioral_probe',
      measured_at: new Date().toISOString(),
    });

  if (insertError) {
    log.error('Failed to store fidelity score', { userId, error: insertError.message });
    throw new Error(`Failed to store fidelity score: ${insertError.message}`);
  }

  log.info('Twin fidelity measured', {
    userId,
    fidelityScore: fidelityScore.toFixed(3),
    probeCount: processedProbes.length,
    confidence: confidence.toFixed(2),
    spearmanRho: rho.toFixed(3),
  });

  return {
    fidelity_score: fidelityScore,
    confidence,
    probe_count: processedProbes.length,
    probes: processedProbes,
  };
}

/**
 * Get the latest fidelity score for a user.
 * @param {string} userId
 * @returns {Promise<object|null>} latest fidelity score record or null
 */
export async function getLatestFidelity(userId) {
  const { data, error } = await supabaseAdmin
    .from('twin_fidelity_scores')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
      return null;
    }
    log.error('Failed to fetch latest fidelity', { userId, error: error.message });
    throw new Error(`Failed to fetch fidelity score: ${error.message}`);
  }

  return data;
}
