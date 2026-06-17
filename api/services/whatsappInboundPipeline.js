/**
 * WhatsApp Inbound Pipeline — provider-agnostic message processing.
 * =================================================================
 * Both inbound webhooks (Kapso/Meta official API, and Z-API unofficial
 * WhatsApp-Web) normalize their wire format into ONE shape and hand it here.
 * This is the single home for everything that happens AFTER parsing:
 *
 *   rate limit -> user lookup -> statement / receipt / thread-approval /
 *   transaction-capture / purchase-intent / twin-chat -> reply -> offer next
 *   proposal.
 *
 * Why a shared module: the logic used to live inline in the Kapso route and was
 * copy-pasted from the direct-Meta route, with a "if you change the patterns,
 * change them in both files" comment papering over the drift. A third copy for
 * Z-API would have made that worse. The provider differences (auth, wire
 * format, media handling) stay in the thin route files; the brain lives here.
 *
 * Normalized inbound shape (what routes must produce):
 *   {
 *     phone:        string,         // digits, with or without leading '+'
 *     text?:        string,         // text body (null for media)
 *     document?:    { id, filename, mimeType },   // id = media id OR direct URL
 *     image?:       { id, mimeType, caption },     // id = media id OR direct URL
 *     messageId?:   string,
 *     contactName?: string,
 *     format?:      string,         // for logging/debugging only
 *   }
 *
 * `send(phone, text)` is injected so replies go back out the SAME provider the
 * message arrived on (a mixed Kapso+Z-API window must not cross channels).
 * Media downloads inside the ingests resolve the provider themselves via
 * downloadWhatsAppMedia (it handles both media-ids and direct URLs).
 */

import crypto from 'crypto';
import { supabaseAdmin } from './database.js';
import { complete, TIER_CHAT } from './llmGateway.js';
import { classifyMessageTier, CHAT_TIER_MODELS } from './chatRouter.js';
import { fetchTwinContext } from './twinContextBuilder.js';
import { checkChatRateLimit } from './chatRateLimiter.js';
import { getBlocks, formatBlocksForPrompt } from './coreMemoryService.js';
import { buildPersonalityPrompt } from './personalityPromptBuilder.js';
import { getProfile, getSoulSignatureLayers } from './personalityProfileService.js';
import { addConversationMemory } from './memoryStreamService.js';
import { createLogger } from './logger.js';
import { buildPurchaseContext } from './purchaseContextBuilder.js';
import { generatePurchaseReflection } from './purchaseReflection.js';
import { classifyProtocolReply, resolveProtocolReply, offerNextProposal } from './threadApprovals.js';
import { buildWorkspaceActionsPrompt } from './tools/workspaceActionParser.js';
import { runWorkspaceActionChain } from './workspaceActionChain.js';
import { tryCaptureTransaction, checkAndBumpCaptureQuota } from './transactions/whatsappTransactionCapture.js';
import { isStatementDocument, handleStatementDocument } from './transactions/whatsappStatementIngest.js';
import { handleReceiptImage } from './transactions/pixReceiptIngest.js';
import { handleFileUploadToDrive } from './transactions/whatsappFileIngest.js';
import { sendWhatsAppCtaButton } from './whatsappService.js';
import { classifyConnectIntent, buildConnectLink } from './connectLinkService.js';

const log = createLogger('WhatsAppInbound');

// ====================================================================
// Pre-purchase intent patterns (forward tense — "vou comprar"). Disjoint by
// construction from transaction capture (past tense / receipts).
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
export function matchesPurchaseIntent(text) {
  if (!text || typeof text !== 'string') return false;
  if (PURCHASE_INTENT_NEGATIVE.some(re => re.test(text))) return false;
  return PURCHASE_INTENT_PATTERNS.some(re => re.test(text));
}

// Audit-table writer for purchase-reflection outcomes. Never throws.
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
// Per-phone rate limiting (in-memory, shared across providers)
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

const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of rateLimitMap) {
    const active = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) rateLimitMap.delete(phone);
  }
}, 300_000);
rateLimitCleanupInterval.unref();

