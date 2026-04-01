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

import express from 'express';
import { sendWhatsAppMessage, markMessageAsRead, verifyWebhookSignature } from '../services/whatsappService.js';
import { supabaseAdmin } from '../services/database.js';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
import { fetchTwinContext } from '../services/twinContextBuilder.js';
import { getBlocks, formatBlocksForPrompt } from '../services/coreMemoryService.js';
import { addConversationMemory } from '../services/memoryStreamService.js';
import { runAgentLoop } from '../services/agenticCore.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppWebhook');
const router = express.Router();

// ====================================================================
// Intent Classification (keyword-based, no LLM — must be instant)
// ====================================================================

const TASK_PATTERNS = [
  { pattern: /check\s*(my\s*)?(emails?|inbox|mail)/i, skill: 'general_task', task: 'Check my recent emails and summarize what needs attention' },
  { pattern: /send\s*(an?\s*)?email/i, skill: 'general_task', task: 'Send an email' },
  { pattern: /draft\s*(an?\s*)?(email|reply|response)/i, skill: 'general_task', task: 'Draft an email reply' },
  { pattern: /reply\s*to\s/i, skill: 'general_task', task: 'Reply to an email' },
  { pattern: /(what'?s?\s*on\s*my\s*calendar|my\s*schedule|what\s*do\s*i\s*have\s*today)/i, skill: 'general_task', task: 'Check my calendar for today and upcoming events' },
  { pattern: /(schedule|create|add)\s*(a\s*)?(meeting|event|appointment)/i, skill: 'general_task', task: 'Create a calendar event' },
  { pattern: /find\s*(free|available)\s*(time|slots?)/i, skill: 'general_task', task: 'Find free time slots in my calendar' },
  { pattern: /(search|find|look\s*up)\s*(in\s*)?(drive|docs|files?)/i, skill: 'general_task', task: 'Search my Google Drive' },
  { pattern: /morning\s*briefing/i, skill: 'morning_briefing', task: 'Give me my morning briefing — calendar, recovery, priorities' },
  { pattern: /what\s*(music|song|playlist)\s*(should|to)/i, skill: 'music_mood_match', task: 'Suggest music based on my current mood and activity' },
];

/**
 * Classify a WhatsApp message as chat or task.
 * Returns { type: 'chat' | 'task', taskDescription, skillName }
 */
function classifyIntent(message) {
  const text = message.trim();
  for (const { pattern, skill, task } of TASK_PATTERNS) {
    if (pattern.test(text)) {
      // Append user's original message for context
      const taskDescription = text.length > task.length
        ? `${task}. User said: "${text}"`
        : task;
      return { type: 'task', taskDescription, skillName: skill };
    }
  }
  return { type: 'chat', taskDescription: null, skillName: null };
}

// ====================================================================
// Agent Result Formatter (structured output → WhatsApp text)
// ====================================================================

function formatAgentResult(result) {
  if (!result) return "I tried but something went wrong. Try again?";

  if (result.blocked) {
    return `I can't do that right now — ${result.reason || 'insufficient permissions'}. You can adjust my autonomy level in Settings.`;
  }

  if (!result.success) {
    return `I ran into an issue: ${result.reason || 'something went wrong'}. Want me to try a different approach?`;
  }

  // Extract useful data from step results
  const parts = [];

  if (result.review?.summary) {
    parts.push(result.review.summary);
  } else if (result.steps?.length > 0) {
    for (const step of result.steps) {
      if (!step.result?.success) continue;
      const data = step.result.data;
      if (!data) continue;

      if (typeof data === 'string') {
        parts.push(data);
      } else if (data.summary) {
        parts.push(data.summary);
      } else if (data.emails?.length > 0) {
        const emailList = data.emails.slice(0, 5).map(e =>
          `• *${e.from || 'Unknown'}*: ${(e.subject || 'No subject').slice(0, 60)}`
        ).join('\n');
        parts.push(`*Recent emails:*\n${emailList}`);
      } else if (data.events?.length > 0) {
        const eventList = data.events.slice(0, 5).map(e =>
          `• ${e.time || ''} — ${(e.title || e.summary || 'Event').slice(0, 50)}`
        ).join('\n');
        parts.push(`*Calendar:*\n${eventList}`);
      } else if (data.files?.length > 0) {
        const fileList = data.files.slice(0, 5).map(f =>
          `• ${(f.name || f.title || 'File').slice(0, 50)}`
        ).join('\n');
        parts.push(`*Files found:*\n${fileList}`);
      } else if (typeof data === 'object') {
        // Generic object — try to extract meaningful text
        const text = data.text || data.content || data.message || data.result;
        if (text) parts.push(String(text).slice(0, 500));
      }
    }
  }

  if (parts.length === 0) {
    return result.plan?.summary || "Done — but I didn't find anything notable to share.";
  }

  return parts.join('\n\n').slice(0, 4000);
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
  if (mode === 'subscribe' && token === verifyToken) {
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

      // Classify intent: chat or task?
      const intent = classifyIntent(text);
      let response;

      if (intent.type === 'task') {
        log.info('Agentic task detected', { userId, skill: intent.skillName, task: intent.taskDescription?.slice(0, 60) });
        try {
          const result = await runAgentLoop(userId, intent.taskDescription, {
            skillName: intent.skillName,
            maxSteps: 3,
          });
          response = formatAgentResult(result);
        } catch (err) {
          log.error('Agent loop failed', { userId, error: err.message });
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
