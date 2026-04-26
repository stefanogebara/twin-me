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
import { getProfile, getSoulSignatureLayers } from '../services/personalityProfileService.js';
import { addConversationMemory } from '../services/memoryStreamService.js';
import { createLogger } from '../services/logger.js';
import { buildPurchaseContext } from '../services/purchaseContextBuilder.js';
import { generatePurchaseReflection } from '../services/purchaseReflection.js';

const log = createLogger('WhatsAppKapsoWebhook');
const router = express.Router();

// ====================================================================
// Pre-purchase intent — same patterns and gates as whatsapp-twinme-webhook.js.
// Real production traffic for the TwinMe WA number lands HERE (via Kapso),
// not on the direct-Meta route. So the purchase reflection logic must live
// here too. If you change the patterns, change them in both files.
// ====================================================================
const PURCHASE_INTENT_PATTERNS = [
  /\bvou\s+compra/i,
  /\bpensando\s+em\s+compra/i,
  /\b(est(ou|á)|t[ôo])\s+a?\s*fim\s+de\s+compra/i,
  /\b(about\s+to|thinking\s+(?:of|about))\s+buy(?:ing)?/i,
  /\bR\$\s*\d.*\b(comprar|comprando|gastar|pedir|levar)\b/i,
  /\b(comprar|comprando|gastar|pedir|levar)\b.*R\$\s*\d/i,
  /\$\s*\d+.*(?:buy|purchase|cart|checkout)/i,
];
const PURCHASE_INTENT_NEGATIVE = [
  /\b(comprei|gastei|paguei|levei|peguei)\b/i,
  /\b(j[áa])\s+comprei/i,
  /\b(ontem|outro\s+dia|sexta\s+passada|m[êe]s\s+passado)\b/i,
  /\b(sal[áa]rio|aluguel|conta\s+de\s+luz|fatura|boleto|sal[aá]rio|recebi)\b/i,
];
function matchesPurchaseIntent(text) {
  if (!text || typeof text !== 'string') return false;
  if (PURCHASE_INTENT_NEGATIVE.some(re => re.test(text))) return false;
  return PURCHASE_INTENT_PATTERNS.some(re => re.test(text));
}

// Audit-table writer (same shape as the one in whatsapp-twinme-webhook.js).
// Inlined to keep route files independent.
function logPurchaseReflection(userId, outcome, sourceText, props = {}) {
  try {
    const text_hash = sourceText
      ? crypto.createHash('sha256').update(sourceText).digest('hex').slice(0, 32)
      : null;
    supabaseAdmin.from('purchase_reflections').insert({
      user_id: userId,
      outcome,
      lang: props.lang ?? null,
      has_music: props.hasMusic ?? null,
      has_calendar: props.hasCalendar ?? null,
      moment_band: props.moment_band ?? null,
      elapsed_ms: props.elapsed_ms ?? null,
      cost_usd: props.cost ?? null,
      response_length: props.response_length ?? null,
      error_message: props.error ?? null,
      text_hash,
    }).then(({ error }) => {
      if (error) log.warn(`audit row failed: ${error.message}`);
    });
  } catch (_e) {
    // never let audit writes crash the webhook flow
  }
}

// ====================================================================
// Dedup: prevent processing the same message twice (Kapso may retry)
// ====================================================================
const processedKeys = new Map(); // key -> timestamp
const DEDUP_TTL_MS = 300_000;    // 5 minutes

// Clean up stale dedup entries every 2 minutes
const dedupCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, ts] of processedKeys) {
    if (ts < cutoff) processedKeys.delete(key);
  }
}, 120_000);
dedupCleanupInterval.unref();

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

// Clean up stale rate limit entries every 5 minutes to prevent memory leak
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of rateLimitMap) {
    const active = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) {
      rateLimitMap.delete(phone);
    }
  }
}, 300_000);
rateLimitCleanupInterval.unref();

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

  // Use raw body for HMAC verification (not JSON.stringify which may reorder keys)
  const rawBody = req.rawBody || JSON.stringify(req.body);
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
      .select('user_id, preferences')
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
    const userPrefs = channel.preferences || {};
    const purchaseBotEnabledForUser = userPrefs.purchase_bot_enabled !== false;

    // 7a. Pre-purchase intent — fires BEFORE the generic twin chat pipeline.
    // Same gates as the direct-Meta webhook: env kill switch + per-user
    // opt-out + try/catch with fallback string. The Kapso route already has
    // its own per-phone rate limit (line 56), so we don't double-gate.
    let response;
    if (matchesPurchaseIntent(text)) {
      if (process.env.PURCHASE_BOT_ENABLED !== 'true') {
        log.info('Purchase intent detected but bot disabled (env)', { userId });
        logPurchaseReflection(userId, 'kill_switch', text);
        response = await processTwinMessage(userId, text);
      } else if (!purchaseBotEnabledForUser) {
        log.info('Purchase intent detected but user opted out', { userId });
        logPurchaseReflection(userId, 'opted_out', text);
        response = await processTwinMessage(userId, text);
      } else {
        log.info('Purchase intent detected — generating reflection', { userId });
        try {
          const ctx = await buildPurchaseContext(userId);
          const refl = await generatePurchaseReflection(ctx, text);
          response = refl.text;
          logPurchaseReflection(userId, 'generated', text, {
            lang: refl.lang,
            hasMusic: !!ctx.music?.available && !ctx.music?.stale,
            hasCalendar: !!ctx.schedule?.available && (ctx.schedule.events?.length || 0) > 0,
            moment_band: ctx.moment?.band,
            elapsed_ms: refl.elapsed_ms,
            cost: refl.cost,
            response_length: refl.text?.length || 0,
          });
        } catch (err) {
          log.error('Purchase reflection failed', { userId, error: err.message });
          response = 'Tive um problema agora pra te responder. Tenta de novo daqui a pouco?';
          logPurchaseReflection(userId, 'failed', text, { error: err.message });
        }
      }
    } else {
      // 7b. Normal twin chat pipeline
      response = await processTwinMessage(userId, text);
    }

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
  const [twinContext, coreBlocks, personalityProfile, soulLayers] = await Promise.all([
    fetchTwinContext(userId, message).catch(() => ({})),
    getBlocks(userId).catch(() => ({})),
    getProfile(userId).catch(() => null),
    getSoulSignatureLayers(userId).catch(() => null),
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

  // Soul-layer personality prompt
  if (personalityProfile || soulLayers) {
    const personalityBlock = buildPersonalityPrompt(personalityProfile, soulLayers);
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
