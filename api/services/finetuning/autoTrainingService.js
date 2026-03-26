/**
 * Auto-Training Service — TRIBE v2 Phase D
 * ==========================================
 * Manages per-user model lifecycle: checks eligibility, auto-triggers
 * SFT/DPO training, handles model versioning and drift-based retraining.
 *
 * Inspired by TRIBE v2's subject-conditional heads — each user gets
 * a personalized LoRA adapter that improves over time.
 *
 * Call checkAndTriggerTraining(userId) periodically (e.g., after session
 * reflection) to maintain up-to-date per-user models.
 */

import { supabaseAdmin } from '../database.js';
import { exportTrainingData } from './trainingDataExporter.js';
import { createFinetune, checkFinetuneStatus, getModelId } from './finetuneManager.js';
import { createLogger } from '../logger.js';

const log = createLogger('AutoTraining');

const MIN_CONVERSATIONS_FOR_SFT = 50;
const MIN_PAIRS_FOR_DPO = 200;
const RETRAIN_COOLDOWN_DAYS = 7;
const DRIFT_RETRAIN_THRESHOLD = 0.80; // Cosine similarity below this triggers retrain

/**
 * Check if a user is eligible for auto-training and trigger if so.
 * Called after session reflection or periodically.
 *
 * @param {string} userId
 * @returns {{ action: string, details: object }}
 */
