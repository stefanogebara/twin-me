/**
 * Cron: Inbox Intelligence
 * =========================
 * Runs daily at 10:05 UTC (after the morning briefing cache at 10:00).
 * Scans Gmail for unread email in the last 48h, scores and summarises
 * real emails, generates draft replies, and stores the result as a
 * proactive insight so it appears in the dashboard card and gets
 * delivered to the user's messaging channels.
 *
 * Schedule: 5 10 * * * (daily at 10:05 UTC)
 * Security: protected by CRON_SECRET Bearer token.
 * maxDuration: 60s
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { generateInboxBrief } from '../services/inboxIntelligenceService.js';
import { deliverInsight } from '../services/messageRouter.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronInboxIntelligence');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    if (await wasRecentlyRun('inbox-intelligence')) {
      return res.json({ success: true, processed: 0, reason: 'cooldown' });
    }

    // Users who have Gmail connected (platform_connections with google_gmail)
    const { data: gmailUsers } = await supabaseAdmin
      .from('platform_connections')
      .select('user_id')
      .eq('platform', 'google_gmail')
      .eq('status', 'connected');

    const userIds = (gmailUsers || []).map(u => u.user_id);

    if (userIds.length === 0) {
      await logCronExecution('inbox-intelligence', 'success', Date.now() - startTime, { processed: 0 });
      return res.json({ success: true, processed: 0, reason: 'no_gmail_users' });
    }

    let processed = 0;
    let skipped = 0;

    for (const userId of userIds) {
      try {
        // Per-user cooldown: skip if inbox brief already generated in last 20h
        const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from('proactive_insights')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('category', 'email_triage')
          .gte('created_at', cutoff);

        if ((count || 0) > 0) {
          skipped++;
          continue;
        }

        const inboxBrief = await generateInboxBrief(userId);
        if (!inboxBrief) {
          skipped++;
          continue;
        }

        const { data: insertedInsight } = await supabaseAdmin
          .from('proactive_insights')
          .insert({
            user_id: userId,
            insight: inboxBrief.message,
            urgency: 'medium',
            category: 'email_triage',
            delivered: false,
            metadata: {
              emails: inboxBrief.emails.map(e => ({
                id: e.id,
                from: e.from,
                subject: e.subject,
                summary: e.summary,
                draft: e.draft,
                score: e.score,
                category: e.category,
              })),
              count: inboxBrief.count,
            },
          })
          .select('id, insight, category, urgency')
          .single();

        if (insertedInsight) {
          try {
            await deliverInsight(userId, insertedInsight);
          } catch (deliverErr) {
            log.warn('Channel delivery failed', { userId, error: deliverErr.message });
          }
          // Mark delivered so cron-deliver-insights doesn't double-send
          await supabaseAdmin
            .from('proactive_insights')
            .update({ delivered: true, delivered_at: new Date().toISOString() })
            .eq('id', insertedInsight.id);
          processed++;
          log.info('Inbox brief generated and delivered', { userId, emailCount: inboxBrief.count });
        }
      } catch (err) {
        log.warn('Inbox intelligence failed for user', { userId, error: err.message });
        skipped++;
      }
    }

    const elapsed = Date.now() - startTime;
    await logCronExecution('inbox-intelligence', 'success', elapsed, { processed, skipped });

    return res.json({ success: true, processed, skipped, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('inbox-intelligence', 'error', elapsed, null, err.message);
    log.error('Inbox intelligence cron failed', { error: err.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error',
    });
  }
});

export default router;
