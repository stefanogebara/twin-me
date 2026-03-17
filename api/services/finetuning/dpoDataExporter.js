import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('DPODataExporter');

/**
 * Format messages array into a prompt string for DPO training.
 * Compatible with together.ai DPO JSONL format.
 */
function formatPrompt(messages) {
  return messages
    .map(m => `<|${m.role}|>\n${m.content}`)
    .join('\n');
}

/**
 * Export DPO training data for a user as together.ai-compatible JSONL lines.
 *
 * @param {string} userId
 * @param {number} [minPairs=200] - Minimum pairs required
 * @returns {{ lines: string[], count: number, error?: string }}
 */
export async function exportDPOTrainingData(userId, minPairs = 200) {
  const { data, error } = await supabaseAdmin
    .from('preference_pairs')
    .select('prompt_messages, chosen_response, rejected_response, similarity_gap')
    .eq('user_id', userId)
    .order('similarity_gap', { ascending: false }); // best examples first

  if (error) {
    log.error('Failed to fetch preference pairs', { error: error.message });
    return { lines: [], count: 0, error: error.message };
  }

  const pairs = data || [];

  if (pairs.length < minPairs) {
    return {
      lines: [],
      count: pairs.length,
      error: `Need ${minPairs} pairs, have ${pairs.length}`,
    };
  }

  const lines = pairs.map(pair => {
    const prompt = formatPrompt(pair.prompt_messages);
    return JSON.stringify({
      input: prompt,
      preferred_output: pair.chosen_response,
      non_preferred_output: pair.rejected_response,
    });
  });

  log.info('Exported DPO training data', { userId, count: lines.length });
  return { lines, count: lines.length };
}
