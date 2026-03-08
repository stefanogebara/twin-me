import { complete, TIER_CHAT } from './llmGateway.js';
import { generateEmbedding } from './embeddingService.js';

function cosineSimilarity(a, b) {
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
      return candidates[0];
    }

    const embeddingResults = await Promise.allSettled(
      candidates.map(c => generateEmbedding(c.content))
    );

    let bestIdx = 0;
    let bestSim = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const embResult = embeddingResults[i];
      if (embResult.status !== 'fulfilled' || !embResult.value) continue;

      const sim = cosineSimilarity(embResult.value, personalityEmbedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    console.log(
      `[PersonalityReranker] Selected candidate ${bestIdx + 1}/${candidates.length} (similarity: ${bestSim.toFixed(4)})`
    );

    return candidates[bestIdx];
  } catch (err) {
    console.warn('[PersonalityReranker] Reranking failed, returning null:', err.message);
    return null;
  }
}
