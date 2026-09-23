/**
 * Story Chapters Routes
 * =====================
 * Chaptered life-story interview (Plan: .claude/plans/2026-08-01-twin-interview).
 *
 * GET  /api/life-story/status         — chapters + progress + suggested next
 * POST /api/life-story/session/start  — begin/resume a chapter session
 * POST /api/life-story/session/turn   — submit an answer, get the next move
 *
 * Thin by design: auth guard, validation, service delegation, error mapping.
 * All interview logic lives in api/services/lifeStoryService.js. The turn
 * endpoint is LLM-backed and rate-limited via aiLimiter in server.js.
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getLifeStoryStatus, startSession, processTurn, getSession } from '../services/lifeStoryService.js';

const router = Router();

router.use(authenticateUser);

router.get('/status', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const data = await getLifeStoryStatus(userId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

router.post('/session/start', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { chapterId } = req.body || {};
    if (!chapterId || typeof chapterId !== 'string') {
      return res.status(400).json({ success: false, error: 'chapterId is required' });
    }

    const data = await startSession(userId, chapterId);
    res.json({ success: true, data });
  } catch (error) {
    if (/unknown chapter/i.test(error.message || '')) {
      return res.status(404).json({ success: false, error: 'Unknown chapter' });
    }
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * Read-only resync after a lost turn response. Cheap (one indexed read,
 * no LLM), so the client can safely call it whenever a turn appears to
 * fail and find out whether the work actually landed.
 */
router.get('/session/:id', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const data = await getSession(userId, req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

router.post('/session/turn', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { sessionId, answer } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'answer is required' });
    }

    const data = await processTurn(userId, sessionId, answer.trim().substring(0, 8000));
    if (!data) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

export default router;
