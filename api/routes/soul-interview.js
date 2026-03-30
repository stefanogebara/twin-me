/**
 * Soul Interview Routes
 * =====================
 * API endpoints for the Soul Interview cold-start feature.
 *
 * POST /api/interview/question  — Get next interview question
 * POST /api/interview/answer    — Submit answer + get extracted facts
 * POST /api/interview/complete  — Generate personality summary
 * GET  /api/interview/status    — Check interview progress
 * GET  /api/interview/should-show — Check if user should see interview prompt
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import {
  generateInterviewQuestion,
  processInterviewAnswer,
  generateInterviewSummary,
  getInterviewStatus,
  shouldShowInterview,
} from '../services/soulInterviewService.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

/**
 * GET /api/interview/status
 * Returns which categories have been answered and overall progress.
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const status = await getInterviewStatus(userId);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/interview/should-show
 * Returns whether the interview prompt should be shown (< 50 memories).
 */
router.get('/should-show', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const show = await shouldShowInterview(userId);
    res.json({ success: true, shouldShow: show });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/interview/question
 * Body: { answeredCategories: string[], connectedPlatforms: string[] }
 * Returns next question or { done: true } if all categories answered.
 */
router.post('/question', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { answeredCategories = [], connectedPlatforms = [] } = req.body;

    const result = await generateInterviewQuestion(userId, answeredCategories, connectedPlatforms);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/interview/answer
 * Body: { category, question, answer }
 * Returns extracted facts.
 */
router.post('/answer', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { category, question, answer } = req.body;

    if (!category || !question) {
      return res.status(400).json({ success: false, error: 'category and question are required' });
    }

    if (!answer || answer.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Answer must be at least 3 characters' });
    }

    const result = await processInterviewAnswer(userId, category, question, answer);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/interview/complete
 * Generates a personality summary from all interview answers.
 */
router.post('/complete', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const result = await generateInterviewSummary(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
