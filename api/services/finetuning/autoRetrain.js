/**
 * Auto-Retrain Trigger
 * ====================
 * Checks if a user has accumulated enough new memories since last finetune
 * to warrant retraining the personality oracle model.
 *
 * Trigger: 200+ new memories since last training, with 7-day cooldown.
 * Called after observation ingestion for users who had new data stored.
 */

import { supabaseAdmin } from '../database.js';
import { exportTrainingData } from './trainingDataExporter.js';
import { createFinetune, getModelId } from './finetuneManager.js';
import { createLogger } from '../logger.js';

const log = createLogger('AutoRetrain');

const MIN_NEW_MEMORIES = 200;
const COOLDOWN_DAYS = 7;
const MIN_TRAINING_EXAMPLES = 50;

/**
 * Check if a user is eligible for automatic retraining.
 * @param {string} userId
 * @returns {{ eligible: boolean, reason: string, newMemories?: number }}
 */
export async function checkRetrainEligibility(userId) {
  // 1. Check if TOGETHER_API_KEY is configured
  if (!process.env.TOGETHER_API_KEY) {
    return { eligible: false, reason: 'TOGETHER_API_KEY not configured' };
  }

  // 2. Get last finetune record
  const { data: model } = await supabaseAdmin
    .from('user_finetuned_models')
    .select('created_at, status, training_examples')
    .eq('user_id', userId)
    .eq('provider', 'together')
    .single();

  // 3. Check cooldown (7 days since last training attempt)
  if (model) {
    const daysSinceLastTrain = (Date.now() - new Date(model.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastTrain < COOLDOWN_DAYS) {
      return { eligible: false, reason: `Cooldown: ${Math.ceil(COOLDOWN_DAYS - daysSinceLastTrain)}d remaining` };
    }
    // Don't retrain if a job is currently running
    if (model.status === 'pending' || model.status === 'running') {
      return { eligible: false, reason: `Job already ${model.status}` };
    }
  }

  // 4. Count new memories since last training (or all if never trained)
  const sinceDate = model?.created_at || '2020-01-01T00:00:00Z';
  const { count } = await supabaseAdmin
    .from('user_memories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('created_at', sinceDate);

  const newMemories = count || 0;

  if (newMemories < MIN_NEW_MEMORIES) {
    return { eligible: false, reason: `Only ${newMemories}/${MIN_NEW_MEMORIES} new memories`, newMemories };
  }

  return { eligible: true, reason: 'Eligible for retraining', newMemories };
}

/**
 * Trigger automatic retraining for a user if eligible.
 * Non-blocking — logs and returns immediately on error.
 * @param {string} userId
 */
export async function triggerAutoRetrain(userId) {
  try {
    const eligibility = await checkRetrainEligibility(userId);
    if (!eligibility.eligible) {
      log.debug('Auto-retrain skipped', { userId: userId.slice(0, 8), reason: eligibility.reason });
      return { triggered: false, reason: eligibility.reason };
    }

    log.info('Auto-retrain triggered', { userId: userId.slice(0, 8), newMemories: eligibility.newMemories });

    // Export training data
    const { filePath, exampleCount } = await exportTrainingData({ userId });

    if (exampleCount < MIN_TRAINING_EXAMPLES) {
      log.info('Auto-retrain skipped: insufficient training examples', { userId: userId.slice(0, 8), exampleCount });
      return { triggered: false, reason: `Only ${exampleCount}/${MIN_TRAINING_EXAMPLES} training examples` };
    }

    // Start finetuning job (non-blocking after this point)
    const result = await createFinetune(userId, filePath);
    log.info('Auto-retrain job started', { userId: userId.slice(0, 8), jobId: result.jobId, exampleCount });

    return { triggered: true, jobId: result.jobId, exampleCount };
  } catch (err) {
    log.error('Auto-retrain failed', { userId: userId.slice(0, 8), error: err.message });
    return { triggered: false, reason: err.message };
  }
}

/**
 * Check retrain eligibility for a batch of user IDs (called from observation ingestion cron).
 * Processes sequentially to avoid overwhelming together.ai API.
 * @param {string[]} userIds
 * @returns {{ checked: number, triggered: number, results: Array }}
 */
export async function checkBatchRetrain(userIds) {
  const results = [];
  let triggered = 0;

  for (const userId of userIds) {
    const result = await triggerAutoRetrain(userId);
    results.push({ userId: userId.slice(0, 8), ...result });
    if (result.triggered) triggered++;
  }

  return { checked: userIds.length, triggered, results };
}
