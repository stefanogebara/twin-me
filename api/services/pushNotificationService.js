/**
 * Push Notification Service
 * =========================
 * Sends push notifications to registered devices via Expo's push gateway.
 * Expo handles FCM v1 (Android) and APNs (iOS) routing transparently.
 *
 * Flow:
 *   Mobile app → registers ExpoPushToken → POST /api/device-tokens
 *   Backend    → reads tokens from device_tokens table
 *   Backend    → sends via Expo Push API (batched, max 100 per request)
 *
 * The service is called by proactiveInsights.js whenever a high-urgency
 * insight is generated, so the user gets a nudge to open the twin chat.
 *
 * Quiet hours: no pushes sent between 23:00 and 08:00 UTC.
 * To migrate to direct FCM (bypass Expo gateway): add google-services.json
 * to mobile/android/app/, install @react-native-firebase/messaging in mobile,
 * and set FIREBASE_SERVICE_ACCOUNT_KEY env var pointing to your service account JSON.
 */

import Expo from 'expo-server-sdk';
import { supabaseAdmin } from './database.js';

const expo = new Expo({ useFcmV1: true });

/** Returns true if the current UTC hour is within quiet hours (23:00–08:00). */
function isQuietHours() {
  const hour = new Date().getUTCHours();
  return hour >= 23 || hour < 8;
}

/**
 * Register or refresh a device token for a user.
 * Called from POST /api/device-tokens.
 *
 * @param {string} userId
 * @param {string} token
 * @param {string} platform  'android' | 'ios'
 * @param {string} [tokenType]  'expo' | 'fcm' (default: 'expo')
 */
export async function registerDeviceToken(userId, token, platform, tokenType = 'expo') {
  const { error } = await supabaseAdmin
    .from('device_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform,
        token_type: tokenType,
        updated_at: new Date().toISOString(),
      },
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
 * @param {object} [opts.data]             - extra payload delivered to the app
 * @param {string} [opts.notificationType] - e.g. 'insight', 'goal', 'reflection'
 * @param {boolean} [opts.force]           - bypass quiet hours check
 */
export async function sendPushToUser(userId, {
  title,
  body,
  data = {},
  notificationType = 'general',
  force = false,
}) {
  if (!force && isQuietHours()) {
    console.log(`[PushNotifications] Quiet hours — skipping push for user ${userId}`);
    return;
  }

  const { data: rows, error } = await supabaseAdmin
    .from('device_tokens')
    .select('token, token_type')
    .eq('user_id', userId);

  if (error || !rows?.length) return;

  const expoRows = rows.filter((r) => r.token_type === 'expo' && Expo.isExpoPushToken(r.token));

  if (!expoRows.length) return;

  const enrichedData = { ...data, notificationType };

  const messages = expoRows.map(({ token }) => ({
    to: token,
    title,
    body,
    data: enrichedData,
    sound: 'default',
    priority: 'high',
    channelId: 'twin-insights',
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

  // Clean up stale tokens reported by Expo
  const staleTokens = [];
  for (let i = 0; i < receipts.length; i++) {
    const ticket = receipts[i];
    if (ticket.status === 'error') {
      if (ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(expoRows[i].token);
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
