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
 * Collect a preference pair from explicit user feedback (thumbs down + regeneration).
 * User-validated pairs get the highest quality score (1.0).
 *
 * @param {string} userId
 * @param {string} userMessage - The user's prompt that generated the responses
 * @param {string} rejectedResponse - The response the user thumbs-downed
 * @param {string} chosenResponse - The regenerated response the user preferred
 * @returns {string|null} The preference pair ID, or null on failure
 */
export async function collectFromUserFeedback(userId, userMessage, rejectedResponse, chosenResponse) {
  if (!userId || !userMessage || !rejectedResponse || !chosenResponse) {
    log.warn('collectFromUserFeedback: missing required fields');
    return null;
  }

  // Don't create a pair if chosen and rejected are identical
  if (rejectedResponse.trim() === chosenResponse.trim()) {
    log.debug('Skipping identical chosen/rejected pair from user feedback');
    return null;
  }

  try {
    const promptMessages = [{ role: 'user', content: userMessage }];

    const { data, error } = await supabaseAdmin
      .from('preference_pairs')
      .insert({
        user_id: userId,
        prompt_messages: promptMessages,
        chosen_response: chosenResponse,
        rejected_response: rejectedResponse,
        source: 'user_feedback',
        source_detail: 'thumbs_down_regeneration',
        quality_score: 1.0,
        user_validated: true,
      })
      .select('id')
      .single();

    if (error) {
      log.warn('Failed to insert user feedback preference pair', { error: error.message });
      return null;
    }

    log.info('Collected user feedback preference pair', { id: data.id });
    return data.id;
  } catch (err) {
    log.warn('User feedback preference collection error', { error: err.message });
    return null;
  }
}

/**
 * Collect DPO preference pairs from agent action outcomes.
 * When the twin has both accepted and rejected actions for the same skill,
 * the accepted action's framing becomes `chosen` and the rejected becomes `rejected`.
 *
 * Quality score: 0.8 (high — direct user action, not just chat thumbs).
 * Source: 'action_feedback'.
 *
 * @param {string} userId
 * @param {string} skillName - The skill that generated these actions
 * @param {Array<{content: string, response: string}>} actions - Actions with user_response
 * @returns {{ created: number, skipped: number }}
 */
export async function collectFromActionFeedback(userId, skillName, actions) {
  if (!userId || !skillName || !actions?.length) {
    return { created: 0, skipped: 0 };
  }

  const accepted = actions.filter(a => a.response === 'accepted' || a.response === 'positive');
  const rejected = actions.filter(a => a.response === 'rejected' || a.response === 'negative');

  if (accepted.length === 0 || rejected.length === 0) {
    return { created: 0, skipped: actions.length };
  }

  let created = 0;
  let skipped = 0;

  // Create pairs by pairing each rejected with a random accepted (up to 5 pairs per skill)
  const maxPairs = Math.min(5, rejected.length);
  for (let i = 0; i < maxPairs; i++) {
    const chosenIdx = i % accepted.length;
    const chosenContent = accepted[chosenIdx].content;
    const rejectedContent = rejected[i].content;

    // Skip if too similar
    if (chosenContent.trim() === rejectedContent.trim()) {
      skipped++;
      continue;
    }

    try {
      const promptMessages = [{
        role: 'system',
        content: `Twin skill "${skillName}" proactive action context`,
      }];

      const { data, error } = await supabaseAdmin
        .from('preference_pairs')
        .insert({
          user_id: userId,
          prompt_messages: promptMessages,
          chosen_response: chosenContent,
          rejected_response: rejectedContent,
          source: 'action_feedback',
          source_detail: `skill:${skillName}`,
          quality_score: 0.8,
          user_validated: true,
        })
        .select('id')
        .single();

      if (error) {
        log.warn('Failed to insert action preference pair', { error: error.message });
        skipped++;
      } else {
        created++;
        log.info('Collected action preference pair', { id: data.id, skill: skillName });
      }
    } catch (err) {
      log.warn('Action preference collection error', { error: err.message });
      skipped++;
    }
  }

  return { created, skipped };
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
