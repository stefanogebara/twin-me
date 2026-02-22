/**
 * Chat Usage Routes
 *
 * Tracks monthly chat message usage for freemium gating.
 * Uses twin_messages table to count user messages per month.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

const FREE_TIER_LIMIT = 100; // messages per month

/**
 * Get the user's current monthly chat usage
 */
async function getMonthlyUsage(userId) {
  if (!supabaseAdmin) return { used: 0, limit: FREE_TIER_LIMIT, tier: 'free' };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Step 1: Get user's conversation IDs
  const { data: convos, error: convosErr } = await supabaseAdmin
    .from('twin_conversations')
    .select('id')
    .eq('user_id', userId);

  if (convosErr) throw convosErr;

  if (!convos || convos.length === 0) {
    return { used: 0, limit: FREE_TIER_LIMIT, tier: 'free' };
  }

  // Step 2: Count user messages in those conversations this month
  const convoIds = convos.map(c => c.id);
  const { count, error: countErr } = await supabaseAdmin
    .from('twin_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', monthStart.toISOString())
    .in('conversation_id', convoIds);

  if (countErr) throw countErr;

  return {
    used: count || 0,
    limit: FREE_TIER_LIMIT,
    tier: 'free'
  };
}

/**
 * GET /api/chat/usage
 * Returns current monthly chat usage for the authenticated user
 */
router.get('/usage', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const usage = await getMonthlyUsage(userId);

    return res.json({
      success: true,
      ...usage,
      remaining: Math.max(0, usage.limit - usage.used),
      reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    });
  } catch (error) {
    console.error('[Chat Usage] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch usage' });
  }
});

export { getMonthlyUsage, FREE_TIER_LIMIT };
export default router;
