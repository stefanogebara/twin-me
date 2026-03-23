/**
 * Telegram Webhook — Receive and Process Telegram Updates
 * =========================================================
 * Handles incoming messages from Telegram users. Supports:
 * - /start <code> — link Telegram to TwinMe account
 * - Text messages — bidirectional twin chat
 * - Callback queries — inline keyboard responses
 *
 * Uses the same twin context pipeline as web chat for consistent personality.
 */

import express from 'express';
import { webhookCallback } from 'grammy';
import { getBot, sendMessage } from '../services/telegramService.js';
import { supabaseAdmin } from '../services/database.js';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { classifyMessageTier, CHAT_TIER_MODELS } from '../services/chatRouter.js';
import { fetchTwinContext } from '../services/twinContextBuilder.js';
import { getBlocks, formatBlocksForPrompt } from '../services/coreMemoryService.js';
import { buildPersonalityPrompt } from '../services/personalityPromptBuilder.js';
import { getProfile } from '../services/personalityProfileService.js';
import { addConversationMemory } from '../services/memoryStreamService.js';
import { getRedisClient, isRedisAvailable } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TelegramWebhook');
const router = express.Router();

// Rate limit: track messages per user (in-memory, simple)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Dedup: prevent processing the same message twice (Telegram retries on slow responses)
const processedMessages = new Set();
const DEDUP_TTL_MS = 300_000; // 5 minutes

/**
 * Initialize bot commands and handlers.
 */
