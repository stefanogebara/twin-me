/**
 * Cron: Meeting Prep
 * ===================
 * Runs every 30 minutes. Finds calendar events starting in 2-4 hours that
 * have external attendees and haven't been briefed yet, then generates a
 * Dimension-style pre-meeting briefing for each user.
 *
 * Schedule: *\/30 * * * * (every 30 minutes)
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { getValidAccessToken } from '../services/tokenRefreshService.js';
import { generateBriefing } from '../services/meetingPrep/meetingPrepService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronMeetingPrep');
const router = express.Router();

const LOOK_AHEAD_MIN_HOURS = 2;
const LOOK_AHEAD_MAX_HOURS = 4;

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

async function fetchUpcomingExternalEvents(userId) {
  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success) return [];

  const now = new Date();
  const minTime = new Date(now.getTime() + LOOK_AHEAD_MIN_HOURS * 3600000).toISOString();
  const maxTime = new Date(now.getTime() + LOOK_AHEAD_MAX_HOURS * 3600000).toISOString();

  const params = new URLSearchParams({
    timeMin: minTime,
    timeMax: maxTime,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '10',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
  );
  if (!res.ok) return [];

  const data = await res.json();
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  const userEmail = userRow?.email || '';
  const userDomain = userEmail.split('@')[1];

  return (data.items || []).filter(event => {
    const attendees = event.attendees || [];
    return attendees.some(
      a => a.email !== userEmail && !a.resource && (!userDomain || !a.email.endsWith(`@${userDomain}`))
    );
  });
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

    return res.json({ success: true, briefingsGenerated, errors, duration });
  } catch (err) {
    log.error('Meeting prep cron crashed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
