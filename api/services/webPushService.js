/**
 * Web Push Service — Browser Push Notifications via VAPID
 * =========================================================
 * Sends push notifications to web browsers (Chrome, Firefox, Edge)
 * using the Web Push protocol with VAPID authentication.
 *
 * No app install required — just browser permission.
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:)
 */

import webpush from 'web-push';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('WebPush');

// Configure VAPID
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@twinme.me';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  log.info('Web push VAPID configured');
} else {
  log.warn('VAPID keys not set — web push disabled');
}

/**
 * Save a web push subscription for a user.
 * Called when the frontend subscribes after permission grant.
 */
export async function saveSubscription(userId, subscription) {
  const { endpoint } = subscription;

  const { error } = await supabaseAdmin
    .from('web_push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint,
      subscription: subscription,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' });

  if (error) {
    log.error('Failed to save web push subscription', { userId, error: error.message });
    return false;
  }

  log.info('Web push subscription saved', { userId, endpoint: endpoint.slice(0, 60) });
  return true;
}

/**
 * Remove a web push subscription (on unsubscribe or permission revoke).
 */
export async function removeSubscription(userId, endpoint) {
  await supabaseAdmin
    .from('web_push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);
}

/** Returns true if the current UTC hour is within quiet hours (23:00-08:00). */
function isQuietHours() {
  const hour = new Date().getUTCHours();
  return hour >= 23 || hour < 8;
}

/**
 * Send a web push notification to all of a user's subscribed browsers.
 * Returns count of successful sends.
 */
export async function sendWebPush(userId, { title, body, url, tag, insightId, category, force = false }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;

  if (!force && isQuietHours()) {
    log.info('Quiet hours — skipping web push', { userId });
    return 0;
  }

  const { data: subs } = await supabaseAdmin
    .from('web_push_subscriptions')
    .select('endpoint, subscription')
    .eq('user_id', userId);

  if (!subs?.length) return 0;

  const payload = JSON.stringify({ title, body, url, tag, insightId, category });
  let sent = 0;
  const staleEndpoints = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired — mark for cleanup
        staleEndpoints.push(sub.endpoint);
      } else {
        log.warn('Web push send failed', { userId, status: err.statusCode, error: err.message });
      }
    }
  }

  // Clean up stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabaseAdmin
      .from('web_push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', staleEndpoints);
    log.info('Cleaned stale web push subscriptions', { userId, count: staleEndpoints.length });
  }

  if (sent > 0) {
    log.info('Web push sent', { userId, sent, total: subs.length });
  }

  return sent;
}
