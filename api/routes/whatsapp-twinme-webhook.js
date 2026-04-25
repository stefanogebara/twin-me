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
import { getRedisClient } from '../services/redisClient.js';

// H4 — telemetry. Structured log envelope so a future PostHog (or BigQuery,
// or a simple Supabase events table) ingest can pick up purchase-bot signal
// without changing every callsite. Emits one log line per event with
// `telemetry: true` so log forwarders can split it out. NEVER include user
// text or reflection content — only metadata.
function captureTelemetry(eventName, properties = {}) {
  try {
    log.info(`telemetry:${eventName}`, { telemetry: true, event: eventName, ...properties });
  } catch (_e) {
    // never let telemetry crash the request flow
  }
}

// H10 — purchase_reflections audit table. Persists outcomes durably so we
// can answer the Day-7 success question and analyze false-positive rate
// without grepping log files. Hashed user message (sha256 truncated)
// allows dedup analysis without storing plaintext.
function logPurchaseReflection(userId, outcome, userText, props = {}) {
  try {
    const text_hash = userText
      ? crypto.createHash('sha256').update(userText).digest('hex').slice(0, 32)
      : null;
    // Fire-and-forget — never block the response path
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
      if (error) log.warn('purchase_reflections write failed', { outcome, error: error.message });
    });
  } catch (_e) {
    // never let audit writes crash the request flow
  }
}

// Per-user purchase-intent rate limit. Cap is intentionally low — the bot
// is a reflective companion, not a search agent. 10 messages/hour gives
// plenty of room for a real moment of indecision but caps cost runaway and
// spam to a few cents per attacker per hour.
const PURCHASE_RATE_LIMIT = parseInt(process.env.PURCHASE_RATE_LIMIT_PER_HOUR || '10', 10);
const _purchaseRateMem = new Map(); // fallback when Redis is down

// C4 — Webhook dedup. Meta retries failed deliveries with the same `wamid`,
// so the handler can't be naive about "is this the same message I already
// processed?" without a per-message lock. We use SETNX with 5min TTL, which
// is well past Meta's retry window. Return true on first sight, false on
// repeat.
async function claimWhatsAppMessageId(messageId) {
  if (!messageId) return true; // missing id is rare; let it through rather than drop
  const key = `wamid_seen:${messageId}`;
  try {
    const redis = getRedisClient();
    if (redis) {
      // SET key value NX EX 300 — succeed only if absent, expire after 5min.
      const result = await redis.set(key, '1', 'EX', 300, 'NX');
      return result === 'OK';
    }
  } catch (_e) {
    // fall through to in-memory
  }
  // In-memory fallback. Dies on cold start but that's fine — Meta retries
  // within seconds, server stays warm during a retry storm.
  if (_wamidSeen.has(key)) return false;
  _wamidSeen.set(key, Date.now() + 300_000);
  // Best-effort prune
  if (_wamidSeen.size > 5000) {
    const now = Date.now();
    for (const [k, exp] of _wamidSeen) {
      if (exp < now) _wamidSeen.delete(k);
    }
  }
  return true;
}
const _wamidSeen = new Map();

async function acquirePurchaseRateSlot(userId) {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `purchase_intents:${userId}:${hour}`;
  try {
    const redis = getRedisClient();
    if (redis) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 3700); // ~1h + small grace
      return count <= PURCHASE_RATE_LIMIT;
    }
  } catch (_e) {
    // fall through to in-memory
  }
  // In-memory fallback (single-instance only — Vercel cold starts may reset)
  const cur = _purchaseRateMem.get(key) || 0;
  if (cur >= PURCHASE_RATE_LIMIT) return false;
  _purchaseRateMem.set(key, cur + 1);
  // Best-effort cleanup
  if (_purchaseRateMem.size > 1000) {
    const cutoff = new Date(Date.now() - 7200_000).toISOString().slice(0, 13);
    for (const k of _purchaseRateMem.keys()) {
      if (k.split(':')[2] < cutoff) _purchaseRateMem.delete(k);
    }
  }
  return true;
}

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

