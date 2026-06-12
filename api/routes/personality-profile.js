/**
 * Personality Profile API
 *
 * GET  /api/personality-profile                 — Current profile (strips embedding)
 * POST /api/personality-profile/rebuild        — Force rebuild
 * GET  /api/personality-profile/drift          — Check drift status
 * GET  /api/personality-profile/history        — Assessment history
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getProfile, buildProfile } from '../services/personalityProfileService.js';
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

// GET /api/personality-profile/drift — removed (OCEAN drift removed)
router.get('/drift', authenticateUser, (_req, res) => {
  res.status(410).json({ success: false, error: 'Personality drift removed — use soul signature layers instead.' });
});

// GET /api/personality-profile/history — removed (OCEAN history removed)
router.get('/history', authenticateUser, (_req, res) => {
  res.status(410).json({ success: false, error: 'Personality history removed — use soul signature layers instead.' });
});

// GET /api/personality-profile/preference-stats — removed (DPO/fine-tuning stack deleted)
router.get('/preference-stats', authenticateUser, (_req, res) => {
  res.status(410).json({ success: false, error: 'Preference pair statistics removed — the DPO fine-tuning pipeline was retired.' });
});

// POST /api/personality-profile/train-dpo — removed (DPO/fine-tuning stack deleted)
router.post('/train-dpo', authenticateUser, (_req, res) => {
  res.status(410).json({ success: false, error: 'DPO training removed — the fine-tuning pipeline was retired.' });
});

export default router;
