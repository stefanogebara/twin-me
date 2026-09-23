// api/routes/cron-email-digest.js
// Weekly digest — sends to all users with recent activity (not gated by subscription tier).
import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { sendWeeklyDigest } from '../services/emailService.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronEmailDigest');

const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();

  // Verify cron secret (timing-safe)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find users who have had memory activity in the last week
  const { data: activeUsers } = await supabaseAdmin
    .from('user_memories')
    .select('user_id')
    .gte('created_at', weekAgo)
    .limit(500);

  if (!activeUsers?.length) return res.json({ sent: 0 });

  // Dedupe user IDs
  const userIds = [...new Set(activeUsers.map(r => r.user_id))];

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      // Fetch user — skip if opted out or no email
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email, first_name, email_digest_unsubscribed')
        .eq('id', userId)
        .single();

      if (!user?.email || user.email_digest_unsubscribed) {
        skipped++;
        continue;
      }

      // Fetch top 3 reflections from the last week
      const { data: reflections } = await supabaseAdmin
        .from('user_memories')
        .select('content')
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .gte('created_at', weekAgo)
        .order('importance_score', { ascending: false })
        .limit(3);

      if (!reflections?.length) {
        // Try all-time top reflections if no recent ones
        const { data: fallback } = await supabaseAdmin
          .from('user_memories')
          .select('content')
          .eq('user_id', userId)
          .eq('memory_type', 'reflection')
          .order('importance_score', { ascending: false })
          .limit(3);

        if (!fallback?.length) { skipped++; continue; }
        reflections.push(...fallback);
      }

      // Count total new memories this week
      const { count: newMemories } = await supabaseAdmin
        .from('user_memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', weekAgo);

      // Resolves false on failure rather than throwing (Resend reports API
      // errors through { data, error }). `sent` is the only health signal
      // this cron emits — counting rejected sends in it would report a
      // fully broken digest as a fully successful run.
      const sentOk = await sendWeeklyDigest({
        toEmail: user.email,
        firstName: user.first_name || 'there',
        reflections: reflections.map(r => r.content),
        newMemories: newMemories || 0,
        userId,
      });

      if (sentOk) sent++;
      else {
        log.error('Weekly digest did not send', { userId });
        errors++;
      }
    } catch (err) {
      log.error('Failed for user', { userId, error: err.message });
      errors++;
    }
  }

  const elapsed = Date.now() - startTime;
  log.info('Digest run complete', { sent, skipped, errors });
  await logCronExecution('email-digest', 'success', elapsed, { sent, skipped, errors });
  res.json({ sent, skipped, errors });
});

export default router;
