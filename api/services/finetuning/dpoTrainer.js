/**
 * DPO Trainer — Phase 3
 * =====================
 * Orchestrates Direct Preference Optimization training on top of an existing
 * SFT-finetuned model. Checks eligibility, exports preference pair data,
 * and launches a DPO fine-tuning job via together.ai.
 *
 * Requires:
 * - A 'ready' SFT model in user_finetuned_models
 * - >= 200 quality preference pairs in preference_pairs
 */

import { supabaseAdmin } from '../database.js';
import { exportDPOTrainingData } from './dpoDataExporter.js';
import { createFinetune } from './finetuneManager.js';
import { createLogger } from '../logger.js';

const log = createLogger('DPOTrainer');

const MIN_DPO_PAIRS = 200;

/**
 * Check if a user is eligible for DPO training.
 * Requires an existing SFT model with status 'ready' and enough preference pairs.
 *
 * @param {string} userId
 * @returns {{ eligible: boolean, reason: string, pairCount: number, sftModelReady: boolean, sftModelId: string|null }}
 */
export async function checkDPOEligibility(userId) {
  if (!process.env.TOGETHER_API_KEY) {
    return {
      eligible: false,
      reason: 'TOGETHER_API_KEY not configured',
      pairCount: 0,
      sftModelReady: false,
      sftModelId: null,
    };
  }

  // 1. Check for a ready SFT model
  const { data: model } = await supabaseAdmin
    .from('user_finetuned_models')
    .select('id, status, training_method, model_id, job_id')
    .eq('user_id', userId)
    .eq('provider', 'together')
    .maybeSingle();

  const sftModelReady = !!(model && model.status === 'ready' && model.model_id);
  const sftModelId = sftModelReady ? model.model_id : null;

  if (!sftModelReady) {
    return {
      eligible: false,
      reason: 'No ready SFT model — SFT training must complete before DPO',
      pairCount: 0,
      sftModelReady: false,
      sftModelId: null,
    };
  }

  // If a DPO job is already running, block
  if (model.training_method === 'dpo' && (model.status === 'pending' || model.status === 'running')) {
    return {
      eligible: false,
      reason: `DPO job already ${model.status}`,
      pairCount: 0,
      sftModelReady: true,
      sftModelId,
    };
  }

  // 2. Count quality preference pairs (matching exporter filter)
  const { count, error: countError } = await supabaseAdmin
    .from('preference_pairs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('quality_score', 0.15);

  if (countError) {
    log.warn('Failed to count preference pairs', { error: countError.message });
    return {
      eligible: false,
      reason: `Failed to count preference pairs: ${countError.message}`,
      pairCount: 0,
      sftModelReady: true,
      sftModelId,
    };
  }

  const pairCount = count || 0;

  if (pairCount < MIN_DPO_PAIRS) {
    return {
      eligible: false,
      reason: `Only ${pairCount}/${MIN_DPO_PAIRS} quality preference pairs`,
      pairCount,
      sftModelReady: true,
      sftModelId,
    };
  }

  return {
    eligible: true,
    reason: 'Eligible for DPO training',
    pairCount,
    sftModelReady: true,
    sftModelId,
  };
}

/**
 * Orchestrate DPO training for a user.
 *
 * 1. Check eligibility (ready SFT model + enough pairs)
 * 2. Export preference data to temp JSONL files
 * 3. Save current model_id as sft_model_id before overwriting
 * 4. Launch DPO fine-tuning job via finetuneManager
 *
 * @param {string} userId
 * @returns {{ jobId: string, status: string, trainCount: number, evalCount: number, sftModelId: string }}
 */
export async function trainDPO(userId) {
  // 1. Check eligibility
  const eligibility = await checkDPOEligibility(userId);
  if (!eligibility.eligible) {
    throw new Error(`DPO not eligible: ${eligibility.reason}`);
  }

  const { sftModelId } = eligibility;
  log.info('Starting DPO training', {
    userId: userId.slice(0, 8),
    sftModelId: sftModelId.slice(0, 30),
    pairCount: eligibility.pairCount,
  });

  // 2. Export preference pairs to temp files
  const exportResult = await exportDPOTrainingData(userId, MIN_DPO_PAIRS);
  if (exportResult.error) {
    throw new Error(`DPO data export failed: ${exportResult.error}`);
  }

  const { trainFilePath, evalFilePath, trainCount, evalCount } = exportResult;

  // 3. Save current model_id as sft_model_id before the DPO job overwrites it
  const { error: saveError } = await supabaseAdmin
    .from('user_finetuned_models')
    .update({ sft_model_id: sftModelId })
    .eq('user_id', userId)
    .eq('provider', 'together');

  if (saveError) {
    log.warn('Failed to save sft_model_id', { error: saveError.message });
    // Non-fatal: proceed with training
  }

  // 4. Launch DPO fine-tuning job
  const result = await createFinetune(userId, trainFilePath, {
    nEpochs: 2,
    batchSize: 4,
    learningRate: 5e-6,
    suffix: 'twinme-dpo',
    trainingMethod: 'dpo',
  });

  log.info('DPO training job launched', {
    userId: userId.slice(0, 8),
    jobId: result.jobId,
    trainCount,
    evalCount,
    sftModelId: sftModelId.slice(0, 30),
  });

  return {
    jobId: result.jobId,
    status: result.status,
    trainCount,
    evalCount,
    sftModelId,
  };
}

export default { trainDPO, checkDPOEligibility };
