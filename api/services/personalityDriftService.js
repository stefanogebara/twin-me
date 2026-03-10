import { supabaseAdmin } from './database.js';
import { buildProfile } from './personalityProfileService.js';

const RECENT_DAYS = 7;
const BASELINE_DAYS = 90;
const MIN_MEMORIES = 5;
const DRIFT_THRESHOLD = 0.85;

export async function checkDrift(userId) {
  try {
    const now = new Date();
    const recentCutoff = new Date(now - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const baselineCutoff = new Date(now - BASELINE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [recentResult, baselineResult] = await Promise.all([
      supabaseAdmin
        .from('user_memories')
        .select('embedding')
        .eq('user_id', userId)
        .not('embedding', 'is', null)
        .gte('created_at', recentCutoff)
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin
        .from('user_memories')
        .select('embedding')
        .eq('user_id', userId)
        .not('embedding', 'is', null)
        .gte('created_at', baselineCutoff)
        .lt('created_at', recentCutoff)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const recentMemories = recentResult.data ?? [];
    const baselineMemories = baselineResult.data ?? [];
    const recentCount = recentMemories.length;
    const baselineCount = baselineMemories.length;

    if (recentCount < MIN_MEMORIES || baselineCount < MIN_MEMORIES) {
      return { drifted: false, reason: 'insufficient_data', recentCount, baselineCount };
    }

    const parseEmbedding = (row) =>
      typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;

    const recentEmbeddings = recentMemories.map(parseEmbedding);
    const baselineEmbeddings = baselineMemories.map(parseEmbedding);

    const recentCentroid = computeCentroid(recentEmbeddings);
    const baselineCentroid = computeCentroid(baselineEmbeddings);

    const similarity = cosineSimilarity(recentCentroid, baselineCentroid);
    const drifted = similarity < DRIFT_THRESHOLD;

    let rebuilt = false;
    if (drifted) {
      await buildProfile(userId);
      rebuilt = true;
    }

    return { drifted, similarity, recentCount, baselineCount, rebuilt };
  } catch (err) {
    console.warn('[PersonalityDrift] checkDrift error:', err.message);
    return { drifted: false, error: err.message };
  }
}

export function computeCentroid(embeddings) {
  const dim = embeddings[0].length;
  const sum = new Array(dim).fill(0);

  for (const vec of embeddings) {
    for (let i = 0; i < dim; i++) {
      sum[i] += vec[i];
    }
  }

  const count = embeddings.length;
  return sum.map((v) => v / count);
}

export function cosineSimilarity(a, b) {
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
