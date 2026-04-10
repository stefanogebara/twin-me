/**
 * Twin Intelligence compatibility routes.
 *
 * Keeps active frontend calls stable while TRIBE scaling routes are mounted
 * under both legacy and canonical prefixes.
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { getLatestFidelity, measureTwinFidelity } from '../services/twinFidelityService.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('TwinIntelligenceRoutes');

router.get('/fidelity', authenticateUser, async (req, res) => {
  try {
    const score = await getLatestFidelity(req.user.id);
    return res.json({
      success: true,
      data: score || null,
      message: score ? undefined : 'No fidelity measurement yet.',
    });
  } catch (error) {
    log.error('Fidelity fetch failed', { userId: req.user.id, error: error.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch fidelity score' });
  }
});

router.post('/fidelity', authenticateUser, async (req, res) => {
  try {
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
    return res.json({ success: true, data: result });
  } catch (error) {
    log.error('Fidelity measurement failed', { userId: req.user.id, error: error.message });
    return res.status(500).json({ success: false, error: 'Failed to measure twin fidelity' });
  }
});

router.get('/ica-axes', authenticateUser, async (req, res) => {
  try {
    const { data: latest, error: latestError } = await supabaseAdmin
      .from('personality_axes')
      .select('generated_at')
      .eq('user_id', req.user.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      log.warn('ICA axes latest lookup failed', { userId: req.user.id, error: latestError.message });
      return res.json({ success: true, data: { axes: [] } });
    }

    if (!latest?.generated_at) {
      return res.json({ success: true, data: { axes: [] } });
    }

    const { data: axes, error: axesError } = await supabaseAdmin
      .from('personality_axes')
      .select('axis_index, label, description, variance_explained, top_memory_contents, generated_at')
      .eq('user_id', req.user.id)
      .eq('generated_at', latest.generated_at)
      .order('axis_index', { ascending: true });

    if (axesError) {
      log.warn('ICA axes fetch failed', { userId: req.user.id, error: axesError.message });
      return res.json({ success: true, data: { axes: [] } });
    }

    return res.json({
      success: true,
      data: {
        axes: axes || [],
        generated_at: latest.generated_at,
      },
    });
  } catch (error) {
    log.error('ICA axes route failed', { userId: req.user.id, error: error.message });
    return res.json({ success: true, data: { axes: [] } });
  }
});

export default router;
