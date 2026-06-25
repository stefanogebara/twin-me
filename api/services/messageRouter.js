/**
 * Message Router — Unified Insight Delivery Across Channels
 * ===========================================================
 * Routes proactive insights to all enabled delivery channels per user.
 * Channel-agnostic: supports web (existing), Telegram, push, and
 * future channels (WhatsApp, SMS) without changing skill code.
 *
 * Each skill just inserts into proactive_insights — the router handles delivery.
 */

import { sendInsight as sendTelegramInsight } from './telegramService.js';
import { sendWhatsAppInsight } from './whatsappService.js';
import { sendPushToUser } from './pushNotificationService.js';
import { sendWebPush } from './webPushService.js';
import { sendInsightNotification } from './emailService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

// Map insight category → friendly push notification title
const PUSH_TITLES = {
  briefing: 'Your morning briefing',
  evening_recap: 'Evening recap',
  music_mood_match: 'Music suggestion',
  email_triage: 'Email update',
  email_draft: 'Email draft ready',
  nudge: 'A little nudge',
  trend: 'Something I noticed',
  anomaly: 'Heads up',
  celebration: 'Worth celebrating',
  concern: 'Checking in',
  goal_progress: 'Goal update',
  goal_suggestion: 'New goal idea',
  suggestion: 'Your twin has a thought',
  reminder: 'Reminder',
  meeting_prep: 'Meeting briefing ready',
};

const log = createLogger('MessageRouter');

/**
 * Get all enabled messaging channels for a user.
 * @returns {Array<{ channel: string, channel_id: string, preferences: object }>}
 */
