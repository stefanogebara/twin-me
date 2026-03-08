/**
 * Vercel Cron Job: Memory Archive
 *
 * Runs daily at 3am UTC. Archives old low-importance memories for users
 * with >5,000 total memories into user_memories_archive.
 *
 * Archive criteria (ALL must be true):
 *   - created_at < NOW() - INTERVAL '6 months'
 *   - importance_score <= 5
 *   - User has > 5,000 total memories
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    // Verify cron secret (timing-safe)
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    console.log('[Cron] memory-archive: starting run');
    const startTime = Date.now();

    // Find users with more than 5,000 memories (archive candidates)
    const { data: candidates, error: candidatesErr } = await supabaseAdmin.rpc(
      'get_users_with_many_memories',
      { p_min_count: 5001 }
    ).catch(() => ({ data: null, error: new Error('RPC not available, using fallback') }));

    let userIds = [];

    if (candidatesErr || !candidates) {
      // Fallback: query users with old low-importance memories directly
      const { data: rows, error: rowsErr } = await supabaseAdmin
        .from('user_memories')
        .select('user_id')
        .lt('created_at', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString())
        .lte('importance_score', 5);

      if (rowsErr) {
        console.error('[Cron] memory-archive: failed to fetch candidates:', rowsErr.message);
        return res.status(500).json({ error: 'Failed to fetch archive candidates' });
      }

      // Deduplicate user IDs
      userIds = [...new Set((rows || []).map(r => r.user_id))];
    } else {
      userIds = candidates.map(c => c.user_id);
    }

    console.log(`[Cron] memory-archive: processing ${userIds.length} candidate users`);

    let usersProcessed = 0;
    let totalArchived = 0;

    for (const userId of userIds) {
      const { data: archived, error: archiveErr } = await supabaseAdmin.rpc(
        'archive_old_memories',
        { p_user_id: userId }
      );

      if (archiveErr) {
        console.error(`[Cron] memory-archive: error for user ${userId}:`, archiveErr.message);
        continue;
      }

      const count = archived || 0;
      if (count > 0) {
        console.log(`[Cron] memory-archive: archived ${count} memories for user ${userId}`);
        totalArchived += count;
      }
      usersProcessed++;
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Cron] memory-archive: done. users=${usersProcessed}, archived=${totalArchived}, duration=${durationMs}ms`);

    res.json({ success: true, usersProcessed, totalArchived, durationMs });
  } catch (err) {
    console.error('[Cron] memory-archive: unexpected error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