// ====================================================================
// Main entry — process one normalized inbound message.
//
// `send(phone, text)` must resolve when the provider has accepted the message.
// Returns a small summary object for the route to log; never throws (the route
// still 200s so the provider doesn't retry-storm).
// ====================================================================
export async function processInboundWhatsApp(parsed, { send }) {
  if (!parsed || !parsed.phone || (!parsed.text && !parsed.document && !parsed.image)) {
    log.info('Non-text or unparseable message, skipping', { format: parsed?.format });
    return { handled: false, reason: 'unparseable' };
  }

  const { phone, text, messageId, contactName, format } = parsed;
  log.info('WhatsApp message received', { phone: phone.slice(-4), format, messageId });

  // 1. Rate limit
  if (isRateLimited(phone)) {
    log.warn('Rate limited', { phone: phone.slice(-4) });
    await send(phone, 'You\'re sending messages too fast. Please wait a moment.');
    return { handled: false, reason: 'rate_limited' };
  }

  // 2. Look up user by phone (both '+5511...' and '5511...' forms exist).
  const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;
  const phoneWithout = phone.startsWith('+') ? phone.slice(1) : phone;
  const { data: channels } = await supabaseAdmin
    .from('messaging_channels')
    .select('user_id, preferences')
    .eq('channel', 'whatsapp')
    .in('channel_id', [phoneWithPlus, phoneWithout])
    .limit(1);
  const channel = channels?.[0] || null;

  if (!channel) {
    log.info('Unlinked WhatsApp user', { phone: phone.slice(-4), contactName });
    await send(
      phone,
      'Welcome to TwinMe! Your WhatsApp isn\'t linked to an account yet.\n\n' +
      'To connect:\n' +
      '1. Open TwinMe app\n' +
      '2. Go to Settings\n' +
      '3. Tap "Connect WhatsApp"\n' +
      '4. Enter your phone number\n\n' +
      'Once linked, you can chat with your digital twin right here!'
    );
    return { handled: false, reason: 'unlinked' };
  }

  const userId = channel.user_id;
  const userPrefs = channel.preferences || {};
  const purchaseBotEnabledForUser = userPrefs.purchase_bot_enabled !== false;

  // 3. Document — bank statement (OFX/CSV/XLSX) goes to the money ingest;
  // anything else gets saved to the user's Google Drive ("file it for me").
  if (parsed.document) {
    if (!isStatementDocument(parsed.document)) {
      const drive = await handleFileUploadToDrive(userId, parsed.document);
      await send(phone, drive.reply);
      await addConversationMemory(
        userId,
        `[sent file: ${parsed.document.filename || 'file'}]`,
        drive.reply,
        { source: 'whatsapp', messageId, contactName },
      ).catch(err => log.warn('Failed to store file conversation memory', { userId, error: err.message }));

      log.info('WhatsApp file → Drive', { userId, ok: drive.ok, filename: parsed.document.filename });
      return { handled: true, kind: 'file_drive', userId };
    }

    const result = await handleStatementDocument(userId, parsed.document);
    await send(phone, result.reply);
    await addConversationMemory(
      userId,
      `[sent bank statement: ${parsed.document.filename || 'file'}]`,
      result.reply,
      { source: 'whatsapp', messageId, contactName },
    ).catch(err => log.warn('Failed to store statement conversation memory', { userId, error: err.message }));

    log.info('WhatsApp statement processed', { userId, ok: result.ok, inserted: result.inserted ?? 0 });
    return { handled: true, kind: 'statement', userId };
  }

  // 4. Receipt image — forwarded Pix comprovante screenshot.
  if (parsed.image) {
    const quota = await checkAndBumpCaptureQuota(userId, 'image');
    if (!quota.allowed) {
      await send(phone, 'Limite diario de comprovantes por imagem atingido — me manda em texto que eu anoto.');
      return { handled: true, kind: 'image_quota', userId };
    }
    const result = await handleReceiptImage(userId, parsed.image);
    await send(phone, result.reply);
    await addConversationMemory(
      userId,
      `[sent payment receipt image${parsed.image.caption ? `: ${parsed.image.caption}` : ''}]`,
      result.reply,
      { source: 'whatsapp', messageId, contactName },
    ).catch(err => log.warn('Failed to store receipt conversation memory', { userId, error: err.message }));

    log.info('WhatsApp receipt processed', { userId, ok: result.ok, inserted: result.inserted ?? 0 });
    return { handled: true, kind: 'receipt', userId };
  }

  // 5. Thread approvals — a SHORT "yes"/"skip" resolves the offered proposal.
  const protocolIntent = classifyProtocolReply(text);
  if (protocolIntent) {
    const confirmation = await resolveProtocolReply(userId, protocolIntent);
    if (confirmation) {
      await send(phone, confirmation);
      await addConversationMemory(userId, text, confirmation, { source: 'whatsapp', messageId, contactName })
        .catch(err => log.warn('Failed to store approval memory', { userId, error: err.message }));
      log.info('Thread approval resolved', { userId, intent: protocolIntent });
      return { handled: true, kind: 'approval', userId };
    }
  }

  // 5b. Connect intent — "conecta meu spotify" / "connect my gmail" → hand the
  // user a Nango OAuth button. The connection completes server-side via the
  // Nango webhook; no web login needed. (Deliberately ignores "liga pro X" —
  // that's place_call, not connect.)
  const connectIntent = classifyConnectIntent(text);
  if (connectIntent) {
    if (!connectIntent.platform) {
      const menu = 'I can connect: Spotify, Gmail, Google Calendar, YouTube, GitHub, Discord, Whoop, Outlook. Which one? (e.g. "conecta meu spotify")';
      await send(phone, menu);
      await addConversationMemory(userId, text, menu, { source: 'whatsapp', messageId, contactName })
        .catch(err => log.warn('Failed to store connect-menu memory', { userId, error: err.message }));
      return { handled: true, kind: 'connect_menu', userId };
    }
    const link = await buildConnectLink(userId, connectIntent.platform);
    if (link.success) {
      const body = `Tap to connect ${link.platform} to your twin. It opens a secure ${link.platform} sign-in — your twin never sees your password.`;
      await sendWhatsAppCtaButton(phone, { body, buttonText: 'Connect', url: link.url });
      await addConversationMemory(userId, text, `Sent a ${link.platform} connect link.`, { source: 'whatsapp', messageId, contactName })
        .catch(err => log.warn('Failed to store connect memory', { userId, error: err.message }));
      log.info('Connect link sent', { userId, platform: link.integrationId });
      return { handled: true, kind: 'connect', userId };
    }
    await send(phone, link.message || 'I couldn\'t create a connect link right now — try again in a moment.');
    return { handled: true, kind: 'connect_error', userId };
  }

  // 6. Text transaction capture — forwarded bank/Pix notification TEXTS and
  // "gastei 80 no ifood" statements become user_transactions rows.
  const capture = await tryCaptureTransaction(userId, { messageType: 'text', text }, { purchaseBotEnabledForUser });

  // 7. Pre-purchase intent (forward tense) vs normal chat.
  let response;
  if (capture.handled) {
    response = capture.reply;
  } else if (matchesPurchaseIntent(text)) {
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
    response = await processTwinMessage(userId, text);
  }

  // 8. Store conversation in memory stream
  await addConversationMemory(userId, text, response, { source: 'whatsapp', messageId, contactName })
    .catch(err => log.warn('Failed to store conversation memory', { userId, error: err.message }));

  // 9. Send response (WhatsApp limit: 4096 chars)
  if (response.length <= 4096) {
    await send(phone, response);
  } else {
    for (const chunk of splitMessage(response, 4096)) await send(phone, chunk);
  }
  log.info('WhatsApp response sent', { userId, phone: phone.slice(-4), responseLen: response.length });

  // 10. Offer the next pending proposal (one-interface approval surface).
  try {
    const offer = await offerNextProposal(userId);
    if (offer) {
      await send(phone, offer);
      log.info('Proposal offered in thread', { userId });
    }
  } catch (err) {
    log.warn('Proposal offer failed (non-fatal)', { userId, error: err.message });
  }

  return { handled: true, kind: 'chat', userId };
}

