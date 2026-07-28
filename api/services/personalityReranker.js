import { complete, TIER_CHAT } from './llmGateway.js';
import { generateEmbedding } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('PersonalityReranker');

function cosineSimilarity(a, b) {
  // Fail loud on a shape mismatch instead of silently returning NaN (which made the
  // reranker degenerate to "always pick candidate 0"); the caller's try/catch turns
  // a throw into "skip rerank, fall back to a normal completion" (audit).
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    throw new Error(`cosineSimilarity shape mismatch: ${Array.isArray(a) ? a.length : typeof a} vs ${Array.isArray(b) ? b.length : typeof b}`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export async function rerankByPersonality(
  { system, messages, maxTokens, userId },
  personalityEmbedding,
  profile,
  n = 3
) {
  try {
    // The stored personality_embedding comes back as a pgvector STRING ("[0.1,...]")
    // on both the build and cache-hit paths — parse it to a numeric array BEFORE any
    // cosine math, or every similarity is NaN and the reranker silently returns
    // candidate 0 at full 3x cost (audit). Bail (fall back to one completion) if unusable.
    const centroid = Array.isArray(personalityEmbedding)
      ? personalityEmbedding
      : (typeof personalityEmbedding === 'string'
          ? personalityEmbedding.replace(/^\[|\]$/g, '').split(',').map(Number)
          : null);
    if (!centroid || centroid.length === 0 || centroid.some((x) => !Number.isFinite(x))) {
      log.warn('Personality reranker: unusable centroid embedding — skipping rerank');
      return null;
    }

    const baseTemp = profile.temperature ?? 0.7;
    const half = Math.floor(n / 2);

    const candidatePromises = Array.from({ length: n }, (_, i) => {
      const rawTemp = baseTemp + (i - half) * 0.08;
      const temperature = Math.min(1.0, Math.max(0.3, rawTemp));
      return complete({
        system,
        messages,
        maxTokens,
        userId,
        tier: TIER_CHAT,
        temperature,
        serviceName: 'twin-chat-rerank',
      });
    });

    const results = await Promise.allSettled(candidatePromises);

    const candidates = results
      .filter(r => r.status === 'fulfilled' && r.value?.content?.trim())
      .map(r => r.value);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return {
        ...candidates[0],
        _rerankerMeta: {
          chosen: candidates[0],
          rejected: null,
          chosenSimilarity: 0,
          rejectedSimilarity: 0,
          similarityGap: 0,
          candidateCount: 1,
        },
      };
    }

    const embeddingResults = await Promise.allSettled(
      candidates.map(c => generateEmbedding(c.content))
    );

    let bestIdx = 0;
    let bestSim = -Infinity;
    let worstIdx = 0;
    let worstSim = Infinity;
    const similarities = [];

    for (let i = 0; i < candidates.length; i++) {
      const embResult = embeddingResults[i];
      if (embResult.status !== 'fulfilled' || !embResult.value
          || embResult.value.length !== centroid.length) {
        similarities.push(null);
        continue;
      }

      const sim = cosineSimilarity(embResult.value, centroid);
      similarities.push(sim);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
      if (sim < worstSim) {
        worstSim = sim;
        worstIdx = i;
      }
    }

    log.info(
      `[PersonalityReranker] Selected candidate ${bestIdx + 1}/${candidates.length} (similarity: ${bestSim.toFixed(4)}, gap: ${(bestSim - worstSim).toFixed(4)})`
    );

    return {
      ...candidates[bestIdx],
      _rerankerMeta: {
        chosen: candidates[bestIdx],
        rejected: candidates[worstIdx],
        chosenSimilarity: bestSim,
        rejectedSimilarity: worstSim,
        similarityGap: bestSim - worstSim,
        candidateCount: candidates.length,
      },
    };
  } catch (err) {
    log.warn('Reranking failed, returning null:', err.message);
    return null;
  }
}
