/**
 * WhatsApp Webhook — TwinMe Agentic Twin via Meta Cloud API
 * ===========================================================
 * Handles incoming WhatsApp messages with two modes:
 *   - Chat: conversational responses (context + LLM)
 *   - Agentic: tool execution via agenticCore (email, calendar, etc.)
 *
 * GET  /api/whatsapp-twin/webhook — Meta verification challenge
 * POST /api/whatsapp-twin/webhook — Incoming messages
 */

import crypto from 'crypto';
import express from 'express';
import { sendWhatsAppMessage, markMessageAsRead, verifyWebhookSignature } from '../services/whatsappService.js';
import { supabaseAdmin } from '../services/database.js';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
import { fetchTwinContext } from '../services/twinContextBuilder.js';
import { getBlocks, formatBlocksForPrompt } from '../services/coreMemoryService.js';
import { addConversationMemory } from '../services/memoryStreamService.js';
import { executeTool } from '../services/toolRegistry.js';
import { createLogger } from '../services/logger.js';
import { buildPurchaseContext } from '../services/purchaseContextBuilder.js';
import { generatePurchaseReflection } from '../services/purchaseReflection.js';

const log = createLogger('WhatsAppWebhook');
const router = express.Router();

// ====================================================================
// Intent Classification → Direct Tool Mapping (no planner, instant)
// ====================================================================

// Pre-purchase intent: user says they're thinking about buying something.
// Fires BEFORE the tool intents so a message like "vou comprar..." routes to
// reflection, not to a Gmail/Calendar tool. Phase: Financial-Emotional Twin.
const PURCHASE_INTENT_PATTERNS = [
  /\bvou\s+compra/i,
  /\bpensando\s+em\s+compra/i,
  /\best(ou|á)\s+a?\s*fim\s+de\s+compra/i,
  /\b(about\s+to|thinking\s+(?:of|about))\s+buy(?:ing)?/i,
  /\bR\$\s*\d/,
  /\$\s*\d+.*(?:buy|purchase|cart|checkout)/i,
];