// ====================================================================
// Twin chat pipeline (smart routing, same tiers as Telegram/web)
// ====================================================================
async function processTwinMessage(userId, message) {
  const rateLimit = await checkChatRateLimit(userId);
  if (!rateLimit.allowed) {
    const minutes = Math.ceil((rateLimit.retryAfterMs || 0) / 60000);
    return `You've been chatty (${rateLimit.used}/${rateLimit.limit} messages this hour). Take a breath — I'll be here in ${minutes || 'a few'} minutes.`;
  }

  const [twinContext, coreBlocks, personalityProfile, soulLayers, workspaceBlock] = await Promise.all([
    fetchTwinContext(userId, message, { enrichments: true }).catch(() => ({})),
    getBlocks(userId).catch(() => ({})),
    getProfile(userId).catch(() => null),
    getSoulSignatureLayers(userId).catch(() => null),
    // Same action-capability prompt the web twin gets, so the twin can emit
    // [ACTION: ...] tags over WhatsApp too. Empty string when the user has no
    // action-capable platforms connected (non-fatal).
    buildWorkspaceActionsPrompt(userId).catch(() => ''),
  ]);

  const systemParts = [];
  const blockText = formatBlocksForPrompt(coreBlocks);
  if (blockText) systemParts.push(blockText);
  if (twinContext.twinSummary) systemParts.push(`WHO YOU ARE:\n${twinContext.twinSummary}`);
  if (personalityProfile || soulLayers) {
    const personalityBlock = buildPersonalityPrompt(personalityProfile, soulLayers);
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

  if (twinContext.proactiveInsights?.length > 0) {
    systemParts.push(`THINGS I NOTICED (bring up naturally):\n${twinContext.proactiveInsights.map(i => `- ${i.insight?.slice(0, 150)}`).join('\n')}`);
  }

  // Action capabilities (email, calendar, drive, etc.) — same block the web
  // twin uses. Lets the twin DO things from WhatsApp, not just talk.
  if (workspaceBlock) systemParts.push(workspaceBlock);

  systemParts.push(
    'You are responding via WhatsApp. Keep responses concise — ' +
    'WhatsApp users expect shorter messages. No markdown headers. ' +
    'Use *bold* for emphasis. Max 3 paragraphs.'
  );

  const system = systemParts.join('\n\n');

  const { data: recentMsgs } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'conversation')
    .order('created_at', { ascending: false })
    .limit(10);

  const history = (recentMsgs || [])
    .reverse()
    .map(m => ({ role: m.metadata?.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

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

  const respText = response?.content || response?.text || "I'm having trouble responding right now. Try again in a moment.";

  // Run the workspace action chain (same machinery as the web twin): if the
  // reply contains [ACTION: ...] tags, execute read tools inline and feed
  // results back; write tools (send email, create event, etc.) are queued to
  // agent_actions for approval — they then surface for yes/skip via
  // offerNextProposal after this reply, executed by executeApprovedAction.
  // Non-streaming, bounded by the chain's own per-tool/turn budget. Any error
  // falls back to the plain first reply.
  let finalText = respText;
  try {
    const chain = await runWorkspaceActionChain({
      userId,
      initialMessage: respText,
      llmMessages: [...history, { role: 'user', content: message }],
      systemPrompt: [{ type: 'text', text: system }],
      routedModel: modelOverride,
      isStreaming: false,
    });
    finalText = chain?.assistantMessage || respText;
  } catch (err) {
    log.warn('WhatsApp workspace action chain failed (non-fatal)', { userId, error: err.message });
  }

  const cleaned = finalText.replace(/^(?:Twin said:\s*"?)+/i, '').replace(/"?\s*$/, '');
  return toWhatsAppMarkdown(cleaned);
}

// ====================================================================
// Utility: normalize web markdown to WhatsApp formatting.
// WhatsApp bold is *single* asterisks; the shared action-chain follow-up
// formatter emits web-style **bold** + ### headers, which render as literal
// characters on WhatsApp. Convert them so action replies look right.
// ====================================================================
export function toWhatsAppMarkdown(text) {
  return String(text || '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*')  // ***x*** -> *x*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')       // **x**   -> *x*
    .replace(/^\s{0,3}#{1,6}\s+/gm, '');      // strip ATX headers (# .. ######)
}

// ====================================================================
// Utility: split long messages at paragraph boundaries
// ====================================================================
export function splitMessage(text, maxLen) {
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
