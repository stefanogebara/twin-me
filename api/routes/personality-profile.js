/**
 * Personality Profile API
 *
 * GET  /api/personality-profile                 — Current profile (strips embedding)
 * POST /api/personality-profile/rebuild        — Force rebuild
 * GET  /api/personality-profile/drift          — Check drift status
 * GET  /api/personality-profile/history        — Assessment history
 * GET  /api/personality-profile/preference-stats — DPO preference pair statistics
 * POST /api/personality-profile/train-dpo      — Start DPO contrastive training
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getProfile, buildProfile } from '../services/personalityProfileService.js';
import { checkDrift } from '../services/personalityDriftService.js';
import { getPersonalityHistory } from '../services/personalityEvaluationService.js';
import { getPreferenceStats } from '../services/finetuning/preferenceCollector.js';
import { exportDPOTrainingData } from '../services/finetuning/dpoDataExporter.js';
import { createFinetune } from '../services/finetuning/finetuneManager.js';
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

// GET /api/personality-profile/preference-stats — preference pair statistics
router.get('/preference-stats', authenticateUser, async (req, res) => {
  try {
    const stats = await getPreferenceStats(req.user.id);
    res.json({ success: true, ...stats });
  } catch (err) {
    log.error('preference-stats error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to fetch preference stats.' });
  }
});

// POST /api/personality-profile/train-dpo — start DPO training
router.post('/train-dpo', authenticateUser, async (req, res) => {
  try {
    const minPairs = 200;
    const exported = await exportDPOTrainingData(req.user.id, minPairs);

    if (exported.error) {
      return res.json({
        success: false,
        error: exported.error,
        pairsAvailable: exported.count,
        pairsRequired: minPairs,
      });
    }

    // Write JSONL to temp file for upload
    const fs = await import('fs');
    const path = await import('path');
    const dataDir = path.resolve('data/training');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().split('T')[0];
    const filePath = path.join(dataDir, `dpo-${req.user.id.slice(0, 8)}-${timestamp}.jsonl`);
    fs.writeFileSync(filePath, exported.lines.join('\n') + '\n', 'utf8');

    const job = await createFinetune(req.user.id, filePath, {
      trainingMethod: 'dpo',
      suffix: 'twinme-dpo',
    });

    res.json({
      success: true,
      jobId: job.jobId,
      status: job.status,
      pairsUsed: exported.count,
    });
  } catch (err) {
    log.error('train-dpo error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to start DPO training.' });
  }
});

export default router;