export async function checkAndTriggerTraining(userId) {
  try {
    // 1. Check current model status
    const modelInfo = await getModelId(userId);
    const hasModel = modelInfo?.modelId && modelInfo?.status === 'ready';

    // 2. Check cooldown — don't retrain too often
    if (hasModel) {
      const { data: model } = await supabaseAdmin
        .from('user_finetuned_models')
        .select('completed_at, metadata')
        .eq('user_id', userId)
        .maybeSingle();

      if (model?.completed_at) {
        const daysSince = (Date.now() - new Date(model.completed_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < RETRAIN_COOLDOWN_DAYS) {
          return { action: 'skip', details: { reason: 'cooldown', daysSince: Math.round(daysSince), daysRemaining: Math.ceil(RETRAIN_COOLDOWN_DAYS - daysSince) } };
        }
      }
    }

    // 3. Count conversations
    const { count: convCount } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('twin_response', 'is', null);

    if (convCount < MIN_CONVERSATIONS_FOR_SFT) {
      return { action: 'skip', details: { reason: 'insufficient_data', conversations: convCount, required: MIN_CONVERSATIONS_FOR_SFT } };
    }

    // 4. Check if we should do DPO (needs SFT model + enough pairs)
    if (hasModel) {
      const { count: pairCount } = await supabaseAdmin
        .from('preference_pairs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('quality_score', 0.15);

      if (pairCount >= MIN_PAIRS_FOR_DPO && modelInfo.trainingMethod !== 'dpo') {
        log.info('Auto-DPO eligible', { userId, pairs: pairCount });
        return { action: 'dpo_eligible', details: { pairs: pairCount, conversations: convCount, currentModel: modelInfo.modelId } };
      }

      // 5. Check personality drift — retrain if personality has changed significantly
      const driftResult = await checkPersonalityDrift(userId, model);
      if (driftResult.shouldRetrain) {
        log.info('Drift-triggered retraining', { userId, similarity: driftResult.similarity });
        return await triggerSFTTraining(userId, convCount, 'drift');
      }

      return { action: 'skip', details: { reason: 'model_current', model: modelInfo.modelId, conversations: convCount } };
    }

    // 6. No model exists — trigger first SFT
    log.info('Auto-SFT triggered (first model)', { userId, conversations: convCount });
    return await triggerSFTTraining(userId, convCount, 'initial');

  } catch (err) {
    log.error('checkAndTriggerTraining failed', { userId, error: err.message });
    return { action: 'error', details: { error: err.message } };
  }
}

/**
 * Trigger SFT training for a user.
 * @param {string} userId
 * @param {number} convCount
 * @param {string} reason - 'initial' | 'drift' | 'manual'
 */
async function triggerSFTTraining(userId, convCount, reason) {
  try {
    const { filePath, stats } = await exportTrainingData({ userId, minTurns: 1 });

    if (stats.exported < MIN_CONVERSATIONS_FOR_SFT) {
      return { action: 'skip', details: { reason: 'insufficient_quality_data', exported: stats.exported, total: stats.total } };
    }

    const result = await createFinetune(userId, filePath);

    log.info('SFT training started', { userId, reason, jobId: result.jobId, examples: stats.exported });

    return {
      action: 'sft_started',
      details: {
        reason,
        jobId: result.jobId,
        examples: stats.exported,
        conversations: convCount,
      },
    };
  } catch (err) {
    log.error('triggerSFTTraining failed', { userId, error: err.message });
    return { action: 'error', details: { error: err.message } };
  }
}

/**
 * Check if user's personality has drifted enough to warrant retraining.
 * Compares current personality embedding centroid with the one used at training time.
 */
async function checkPersonalityDrift(userId, modelRow) {
  try {
    // Get current personality embedding
    const { data: currentProfile } = await supabaseAdmin
      .from('user_personality_profiles')
      .select('personality_embedding')
      .eq('user_id', userId)
      .maybeSingle();

    if (!currentProfile?.personality_embedding) {
      return { shouldRetrain: false, similarity: null };
    }

    // Get training-time embedding from model metadata
    const trainingEmbedding = modelRow?.metadata?.personality_embedding_at_training;
    if (!trainingEmbedding) {
      // No baseline — store current for next check
      await supabaseAdmin
        .from('user_finetuned_models')
        .update({
          metadata: {
            ...(modelRow?.metadata || {}),
            personality_embedding_at_training: currentProfile.personality_embedding,
          },
        })
        .eq('user_id', userId);
      return { shouldRetrain: false, similarity: null };
    }

    // Compute cosine similarity
    const current = currentProfile.personality_embedding;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < Math.min(current.length, trainingEmbedding.length); i++) {
      dot += current[i] * trainingEmbedding[i];
      normA += current[i] * current[i];
      normB += trainingEmbedding[i] * trainingEmbedding[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    const similarity = denom > 0 ? dot / denom : 1;

    return {
      shouldRetrain: similarity < DRIFT_RETRAIN_THRESHOLD,
      similarity,
    };
  } catch (err) {
    log.warn('Drift check failed', { userId, error: err.message });
    return { shouldRetrain: false, similarity: null };
  }
}

/**
 * Get training readiness summary for a user.
 * Used by frontend to show training status and progress.
 *
 * @param {string} userId
 * @returns {{ eligible, status, conversations, pairs, model, nextAction }}
 */
export async function getTrainingReadiness(userId) {
  try {
    const [modelInfo, convResult, pairResult] = await Promise.all([
      getModelId(userId),
      supabaseAdmin
        .from('mcp_conversation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('twin_response', 'is', null),
      supabaseAdmin
        .from('preference_pairs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('quality_score', 0.15),
    ]);

    const conversations = convResult.count || 0;
    const pairs = pairResult.count || 0;
    const hasModel = modelInfo?.modelId && modelInfo?.status === 'ready';

    let nextAction = 'none';
    if (!hasModel && conversations >= MIN_CONVERSATIONS_FOR_SFT) nextAction = 'sft_ready';
    else if (!hasModel) nextAction = `need_${MIN_CONVERSATIONS_FOR_SFT - conversations}_more_conversations`;
    else if (hasModel && pairs >= MIN_PAIRS_FOR_DPO && modelInfo.trainingMethod !== 'dpo') nextAction = 'dpo_ready';
    else if (hasModel) nextAction = 'model_current';

    return {
      eligible: conversations >= MIN_CONVERSATIONS_FOR_SFT,
      status: modelInfo?.status || 'none',
      conversations,
      conversationsRequired: MIN_CONVERSATIONS_FOR_SFT,
      pairs,
      pairsRequired: MIN_PAIRS_FOR_DPO,
      model: hasModel ? { id: modelInfo.modelId, method: modelInfo.trainingMethod } : null,
      nextAction,
    };
  } catch (err) {
    log.error('getTrainingReadiness failed', { userId, error: err.message });
    return { eligible: false, status: 'error', conversations: 0, pairs: 0, model: null, nextAction: 'error' };
  }
}
