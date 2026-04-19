/**
 * Identity API
 * ============
 * GET /api/identity/temporal-comparison
 *   Returns a "You then vs you now" comparison of the user's memory stream.
 *   Response: { available: boolean, then?: string, now?: string, generatedAt?: string, reason?: string }
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getTemporalComparison } from '../services/temporalComparisonService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Identity');

const router = express.Router();

router.get('/temporal-comparison', authenticateUser, async (req, res) => {
  try {
    const result = await getTemporalComparison(req.user.id);
    return res.json(result);
  } catch (err) {
    log.error('temporal-comparison error', { error: err });
    return res.status(500).json({ available: false, reason: 'Failed to generate comparison.' });
  }
});

export default router;
