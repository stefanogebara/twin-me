/**
 * Cron: Relationships Agent
 * =========================
 * Daily scan for Gmail-connected users to find people they haven't replied
 * to (threads where the last message is from someone else and is older than
 * 3 days). One proactive insight per surfaced person, rendered by the
 * existing InsightsFeed under category='relationship_followup'.
 *
 * Schedule: 10 10 * * * (daily 10:10 UTC, 5 min after inbox cron)
 * Security: CRON_SECRET Bearer token.
 * maxDuration: 60s
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { findUnansweredThreads } from '../services/relationshipsService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronRelationships');
const router = express.Router();

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    if (await wasRecentlyRun('relationships')) {
      return res.json({ success: true, processed: 0, reason: 'cooldown' });
    }

    // Optional ?userId override for manual probes (still requires CRON_SECRET).
    const userIdOverride = typeof req.query?.userId === 'string' ? req.query.userId : null;
    let userIds;
    if (userIdOverride) {
      userIds = [userIdOverride];
    } else {
      const { data: gmailUsers } = await supabaseAdmin
        .from('platform_connections')
        .select('user_id')
        .eq('platform', 'google_gmail')
        .eq('status', 'connected');
      userIds = (gmailUsers || []).map(u => u.user_id);
    }

    if (!userIds.length) {
      await logCronExecution('relationships', 'success', Date.now() - startTime, { processed: 0 });
      return res.json({ success: true, processed: 0, reason: 'no_gmail_users' });
    }

    let processed = 0;
    let skipped = 0;

    for (const userId of userIds) {
      try {
        const result = await findUnansweredThreads(userId);
        if (result.status !== 'ok' || !result.relationships.length) {
          skipped++;
          continue;
        }

        // Per-user 24h cooldown via existing rows in same window. Same upsert
        // strategy as inbox refresh: if today already has a relationship_followup
        // brief for this user, update the metadata instead of inserting (the
        // trg_insight_cooldown DB trigger blocks repeat inserts silently).
        const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabaseAdmin
          .from('proactive_insights')
          .select('id')
          .eq('user_id', userId)
          .eq('category', 'relationship_followup')
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // We want one insight per relationship surfaced today, so insert each.
        // To avoid the cooldown trigger killing the second+ inserts, we fold
        // them into a single row whose metadata.relationships[] holds them all.
        const top = result.relationships[0];
        const summaryLines = result.relationships.map((r, i) =>
          `${i + 1}. ${r.name} — ${r.thread_count} message${r.thread_count > 1 ? 's' : ''} unanswered for ${r.days_unanswered}d`
        );
        const insightText = [
          `${result.relationships.length} ${result.relationships.length === 1 ? 'person is' : 'people are'} waiting on you:`,
          '',
          ...summaryLines,
        ].join('\n');

        const metadata = {
          relationships: result.relationships,
          count: result.relationships.length,
        };

        let savedId = null;

        if (existing?.id) {
          const { data: updated, error: updateErr } = await supabaseAdmin
            .from('proactive_insights')
            .update({ insight: insightText, metadata, urgency: 'medium' })
            .eq('id', existing.id)
            .eq('user_id', userId)
            .select('id')
            .single();
          if (updateErr || !updated) {
            log.warn('Update failed, skipping user', { userId, error: updateErr?.message });
            skipped++;
            continue;
          }
          savedId = updated.id;
        } else {
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('proactive_insights')
            .insert({
              user_id: userId,
              insight: insightText,
              urgency: 'medium',
              category: 'relationship_followup',
              delivered: false,
              nudge_action: top
                ? `Reply to ${top.name} — they've waited ${top.days_unanswered} days.`
                : null,
              metadata,
            })
            .select('id')
            .single();
          if (insertErr || !inserted) {
            log.warn('Insert failed, skipping user', { userId, error: insertErr?.message });
            skipped++;
            continue;
          }
          savedId = inserted.id;
        }

        if (savedId) {
          processed++;
          log.info('Relationship insight saved', {
            userId,
            count: result.relationships.length,
            top: top?.name,
          });
        }
      } catch (err) {
        log.warn('Relationships failed for user', { userId, error: err.message });
        skipped++;
      }
    }

    const elapsed = Date.now() - startTime;
    await logCronExecution('relationships', 'success', elapsed, { processed, skipped });
    return res.json({ success: true, processed, skipped, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('relationships', 'error', elapsed, null, err.message);
    log.error('Relationships cron failed', { error: err.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error',
    });
  }
});

export default router;
