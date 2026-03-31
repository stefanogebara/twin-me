import express from 'express';
import behavioralEvidencePipeline from '../services/behavioralEvidencePipeline.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TestEvidencePipeline');

const router = express.Router();

// TEMPORARY: Test endpoint to trigger evidence pipeline (for debugging)
// Only available in development mode
router.get('/:userId', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' });
  }

  try {
    const { userId } = req.params;
    log.info(`Triggering evidence pipeline for user ${userId}`);
    const result = await behavioralEvidencePipeline.runPipeline(userId);
    res.json(result);
  } catch (error) {
    log.error('Test pipeline error:', error);
    res.status(500).json({ error: 'Pipeline execution failed' });
  }
});

export default router;