function setupBotHandlers() {
  const bot = getBot();
  if (!bot) return null;

  // /start command — link account or greet
  bot.command('start', async (ctx) => {
    const args = ctx.match?.trim();
    const chatId = String(ctx.chat.id);

    if (args && args.length >= 4) {
      // Linking flow: /start <code>
      await handleLinkCode(ctx, chatId, args);
    } else {
      // Generic start — check if already linked
      const { data: existing } = await supabaseAdmin
        .from('messaging_channels')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_id', chatId)
        .single();

      if (existing) {
        await ctx.reply('Hey! Your twin is already connected here. Just send me a message.');
      } else {
        await ctx.reply(
          'Welcome to TwinMe! To connect your twin:\n\n' +
          '1. Open TwinMe Settings\n' +
          '2. Click "Connect Telegram"\n' +
          '3. Send the code here\n\n' +
          'Or paste your link code now.'
        );
      }
    }
  });

  // Callback queries — inline keyboard feedback (insight thumbs up/down)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = String(ctx.chat.id);

    // Handle quick-reply buttons (user tapped a suggestion)
    if (data.startsWith('quick_reply_')) {
      const replyText = data.replace('quick_reply_', '');
      await ctx.answerCallbackQuery({ text: `Sending: "${replyText}"` });
      // Re-emit as a regular text message for the twin chat pipeline
      ctx.message = { ...ctx.callbackQuery.message, text: replyText, message_id: Date.now() };
      // Let it fall through to the message:text handler below
      return;
    }

    // Parse insight_up_<id> or insight_down_<id>
    const match = data.match(/^insight_(up|down)_(.+)$/);
    if (!match) {
      await ctx.answerCallbackQuery({ text: 'Unknown action' });
      return;
    }

    const [, direction, insightId] = match;
    const rating = direction === 'up' ? 1 : -1;

    // Look up user
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('user_id')
      .eq('channel', 'telegram')
      .eq('channel_id', chatId)
      .single();

    if (!channel) {
      await ctx.answerCallbackQuery({ text: 'Account not linked' });
      return;
    }

    try {
      // Update insight engagement
      await supabaseAdmin
        .from('proactive_insights')
        .update({ engaged: rating === 1 })
        .eq('id', insightId)
        .eq('user_id', channel.user_id);

      // Log as agent_action for the reflection engine
      const { logAgentAction } = await import('../services/autonomyService.js');
      const action = await logAgentAction(channel.user_id, {
        skillName: 'proactive_insight',
        actionType: 'insight_delivery',
        content: `Telegram insight feedback: ${direction}`,
        autonomyLevel: 1,
      });

      if (action?.id) {
        await supabaseAdmin
          .from('agent_actions')
          .update({
            user_response: rating === 1 ? 'accepted' : 'rejected',
            outcome_data: { source: 'telegram_feedback', insight_id: insightId },
            resolved_at: new Date().toISOString(),
          })
          .eq('id', action.id);
      }

      const emoji = rating === 1 ? '\u{1F44D}' : '\u{1F44E}';
      await ctx.answerCallbackQuery({ text: `${emoji} Feedback recorded! This helps me learn.` });
      log.info('Telegram insight feedback', { userId: channel.user_id, insightId, direction });
    } catch (err) {
      log.error('Callback query error', { insightId, error: err.message });
      await ctx.answerCallbackQuery({ text: 'Failed to record feedback' });
    }
  });

  // Text messages — twin chat
  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text;

    // Skip commands (already handled above)
    if (text.startsWith('/')) return;

    // Dedup: skip if this exact message was already processed (Telegram webhook retry)
    const msgId = String(ctx.message.message_id);
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);
    setTimeout(() => processedMessages.delete(msgId), DEDUP_TTL_MS);

    // Rate limit check
    if (isRateLimited(chatId)) {
      await ctx.reply('Slow down a bit. Too many messages.');
      return;
    }

    // Look up user by chat_id
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('user_id')
      .eq('channel', 'telegram')
      .eq('channel_id', chatId)
      .single();

    if (!channel) {
      await ctx.reply('Your Telegram isn\'t linked to TwinMe yet. Send /start to get started.');
      return;
    }

    const userId = channel.user_id;

    try {
      // Show typing indicator — refresh every 4s since it expires after 5s.
      // The LLM call takes 10-30s so we need to keep refreshing.
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction('typing').catch(() => {});
      }, 4000);
      await ctx.replyWithChatAction('typing');

      try {
        // Run twin chat pipeline (same as web)
        const response = await processTwinMessage(userId, text);

        clearInterval(typingInterval);

        // Store conversation in memory stream
        await addConversationMemory(userId, text, response, { source: 'telegram' }).catch(() => {});

        // Send response (split long messages at 4096 char Telegram limit)
        if (response.length <= 4096) {
          await ctx.reply(response);
        } else {
          const chunks = splitMessage(response, 4096);
          for (const chunk of chunks) {
            await ctx.reply(chunk);
          }
        }
      } catch (innerErr) {
        clearInterval(typingInterval);
        throw innerErr;
      }
    } catch (err) {
      log.error('Telegram chat error', { userId, chatId, error: err.message });
      const userMsg = err.message?.includes('402') || err.message?.includes('credits')
        ? 'My AI brain is temporarily offline (credits). Try again in a bit.'
        : 'Something went wrong. Try again in a moment.';
      await ctx.reply(userMsg).catch(() => {});
    }
  });

  return bot;
}

/**
 * Handle account linking via /start <code>.
 */
async function handleLinkCode(ctx, chatId, code) {
  const redis = isRedisAvailable() ? getRedisClient() : null;
  const key = `telegram_link:${code}`;

  let userId = null;

  if (redis) {
    userId = await redis.get(key);
    if (userId) await redis.del(key);
  } else {
    // Fallback: check a simple DB table for pending links
    const { data } = await supabaseAdmin
      .from('agent_events')
      .select('user_id')
      .eq('event_type', 'telegram_link_code')
      .eq('event_data->>code', code)
      .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
      .single();
    userId = data?.user_id;
  }

  if (!userId) {
    await ctx.reply('Invalid or expired code. Generate a new one in TwinMe Settings.');
    return;
  }

  // Store the channel mapping
  const { error } = await supabaseAdmin
    .from('messaging_channels')
    .upsert({
      user_id: userId,
      channel: 'telegram',
      channel_id: chatId,
      is_enabled: true,
      preferences: {},
    }, { onConflict: 'user_id,channel' });

  if (error) {
    log.error('Failed to link Telegram', { userId, chatId, error: error.message });
    await ctx.reply('Failed to link. Try again.');
    return;
  }

  log.info('Telegram account linked', { userId, chatId });
  await ctx.reply(
    'Connected! Your twin will send you:\n' +
    '- Morning briefings\n' +
    '- Evening recaps\n' +
    '- Music suggestions\n' +
    '- Reminders & insights\n\n' +
    'You can also chat with your twin right here. Try saying hi!'
  );
}

