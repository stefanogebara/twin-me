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
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronMemoryArchive');

const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    // Verify cron secret (timing-safe)
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    log.info('Starting run');

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
        log.error('Failed to fetch candidates', { error: rowsErr.message });
        return res.status(500).json({ error: 'Failed to fetch archive candidates' });
      }

      // Deduplicate user IDs
      userIds = [...new Set((rows || []).map(r => r.user_id))];
    } else {
      userIds = candidates.map(c => c.user_id);
    }

    // Cap at 10 users per run to stay within 60s maxDuration. Remaining users are handled in the next daily run.
    const MAX_USERS_PER_RUN = 10;
    if (userIds.length > MAX_USERS_PER_RUN) {
      log.info('Capping users per run', { total: userIds.length, processing: MAX_USERS_PER_RUN });
      userIds = userIds.slice(0, MAX_USERS_PER_RUN);
    }

    log.info('Processing candidate users', { count: userIds.length });

    let usersProcessed = 0;
    let totalArchived = 0;

    for (const userId of userIds) {
      const { data: archived, error: archiveErr } = await supabaseAdmin.rpc(
        'archive_old_memories',
        { p_user_id: userId }
      );

      if (archiveErr) {
        log.error('Error for user', { userId, error: archiveErr.message });
        continue;
      }

      const count = archived || 0;
      if (count > 0) {
        log.info('Archived memories for user', { count, userId });
        totalArchived += count;
      }
      usersProcessed++;
    }

    const durationMs = Date.now() - startTime;
    log.info('Archive run complete', { usersProcessed, totalArchived, durationMs });

    await logCronExecution('memory-archive', 'success', durationMs, { usersProcessed, totalArchived });

    res.json({ success: true, usersProcessed, totalArchived, durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('memory-archive', 'error', durationMs, null, err.message);
    log.error('Unexpected error', { error: err.message });
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
