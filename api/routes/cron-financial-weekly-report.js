/**
 * Cron: Financial Weekly Report
 * ==============================
 * Sends the Financial-Emotional Twin weekly recap to users who uploaded a
 * bank statement in the last 30 days.
 *
 * Schedule: 0 11 * * 0  (Sunday 11:00 UTC = 8:00 São Paulo)
 * Security: CRON_SECRET Bearer token.
 *
 * Cost/timeout rules (CLAUDE.md):
 *   - maxDuration 60s — cap at 20 users per run
 *   - Eligible user = uploaded a transaction in the last 30 days + has email
 *   - 6-day cooldown per user (prevents double-send on cron retries)
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { buildWeeklyReport } from '../services/financialWeeklyReportService.js';
import { sendFinancialWeeklyReport } from '../services/emailService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronFinancialWeeklyReport');
const router = express.Router();

const MAX_USERS_PER_RUN = 20;
const COOLDOWN_DAYS = 6;

router.all('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Users who uploaded a transaction in last 30 days — the cohort that has
    // enough data for a meaningful report.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentUsers, error: usersErr } = await supabaseAdmin
      .from('user_transactions')
      .select('user_id')
      .gte('created_at', thirtyDaysAgo);

    if (usersErr) {
      log.error('users query failed', usersErr);
      return res.status(500).json({ error: usersErr.message });
    }

    const uniqueUserIds = [...new Set((recentUsers || []).map((r) => r.user_id))];
    log.info(`${uniqueUserIds.length} candidate users`);

    if (!uniqueUserIds.length) {
      await logCronExecution('financial-weekly-report', 'success', { duration_ms: Date.now() - startTime, users_checked: 0, emails_sent: 0 });
      return res.json({ success: true, users_checked: 0, emails_sent: 0 });
    }

    // Fetch profile + email for each
    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, email_unsubscribed_at')
      .in('id', uniqueUserIds.slice(0, MAX_USERS_PER_RUN));

    if (profileErr) {
      log.error('profiles query failed', profileErr);
      return res.status(500).json({ error: profileErr.message });
    }

    const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Last-sent check — stored in user_platform_data with data_type='financial_weekly_email'
    const { data: recentSends } = await supabaseAdmin
      .from('user_platform_data')
      .select('user_id, extracted_at')
      .eq('platform', 'twinme')
      .eq('data_type', 'financial_weekly_email')
      .gte('extracted_at', cooldownCutoff);

    const recentlyEmailed = new Set((recentSends || []).map((r) => r.user_id));

    const results = { checked: 0, skipped_unsub: 0, skipped_cooldown: 0, skipped_nodata: 0, skipped_noemail: 0, sent: 0, errors: 0 };

    for (const user of profiles || []) {
      results.checked++;

      if (user.email_unsubscribed_at) { results.skipped_unsub++; continue; }
      if (!user.email) { results.skipped_noemail++; continue; }
      if (recentlyEmailed.has(user.id)) { results.skipped_cooldown++; continue; }

      try {
        const report = await buildWeeklyReport(user.id);
        if (!report.hasData) {
          results.skipped_nodata++;
          continue;
        }

        await sendFinancialWeeklyReport({
          toEmail: user.email,
          firstName: user.first_name,
          report,
          userId: user.id,
        });

        // Record send to enforce cooldown
        await supabaseAdmin.from('user_platform_data').insert({
          user_id: user.id,
          platform: 'twinme',
          data_type: 'financial_weekly_email',
          raw_data: { window_start: report.windowStart, window_end: report.windowEnd, tx_count: report.txCount },
          extracted_at: new Date().toISOString(),
          processed: true,
        });

        results.sent++;
      } catch (err) {
        log.warn(`send failed for user ${user.id}: ${err.message}`);
        results.errors++;
      }
    }

    const duration = Date.now() - startTime;
    log.info('cron complete', { duration_ms: duration, ...results });

    await logCronExecution('financial-weekly-report', 'success', {
      duration_ms: duration,
      ...results,
    });

    return res.json({ success: true, duration_ms: duration, ...results });
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error('cron crashed', err);
    await logCronExecution('financial-weekly-report', 'error', {
      duration_ms: duration,
      error: err.message,
    });
    return res.status(500).json({ error: err.message });
  }
});

export default router;
