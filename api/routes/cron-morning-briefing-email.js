/**
 * Cron: Morning Briefing Email
 * =============================
 * Sends a personalized morning briefing email to beta users daily.
 *
 * Schedule: 0 11 * * * (daily at 11:00 UTC / 8:00 São Paulo)
 * Security: protected by CRON_SECRET Bearer token.
 *
 * Rules (from CLAUDE.md):
 * - maxDuration 60s — check conditions BEFORE LLM calls
 * - Rate limit: max 20 users per run to stay within timeout
 * - Skips users who signed up < 12 hours ago (wait for data)
 * - Skips users who unsubscribed from emails
 * - 20h cooldown per user to prevent duplicate sends
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { generateMorningBriefing, hasRecentBriefingEmail, recordBriefingEmailSent } from '../services/morningBriefingService.js';
import { sendMorningBriefing } from '../services/emailService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronMorningBriefingEmail');
const router = express.Router();

const MAX_USERS_PER_RUN = 20;

router.all('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // Auth check first (cheapest possible early return)
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Find eligible users: signed up > 12h ago, have email, not unsubscribed
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: eligibleUsers, error: queryErr } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, email_digest_unsubscribed, created_at')
      .not('email', 'is', null)
      .lte('created_at', twelveHoursAgo)
      .or('email_digest_unsubscribed.is.null,email_digest_unsubscribed.eq.false')
      .limit(100);

    if (queryErr) {
      log.error('Failed to query eligible users', { error: queryErr.message });
      await logCronExecution('morning-briefing-email', 'error', Date.now() - startTime, null, queryErr.message);
      return res.status(500).json({ success: false, error: 'Database query failed' });
    }

    if (!eligibleUsers?.length) {
      const elapsed = Date.now() - startTime;
      await logCronExecution('morning-briefing-email', 'success', elapsed, { sent: 0, reason: 'no_eligible_users' });
      return res.json({ success: true, sent: 0, skipped: 0, reason: 'no_eligible_users' });
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of eligibleUsers) {
      // Respect rate limit to stay within 60s maxDuration
      if (sent >= MAX_USERS_PER_RUN) {
        log.info('Rate limit reached, stopping', { sent, remaining: eligibleUsers.length - sent - skipped });
        break;
      }

      try {
        // Cooldown check BEFORE any LLM call (early return = free)
        const recentlySent = await hasRecentBriefingEmail(user.id);
        if (recentlySent) {
          skipped++;
          continue;
        }

        // Generate the briefing (may call LLM for users with enough data)
        const briefing = await generateMorningBriefing(user.id);

        // Send the email
        await sendMorningBriefing({
          toEmail: user.email,
          firstName: user.first_name || 'there',
          userId: user.id,
          briefing,
        });

        // Record for cooldown tracking
        await recordBriefingEmailSent(user.id);

        sent++;
      } catch (err) {
        errors++;
        log.error('Failed for user', { userId: user.id, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    const result = { sent, skipped, errors, eligibleUsers: eligibleUsers.length, elapsedMs: elapsed };

    log.info('Morning briefing email cron complete', result);
    await logCronExecution('morning-briefing-email', 'success', elapsed, result);

    return res.json({ success: true, ...result });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('morning-briefing-email', 'error', elapsed, null, err.message);
    log.error('Morning briefing email cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
