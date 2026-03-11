import express from 'express';
import behavioralEvidencePipeline from '../services/behavioralEvidencePipeline.js';

const router = express.Router();

// TEMPORARY: Test endpoint to trigger evidence pipeline (for debugging)
// SECURITY FIX: Only available in development mode
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[Test] Triggering evidence pipeline for user ${userId}`);
    const result = await behavioralEvidencePipeline.runPipeline(userId);
    res.json(result);
  } catch (error) {
    console.error('Test pipeline error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
