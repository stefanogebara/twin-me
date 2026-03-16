import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('PreferenceCollector');

const MIN_SIMILARITY_GAP = 0.05;

/**
 * Collect a preference pair from the personality reranker.
 * Skips near-ties (similarity gap < MIN_SIMILARITY_GAP).
 */
export async function collectPreferencePair(userId, promptMessages, rerankerMeta) {
  if (!rerankerMeta || !rerankerMeta.chosen || !rerankerMeta.rejected) {
    return null;
  }

  const { chosenSimilarity, rejectedSimilarity, similarityGap } = rerankerMeta;

  if (similarityGap < MIN_SIMILARITY_GAP) {
    log.debug('Skipping near-tie preference pair', { similarityGap });
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('preference_pairs')
      .insert({
        user_id: userId,
        prompt_messages: promptMessages,
        chosen_response: rerankerMeta.chosen.content,
        rejected_response: rerankerMeta.rejected.content,
        chosen_similarity: chosenSimilarity,
        rejected_similarity: rejectedSimilarity,
        similarity_gap: similarityGap,
        source: 'reranker',
      })
      .select('id')
      .single();

    if (error) {
      log.warn('Failed to insert preference pair', { error: error.message });
      return null;
    }

    log.info('Collected preference pair', { id: data.id, gap: similarityGap.toFixed(4) });
    return data.id;
  } catch (err) {
    log.warn('Preference collection error', { error: err.message });
    return null;
  }
}

/**
 * Get preference pair stats for a user.
 */
export async function getPreferenceStats(userId) {
  const { data, error } = await supabaseAdmin
    .from('preference_pairs')
    .select('id, similarity_gap, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    log.warn('Failed to fetch preference stats', { error: error.message });
    return { count: 0, avgGap: 0, oldestAt: null, newestAt: null };
  }

  const pairs = data || [];
  const count = pairs.length;
  const avgGap = count > 0 ? pairs.reduce((sum, p) => sum + (p.similarity_gap || 0), 0) / count : 0;

  return {
    count,
    avgGap: Math.round(avgGap * 10000) / 10000,
    oldestAt: pairs.length > 0 ? pairs[pairs.length - 1].created_at : null,
    newestAt: pairs.length > 0 ? pairs[0].created_at : null,
  };
}