const TOOL_INTENTS = [
  { pattern: /check\s*(my\s*)?(emails?|inbox|mail)/i, tool: 'gmail_search', params: { query: 'is:unread newer_than:1d', maxResults: 5 } },
  { pattern: /unread\s*(emails?|mail)/i, tool: 'gmail_search', params: { query: 'is:unread', maxResults: 5 } },
  { pattern: /(what'?s?\s*on\s*my\s*calendar|my\s*schedule|what\s*do\s*i\s*have\s*today)/i, tool: 'calendar_today', params: {} },
  { pattern: /(tomorrow|upcoming|next\s*few\s*days|this\s*week)/i, tool: 'calendar_upcoming', params: { days: 3 } },
  { pattern: /find\s*(free|available)\s*(time|slots?)/i, tool: 'calendar_find_free_slots', params: { days: 3 } },
  { pattern: /(search|find|look\s*up)\s*(in\s*)?(drive|docs|files?)/i, tool: 'drive_search', params: {} },
  { pattern: /morning\s*briefing/i, tool: 'calendar_today', params: {} },
  { pattern: /(now\s*playing|what.*listening|current.*song)/i, tool: 'spotify_now_playing', params: {} },
  { pattern: /(recent\s*tracks?|what.*been\s*listening)/i, tool: 'spotify_recent_tracks', params: { limit: 5 } },
  { pattern: /(my\s*recovery|how.*body|whoop)/i, tool: 'whoop_recovery', params: {} },
];

/**
 * Classify a WhatsApp message as chat or tool action.
 * Returns { type: 'chat' | 'tool', toolName, toolParams }
 */
function classifyIntent(message) {
  const text = message.trim();

  // Purchase-check fires first — user mentioning an amount or intent to buy
  // should never be interpreted as a calendar/gmail tool call.
  for (const pattern of PURCHASE_INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return { type: 'purchase', toolName: null, toolParams: null };
    }
  }

  for (const { pattern, tool, params } of TOOL_INTENTS) {
    if (pattern.test(text)) {
      // Extract dynamic params from message (e.g., search query for drive)
      const dynamicParams = { ...params };
      if (tool === 'drive_search') {
        const match = text.match(/(?:search|find|look\s*up).*(?:drive|docs|files?)\s+(?:for\s+)?(.+)/i);
        if (match) dynamicParams.query = match[1].trim();
      }
      if (tool === 'gmail_search' && !params.query) {
        const match = text.match(/(?:search|find).*(?:email|mail).*(?:for|about)\s+(.+)/i);
        if (match) dynamicParams.query = match[1].trim();
      }
      return { type: 'tool', toolName: tool, toolParams: dynamicParams };
    }
  }
  return { type: 'chat', toolName: null, toolParams: null };
}

// ====================================================================
// Agent Result Formatter (structured output → WhatsApp text)
// ====================================================================

/**
 * Format tool execution result as WhatsApp-friendly text.
 */
function formatToolResult(toolName, result) {
  if (!result) return "I tried but something went wrong. Try again?";

  if (!result.success) {
    return `Couldn't complete that: ${result.error || 'unknown error'}`;
  }

  const data = result.data;
  if (!data) return "Done, but nothing to report.";

  // Email results
  if (data.emails?.length > 0) {
    const list = data.emails.slice(0, 5).map(e =>
      `• *${(e.from || e.sender || 'Unknown').split('<')[0].trim()}* — ${(e.subject || 'No subject').slice(0, 60)}`
    ).join('\n');
    return `*${data.emails.length} recent emails:*\n\n${list}${data.emails.length > 5 ? `\n\n...and ${data.emails.length - 5} more` : ''}`;
  }

  // Calendar results
  if (data.events?.length > 0) {
    const list = data.events.slice(0, 8).map(e => {
      const time = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : (e.time || '');
      return `• ${time} — ${(e.summary || e.title || 'Event').slice(0, 50)}`;
    }).join('\n');
    return `*Today's calendar:*\n\n${list}`;
  }

  // Free slots
  if (data.freeSlots?.length > 0) {
    const list = data.freeSlots.slice(0, 5).map(s => `• ${s.start} — ${s.end}`).join('\n');
    return `*Free time slots:*\n\n${list}`;
  }

  // Spotify
  if (data.track || data.artist) {
    return `*Now playing:* ${data.track || 'Unknown'} by ${data.artist || 'Unknown'}`;
  }
  if (data.tracks?.length > 0) {
    const list = data.tracks.slice(0, 5).map(t => `• ${t.name || t.track} — ${t.artist}`).join('\n');
    return `*Recent tracks:*\n\n${list}`;
  }

  // Whoop
  if (data.recovery != null || data.recovery_score != null) {
    return `*Recovery:* ${data.recovery || data.recovery_score}%\n*Sleep:* ${data.sleep_hours || '?'}h\n*HRV:* ${data.hrv || '?'}ms`;
  }

  // Drive files
  if (data.files?.length > 0) {
    const list = data.files.slice(0, 5).map(f => `• ${(f.name || f.title || 'File').slice(0, 50)}`).join('\n');
    return `*Files found:*\n\n${list}`;
  }

  // Generic string
  if (typeof data === 'string') return data.slice(0, 2000);
  if (data.text || data.content || data.message) return String(data.text || data.content || data.message).slice(0, 2000);

  // Last resort — JSON dump
  return JSON.stringify(data).slice(0, 500);
}

// ====================================================================
// Webhook Handlers
// ====================================================================

// Meta webhook verification (GET)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.TWINME_WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && verifyToken && token &&
      token.length === verifyToken.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(verifyToken))) {
    log.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  log.warn('WhatsApp webhook verification failed');
  return res.sendStatus(403);
});

