/**
 * Chat Usage Routes
 *
 * Tracks monthly chat message usage for freemium gating.
 * Limits are plan-aware: Free=50, Plus=500, Pro=unlimited.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { getUserSubscription, getPlanLimits } from '../services/subscriptionService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ChatUsage');

const router = express.Router();

/**
 * Get the user's current monthly chat usage (plan-aware).
 *
 * Note: returns `limit: Infinity` for unlimited tiers (max plan). The
 * REST handler below normalizes this to `null` for JSON serialization;
 * pre-flight quota checks consume the raw Infinity value directly.
 */
async function getMonthlyUsage(userId) {
  if (!supabaseAdmin) return { used: 0, limit: 50, tier: 'free' };

  // Get user's plan
  const sub = await getUserSubscription(userId);
  const limits = getPlanLimits(sub.plan);
  const limit = limits.chatMessages;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Count user conversation memories this month from the memory stream.
  const { count, error: countErr } = await supabaseAdmin
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('memory_type', 'conversation')
    .eq('metadata->>role', 'user')
    .gte('created_at', monthStart.toISOString());

  if (countErr) throw countErr;

  const messageCount = count || 0;

  return {
    used: messageCount,
    limit,
    tier: sub.plan,
  };
}

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

export { getMonthlyUsage };
export default router;
