/**
 * Finetuning API Routes
 * =====================
 * POST /api/finetuning/train            — Export data + start SFT finetuning job
 * POST /api/finetuning/train-dpo        — Export preference data + start DPO training
 * GET  /api/finetuning/status           — Check model status
 * GET  /api/finetuning/preference-stats — Preference pair & feedback stats
 * POST /api/finetuning/generate-pairs   — Trigger synthetic DPO pair generation
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { exportTrainingData } from '../services/finetuning/trainingDataExporter.js';
import { createFinetune, checkFinetuneStatus } from '../services/finetuning/finetuneManager.js';
import { collectFromUserFeedback } from '../services/finetuning/preferenceCollector.js';
import { checkAndTriggerTraining, getTrainingReadiness } from '../services/finetuning/autoTrainingService.js';
import { generateSyntheticPairs } from '../services/finetuning/syntheticPairGenerator.js';
import { trainDPO, checkDPOEligibility } from '../services/finetuning/dpoTrainer.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('FinetuningAPI');
const router = express.Router();

const MIN_DPO_PAIRS = 200;

const MIN_TRAINING_EXAMPLES = 50;

/**
 * POST /api/finetuning/train
 * Export user's conversation data and start a finetuning job.
 * Rate limited: 1 per 24h per user (enforced by DB upsert — only one job per user).
 */
router.post('/train', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if there's already a running job
    const currentStatus = await checkFinetuneStatus(userId);
    if (currentStatus.status === 'running' || currentStatus.status === 'pending') {
      return res.status(409).json({
        success: false,
        error: 'A finetuning job is already in progress',
        status: currentStatus.status,
      });
    }

    // Export training data
    log.info(`Starting training data export for user ${userId.slice(0, 8)}`);
    const { filePath, stats } = await exportTrainingData({ userId });

    if (stats.exported < MIN_TRAINING_EXAMPLES) {
      return res.status(400).json({
        success: false,
        error: `Need at least ${MIN_TRAINING_EXAMPLES} conversation examples. You have ${stats.exported}.`,
        stats,
      });
    }

    // Start finetuning job
    const result = await createFinetune(userId, filePath);

    log.info(`Finetuning started for user ${userId.slice(0, 8)}: job ${result.jobId}`);

    return res.json({
      success: true,
      jobId: result.jobId,
      trainingExamples: stats.exported,
      status: result.status,
    });
  } catch (error) {
    log.error('Train error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to start finetuning' });
  }
});

/**
 * POST /api/finetuning/train-dpo
 * Manually trigger DPO training on top of an existing SFT model.
 * Requires: ready SFT model + >= 200 quality preference pairs.
 */
router.post('/train-dpo', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check eligibility before attempting training
    const eligibility = await checkDPOEligibility(userId);
    if (!eligibility.eligible) {
      return res.status(400).json({
        success: false,
        error: eligibility.reason,
        eligibility,
      });
    }

    log.info(`Starting DPO training for user ${userId.slice(0, 8)}`);
    const result = await trainDPO(userId);

    log.info(`DPO training started for user ${userId.slice(0, 8)}: job ${result.jobId}`);

    return res.json({
      success: true,
      jobId: result.jobId,
      status: result.status,
      trainCount: result.trainCount,
      evalCount: result.evalCount,
      sftModelId: result.sftModelId,
    });
  } catch (error) {
    log.error('Train DPO error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: 'Failed to start DPO training', details: error.message });
  }
});

/**
 * GET /api/finetuning/status
 * Check the current finetuning model status for the authenticated user.
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const result = await checkFinetuneStatus(req.user.id);
    return res.json({ success: true, ...result });
  } catch (error) {
    log.error('Status error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to check status' });
  }
});

/**
 * POST /api/chat/feedback
 * Record thumbs up/down on a twin chat message.
 * On thumbs down, attempts to find a regenerated (chosen) response
 * in twin_messages to auto-create a DPO preference pair.
 */
