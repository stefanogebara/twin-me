/**
 * Portrait API
 * ============
 * GET  /api/portrait                        the signed-in person's Portrait (PortraitData)
 * POST /api/portrait/readings/:id/verdict   { verdict: true|partly|wrong|null, note? }
 * POST /api/portrait/question/answer        { readingIds: [], answer }
 * DELETE /api/portrait/sources/:platform    archive and delete everything read from one platform
 *
 * Spec: .claude/plans/2026-09-03-portrait/README.md
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { loadPortrait, setVerdict, answerQuestion, deleteSource } from '../services/portraitService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('PortraitRoute');
const router = Router();

router.use(authenticateUser);

router.get('/', async (req, res) => {
  try {
    const data = await loadPortrait(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    log.error('Failed to load portrait', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/readings/:id/verdict', async (req, res) => {
  const { verdict = null, note = '' } = req.body || {};
  if (verdict !== null && !['true', 'partly', 'wrong'].includes(verdict)) {
    return res.status(400).json({ success: false, error: 'verdict must be true, partly, wrong or null' });
  }
  try {
    const data = await setVerdict(req.user.id, req.params.id, verdict, typeof note === 'string' ? note.slice(0, 500) : '');
    res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'reading not found') return res.status(404).json({ success: false, error: 'Reading not found' });
    log.error('Failed to set verdict', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/question/answer', async (req, res) => {
  const { readingIds = [], answer = '' } = req.body || {};
  if (typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ success: false, error: 'answer is required' });
  }
  try {
    const data = await answerQuestion(req.user.id, Array.isArray(readingIds) ? readingIds.slice(0, 5) : [], answer.slice(0, 500));
    res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'reading not found') return res.status(404).json({ success: false, error: 'Reading not found' });
    log.error('Failed to answer question', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/sources/:platform', async (req, res) => {
  const platform = String(req.params.platform || '').toLowerCase();
  if (!/^[a-z_]+$/.test(platform)) return res.status(400).json({ success: false, error: 'invalid platform' });
  try {
    const data = await deleteSource(req.user.id, platform);
    res.json({ success: true, data });
  } catch (error) {
    log.error('Failed to delete source', { error: error.message, platform });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
