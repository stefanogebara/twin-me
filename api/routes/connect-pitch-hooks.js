/**
 * GET /api/connect/pitch-hooks
 * ============================
 * Returns personalized one-liner hooks for unconnected platform tiles on /connect.
 * Shape: { success: true, hooks: { [platformId]: string } }
 * Unknown / no-hook platforms are absent — frontend falls back to generic copy.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getPitchHooks } from '../services/connectPitchHooks.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ConnectPitchHooksRoute');
const router = express.Router();

router.get('/pitch-hooks', authenticateUser, async (req, res) => {
  try {
    const hooks = await getPitchHooks(req.user.id);
    return res.json({ success: true, hooks });
  } catch (err) {
    log.error('pitch-hooks error:', err.message);
    return res.json({ success: true, hooks: {} }); // never block the page
  }
});

export default router;