router.post('/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, conversationId, rating, messageContent, userMessage, modelVersion } = req.body;

    // Validate required fields
    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({ success: false, error: 'Rating must be 1 or -1' });
    }
    if (!messageContent || typeof messageContent !== 'string') {
      return res.status(400).json({ success: false, error: 'messageContent is required' });
    }

    // Insert feedback
    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from('chat_message_feedback')
      .insert({
        user_id: userId,
        message_id: messageId || null,
        conversation_id: conversationId || null,
        rating,
        message_content: messageContent.slice(0, 10000),
        user_message: userMessage ? userMessage.slice(0, 5000) : null,
        model_version: modelVersion || 'unknown',
      })
      .select('id')
      .single();

    if (feedbackError) {
      log.error('Failed to insert chat feedback', { error: feedbackError.message });
      return res.status(500).json({ success: false, error: 'Failed to save feedback' });
    }

    let preferenceGenerated = false;

    // On thumbs down with a conversationId, look for a subsequent assistant message
    // (regenerated response) to create a preference pair
    if (rating === -1 && conversationId && userMessage) {
      try {
        const { data: subsequentMessages } = await supabaseAdmin
          .from('twin_messages')
          .select('content, created_at')
          .eq('conversation_id', conversationId)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(5);

        if (subsequentMessages && subsequentMessages.length >= 2) {
          // The most recent assistant message is likely the regeneration (chosen),
          // and the rated message is the rejected one.
          const chosenResponse = subsequentMessages[0].content;
          if (chosenResponse && chosenResponse.trim() !== messageContent.trim()) {
            const pairId = await collectFromUserFeedback(
              userId,
              userMessage,
              messageContent,
              chosenResponse
            );
            preferenceGenerated = !!pairId;
          }
        }
      } catch (pairErr) {
        log.warn('Failed to auto-generate preference pair from feedback', { error: pairErr.message });
      }
    }

    log.info('Chat feedback recorded', {
      feedbackId: feedback.id,
      rating,
      preferenceGenerated,
      userId: userId.slice(0, 8),
    });

    return res.json({
      success: true,
      feedbackId: feedback.id,
      preferenceGenerated,
    });
  } catch (error) {
    log.error('Feedback error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to record feedback' });
  }
});

/**
 * GET /api/finetuning/preference-stats
 * Returns preference pair counts by source, feedback counts by rating,
 * and DPO eligibility status.
 */
router.get('/preference-stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch preference pairs grouped by source
    const { data: pairs, error: pairsError } = await supabaseAdmin
      .from('preference_pairs')
      .select('source')
      .eq('user_id', userId);

    if (pairsError) {
      log.error('Failed to fetch preference pair stats', { error: pairsError.message });
      return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }

    const pairsBySource = (pairs || []).reduce((acc, p) => {
      const src = p.source || 'unknown';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});

    // Fetch feedback counts by rating
    const { data: feedbacks, error: feedbackError } = await supabaseAdmin
      .from('chat_message_feedback')
      .select('rating')
      .eq('user_id', userId);

    if (feedbackError) {
      log.error('Failed to fetch feedback stats', { error: feedbackError.message });
      return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }

    const feedbackByRating = (feedbacks || []).reduce((acc, f) => {
      const key = f.rating === 1 ? 'thumbs_up' : 'thumbs_down';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { thumbs_up: 0, thumbs_down: 0 });

    const totalPairs = pairs ? pairs.length : 0;

    return res.json({
      success: true,
      preferencePairs: {
        total: totalPairs,
        bySource: pairsBySource,
      },
      feedback: feedbackByRating,
      dpo: {
        eligible: totalPairs >= MIN_DPO_PAIRS,
        pairsNeeded: Math.max(0, MIN_DPO_PAIRS - totalPairs),
        minRequired: MIN_DPO_PAIRS,
      },
    });
  } catch (error) {
    log.error('Preference stats error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch preference stats' });
  }
});

/**
 * POST /api/finetuning/generate-pairs
 * Manually trigger synthetic DPO preference pair generation.
 * Generates oracle candidate responses at varying temperatures,
 * scores them against the user's personality embedding centroid,
 * and stores chosen/rejected pairs.
 */
router.post('/generate-pairs', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const requestedBatchSize = req.body.batchSize;

    // Validate and cap batchSize
    let batchSize = 20;
    if (requestedBatchSize != null) {
      const parsed = parseInt(requestedBatchSize, 10);
      if (isNaN(parsed) || parsed < 1) {
        return res.status(400).json({
          success: false,
          error: 'batchSize must be a positive integer',
        });
      }
      batchSize = Math.min(parsed, 50);
    }

    log.info('Synthetic pair generation requested', {
      userId: userId.slice(0, 8),
      batchSize,
    });

    const stats = await generateSyntheticPairs(userId, batchSize);

    return res.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    log.error('Generate pairs error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate synthetic pairs',
    });
  }
});

// ─── Auto-Training (TRIBE v2 Phase D) ─────────────────────────────────────

/**
 * GET /api/finetuning/readiness — Training readiness summary
 */
router.get('/readiness', authenticateUser, async (req, res) => {
  try {
    const readiness = await getTrainingReadiness(req.user.id);
    res.json({ success: true, data: readiness });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check training readiness' });
  }
});

/**
 * POST /api/finetuning/auto-train — Trigger auto-training check
 * Checks eligibility and triggers SFT/DPO if conditions are met.
 */
router.post('/auto-train', authenticateUser, async (req, res) => {
  try {
    const result = await checkAndTriggerTraining(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Auto-training check failed' });
  }
});

export default router;