/**
 * Process a message through the twin chat pipeline.
 * Simplified version of twin-chat.js for Telegram (non-streaming).
 */
async function processTwinMessage(userId, message) {
  // Build context (reuse existing pipeline)
  const [twinContext, coreBlocks, personalityProfile] = await Promise.all([
    fetchTwinContext(userId, message).catch(() => ({})),
    getBlocks(userId).catch(() => ({})),
    getProfile(userId).catch(() => null),
  ]);

  // Build system prompt
  const systemParts = [];

  // Core memory blocks first
  const blockText = formatBlocksForPrompt(coreBlocks);
  if (blockText) {
    systemParts.push(blockText);
  }

  // Twin summary (dynamic personality portrait)
  if (twinContext.twinSummary) {
    systemParts.push(`WHO YOU ARE:\n${twinContext.twinSummary}`);
  }

  // Personality prompt (OCEAN-derived behavioral instructions)
  if (personalityProfile) {
    const personalityBlock = buildPersonalityPrompt(personalityProfile);
    if (personalityBlock) systemParts.push(personalityBlock);
  }

  // Memories (reflections + observations)
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

  // Proactive insights (things to surface)
  if (twinContext.proactiveInsights?.length > 0) {
    systemParts.push(`THINGS I NOTICED (bring up naturally):\n${twinContext.proactiveInsights.map(i => `- ${i.insight?.slice(0, 150)}`).join('\n')}`);
  }

  // Channel-specific instructions
  systemParts.push(
    'You are responding via Telegram (not web chat). Keep responses concise — ' +
    'Telegram users expect shorter messages. No markdown headers. ' +
    'Use plain text with occasional *bold* for emphasis. Max 3 paragraphs.'
  );

  const system = systemParts.join('\n\n');

  // Get recent conversation history from Telegram
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

  // Smart routing: use cheapest model that maintains quality (same as web chat)
  // LIGHT (Gemini Flash $0.15/M) for greetings, STANDARD (DeepSeek $0.25/M) for casual,
  // DEEP (Sonnet $3/M) only for emotional/identity/complex. Saves ~75% on most messages.
  const chatTier = classifyMessageTier(message);
  const modelOverride = CHAT_TIER_MODELS[chatTier] || undefined;

  const response = await complete({
    system: [{ type: 'text', text: system }],
    messages: [...history, { role: 'user', content: message }],
    tier: TIER_CHAT,
    maxTokens: 800,
    temperature: personalityProfile?.temperature ?? 0.7,
    userId,
    serviceName: `twin-chat:telegram_${chatTier}`,
    modelOverride,
  });

  return response?.content || response?.text || "I'm having trouble responding right now. Try again in a moment.";
}

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

function isRateLimited(chatId) {
  const now = Date.now();
  const entry = rateLimitMap.get(chatId) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  entry.timestamps.push(now);
  rateLimitMap.set(chatId, entry);
  return entry.timestamps.length > RATE_LIMIT_MAX;
}

// Set up handlers and create webhook middleware
let webhookHandler = null;

router.post('/', (req, res, next) => {
  if (!webhookHandler) {
    const bot = setupBotHandlers();
    if (!bot) {
      return res.status(503).json({ error: 'Telegram bot not configured' });
    }
    // 90-second timeout — twin chat needs 10-30s for LLM + memory retrieval.
    // grammY's default is 10s which is too short for our pipeline.
    webhookHandler = webhookCallback(bot, 'express', 'throw', 90_000);
  }
  return webhookHandler(req, res, next);
});

export default router;
