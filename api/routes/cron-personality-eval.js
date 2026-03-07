/**
 * Cron: Weekly Personality Evaluation
 * ====================================
 * Runs Sunday 4am — evaluates personality for active users.
 * Batch size: 5 users per run, max 10 total.
 *
 * Schedule in vercel.json: "0 4 * * 0"
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { evaluatePersonality } from '../services/personalityEvaluationService.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';

const router = express.Router();

const BATCH_SIZE = 5;
const MAX_USERS = 10;

router.post('/', async (req, res) => {
  // Verify cron secret (timing-safe)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const startTime = Date.now();
  const stats = { evaluated: 0, skipped: 0, errors: [] };

  try {
    // Find active users with enough memories who haven't been assessed this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: activeUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(MAX_USERS * 2); // Over-fetch to account for skips

    if (!activeUsers?.length) {
      return res.json({ success: true, message: 'No active users', ...stats });
    }

    // Filter out users already assessed this week
    const { data: recentAssessments } = await supabaseAdmin
      .from('personality_assessments')
      .select('user_id')
      .gt('created_at', weekAgo);

    const assessedUserIds = new Set((recentAssessments || []).map(a => a.user_id));
    const eligibleUsers = activeUsers.filter(u => !assessedUserIds.has(u.id));

    // Process in batches
    const usersToProcess = eligibleUsers.slice(0, MAX_USERS);

    for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
      const batch = usersToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(user => evaluatePersonality(user.id))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          stats.evaluated++;
        } else if (result.status === 'rejected') {
          stats.errors.push(result.reason?.message || 'Unknown error');
        } else {
          stats.skipped++;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Cron] personality-eval: ${stats.evaluated} evaluated, ${stats.skipped} skipped in ${durationMs}ms`);

    res.json({ success: true, ...stats, durationMs });
  } catch (err) {
    console.error('[Cron] personality-eval error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
