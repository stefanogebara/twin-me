/**
 * Chat History Ingestion Orchestrator
 * =====================================
 * Ties together parsing → processing → memory ingestion → stylometrics.
 *
 * Flow:
 *   buffer + platform + opts
 *     → parser (whatsapp / telegram)
 *     → processMessages (combine + PII + QA pairs)
 *     → ingest QA pairs as conversation memories
 *     → ingest own messages as observation memories (raw voice samples)
 *     → extract stylometrics → fact memories
 *     → trigger reflection engine if enough new memories
 *     → return summary stats
 *
 * Memory format for QA pairs (conversation type):
 *   "In [chat_name], they said: <context>. You replied: <response>."
 *   This format gives the twin direct access to your conversational voice
 *   with the full context of what prompted each response.
 *
 * Memory format for raw messages (observation type):
 *   "You wrote: <message>" — used for stylometric pattern surfacing
 */

import { parseWhatsAppChat } from './whatsappParser.js';
import { parseTelegramChat } from './telegramParser.js';
import { processMessages } from './messageProcessor.js';
import { extractAndStoreStylometrics } from './stylometricExtractor.js';
import { addMemory } from '../memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from '../reflectionEngine.js';
import { createLogger } from '../logger.js';

const log = createLogger('ChatHistoryIngestion');

// Batch size for memory inserts — avoid hammering the DB
const BATCH_SIZE = 50;
// Max raw "you wrote" observations to store (stylometrics doesn't need all)
const MAX_RAW_OBS = 500;

// ── Memory content builders ──────────────────────────────────────────────────

// Maps chatContext → the phrase used inside "In a chat <phrase>, someone said:"
// Professional uses a different preposition so it gets its own full sentence prefix.
const CONTEXT_PHRASE = {
  close_friend:     { prefix: 'In a chat with a close friend',      withName: n => `In a chat with a close friend (${n})` },
  family:           { prefix: 'In a chat with a family member',     withName: n => `In a chat with a family member (${n})` },
  professional:     { prefix: 'In a professional conversation',     withName: n => `In a professional conversation (${n})` },
  romantic_partner: { prefix: 'In a chat with your romantic partner', withName: n => `In a chat with your romantic partner (${n})` },
};

function buildConversationContent(pair, chatContext) {
  const phrase = chatContext && CONTEXT_PHRASE[chatContext];
  let prefix;
  if (phrase) {
    prefix = pair.chat_name ? phrase.withName(pair.chat_name) : phrase.prefix;
  } else {
    prefix = pair.chat_name ? `In a chat (${pair.chat_name})` : 'In a chat';
  }
  return `${prefix}, someone said: "${pair.context}" — you replied: "${pair.response}"`;
}

function buildObservationContent(msg, chatContext) {
  const ctx = chatContext && CONTEXT_PHRASE[chatContext]
    ? CONTEXT_PHRASE[chatContext].prefix.toLowerCase()
    : 'a conversation';
  return `You wrote in ${ctx}: "${msg.msg}"`;
}

// ── Batch insert with delay ──────────────────────────────────────────────────

async function batchIngest(userId, items, memoryType, metadataFn, label, chatContext) {
  let stored = 0;
  let skipped = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (item) => {
        const content = memoryType === 'conversation'
          ? buildConversationContent(item, chatContext)
          : buildObservationContent(item, chatContext);

        const result = await addMemory(userId, content, memoryType, metadataFn(item));
        if (result) stored++;
        else skipped++;
      })
    );

    // Small pause between batches to avoid embedding service overload
    if (i + BATCH_SIZE < items.length) {
      await new Promise(r => setTimeout(r, 200));
    }

    const progress = Math.min(i + BATCH_SIZE, items.length);
    log.info(`${label}: ingested ${progress}/${items.length}`);
  }

  return { stored, skipped };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ingest a chat history export into the TwinMe memory stream
 *
 * @param {string} userId
 * @param {Buffer} fileBuffer
 * @param {string} platform - 'whatsapp_chat' | 'telegram_chat'
 * @param {object} opts
 * @param {string} [opts.ownerName]  - WhatsApp: your display name (inferred if omitted)
 * @param {string} [opts.myName]     - Telegram: your display name in the export
 * @param {string} [opts.myId]       - Telegram: your numeric user ID
 * @param {string} [opts.chatName]    - Override chat label in memories
 * @param {string} [opts.chatContext] - Relationship context: 'close_friend' | 'family' | 'professional' | 'romantic_partner'
 * @returns {object} Ingestion summary
 */
