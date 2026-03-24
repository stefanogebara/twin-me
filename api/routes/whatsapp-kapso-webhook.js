/**
 * WhatsApp Webhook — Kapso.ai Inbound Messages
 * ==============================================
 * Handles incoming WhatsApp messages from Kapso's webhook format
 * and routes them through the twin chat pipeline.
 *
 * Kapso sends:
 *   Header: X-Webhook-Event: whatsapp.message.received
 *   Header: X-Webhook-Signature: <HMAC-SHA256>
 *   Header: X-Idempotency-Key: <unique key>
 *   Body:   { event, data: { from, message, phone_number_id, contact } }
 *
 * Fallback: Also accepts Meta's native webhook format for flexibility.
 *
 * POST /api/whatsapp/webhook
 */

import express from 'express';
import crypto from 'crypto';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { supabaseAdmin } from '../services/database.js';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { classifyMessageTier, CHAT_TIER_MODELS } from '../services/chatRouter.js';
import { fetchTwinContext } from '../services/twinContextBuilder.js';
import { getBlocks, formatBlocksForPrompt } from '../services/coreMemoryService.js';
import { buildPersonalityPrompt } from '../services/personalityPromptBuilder.js';
import { getProfile } from '../services/personalityProfileService.js';
import { addConversationMemory } from '../services/memoryStreamService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppKapsoWebhook');
const router = express.Router();

// ====================================================================
// Dedup: prevent processing the same message twice (Kapso may retry)
// ====================================================================
const processedKeys = new Map(); // key -> timestamp
const DEDUP_TTL_MS = 300_000;    // 5 minutes

// Clean up stale dedup entries every 2 minutes
setInterval(() => {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, ts] of processedKeys) {
    if (ts < cutoff) processedKeys.delete(key);
  }
}, 120_000);

// ====================================================================
// Rate limiting: per phone number (in-memory, simple)
// ====================================================================
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(phone) {
  const now = Date.now();
  const entry = rateLimitMap.get(phone) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  entry.timestamps.push(now);
  rateLimitMap.set(phone, entry);
  return entry.timestamps.length > RATE_LIMIT_MAX;
}

// ====================================================================
// Webhook signature verification (HMAC-SHA256)
// ====================================================================
function verifyKapsoSignature(signature, rawBody) {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    // Kapso may send raw hex or "sha256=hex" format — handle both
    const sigHash = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    const sigBuf = Buffer.from(sigHash, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;

    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    log.warn('Signature verification error', { error: err.message });
    return false;
  }
}

// ====================================================================
// Parse incoming message from either Kapso or Meta native format
// ====================================================================
function parseIncomingMessage(body) {
  // Try Kapso format first:
  // { event: "whatsapp.message.received", data: { from, message: { id, type, text: { body } }, contact } }
  if (body?.event === 'whatsapp.message.received' && body?.data?.message) {
    const { data } = body;
    const msg = data.message;
    if (msg.type !== 'text') return null;

    return {
      phone: data.from || data.contact?.wa_id,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: data.contact?.name,
      format: 'kapso',
    };
  }

  // Fallback: Kapso format with data.messages array (batch)
  if (body?.data?.messages?.length) {
    const msg = body.data.messages[0];
    if (msg.type !== 'text') return null;
    return {
      phone: msg.from || body.data.contact?.wa_id,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: body.data.contact?.name,
      format: 'kapso_batch',
    };
  }

  // Fallback: Meta native webhook format
  // { entry: [{ changes: [{ value: { messages: [{ from, text: { body }, id, type }] } }] }] }
  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (messages?.length) {
    const msg = messages[0];
    if (msg.type !== 'text') return null;
    const contacts = body.entry[0].changes[0].value.contacts;
    return {
      phone: msg.from,
      text: msg.text?.body,
      messageId: msg.id,
      contactName: contacts?.[0]?.profile?.name,
      format: 'meta_native',
    };
  }

  return null;
}

