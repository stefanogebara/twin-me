/**
 * Personality Profile API
 *
 * GET  /api/personality-profile          — Current profile (strips embedding)
 * POST /api/personality-profile/rebuild — Force rebuild
 * GET  /api/personality-profile/drift   — Check drift status
 * GET  /api/personality-profile/history — Assessment history
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getProfile, buildProfile } from '../services/personalityProfileService.js';
import { checkDrift } from '../services/personalityDriftService.js';
import { getPersonalityHistory } from '../services/personalityEvaluationService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('PersonalityProfile');

const router = Router();

// GET /api/personality-profile — return current profile
router.get('/', authenticateUser, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) {
      return res.json({
        success: true,
        profile: null,
        message: 'Not enough data to build a personality profile yet (minimum 20 memories).',
      });
    }

    // Strip the raw embedding vector — it's large and only used internally
    const { personality_embedding, ...safeProfile } = profile;

    res.json({ success: true, profile: safeProfile });
  } catch (err) {
    log.error('GET error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to retrieve personality profile.' });
  }
});

// POST /api/personality-profile/rebuild — force rebuild
router.post('/rebuild', authenticateUser, async (req, res) => {
  try {
    const profile = await buildProfile(req.user.id);
    if (!profile) {
      return res.json({
        success: true,
        profile: null,
        message: 'Not enough data to build a personality profile yet (minimum 20 memories).',
      });
    }

    const { personality_embedding, ...safeProfile } = profile;

    res.json({ success: true, profile: safeProfile, rebuilt: true });
  } catch (err) {
    log.error('rebuild error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to rebuild personality profile.' });
  }
});

// GET /api/personality-profile/drift — check for personality drift
router.get('/drift', authenticateUser, async (req, res) => {
  try {
    const result = await checkDrift(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('drift check error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to check personality drift.' });
  }
});

// GET /api/personality-profile/history — assessment history
router.get('/history', authenticateUser, async (req, res) => {
  try {
    const history = await getPersonalityHistory(req.user.id, parseInt(req.query.limit) || 12);
    res.json({ success: true, assessments: history });
  } catch (err) {
    log.error('History fetch error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to fetch personality history' });
  }
});

export default router;
