/**
 * Preference Collector — DPO Training Data
 * ==========================================
 * Collects chosen/rejected response pairs from the personality reranker.
 * Pairs with insufficient similarity gap are discarded (near-ties).
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('PreferenceCollector');
const MIN_SIMILARITY_GAP = 0.05;

/**
 * Store a preference pair if the similarity gap is large enough.
 *
 * @param {string} userId
 * @param {Array} promptMessages - The LLM messages that produced the candidates
 * @param {string} chosenResponse - Best candidate text
 * @param {string} rejectedResponse - Worst candidate text
 * @param {number} chosenSim - Cosine similarity of chosen to personality embedding
 * @param {number} rejectedSim - Cosine similarity of rejected to personality embedding
 * @returns {string|null} Inserted row ID, or null if skipped/failed
 */
export async function collectPreferencePair(userId, promptMessages, chosenResponse, rejectedResponse, chosenSim, rejectedSim) {
  const gap = chosenSim - rejectedSim;

  if (gap < MIN_SIMILARITY_GAP) {
    log.debug(`Skipping near-tie pair (gap=${gap.toFixed(4)})`);
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('preference_pairs')
    .insert({
      user_id: userId,
      prompt_messages: promptMessages,
      chosen_response: chosenResponse,
      rejected_response: rejectedResponse,
      chosen_similarity: chosenSim,
      rejected_similarity: rejectedSim,
      similarity_gap: gap,
      source: 'reranker',
    })
    .select('id')
    .single();

  if (error) {
    log.error('Failed to insert preference pair', { error: error.message });
    return null;
  }

  log.info(`Collected preference pair ${data.id} (gap=${gap.toFixed(4)})`);
  return data.id;
}
