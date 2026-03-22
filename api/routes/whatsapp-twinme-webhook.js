/**
 * WhatsApp Webhook — TwinMe Bidirectional Chat via Meta Cloud API
 * =================================================================
 * Handles incoming WhatsApp messages and routes them through the twin
 * chat pipeline (same as Telegram). Feature-flagged off until ops done.
 *
 * GET  /api/whatsapp-twin/webhook — Meta verification challenge
 * POST /api/whatsapp-twin/webhook — Incoming messages
 */

import express from 'express';
import { sendWhatsAppMessage, verifyWebhookSignature } from '../services/whatsappService.js';
import { supabaseAdmin } from '../services/database.js';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { fetchTwinContext } from '../services/twinContextBuilder.js';
import { getBlocks, formatBlocksForPrompt } from '../services/coreMemoryService.js';
import { buildPersonalityPrompt } from '../services/personalityPromptBuilder.js';
import { getProfile } from '../services/personalityProfileService.js';
import { addConversationMemory } from '../services/memoryStreamService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppWebhook');
const router = express.Router();

// Meta webhook verification (GET)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.TWINME_WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    log.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  log.warn('WhatsApp webhook verification failed');
  return res.sendStatus(403);
});

// Incoming messages (POST)
router.post('/webhook', express.json(), async (req, res) => {
  // Verify Meta webhook signature before processing
  const signature = req.headers['x-hub-signature-256'];
  if (process.env.TWINME_WHATSAPP_WEBHOOK_SECRET && signature) {
    const rawBody = JSON.stringify(req.body);
    if (!verifyWebhookSignature(signature, rawBody)) {
      log.warn('WhatsApp webhook signature verification failed');
      return res.sendStatus(403);
    }
  }

  // Always respond 200 to Meta quickly
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (!messages?.length) return;

    for (const msg of messages) {
      if (msg.type !== 'text') continue;

      const phone = msg.from;
      const text = msg.text?.body;
      if (!phone || !text) continue;

      // Look up user by WhatsApp phone number
      const { data: channel } = await supabaseAdmin
        .from('messaging_channels')
        .select('user_id')
        .eq('channel', 'whatsapp')
        .eq('channel_id', phone)
        .single();

      if (!channel) {
        await sendWhatsAppMessage(phone, 'Your WhatsApp isn\'t linked to TwinMe yet. Go to Settings in the app to connect.');
        continue;
      }

      const userId = channel.user_id;

      // Run twin chat pipeline (same as Telegram, non-streaming)
      const response = await processTwinMessage(userId, text);

      // Store in memory stream
      await addConversationMemory(userId, text, response, { source: 'whatsapp' }).catch(() => {});

      // Send response (WhatsApp limit: 4096 chars)
      if (response.length <= 4096) {
        await sendWhatsAppMessage(phone, response);
      } else {
        await sendWhatsAppMessage(phone, response.slice(0, 4096));
      }
    }
  } catch (err) {
    log.error('WhatsApp webhook error', { error: err.message });
  }
});

/**
 * Process a message through the twin chat pipeline (simplified for WhatsApp).
 */
async function processTwinMessage(userId, message) {
  const [twinContext, coreBlocks, personalityProfile] = await Promise.all([
    fetchTwinContext(userId, message).catch(() => ({})),
    getBlocks(userId).catch(() => ({})),
    getProfile(userId).catch(() => null),
  ]);

  const systemParts = [];

  const blockText = formatBlocksForPrompt(coreBlocks);
  if (blockText) systemParts.push(blockText);

  if (twinContext.twinSummary) {
    systemParts.push(`WHO YOU ARE:\n${twinContext.twinSummary}`);
  }

  if (personalityProfile) {
    const personalityBlock = buildPersonalityPrompt(personalityProfile);
    if (personalityBlock) systemParts.push(personalityBlock);
  }

  if (twinContext.memories?.length > 0) {
    const reflections = twinContext.memories.filter(m => m.memory_type === 'reflection').slice(0, 5);
    const facts = twinContext.memories.filter(m => m.memory_type !== 'reflection').slice(0, 8);
    if (reflections.length > 0) {
      systemParts.push(`Deep patterns I've noticed:\n${reflections.map(r => `- ${r.content.slice(0, 200)}`).join('\n')}`);
    }
    if (facts.length > 0) {
      systemParts.push(`[USER DATA]\n${facts.map(f => `- ${f.content.slice(0, 150)}`).join('\n')}\n[END USER DATA]`);
    }
  }

  systemParts.push(
    'You are responding via WhatsApp. Keep responses concise — ' +
    'WhatsApp users expect shorter messages. No markdown headers. ' +
    'Use *bold* for emphasis. Max 3 paragraphs.'
  );

  const system = systemParts.join('\n\n');

  const response = await complete({
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: message }],
    tier: TIER_CHAT,
    maxTokens: 800,
    temperature: personalityProfile?.temperature ?? 0.7,
    userId,
    serviceName: 'twin-chat:whatsapp',
  });

  return response?.content || response?.text || "I'm having trouble right now. Try again in a moment.";
}

export default router;
