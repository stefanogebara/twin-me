/**
 * Personality Profile API
 *
 * GET  /api/personality-profile          — Current profile (strips embedding)
 * POST /api/personality-profile/rebuild — Force rebuild
 * GET  /api/personality-profile/drift   — Check drift status
 * GET  /api/personality-profile/history — Assessment history
 * POST /api/personality-profile/train-dpo — Start DPO fine-tuning job
 * GET  /api/personality-profile/preference-stats — Preference pair statistics
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getProfile, buildProfile } from '../services/personalityProfileService.js';
import { checkDrift } from '../services/personalityDriftService.js';
import { getPersonalityHistory } from '../services/personalityEvaluationService.js';
import { supabaseAdmin } from '../services/database.js';
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

// POST /api/personality-profile/train-dpo — start DPO fine-tuning job
router.post('/train-dpo', authenticateUser, async (req, res) => {
  try {
    // Check minimum preference pairs
    const { count, error: countErr } = await supabaseAdmin
      .from('preference_pairs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (countErr) throw countErr;
    if (count < 200) {
      return res.json({
        success: false,
        error: `Need at least 200 preference pairs for DPO training (have ${count}).`,
        currentCount: count,
      });
    }

    // Export DPO JSONL
    const { filePath, stats } = await exportDPOTrainingData(req.user.id);
    if (!filePath) {
      return res.json({ success: false, error: 'No preference pairs to export.' });
    }

    // Create DPO fine-tune job
    const result = await createFinetune(req.user.id, filePath, {
      trainingMethod: 'dpo',
      suffix: 'twinme-dpo',
    });

    res.json({ success: true, ...result, stats });
  } catch (err) {
    log.error('train-dpo error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to start DPO training.' });
  }
});

// GET /api/personality-profile/preference-stats — preference pair statistics
router.get('/preference-stats', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('preference_pairs')
      .select('id, similarity_gap, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const pairs = data || [];
    const avgGap = pairs.length > 0
      ? pairs.reduce((sum, p) => sum + p.similarity_gap, 0) / pairs.length
      : 0;

    res.json({
      success: true,
      count: pairs.length,
      avgSimilarityGap: Math.round(avgGap * 10000) / 10000,
      dateRange: pairs.length > 0
        ? { from: pairs[0].created_at, to: pairs[pairs.length - 1].created_at }
        : null,
      readyForDPO: pairs.length >= 200,
    });
  } catch (err) {
    log.error('preference-stats error', { error: err });
    res.status(500).json({ success: false, error: 'Failed to fetch preference stats.' });
  }
});

export default router;