// Incoming messages (POST). Body parsing is done by the global express.json
// middleware in server.js, which ALSO captures req.rawBody for HMAC verification
// when the URL matches the webhook allowlist. Do NOT mount express.json() here
// — it would consume the stream before the global verify hook runs and silently
// break signature verification.
router.post('/webhook', async (req, res) => {
  if (!process.env.TWINME_WHATSAPP_WEBHOOK_SECRET) {
    log.error('TWINME_WHATSAPP_WEBHOOK_SECRET not configured');
    return res.sendStatus(403);
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return res.sendStatus(403);

  // Use the raw bytes captured by the global verify hook — JSON.stringify of
  // the parsed body is NOT byte-equivalent to Meta's HMAC input and would
  // never match. If rawBody is missing the route is misconfigured.
  if (!req.rawBody) {
    log.error('req.rawBody missing — server.js verify allowlist out of sync');
    return res.sendStatus(500);
  }
  if (!verifyWebhookSignature(signature, req.rawBody)) return res.sendStatus(403);

  // Process BEFORE responding (Vercel kills functions after res.send)
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (!messages?.length) return res.sendStatus(200);

    for (const msg of messages) {
      if (msg.type !== 'text') continue;

      // C4 — dedup on wamid. Meta retries the same payload up to ~5 times
      // for failed acks; without this gate we'd run 5 reflections, store 5
      // memory turns, and burn 5x cost.
      if (!(await claimWhatsAppMessageId(msg.id))) {
        log.info('WhatsApp message duplicate ignored', { wamid: msg.id });
        continue;
      }

      // Sanitize phone — webhook payload is attacker-controllable. Allow only
      // E.164 chars (+ and digits). Anything else gets stripped before we put
      // it into a Supabase .or() filter, which is string-interpolated and
      // could otherwise be used to alter the OR clause.
      const rawPhone = msg.from;
      if (!rawPhone) continue;
      const phone = String(rawPhone).replace(/[^\d+]/g, '');
      if (!phone || phone.length < 8 || phone.length > 16) continue;

      const text = msg.text?.body;
      if (!text) continue;
      // Length cap: WhatsApp allows ~65k chars but a real user message that's
      // even close to 2000 is either spam, a paste accident, or an attack on
      // the LLM token budget. Drop and move on.
      if (text.length > 2000) {
        log.warn('Dropping oversize WhatsApp message', { phoneLen: phone.length, textLen: text.length });
        continue;
      }

      // Mark as read immediately (blue checkmarks)
      markMessageAsRead(msg.id).catch(() => {});

      // Look up user. Both forms ('+5511...' and '5511...') exist in the wild
      // depending on how the user linked.
      const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;
      const phoneWithout = phone.startsWith('+') ? phone.slice(1) : phone;

      const { data: channel } = await supabaseAdmin
        .from('messaging_channels')
        .select('user_id, preferences')
        .eq('channel', 'whatsapp')
        .or(`channel_id.eq.${phoneWithPlus},channel_id.eq.${phoneWithout}`)
        .single();

      if (!channel) {
        log.warn('No messaging_channels match', { phone });
        await sendWhatsAppMessage(phoneWithout, "Your WhatsApp isn't linked to TwinMe yet. Go to Settings in the app to connect.");
        continue;
      }

      const userId = channel.user_id;
      // C7 — user-level opt-out for the purchase bot. Stored in
      // messaging_channels.preferences.purchase_bot_enabled (default true).
      // To opt a user out: UPDATE messaging_channels SET preferences =
      // jsonb_set(coalesce(preferences,'{}'), '{purchase_bot_enabled}', 'false')
      // WHERE user_id = ... AND channel = 'whatsapp';
      const userPrefs = channel.preferences || {};
      const purchaseBotEnabledForUser = userPrefs.purchase_bot_enabled !== false;
      log.info('WhatsApp message received', { userId, textLength: text.length });

      // Classify intent: chat or tool action?
      const intent = classifyIntent(text);
      let response;

      if (intent.type === 'purchase') {
        // C6 — global kill switch (env). C7 — per-user opt-out (preferences).
        // Both must allow before we fire a reflection.
        if (process.env.PURCHASE_BOT_ENABLED !== 'true') {
          log.info('Purchase intent detected but bot disabled (env) — falling through to chat', { userId });
          response = await processTwinMessage(userId, text);
          logPurchaseReflection(userId, 'kill_switch', text);
        } else if (!purchaseBotEnabledForUser) {
          log.info('Purchase intent detected but user opted out — falling through to chat', { userId });
          response = await processTwinMessage(userId, text);
          logPurchaseReflection(userId, 'opted_out', text);
        } else if (!(await acquirePurchaseRateSlot(userId))) {
          // C5: per-user rate limit. Cap at PURCHASE_RATE_LIMIT_PER_HOUR
          // (default 10) intents per user per rolling hour. Returns a soft
          // message instead of running another LLM round.
          log.warn('Purchase rate limit exceeded', { userId });
          response = "Você tá querendo comprar bastante coisa hoje, hein? Vou te dar um espaço — manda de novo daqui a pouco.";
          captureTelemetry('purchase_reflection_rate_limited', { userId });
          logPurchaseReflection(userId, 'rate_limited', text);
        } else {
          log.info('Purchase intent detected', { userId });
          try {
            const ctx = await buildPurchaseContext(userId);
            const refl = await generatePurchaseReflection(ctx, text);
            response = refl.text;
            const auditProps = {
              lang: refl.lang,
              hasMusic: !!ctx.music?.available && !ctx.music?.stale,
              hasCalendar: !!ctx.schedule?.available && (ctx.schedule.events?.length || 0) > 0,
              moment_band: ctx.moment?.band,
              elapsed_ms: refl.elapsed_ms,
              cost: refl.cost,
              response_length: refl.text?.length || 0,
            };
            // H4 — telemetry log line. H10 — durable audit row.
            captureTelemetry('purchase_reflection_generated', { userId, ...auditProps });
            logPurchaseReflection(userId, 'generated', text, auditProps);
          } catch (err) {
            // H9: do NOT escalate to processTwinMessage (Claude Sonnet, ~50x
            // cost). Return a fixed fallback string instead.
            log.error('Purchase reflection failed', { userId, error: err.message });
            response = "Tive um problema agora pra te responder. Tenta de novo daqui a pouco?";
            captureTelemetry('purchase_reflection_failed', { userId, error: err.message });
            logPurchaseReflection(userId, 'failed', text, { error: err.message });
          }
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
      addConversationMemory(userId, text, response, { source: 'whatsapp' })
        .catch(err => log.warn('addConversationMemory failed (turn lost)', { userId, error: err?.message }));

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
