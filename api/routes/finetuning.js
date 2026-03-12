/**
 * Finetuning API Routes
 * =====================
 * POST /api/finetuning/train  — Export data + start finetuning job
 * GET  /api/finetuning/status — Check model status
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { exportTrainingData } from '../services/finetuning/trainingDataExporter.js';
import { createFinetune, checkFinetuneStatus } from '../services/finetuning/finetuneManager.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('FinetuningAPI');
const router = express.Router();

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

export default router;
