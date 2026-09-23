/**
 * Fine-Tune Manager — together.ai (serving-side remnant)
 * =======================================================
 * The TRAINING half of this module (createFinetune, checkFinetuneStatus) was
 * deleted in replan-2026-06-10 cycle 4 along with the rest of the DPO/
 * fine-tuning pipeline — the training infra never existed in production.
 *
 * What remains is the SERVING lookup: if a user has a ready finetuned model
 * recorded in `user_finetuned_models` (table intentionally kept), the
 * personality oracle uses it for draft generation. With no ready model this
 * returns null and the oracle gracefully no-ops.
 */

import { supabaseAdmin } from '../database.js';

/**
 * Get the finetuned model ID for a user (if ready).
 *
 * @param {string} userId
 * @returns {{ modelId: string, sftModelId: string|null, trainingMethod: string }|null}
 */
export async function getModelId(userId) {
  const { data } = await supabaseAdmin
    .from('user_finetuned_models')
    .select('model_id, sft_model_id, training_method')
    .eq('user_id', userId)
    .eq('provider', 'together')
    .eq('status', 'ready')
    .maybeSingle();

  if (!data) return null;

  return {
    modelId: data.model_id,
    sftModelId: data.sft_model_id,
    trainingMethod: data.training_method || 'sft',
  };
}

export default { getModelId };