// Incoming messages (POST)
router.post('/webhook', express.json(), async (req, res) => {
  if (!process.env.TWINME_WHATSAPP_WEBHOOK_SECRET) {
    log.error('TWINME_WHATSAPP_WEBHOOK_SECRET not configured');
    return res.sendStatus(403);
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return res.sendStatus(403);

  const rawBody = JSON.stringify(req.body);
  if (!verifyWebhookSignature(signature, rawBody)) return res.sendStatus(403);

  // Process BEFORE responding (Vercel kills functions after res.send)
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (!messages?.length) return res.sendStatus(200);

    for (const msg of messages) {
      if (msg.type !== 'text') continue;

      const phone = msg.from;
      const text = msg.text?.body;
      if (!phone || !text) continue;

      // Mark as read immediately (blue checkmarks)
      markMessageAsRead(msg.id).catch(() => {});

      // Look up user
      const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;
      const phoneWithout = phone.startsWith('+') ? phone.slice(1) : phone;

      const { data: channel } = await supabaseAdmin
        .from('messaging_channels')
        .select('user_id')
        .eq('channel', 'whatsapp')
        .or(`channel_id.eq.${phoneWithPlus},channel_id.eq.${phoneWithout}`)
        .single();

      if (!channel) {
        log.warn('No messaging_channels match', { phone });
        await sendWhatsAppMessage(phoneWithout, "Your WhatsApp isn't linked to TwinMe yet. Go to Settings in the app to connect.");
        continue;
      }

      const userId = channel.user_id;
      log.info('WhatsApp message received', { userId, textLength: text.length });

      // Classify intent: chat or tool action?
      const intent = classifyIntent(text);
      let response;

      if (intent.type === 'purchase') {
        log.info('Purchase intent detected', { userId });
        try {
          const ctx = await buildPurchaseContext(userId);
          const refl = await generatePurchaseReflection(ctx, text);
          response = refl.text;
        } catch (err) {
          log.error('Purchase reflection failed, falling back to chat', { userId, error: err.message });
          response = await processTwinMessage(userId, text);
        }
      } else if (intent.type === 'tool') {
        log.info('Tool action detected', { userId, tool: intent.toolName });
        try {
          const result = await executeTool(userId, intent.toolName, intent.toolParams);
          response = formatToolResult(intent.toolName, result);
        } catch (err) {
          log.error('Tool execution failed, falling back to chat', { userId, tool: intent.toolName, error: err.message });
          response = await processTwinMessage(userId, text);
        }
      } else {
        response = await processTwinMessage(userId, text);
      }

      // Store conversation (fire and forget)
      addConversationMemory(userId, text, response, { source: 'whatsapp' }).catch(() => {});

      // Send response
      await sendWhatsAppMessage(phoneWithout, response.length <= 4096 ? response : response.slice(0, 4096));
      log.info('WhatsApp response sent', { userId, type: intent.type, responseLength: response.length });
    }
  } catch (err) {
    log.error('WhatsApp webhook error', { error: err.message, stack: err.stack });
  }

  res.sendStatus(200);
});

/**
 * Process a conversational message (no tools).
 */
async function processTwinMessage(userId, message) {
  const [twinContext, coreBlocks] = await Promise.all([
    fetchTwinContext(userId, message).catch(() => ({})),
    getBlocks(userId).catch(() => ({})),
  ]);

  const systemParts = [];

  const blockText = formatBlocksForPrompt(coreBlocks);
  if (blockText) systemParts.push(blockText);

  if (twinContext.twinSummary) {
    systemParts.push(`WHO YOU ARE:\n${twinContext.twinSummary}`);
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
    system,
    messages: [{ role: 'user', content: message }],
    tier: TIER_ANALYSIS,
    maxTokens: 500,
    temperature: 0.7,
    userId,
    serviceName: 'twin-chat:whatsapp',
  });

  return response?.content || response?.text || "I'm having trouble right now. Try again in a moment.";
}

export default router;
