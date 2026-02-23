/**
 * Webhook Receiver Service
 * Handles real-time push notifications from platforms that support webhooks
 * Eliminates the need for polling where webhooks are available
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { notifyNewData, notifyConnectionStatus } from './websocketService.js';
import * as sseService from './sseService.js';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Verify GitHub webhook signature
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
function verifyGitHubSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Verify Slack webhook signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(body, timestamp, signature, secret) {
  const sigBasestring = 'v0:' + timestamp + ':' + body;
  const mySignature = 'v0=' + crypto.createHmac('sha256', secret).update(sigBasestring).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

/**
 * Handle GitHub webhook events
 * Supported events: push, issues, pull_request, release, etc.
 */
async function handleGitHubWebhook(event, payload, userId) {
  console.log(`📡 GitHub webhook received: ${event} for user ${userId}`);

  try {
    // Store the raw event data
    const { error } = await supabase
      .from('user_platform_data')
      .insert({
        user_id: userId,
        platform: 'github',
        data_type: `webhook_${event}`,
        raw_data: payload,
        extracted_at: new Date().toISOString(),
      });

    if (error) {
      console.error('❌ Error storing GitHub webhook data:', error);
      return { success: false, error };
    }

    // Update last sync timestamp
    const { error: githubSyncErr } = await supabase
      .from('platform_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'github');

    if (githubSyncErr) console.error('[Webhook] Error updating GitHub last_sync:', githubSyncErr.message);

    // Notify user via WebSocket and SSE
    notifyNewData(userId, 'github', event, 1);
    sseService.notifyWebhookReceived(userId, 'github', event, { repository: payload.repository?.name });

    console.log(`✅ GitHub ${event} event processed for user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error('❌ Error handling GitHub webhook:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle Gmail Pub/Sub push notifications
 * Requires Google Cloud Pub/Sub setup
 */
async function handleGmailPushNotification(message, userId) {
  console.log(`📧 Gmail push notification received for user ${userId}`);

  try {
    // Decode the Pub/Sub message
    const data = message.data ? JSON.parse(Buffer.from(message.data, 'base64').toString()) : {};

    // historyId is the Gmail history ID
    const historyId = data.historyId;

    // Store the notification
    const { error: gmailInsertErr } = await supabase
      .from('user_platform_data')
      .insert({
        user_id: userId,
        platform: 'google_gmail',
        data_type: 'push_notification',
        raw_data: {
          historyId,
          emailAddress: data.emailAddress,
          receivedAt: new Date().toISOString(),
        },
        extracted_at: new Date().toISOString(),
      });

    if (gmailInsertErr) console.error('[Webhook] Error storing Gmail push notification data:', gmailInsertErr.message);

    // Update last sync
    const { error: gmailSyncErr } = await supabase
      .from('platform_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'google_gmail');

    if (gmailSyncErr) console.error('[Webhook] Error updating Gmail last_sync:', gmailSyncErr.message);

    // Notify user via WebSocket and SSE
    notifyNewData(userId, 'google_gmail', 'new_email', 1);
    sseService.notifyWebhookReceived(userId, 'google_gmail', 'new_email', { historyId });

    console.log(`✅ Gmail push notification processed for user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error('❌ Error handling Gmail push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle Slack event subscriptions
 * https://api.slack.com/apis/connections/events-api
 */
async function handleSlackEvent(event, payload, userId) {
  console.log(`💬 Slack event received: ${event.type} for user ${userId}`);

  try {
    // Handle URL verification challenge
    if (event.type === 'url_verification') {
      return { challenge: event.challenge };
    }

    // Store the event
    const { error: slackInsertErr } = await supabase
      .from('user_platform_data')
      .insert({
        user_id: userId,
        platform: 'slack',
        data_type: `event_${event.type}`,
        raw_data: payload,
        extracted_at: new Date().toISOString(),
      });

    if (slackInsertErr) console.error('[Webhook] Error storing Slack event data:', slackInsertErr.message);

    // Update last sync
    const { error: slackSyncErr } = await supabase
      .from('platform_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'slack');

    if (slackSyncErr) console.error('[Webhook] Error updating Slack last_sync:', slackSyncErr.message);

    // Notify user via WebSocket and SSE
    notifyNewData(userId, 'slack', event.type, 1);
    sseService.notifyWebhookReceived(userId, 'slack', event.type, event);

    console.log(`✅ Slack ${event.type} event processed for user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error('❌ Error handling Slack event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Register GitHub webhook for a repository
 * Called after user connects GitHub account
 */
async function registerGitHubWebhook(userId, accessToken, repoOwner, repoName) {
  try {
    const webhookUrl = `${process.env.API_URL || 'http://localhost:3001'}/api/webhooks/github/${userId}`;

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/hooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push', 'issues', 'pull_request', 'release', 'star', 'fork'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret: process.env.GITHUB_WEBHOOK_SECRET || crypto.randomBytes(20).toString('hex'),
            insecure_ssl: process.env.NODE_ENV === 'development' ? '1' : '0',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to register GitHub webhook: ${error}`);
    }

    const webhook = await response.json();

    console.log(`✅ GitHub webhook registered for ${repoOwner}/${repoName}`);

    // Store webhook info in database
    const { error: webhookInsertErr } = await supabase
      .from('platform_webhooks')
      .insert({
        user_id: userId,
        platform: 'github',
        webhook_id: webhook.id.toString(),
        webhook_url: webhookUrl,
        events: ['push', 'issues', 'pull_request', 'release', 'star', 'fork'],
        metadata: {
          repo: `${repoOwner}/${repoName}`,
          created_at: webhook.created_at,
        },
      });

    if (webhookInsertErr) console.error('[Webhook] Error storing GitHub webhook registration:', webhookInsertErr.message);

    return { success: true, webhook };
  } catch (error) {
    console.error('❌ Error registering GitHub webhook:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup Gmail push notifications using Google Cloud Pub/Sub
 * https://developers.google.com/gmail/api/guides/push
 */
async function setupGmailPushNotifications(userId, accessToken) {
  try {
    const topicName = `projects/${process.env.GOOGLE_PROJECT_ID}/topics/gmail-notifications`;

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName,
          labelIds: ['INBOX'],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to setup Gmail push: ${error}`);
    }

    const watchResponse = await response.json();

    console.log(`✅ Gmail push notifications enabled for user ${userId}`);

    // Store watch info
    const { error: gmailWatchInsertErr } = await supabase
      .from('platform_webhooks')
      .insert({
        user_id: userId,
        platform: 'google_gmail',
        webhook_id: 'push_notification',
        webhook_url: topicName,
        metadata: {
          historyId: watchResponse.historyId,
          expiration: watchResponse.expiration,
        },
      });

    if (gmailWatchInsertErr) console.error('[Webhook] Error storing Gmail watch registration:', gmailWatchInsertErr.message);

    return { success: true, watchResponse };
  } catch (error) {
    console.error('❌ Error setting up Gmail push notifications:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Refresh Gmail watch (must be called every 7 days)
 * This runs automatically via cron job
 */
async function refreshGmailWatch(userId, accessToken) {
  try {
    // Simply call watch again - this extends the watch period
    return await setupGmailPushNotifications(userId, accessToken);
  } catch (error) {
    console.error('❌ Error refreshing Gmail watch:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Resolve a userId from a Gmail email address.
 * First checks platform_connections (where platform_user_id stores the Gmail address),
 * then falls back to the users table by email.
 *
 * @param {string} emailAddress - The Gmail address from the Pub/Sub notification
 * @returns {Promise<string|null>} userId or null if not found
 */
async function getUserIdByEmail(emailAddress) {
  // 1. Check platform_connections (most reliable — gmail connection stores email as platform_user_id)
  const { data: conn } = await getSupabaseClient()
    .from('platform_connections')
    .select('user_id')
    .eq('platform', 'google_gmail')
    .eq('platform_user_id', emailAddress)
    .eq('status', 'connected')
    .limit(1)
    .single()
    .catch(() => ({ data: null }));

  if (conn?.user_id) return conn.user_id;

  // 2. Fall back to users table by email
  const { data: user } = await getSupabaseClient()
    .from('users')
    .select('id')
    .eq('email', emailAddress)
    .limit(1)
    .single()
    .catch(() => ({ data: null }));

  return user?.id || null;
}

/**
 * Get webhook registration info for a user
 */
async function getWebhookInfo(userId, platform) {
  const { data, error } = await supabase
    .from('platform_webhooks')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform);

  if (error) {
    console.error('❌ Error fetching webhook info:', error);
    return null;
  }

  return data;
}

export {
  verifyGitHubSignature,
  verifySlackSignature,
  handleGitHubWebhook,
  handleGmailPushNotification,
  handleSlackEvent,
  registerGitHubWebhook,
  setupGmailPushNotifications,
  refreshGmailWatch,
  getWebhookInfo,
  getUserIdByEmail,
};
