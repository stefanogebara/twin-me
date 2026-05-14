/**
 * Cron: Meeting Debrief
 * ======================
 * Runs every 30 minutes. Finds prepped meetings that ended 25-180 min ago
 * and don't have a debrief yet, then generates a post-meeting "twin's read"
 * for each (summary, likely topics, probable action items, follow-ups,
 * relationship notes).
 *
 * Pairs with cron-meeting-prep: prep runs BEFORE the meeting, debrief runs
 * AFTER. Together they're the meeting-prep agent's full loop.
 *
 * Schedule: *\/30 * * * * (every 30 minutes)
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { generateDebrief, findDebriefCandidates } from '../services/meetingPrep/meetingDebriefService.js';
import { createLogger } from '../services/logger.js';
import { logCronExecution } from '../services/cronLogger.js';

const log = createLogger('CronMeetingDebrief');
const router = express.Router();

async function getActiveUsers() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('user_id')
    .gte('created_at', weekAgo)
    .limit(100);

  if (!data) return [];
  return [...new Set(data.map((r) => r.user_id))];
}

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const userIds = await getActiveUsers();
    log.info('Meeting debrief cron started', { users: userIds.length });

    let debriefsGenerated = 0;
    let errors = 0;

    for (const userId of userIds) {
      try {
        const candidates = await findDebriefCandidates(userId);
        for (const row of candidates) {
          const result = await generateDebrief(userId, row);
          if (result) debriefsGenerated++;
        }
      } catch (err) {
        log.warn('Meeting debrief failed for user', { userId, error: err.message });
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    log.info('Meeting debrief cron complete', { debriefsGenerated, errors, duration });

    await logCronExecution('meeting-debrief', 'success', duration, {
      users: userIds.length,
      debriefsGenerated,
      errors,
    });

    res.json({ success: true, debriefsGenerated, errors, duration });
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error('Meeting debrief cron crashed', { error: err.message });
    await logCronExecution('meeting-debrief', 'error', duration, { error: err.message }).catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
