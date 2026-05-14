/**
 * Cron: Meeting Prep
 * ===================
 * Runs every 30 minutes. Finds calendar events starting in the next 26
 * hours that have external attendees and haven't been briefed yet, then
 * generates a Dimension-style pre-meeting briefing for each user.
 *
 * The calendar-scan logic (fetchUpcomingExternalEvents) lives in
 * meetingPrepService.js so the on-demand /api/meeting-briefings/scan
 * endpoint can reuse the exact same window + filter.
 *
 * Schedule: *\/30 * * * * (every 30 minutes)
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { generateBriefing, fetchUpcomingExternalEvents } from '../services/meetingPrep/meetingPrepService.js';
import { createLogger } from '../services/logger.js';
import { logCronExecution } from '../services/cronLogger.js';

const log = createLogger('CronMeetingPrep');
const router = express.Router();

async function getActiveUsers() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('user_id')
    .gte('created_at', weekAgo)
    .limit(100);

  if (!data) return [];
  return [...new Set(data.map(r => r.user_id))];
}

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const userIds = await getActiveUsers();
    log.info('Meeting prep cron started', { users: userIds.length });

    let briefingsGenerated = 0;
    let errors = 0;

    for (const userId of userIds) {
      try {
        const events = await fetchUpcomingExternalEvents(userId);
        for (const event of events) {
          const result = await generateBriefing(userId, event);
          if (result) briefingsGenerated++;
        }
      } catch (err) {
        log.warn('Meeting prep failed for user', { userId, error: err.message });
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    log.info('Meeting prep cron complete', { briefingsGenerated, errors, duration });

    await logCronExecution('meeting-prep', 'success', duration, {
      users: userIds.length,
      briefingsGenerated,
      errors,
    });

    return res.json({ success: true, briefingsGenerated, errors, duration });
  } catch (err) {
    log.error('Meeting prep cron crashed', { error: err.message });
    await logCronExecution('meeting-prep', 'error', Date.now() - startTime, null, err.message);
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
