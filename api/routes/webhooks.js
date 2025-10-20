/**
 * Webhook Routes
 * Handles incoming webhook notifications from platforms that support real-time push
 * Endpoints for GitHub, Gmail Pub/Sub, and Slack event subscriptions
 */

import express from 'express';
import {
  verifyGitHubSignature,
  verifySlackSignature,
  handleGitHubWebhook,
  handleGmailPushNotification,
  handleSlackEvent,
} from '../services/webhookReceiverService.js';

const router = express.Router();

/**
 * GitHub Webhook Receiver
 * Receives real-time push notifications from GitHub repositories
 * https://docs.github.com/en/webhooks
 */
router.post('/github/:userId', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const { userId } = req.params;
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    if (!signature) {
      console.warn('⚠️  GitHub webhook missing signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const payload = req.body.toString('utf8');
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!verifyGitHubSignature(payload, signature, secret)) {
      console.warn('⚠️  GitHub webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse payload after verification
    const webhookPayload = JSON.parse(payload);

    console.log(`📡 GitHub webhook received: ${event} for user ${userId}`);

    // Handle the webhook event
    const result = await handleGitHubWebhook(event, webhookPayload, userId);

    if (!result.success) {
      console.error('❌ Failed to process GitHub webhook:', result.error);
      return res.status(500).json({ error: 'Failed to process webhook' });
    }

    res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('❌ Error processing GitHub webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Gmail Pub/Sub Push Notification Receiver
 * Receives push notifications from Google Cloud Pub/Sub for Gmail updates
 * https://developers.google.com/gmail/api/guides/push
 */
router.post('/gmail', express.json(), async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      console.warn('⚠️  Gmail push notification missing message');
      return res.status(400).json({ error: 'Missing message' });
    }

    // The userId should be in the message attributes or you need to decode the message
    // For now, we'll extract it from the decoded message data
    const decodedData = message.data ?
      JSON.parse(Buffer.from(message.data, 'base64').toString()) :
      {};

    const emailAddress = decodedData.emailAddress;

    if (!emailAddress) {
      console.warn('⚠️  Gmail push notification missing email address');
      return res.status(400).json({ error: 'Missing email address' });
    }

    // Look up userId by email address
    // TODO: Implement email-to-userId lookup from database
    // For now, we'll need to store this mapping when setting up push notifications

    console.log(`📧 Gmail push notification received for ${emailAddress}`);

    // Handle the push notification
    // We need the userId here - this should be stored when registering the webhook
    // For now, we'll acknowledge receipt
    res.status(200).json({ success: true, message: 'Notification received' });

    // Process in background (don't block response)
    // await handleGmailPushNotification(message, userId);
  } catch (error) {
    console.error('❌ Error processing Gmail push notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Slack Event Subscription Receiver
 * Receives event notifications from Slack workspaces
 * https://api.slack.com/apis/connections/events-api
 */
router.post('/slack/:userId', express.json(), async (req, res) => {
  try {
    const { userId } = req.params;
    const slackSignature = req.headers['x-slack-signature'];
    const slackTimestamp = req.headers['x-slack-request-timestamp'];

    // Verify request is recent (within 5 minutes)
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
    if (parseInt(slackTimestamp) < fiveMinutesAgo) {
      console.warn('⚠️  Slack webhook timestamp too old');
      return res.status(401).json({ error: 'Request timestamp too old' });
    }

    // Verify Slack signature
    const body = JSON.stringify(req.body);
    const secret = process.env.SLACK_SIGNING_SECRET;

    if (!verifySlackSignature(body, slackTimestamp, slackSignature, secret)) {
      console.warn('⚠️  Slack webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log(`💬 Slack webhook received for user ${userId}`);

    // Handle URL verification challenge
    if (req.body.type === 'url_verification') {
      console.log('✅ Slack URL verification challenge received');
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // Handle the event
    const result = await handleSlackEvent(req.body.event, req.body, userId);

    if (result.challenge) {
      return res.status(200).json({ challenge: result.challenge });
    }

    if (!result.success) {
      console.error('❌ Failed to process Slack event:', result.error);
      return res.status(500).json({ error: 'Failed to process event' });
    }

    res.status(200).json({ success: true, message: 'Event processed' });
  } catch (error) {
    console.error('❌ Error processing Slack webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Discord Webhook Receiver (if Discord adds webhook support in future)
 * Currently Discord only supports OAuth + Gateway, not outgoing webhooks
 */
router.post('/discord/:userId', express.json(), async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`🎮 Discord webhook received for user ${userId}`);

    // Discord doesn't currently support outgoing webhooks for user events
    // This endpoint is a placeholder for future Discord webhook support
    // For now, we continue using the polling approach for Discord

    res.status(501).json({
      error: 'Discord webhooks not yet supported',
      message: 'Using polling mechanism for Discord'
    });
  } catch (error) {
    console.error('❌ Error processing Discord webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * List all registered webhooks for a user
 * GET /api/webhooks/list?userId=xxx
 */
router.get('/list', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }

    // TODO: Implement getWebhookInfo from webhookReceiverService
    const webhooks = []; // await getWebhookInfo(userId);

    res.status(200).json({
      success: true,
      webhooks,
    });
  } catch (error) {
    console.error('❌ Error fetching webhooks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check endpoint for webhook service
 * GET /api/webhooks/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'webhook-receiver',
    timestamp: new Date().toISOString(),
    endpoints: {
      github: '/api/webhooks/github/:userId',
      gmail: '/api/webhooks/gmail',
      slack: '/api/webhooks/slack/:userId',
      discord: '/api/webhooks/discord/:userId (not supported)',
    },
  });
});

export default router;
