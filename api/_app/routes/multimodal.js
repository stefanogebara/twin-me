/**
 * Multimodal Profile Routes — TRIBE v2 Phase C
 * ==============================================
 * GET  /api/twin/multimodal-profile  — Cache-first fetch
 * POST /api/twin/multimodal-profile  — Force rebuild
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getMultimodalProfile, rebuildMultimodalProfile } from '../services/multimodalFusionService.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('MultimodalRoutes');

// GET /api/twin/multimodal-profile
router.get('/multimodal-profile', authenticateUser, async (req, res) => {
  try {
    const result = await getMultimodalProfile(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Multimodal profile fetch failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch multimodal profile' });
  }
});

// POST /api/twin/multimodal-profile — force rebuild
router.post('/multimodal-profile', authenticateUser, async (req, res) => {
  try {
    const result = await rebuildMultimodalProfile(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Multimodal profile rebuild failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to rebuild multimodal profile' });
  }
});

export default router;