// ====================================================================
// POST /api/whatsapp/webhook — Incoming messages from Kapso
// ====================================================================
router.post('/webhook', async (req, res) => {
  // 1. Verify webhook signature
  if (!process.env.KAPSO_WEBHOOK_SECRET) {
    log.error('KAPSO_WEBHOOK_SECRET not configured — rejecting request');
    return res.sendStatus(403);
  }

  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    log.warn('Missing X-Webhook-Signature header');
    return res.sendStatus(403);
  }

  const rawBody = JSON.stringify(req.body);
  if (!verifyKapsoSignature(signature, rawBody)) {
    log.warn('Webhook signature verification failed');
    return res.sendStatus(403);
  }

  // 2. Dedup using X-Idempotency-Key
  const idempotencyKey = req.headers['x-idempotency-key'];
  if (idempotencyKey && processedKeys.has(idempotencyKey)) {
    log.info('Duplicate webhook skipped', { idempotencyKey });
    return res.sendStatus(200);
  }
  if (idempotencyKey) {
    processedKeys.set(idempotencyKey, Date.now());
  }

  // 3. Return 200 immediately — process async
  res.sendStatus(200);

  try {
    // 4. Parse message (supports Kapso + Meta native fallback)
    const parsed = parseIncomingMessage(req.body);
    if (!parsed || !parsed.phone || !parsed.text) {
      log.info('Non-text or unparseable message, skipping', {
        event: req.body?.event,
        format: parsed?.format,
      });
      return;
    }

    const { phone, text, messageId, contactName, format } = parsed;
    log.info('WhatsApp message received', { phone: phone.slice(-4), format, messageId });

    // 5. Rate limit check
    if (isRateLimited(phone)) {
      log.warn('Rate limited', { phone: phone.slice(-4) });
      await sendWhatsAppMessage(phone, 'You\'re sending messages too fast. Please wait a moment.');
      return;
    }

    // 6. Look up user by phone number in messaging_channels
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('user_id')
      .eq('channel', 'whatsapp')
      .eq('channel_id', phone)
      .single();

    if (!channel) {
      log.info('Unlinked WhatsApp user', { phone: phone.slice(-4), contactName });
      await sendWhatsAppMessage(
        phone,
        'Welcome to TwinMe! Your WhatsApp isn\'t linked to an account yet.\n\n' +
        'To connect:\n' +
        '1. Open TwinMe app\n' +
        '2. Go to Settings\n' +
        '3. Tap "Connect WhatsApp"\n' +
        '4. Enter your phone number\n\n' +
        'Once linked, you can chat with your digital twin right here!'
      );
      return;
    }

    const userId = channel.user_id;

    // 7. Process through twin chat pipeline
    const response = await processTwinMessage(userId, text);

    // 8. Store conversation in memory stream
    await addConversationMemory(userId, text, response, {
      source: 'whatsapp',
      messageId,
      contactName,
    }).catch(err => {
      log.warn('Failed to store conversation memory', { userId, error: err.message });
    });

    // 9. Send response (WhatsApp limit: 4096 chars)
    if (response.length <= 4096) {
      await sendWhatsAppMessage(phone, response);
    } else {
      // Split at paragraph boundaries when possible
      const chunks = splitMessage(response, 4096);
      for (const chunk of chunks) {
        await sendWhatsAppMessage(phone, chunk);
      }
    }

    log.info('WhatsApp response sent', { userId, phone: phone.slice(-4), responseLen: response.length });
  } catch (err) {
    log.error('WhatsApp webhook processing error', { error: err.message, stack: err.stack });
  }
});

// ====================================================================
// Twin chat pipeline (mirrors Telegram webhook pattern with smart routing)
// ====================================================================
async function processTwinMessage(userId, message) {
  // Build context in parallel
  const [twinContext, coreBlocks, personalityProfile] = await Promise.all([
    fetchTwinContext(userId, message).catch(() => ({})),
    getBlocks(userId).catch(() => ({})),
    getProfile(userId).catch(() => null),
  ]);

  // Build system prompt
  const systemParts = [];

  // Core memory blocks first (pinned identity)
  const blockText = formatBlocksForPrompt(coreBlocks);
  if (blockText) systemParts.push(blockText);

  // Dynamic twin summary
  if (twinContext.twinSummary) {
    systemParts.push(`WHO YOU ARE:\n${twinContext.twinSummary}`);
  }

  // OCEAN personality prompt
  if (personalityProfile) {
    const personalityBlock = buildPersonalityPrompt(personalityProfile);
    if (personalityBlock) systemParts.push(personalityBlock);
  }

  // Memories (reflections + facts)
  if (twinContext.memories?.length > 0) {
    const reflections = twinContext.memories
      .filter(m => m.memory_type === 'reflection')
      .slice(0, 5);
    const facts = twinContext.memories
      .filter(m => m.memory_type !== 'reflection')
      .slice(0, 8);

    if (reflections.length > 0) {
      systemParts.push(
        `Deep patterns I've noticed:\n${reflections.map(r => `- ${r.content.slice(0, 200)}`).join('\n')}`
      );
    }
    if (facts.length > 0) {
      systemParts.push(
        `[USER DATA]\n${facts.map(f => `- ${f.content.slice(0, 150)}`).join('\n')}\n[END USER DATA]`
      );
    }
  }

  // Proactive insights
  if (twinContext.proactiveInsights?.length > 0) {
    systemParts.push(
      `THINGS I NOTICED (bring up naturally):\n${twinContext.proactiveInsights.map(i => `- ${i.insight?.slice(0, 150)}`).join('\n')}`
    );
  }

  // Channel-specific instructions
  systemParts.push(
    'You are responding via WhatsApp. Keep responses concise — ' +
    'WhatsApp users expect shorter messages. No markdown headers. ' +
    'Use *bold* for emphasis. Max 3 paragraphs.'
  );

  const system = systemParts.join('\n\n');

  // Get recent conversation history
  const { data: recentMsgs } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'conversation')
    .order('created_at', { ascending: false })
    .limit(10);

  const history = (recentMsgs || [])
    .reverse()
    .map(m => ({
      role: m.metadata?.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  // Smart model routing (same tiers as Telegram/web)
  const routing = classifyMessageTier(message);
  const modelOverride = CHAT_TIER_MODELS[routing.tier] || undefined;

  const response = await complete({
    system: [{ type: 'text', text: system }],
    messages: [...history, { role: 'user', content: message }],
    tier: TIER_CHAT,
    maxTokens: 800,
    temperature: personalityProfile?.temperature ?? 0.7,
    userId,
    serviceName: `twin-chat:whatsapp_${routing.tier}`,
    modelOverride,
  });

  const text = response?.content || response?.text || "I'm having trouble responding right now. Try again in a moment.";

  // Strip leaked "Twin said:" prefix (same as Telegram handler)
  return text.replace(/^(?:Twin said:\s*"?)+/i, '').replace(/"?\s*$/, '');
}

// ====================================================================
// Utility: split long messages at paragraph boundaries
// ====================================================================
function splitMessage(text, maxLen) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let split = remaining.lastIndexOf('\n', maxLen);
    if (split < maxLen * 0.5) split = maxLen;
    chunks.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export default router;
