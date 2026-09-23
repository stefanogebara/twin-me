/**
 * Twin Scaling & Fidelity API Routes
 * ====================================
 * Mounted under /api/twin and /api/tribe.
 *
 * POST /scaling-metrics — Trigger scaling measurement
 * GET  /scaling-metrics — Get historical metrics + fit
 * POST /fidelity        — Trigger fidelity measurement (rate-limited: 1/day)
 * GET  /fidelity        — Get latest fidelity score
 * GET  /ica-axes        — Get latest cached ICA axes, never rebuilds on read
 * POST /ica-axes        — Retired rebuild endpoint
 * POST /in-silico       — Retired engagement-prediction endpoint
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { measureScalingPoint, getScalingHistory } from '../services/scalingMetricsService.js';
import { measureTwinFidelity, getLatestFidelity } from '../services/twinFidelityService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('TwinScaling');

async function getCachedPersonalityAxes(userId) {
  const { data: cache, error: cacheError } = await supabaseAdmin
    .from('personality_axes_cache')
    .select('generated_at, n_components, n_memories_used, total_variance_explained')
    .eq('user_id', userId)
    .maybeSingle();

  if (cacheError) {
    log.warn('Personality axes cache lookup failed', { userId, error: cacheError.message });
  }

  let generatedAt = cache?.generated_at || null;
  if (!generatedAt) {
    const { data: latestAxis, error: latestError } = await supabaseAdmin
      .from('personality_axes')
      .select('generated_at')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      log.warn('Latest personality axis lookup failed', { userId, error: latestError.message });
    }

    generatedAt = latestAxis?.generated_at || null;
  }

  if (!generatedAt) {
    return {
      axes: [],
      cached: true,
      generated_at: null,
      n_components: 0,
      n_memories_used: 0,
      total_variance_explained: null,
    };
  }

  const { data: axes, error: axesError } = await supabaseAdmin
    .from('personality_axes')
    .select('axis_index, label, description, variance_explained, top_memory_contents, generated_at')
    .eq('user_id', userId)
    .eq('generated_at', generatedAt)
    .order('axis_index', { ascending: true });

  if (axesError) {
    log.warn('Personality axes fetch failed', { userId, error: axesError.message });
    return {
      axes: [],
      cached: true,
      generated_at: generatedAt,
      n_components: cache?.n_components || 0,
      n_memories_used: cache?.n_memories_used || 0,
      total_variance_explained: cache?.total_variance_explained || null,
    };
  }

  return {
    axes: axes || [],
    cached: true,
    generated_at: generatedAt,
    n_components: cache?.n_components || axes?.length || 0,
    n_memories_used: cache?.n_memories_used || 0,
    total_variance_explained: cache?.total_variance_explained || null,
  };
}

// ─── Scaling Metrics ──────────────────────────────────────────────────

router.post('/scaling-metrics', authenticateUser, async (req, res) => {
  try {
    const result = await measureScalingPoint(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Scaling measurement failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to measure scaling metrics' });
  }
});

router.get('/scaling-metrics', authenticateUser, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const history = await getScalingHistory(req.user.id, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    log.error('Scaling history fetch failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch scaling history' });
  }
});

// ─── Twin Fidelity ────────────────────────────────────────────────────

router.post('/fidelity', authenticateUser, async (req, res) => {
  try {
    // Rate limit: 1 measurement per user per 24 hours
    const existing = await getLatestFidelity(req.user.id);
    if (existing?.measured_at) {
      const hoursSince = (Date.now() - new Date(existing.measured_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        return res.status(429).json({
          success: false,
          error: `Fidelity measurement available once per 24 hours. Next available in ${Math.ceil(24 - hoursSince)} hours.`,
          data: existing,
        });
      }
    }

    const result = await measureTwinFidelity(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Fidelity measurement failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to measure twin fidelity' });
  }
});

router.get('/fidelity', authenticateUser, async (req, res) => {
  try {
    const score = await getLatestFidelity(req.user.id);
    if (!score) {
      return res.json({
        success: true,
        data: null,
        message: 'No fidelity measurement yet. POST /api/twin/fidelity to trigger one.',
      });
    }
    res.json({ success: true, data: score });
  } catch (error) {
    log.error('Fidelity fetch failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch fidelity score' });
  }
});

// --- Personality Axes (ICA, Phase B) ---

router.get('/ica-axes', authenticateUser, async (req, res) => {
  try {
    const result = await getCachedPersonalityAxes(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Personality axes fetch failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch personality axes' });
  }
});

router.post('/ica-axes', authenticateUser, async (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'personality_axes_rebuild_retired',
    message: 'ICA axes are read-only cached artifacts. Use soul signature layers for live personality updates.',
  });
});

// --- In-Silico Experimentation — retired ---
// replan-2026-06-10 cycle 4: the in-silico engine scored against ICA axes that
// were hardcoded to [] — a static prior wearing an engagement costume. Removed
// with the rest of the DPO/fine-tuning dead stack.

router.post('/in-silico', authenticateUser, (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'in_silico_retired',
    message: 'In-silico engagement prediction was retired. Use soul signature layers for personality insight.',
  });
});

export default router;
