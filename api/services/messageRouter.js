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
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

// Map insight category → friendly push notification title
const PUSH_TITLES = {
  briefing: 'Your morning briefing',
  evening_recap: 'Evening recap',
  music_mood_match: 'Music suggestion',
  email_triage: 'Email update',
  nudge: 'A little nudge',
  trend: 'Something I noticed',
  anomaly: 'Heads up',
  celebration: 'Worth celebrating',
  concern: 'Checking in',
  goal_progress: 'Goal update',
  goal_suggestion: 'New goal idea',
  suggestion: 'Your twin has a thought',
  reminder: 'Reminder',
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

  // Push notification — universal channel, doesn't require messaging_channels entry
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
 */
export async function deliverPendingInsights() {
  // Get all users with enabled messaging channels OR registered push tokens
  const [{ data: channelUsers }, { data: pushUsers }] = await Promise.all([
    supabaseAdmin.from('messaging_channels').select('user_id').eq('is_enabled', true),
    supabaseAdmin.from('device_tokens').select('user_id'),
  ]);

  const allUsers = [...(channelUsers || []), ...(pushUsers || [])];
  if (allUsers.length === 0) return { processed: 0, delivered: 0 };

  const uniqueUserIds = [...new Set(allUsers.map(c => c.user_id))];

  let totalProcessed = 0;
  let totalDelivered = 0;

  for (const userId of uniqueUserIds) {
    // Get undelivered insights (max 5 per user per run to avoid spam)
    const { data: insights } = await supabaseAdmin
      .from('proactive_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('delivered', false)
      .order('created_at', { ascending: true })
      .limit(5);

    if (!insights?.length) continue;

    for (const insight of insights) {
      const result = await deliverInsight(userId, insight);
      totalProcessed++;

      if (result.delivered > 0) {
        totalDelivered++;
        // Mark as delivered (Telegram delivery counts — web will also show it)
        await supabaseAdmin
          .from('proactive_insights')
          .update({ delivered: true, delivered_at: new Date().toISOString() })
          .eq('id', insight.id);
      }
    }
  }

  return { processed: totalProcessed, delivered: totalDelivered, users: uniqueUserIds.length };
}
