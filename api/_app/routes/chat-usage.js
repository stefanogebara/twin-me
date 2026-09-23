/**
 * Chat Usage Routes
 *
 * Thin HTTP wrapper around getMonthlyUsage. The actual business logic and
 * the function used by pre-flight checks live in subscriptionService.js so
 * imports of the function don't pull in the route file. (Audit M3.)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getMonthlyUsage } from '../services/subscriptionService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ChatUsage');

const router = express.Router();

/**
 * GET /api/chat/usage
 * Returns current monthly chat usage for the authenticated user.
 *
 * Audit bug C2 (2026-05-12): JSON.stringify converts Infinity to null, which
 * leaks into the UI as "35/ messages used" with an empty denominator. For
 * unlimited tiers we explicitly emit `unlimited: true` and `limit: null` so
 * the client can render "X messages" without a broken fraction.
 */
router.get('/usage', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const usage = await getMonthlyUsage(userId);
    const unlimited = usage.limit === Infinity;

    return res.json({
      success: true,
      used: usage.used,
      limit: unlimited ? null : usage.limit,
      tier: usage.tier,
      unlimited,
      remaining: unlimited ? null : Math.max(0, usage.limit - usage.used),
      reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch usage' });
  }
});

export default router;
