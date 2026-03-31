/**
 * In-Silico Experiment API Routes
 * ================================
 * POST /api/in-silico                        — Score stimuli against personality axes
 * GET  /api/in-silico/validation/:experimentId — Fetch experiment + validation results
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { predictEngagement } from '../services/inSilicoEngine.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('InSilicoRoutes');

const MAX_STIMULI = 50;

// ─── POST /api/in-silico ───────────────────────────────────────────────

router.post('/in-silico', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { stimuli } = req.body;

    // Input validation
    if (!Array.isArray(stimuli) || stimuli.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'stimuli must be a non-empty array',
      });
    }

    if (stimuli.length > MAX_STIMULI) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_STIMULI} stimuli per request`,
      });
    }

    const invalidIndex = stimuli.findIndex(
      (s) => !s || typeof s.text !== 'string' || s.text.trim().length === 0
    );
    if (invalidIndex !== -1) {
      return res.status(400).json({
        success: false,
        error: `Invalid stimulus at index ${invalidIndex}: each item must have a non-empty "text" string`,
      });
    }

    // Score stimuli
    const result = await predictEngagement(userId, stimuli);

    if (result.error) {
      log.warn('Prediction failed', { userId, error: result.error });
      return res.status(500).json({ success: false, error: result.message });
    }

    // Store experiment in DB
    const { data: experiment, error: insertError } = await supabaseAdmin
      .from('in_silico_experiments')
      .insert({
        user_id: userId,
        stimuli_count: stimuli.length,
        axes_used: result.axesUsed,
        results: result.predictions,
        created_at: new Date().toISOString(),
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      log.warn('Failed to store experiment (non-fatal)', {
        userId,
        error: insertError.message,
      });
    }

    res.json({
      success: true,
      data: {
        experimentId: experiment?.id || null,
        predictions: result.predictions,
        axesUsed: result.axesUsed,
        stimuliCount: stimuli.length,
      },
    });
  } catch (error) {
    log.error('POST /in-silico failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to score stimuli' });
  }
});

// ─── GET /api/in-silico/validation/:experimentId ────────────────────────

router.get('/in-silico/validation/:experimentId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { experimentId } = req.params;

    if (!experimentId) {
      return res.status(400).json({ success: false, error: 'experimentId is required' });
    }

    const { data: experiment, error } = await supabaseAdmin
      .from('in_silico_experiments')
      .select('*')
      .eq('id', experimentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to fetch experiment', { experimentId, error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to fetch experiment' });
    }

    if (!experiment) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    res.json({ success: true, data: experiment });
  } catch (error) {
    log.error('GET /in-silico/validation failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch experiment' });
  }
});

export default router;
