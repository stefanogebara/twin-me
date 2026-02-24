/**
 * Push Notification Service
 * =========================
 * Sends push notifications to registered devices via Expo's push gateway.
 * Expo handles FCM (Android) and APNs (iOS) routing transparently.
 *
 * Flow:
 *   Mobile app → registers ExpoPushToken → POST /api/device-tokens
 *   Backend    → reads tokens from device_tokens table
 *   Backend    → sends via Expo Push API (batched, max 100 per request)
 *
 * The service is called by proactiveInsights.js whenever a high-urgency
 * insight is generated, so the user gets a nudge to open the twin chat.
 */

import Expo from 'expo-server-sdk';
import { supabaseAdmin } from './database.js';

const expo = new Expo({ useFcmV1: true });

/**
 * Register or refresh a device token for a user.
 * Called from POST /api/device-tokens.
 */
export async function registerDeviceToken(userId, token, platform) {
  const { error } = await supabaseAdmin
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );

  if (error) throw error;
}

/**
 * Send a push notification to all registered devices for a user.
 *
 * @param {string} userId
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data] - extra payload delivered to the app
 */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  const { data: rows, error } = await supabaseAdmin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !rows?.length) return;

  const validTokens = rows
    .map((r) => r.token)
    .filter((t) => Expo.isExpoPushToken(t));

  if (!validTokens.length) return;

  const messages = validTokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
  }));

  // Expo SDK batches up to 100 messages per HTTP request
  const chunks = expo.chunkPushNotifications(messages);
  const receipts = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      receipts.push(...ticketChunk);
    } catch (err) {
      console.error('[PushNotifications] Send error:', err.message);
    }
  }

  // Log any DeviceNotRegistered errors so stale tokens can be cleaned up
  const staleTokens = [];
  for (let i = 0; i < receipts.length; i++) {
    const ticket = receipts[i];
    if (ticket.status === 'error') {
      if (ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(validTokens[i]);
      } else {
        console.error('[PushNotifications] Ticket error:', ticket.message);
      }
    }
  }

  if (staleTokens.length) {
    await supabaseAdmin
      .from('device_tokens')
      .delete()
      .in('token', staleTokens);
  }

  return receipts;
}
