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
    // Use try/catch around await — supabase query builders are NOT Promises and have no .catch()
    let candidates = null;
    let candidatesErr = null;
    try {
      const rpcResult = await supabaseAdmin.rpc(
        'get_users_with_many_memories',
        { p_min_count: 5001 }
      );
      candidates = rpcResult.data;
      candidatesErr = rpcResult.error;
    } catch (rpcThrow) {
      // RPC threw (e.g. function missing on DB). Log with full context, then use fallback.
      log.warn('RPC get_users_with_many_memories threw, falling back to direct query', {
        cron: 'memory-archive',
        minCount: 5001,
        errorMessage: rpcThrow.message,
        errorStack: rpcThrow.stack,
      });
      candidatesErr = rpcThrow;
    }

    let userIds = [];

    if (candidatesErr || !candidates) {
      // Fallback: query users with old low-importance memories directly
      const { data: rows, error: rowsErr } = await supabaseAdmin
        .from('user_memories')
        .select('user_id')
        .lt('created_at', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString())
        .lte('importance_score', 5);

      if (rowsErr) {
        log.error('Failed to fetch candidates', {
          cron: 'memory-archive',
          error: rowsErr.message,
          stack: rowsErr.stack,
          code: rowsErr.code,
        });
        throw new Error(`memory-archive: failed to fetch candidates: ${rowsErr.message}`);
      }

      // Deduplicate user IDs
      userIds = [...new Set((rows || []).map(r => r.user_id))];
    } else {
      userIds = candidates.map(c => c.user_id);
    }

    log.info('Processing candidate users', { count: userIds.length });

    let usersProcessed = 0;
    let totalArchived = 0;
    const userErrors = [];

    for (const userId of userIds) {
      try {
        const { data: archived, error: archiveErr } = await supabaseAdmin.rpc(
          'archive_old_memories',
          { p_user_id: userId }
        );

        if (archiveErr) {
          log.error('archive_old_memories returned error', {
            cron: 'memory-archive',
            userId,
            error: archiveErr.message,
            code: archiveErr.code,
            details: archiveErr.details,
          });
          userErrors.push({ userId, error: archiveErr.message });
          continue;
        }

        const count = archived || 0;
        if (count > 0) {
          log.info('Archived memories for user', { count, userId });
          totalArchived += count;
        }
        usersProcessed++;
      } catch (perUserErr) {
        log.error('archive_old_memories threw for user', {
          cron: 'memory-archive',
          userId,
          error: perUserErr.message,
          stack: perUserErr.stack,
        });
        userErrors.push({ userId, error: perUserErr.message });
      }
    }

    const durationMs = Date.now() - startTime;
    const errorCount = userErrors.length;
    log.info('Archive run complete', { usersProcessed, totalArchived, errorCount, durationMs });

    // If any per-user errors occurred, record as partial-success with context so it surfaces in dashboards
    const status = errorCount > 0 ? 'error' : 'success';
    await logCronExecution(
      'memory-archive',
      status,
      durationMs,
      { usersProcessed, totalArchived, errorCount, userErrors: userErrors.slice(0, 20) },
      errorCount > 0 ? `memory-archive: ${errorCount} per-user failures` : null
    );

    res.json({ success: errorCount === 0, usersProcessed, totalArchived, errorCount, durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    log.error('memory-archive fatal error', {
      cron: 'memory-archive',
      error: err.message,
      stack: err.stack,
      durationMs,
    });
    await logCronExecution('memory-archive', 'error', durationMs, null, `${err.message}\n${err.stack}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