export async function getUserChannels(userId) {
  const { data, error } = await supabaseAdmin
    .from('messaging_channels')
    .select('channel, channel_id, is_enabled, preferences')
    .eq('user_id', userId)
    .eq('is_enabled', true);

  if (error) {
    log.warn('Failed to fetch user channels', { userId, error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Deliver a proactive insight to all enabled channels for a user.
 * Returns summary of delivery results.
 */
export async function deliverInsight(userId, insight) {
  const channels = await getUserChannels(userId);
  if (channels.length === 0) return { delivered: 0, channels: [] };

  const results = [];

  for (const ch of channels) {
    // Check quiet hours (preferences.quiet_hours = [startHour, endHour])
    if (ch.preferences?.quiet_hours) {
      const [start, end] = ch.preferences.quiet_hours;
      const hour = new Date().getUTCHours();
      if (start > end ? (hour >= start || hour < end) : (hour >= start && hour < end)) {
        results.push({ channel: ch.channel, skipped: true, reason: 'quiet_hours' });
        continue;
      }
    }

    // Check category filter (preferences.categories = ['briefing', 'reminder', ...])
    if (ch.preferences?.categories?.length > 0) {
      if (!ch.preferences.categories.includes(insight.category)) {
        results.push({ channel: ch.channel, skipped: true, reason: 'category_filtered' });
        continue;
      }
    }

    try {
      if (ch.channel === 'telegram') {
        const result = await sendTelegramInsight(ch.channel_id, insight);
        results.push({ channel: 'telegram', ...result });
      } else if (ch.channel === 'whatsapp') {
        const result = await sendWhatsAppInsight(ch.channel_id, insight);
        results.push({ channel: 'whatsapp', ...result });
      }
    } catch (err) {
      log.warn('Channel delivery failed', { channel: ch.channel, userId, error: err.message });
      results.push({ channel: ch.channel, success: false, error: err.message });
    }
  }

  // Web push — browser notifications (Chrome, Firefox, Edge). No app needed.
  try {
    const webPushSent = await sendWebPush(userId, {
      title: PUSH_TITLES[insight.category] || 'Your twin noticed something',
      body: (insight.insight || '').substring(0, 120),
      url: '/talk-to-twin',
      tag: `insight-${insight.id}`,
      insightId: insight.id,
      category: insight.category,
    });
    if (webPushSent > 0) {
      results.push({ channel: 'web_push', success: true, sent: webPushSent });
    }
  } catch (err) {
    if (!err.message?.includes('not configured')) {
      log.warn('Web push delivery failed', { userId, error: err.message });
    }
  }

  // Mobile push notification — Expo (iOS/Android). Requires device token registration.
  // Tokens live in device_tokens table (registered by mobile app)
  try {
    const pushResult = await sendPushToUser(userId, {
      title: PUSH_TITLES[insight.category] || 'Your twin noticed something',
      body: (insight.insight || '').substring(0, 120),
      data: { type: 'proactive_insight', category: insight.category, insightId: insight.id },
      notificationType: 'insight',
    });
    if (pushResult?.length > 0) {
      results.push({ channel: 'push', success: true, tickets: pushResult.length });
    }
  } catch (err) {
    // Non-fatal — user may not have mobile app installed
    if (!err.message?.includes('No device tokens')) {
      log.warn('Push delivery failed', { userId, error: err.message });
    }
  }

  const delivered = results.filter(r => r.success).length;
  if (delivered > 0) {
    log.info('Insight delivered to channels', { userId, delivered, total: channels.length });
  }

  return { delivered, channels: results };
}

/**
 * Deliver all undelivered insights for all users with messaging channels.
 * Called by cron every 5 minutes.
 * Global cap of 50 deliveries per run to avoid Vercel 120s timeout.
 */
const MAX_DELIVERIES_PER_RUN = 50;
const EMAIL_COOLDOWN_HOURS = 24;

// audit-2026-05-27 task #12: after this many attempts with zero successful
// channel sends, give up on the row (set delivery_failed_at). Cron runs
// hourly, so 3 attempts = ~3-hour retry window. Prevents indefinite spam
// when a channel is structurally broken (e.g. token expired, number invalid).
const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Group batched pending insights by user, capping each user to `perUserCap`
 * rows per run (preserves the prior anti-spam limit). Input is assumed ordered
 * oldest-first; insertion order is preserved so the returned Map iterates users
 * by their oldest pending insight.
 * @param {Array<{user_id: string}>} rows
 * @param {number} perUserCap
 * @returns {Map<string, Array>}
 */
export function groupPendingByUser(rows, perUserCap = 5) {
  const byUser = new Map();
  for (const row of rows || []) {
    const list = byUser.get(row.user_id) || [];
    if (list.length < perUserCap) {
      list.push(row);
      byUser.set(row.user_id, list);
    }
  }
  return byUser;
}

/**
 * Attempt email delivery of batched insights for a single user.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * Checks:
 * 1. User has email and has not unsubscribed
 * 2. No email_notification_sent marker within the cooldown window (unless high urgency)
 * 3. Collects up to 3 recent delivered-but-not-emailed insights
 */
async function tryEmailDelivery(userId, recentInsights) {
  try {
    // 1. Fetch user — skip if opted out or no email
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('email, first_name, email_digest_unsubscribed')
      .eq('id', userId)
      .single();

    if (userErr || !user?.email || user.email_digest_unsubscribed) return;

    const hasHighUrgency = recentInsights.some(i => i.urgency === 'high');

    // 2. Check cooldown — look for a recent email_notification_sent marker
    const cooldownCutoff = new Date(Date.now() - EMAIL_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentEmail } = await supabaseAdmin
      .from('proactive_insights')
      .select('id')
      .eq('user_id', userId)
      .eq('category', 'email_notification_sent')
      .gte('created_at', cooldownCutoff)
      .limit(1);

    if (recentEmail?.length > 0 && !hasHighUrgency) return; // Cooldown active, no high urgency bypass

    // 3. Collect up to 3 insights to email (from the batch just processed)
    //    Filter out tracking markers and system categories
    const emailableInsights = recentInsights
      .filter(i => i.category !== 'email_notification_sent' && i.insight)
      .slice(0, 3);

    if (emailableInsights.length === 0) return;

    // 4. Send email (fire-and-forget, don't await in caller)
    await sendInsightNotification({
      toEmail: user.email,
      firstName: user.first_name,
      userId,
      insights: emailableInsights,
    });

    // 5. Insert cooldown marker (system marker — excluded from eval/display)
    await supabaseAdmin.from('proactive_insights').insert({
      user_id: userId,
      insight: `Email sent with ${emailableInsights.length} insight${emailableInsights.length !== 1 ? 's' : ''}`,
      category: 'email_notification_sent',
      urgency: 'low',
      delivered: true,
      delivered_at: new Date().toISOString(),
      metadata: { is_system_marker: true },
    });

    log.info('Email insight notification sent', { userId, count: emailableInsights.length });
  } catch (err) {
    // Non-fatal — email is additive, never blocks push/telegram delivery
    log.warn('Email insight delivery failed', { userId, error: err.message });
  }
}

export async function deliverPendingInsights() {
  // Get all users with enabled messaging channels OR registered push tokens
  const [{ data: channelUsers }, { data: pushUsers }] = await Promise.all([
    supabaseAdmin.from('messaging_channels').select('user_id').eq('is_enabled', true),
    supabaseAdmin.from('device_tokens').select('user_id'),
  ]);

  const allUsers = [...(channelUsers || []), ...(pushUsers || [])];
  if (allUsers.length === 0) return { processed: 0, delivered: 0 };

  const uniqueUserIds = [...new Set(allUsers.map(c => c.user_id))];

  // Single batched fetch of pending insights for all eligible users, replacing
  // the previous per-user query (an N+1: one SELECT per user). Oldest-first,
  // then grouped + capped to 5/user in memory to preserve the prior anti-spam
  // limit. Pending = not yet delivered AND not in terminal-failure state.
  // (At very large user counts the .in() list and the two leading scans would
  // want a server-side joined RPC; deferred — the per-run delivery cap already
  // bounds the work, and this removes the round-trip-per-user hot path.)
  const PENDING_FETCH_LIMIT = MAX_DELIVERIES_PER_RUN * 5;
  const { data: pendingRows } = await supabaseAdmin
    .from('proactive_insights')
    .select('*')
    .in('user_id', uniqueUserIds)
    .eq('delivered', false)
    .is('delivery_failed_at', null)
    .order('created_at', { ascending: true })
    .limit(PENDING_FETCH_LIMIT);

  const pendingByUser = groupPendingByUser(pendingRows, 5);

  let totalProcessed = 0;
  let totalDelivered = 0;
  const emailPromises = [];

  for (const [userId, insights] of pendingByUser) {
    // Stop if we've hit the global delivery cap
    if (totalDelivered >= MAX_DELIVERIES_PER_RUN) {
      log.info('Global delivery cap reached', { cap: MAX_DELIVERIES_PER_RUN, totalDelivered, totalProcessed });
      break;
    }

    // Track insights processed this run for email batching
    const deliveredThisRun = [];

    for (const insight of insights) {
      // Stop if we've hit the global delivery cap
      if (totalDelivered >= MAX_DELIVERIES_PER_RUN) break;

      // audit-2026-05-27 task #12: HONEST claim.
      //
      // Old behaviour: set delivered=true BEFORE sending, only unclaim on a
      // thrown exception. Silent-fail case (result.delivered=0 with no exception)
      // left rows marked delivered=true while no channel actually succeeded.
      // The DB lied → debugging WhatsApp drops took hours longer than it should.
      //
      // New behaviour: increment delivery_attempts under an optimistic lock,
      // run the send, THEN write the outcome:
      //   - Any channel success    → delivered=true, delivered_at=NOW
      //   - All channels failed AND attempts >= MAX → delivery_failed_at=NOW (terminal)
      //   - Otherwise              → leave attempts++ and let next cron retry
      //
      // The optimistic lock on delivery_attempts blocks concurrent cron races.
      const currentAttempts = insight.delivery_attempts || 0;
      const { data: claimedRows, error: claimError } = await supabaseAdmin
        .from('proactive_insights')
        .update({ delivery_attempts: currentAttempts + 1 })
        .eq('id', insight.id)
        .eq('delivery_attempts', currentAttempts) // optimistic lock
        .eq('delivered', false)
        .is('delivery_failed_at', null)
        .select('id');

      if (claimError) {
        log.warn('Failed to claim insight (DB error)', { insightId: insight.id, error: claimError.message });
        continue;
      }
      if (!claimedRows?.length) {
        // Another cron incremented this row's attempts since our SELECT.
        // Skip — that run owns this attempt.
        continue;
      }

      const newAttempts = currentAttempts + 1;
      let result;
      try {
        result = await deliverInsight(userId, insight);
        totalProcessed++;
      } catch (err) {
        // Catastrophic failure (network, code crash, etc.). attempts++ already
        // saved — the row stays pending unless attempts hit the cap. If so,
        // mark it terminal so we don't burn cron budget on a hopeless row.
        log.warn('Insight delivery threw', {
          insightId: insight.id,
          attempts: newAttempts,
          error: err.message,
        });
        if (newAttempts >= MAX_DELIVERY_ATTEMPTS) {
          await supabaseAdmin
            .from('proactive_insights')
            .update({ delivery_failed_at: new Date().toISOString() })
            .eq('id', insight.id);
        }
        continue;
      }

      if (result.delivered > 0) {
        // SUCCESS — at least one channel returned success=true. Mark delivered.
        await supabaseAdmin
          .from('proactive_insights')
          .update({ delivered: true, delivered_at: new Date().toISOString() })
          .eq('id', insight.id);
        totalDelivered++;
        deliveredThisRun.push(insight);
      } else if (newAttempts >= MAX_DELIVERY_ATTEMPTS) {
        // EXHAUSTED — every channel returned success=false across all attempts.
        // Mark terminal so we stop retrying. Still eligible for email batch
        // delivery below (different channel, different failure modes).
        await supabaseAdmin
          .from('proactive_insights')
          .update({ delivery_failed_at: new Date().toISOString() })
          .eq('id', insight.id);
        log.warn('Insight delivery exhausted retry budget', {
          insightId: insight.id,
          attempts: newAttempts,
          channelsTried: result.channels?.length || 0,
        });
        deliveredThisRun.push(insight);
      } else {
        // Transient failure — leave pending for the next cron run.
        // attempts++ already persisted via the claim update.
        deliveredThisRun.push(insight);
      }
    }

    // Email delivery — batch insights and send if cooldown passed or high urgency.
    // Fire-and-forget: launch async, collect promise, don't block the loop.
    if (deliveredThisRun.length > 0) {
      emailPromises.push(tryEmailDelivery(userId, deliveredThisRun));
    }
  }

  // Await all email promises (already fire-and-forget with internal try/catch)
  if (emailPromises.length > 0) {
    await Promise.allSettled(emailPromises);
  }

  return { processed: totalProcessed, delivered: totalDelivered, users: uniqueUserIds.length, capped: totalDelivered >= MAX_DELIVERIES_PER_RUN };
}
