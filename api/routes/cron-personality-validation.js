/**
 * Cron: Personality Anchor Validation
 * ====================================
 * Weekly on Sundays at 3am UTC. Triggers personality validation
 * for all users with core_memory_blocks to detect drift from
 * the immutable soul signature anchor.
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronPersonalityValidation');
const router = express.Router();

router.post('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Get all users with core_memory_blocks (distinct user_ids)
    const { data: usersWithBlocks } = await supabaseAdmin
      .from('core_memory_blocks')
      .select('user_id')
      .eq('block_name', 'soul_signature');

    const uniqueUserIds = [...new Set((usersWithBlocks || []).map(u => u.user_id))];

    let triggered = 0;
    for (const userId of uniqueUserIds) {
      try {
        await inngest.send({ name: EVENTS.PERSONALITY_VALIDATION, data: { userId } });
        triggered++;
      } catch (err) {
        log.warn('Failed to trigger personality validation', { userId, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    log.info('Personality validation cron complete', { users: uniqueUserIds.length, triggered, elapsedMs: elapsed });

    await logCronExecution('personality-validation', 'success', elapsed, { users: uniqueUserIds.length, triggered });

    return res.json({ success: true, users: uniqueUserIds.length, triggered, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('personality-validation', 'error', elapsed, null, err.message);
    log.error('Cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