const VALID_CHAT_CONTEXTS = new Set(['close_friend', 'family', 'professional', 'romantic_partner']);

export async function ingestChatHistory(userId, fileBuffer, platform, opts = {}) {
  const chatContext = opts.chatContext && VALID_CHAT_CONTEXTS.has(opts.chatContext)
    ? opts.chatContext
    : null;
  log.info('Chat history ingestion started', { userId, platform, chatContext });

  // ── 1. Parse ───────────────────────────────────────────────────────────────
  let parsed;
  try {
    if (platform === 'whatsapp_chat') {
      parsed = parseWhatsAppChat(fileBuffer, {
        ownerName: opts.ownerName,
        chatName: opts.chatName,
      });
    } else if (platform === 'telegram_chat') {
      parsed = parseTelegramChat(fileBuffer, {
        myName: opts.myName,
        myId: opts.myId,
      });
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (err) {
    log.error('Parse failed', { platform, error: err.message });
    throw err;
  }

  log.info('Parse complete', { ...parsed.stats });

  // ── 2. Process → QA pairs + my messages ───────────────────────────────────
  const { pairs, myMessages, stats: processStats } = processMessages(parsed.messages);

  log.info('Processing complete', processStats);

  if (pairs.length === 0) {
    return {
      success: true,
      platform,
      parseStats: parsed.stats,
      processStats,
      memoriesStored: 0,
      factsStored: 0,
      message: 'No conversation pairs could be extracted from this export.',
    };
  }

  // ── 3. Ingest conversation pairs ───────────────────────────────────────────
  const convMetadata = (pair) => ({
    source: platform,
    chat_name: pair.chat_name,
    chat_context: chatContext,
    imported_at: new Date().toISOString(),
    is_chat_import: true,
  });

  const { stored: convStored, skipped: convSkipped } = await batchIngest(
    userId, pairs, 'conversation', convMetadata, 'Conversations', chatContext
  );

  // ── 4. Ingest raw "you wrote" observations (sample for stylometrics) ───────
  const rawSample = myMessages.slice(0, MAX_RAW_OBS);
  const obsMetadata = (msg) => ({
    source: platform,
    chat_name: msg.chat_name,
    chat_context: chatContext,
    is_chat_import: true,
    is_voice_sample: true,
  });

  const { stored: obsStored } = await batchIngest(
    userId, rawSample, 'observation', obsMetadata, 'Voice samples', chatContext
  );

  // ── 5. Stylometric extraction → fact memories ──────────────────────────────
  let stylometricResult = { factsStored: 0, features: null };
  try {
    stylometricResult = await extractAndStoreStylometrics(userId, myMessages, platform);
  } catch (err) {
    log.error('Stylometrics failed (non-fatal)', { error: err.message });
  }

  // ── 6. Trigger reflection if enough new memories ──────────────────────────
  const totalStored = convStored + obsStored;
  if (totalStored >= 20) {
    try {
      const shouldReflect = await shouldTriggerReflection(userId);
      if (shouldReflect) {
        log.info('Triggering reflection after chat import', { userId });
        generateReflections(userId).catch(err =>
          log.error('Reflection failed (non-fatal)', { error: err.message })
        );
      }
    } catch (err) {
      log.error('Reflection check failed (non-fatal)', { error: err.message });
    }
  }

  const summary = {
    success: true,
    platform,
    parseStats: parsed.stats,
    processStats,
    memoriesStored: convStored,
    observationsStored: obsStored,
    memoriesSkipped: convSkipped,
    factsStored: stylometricResult.factsStored,
    stylometricFeatures: stylometricResult.features
      ? {
          avgWordsPerMessage: stylometricResult.features.avgWords,
          capitalizationStyle: stylometricResult.features.capStyle,
          emojiRatio: stylometricResult.features.emojiRatio,
          topEmojis: stylometricResult.features.topEmojis,
        }
      : null,
  };

  log.info('Chat history ingestion complete', { userId, ...summary });
  return summary;
}
