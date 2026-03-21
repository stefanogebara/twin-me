/**
 * Task Progress Service — Real-Time Updates During Agent Execution
 * =================================================================
 * When the agent runs a multi-step task, this service pushes progress
 * updates to the user via Telegram (edit-in-place) and SSE (web).
 *
 * Usage:
 *   import { reportProgress } from './taskProgressService.js';
 *   await reportProgress(userId, actionId, { step: 2, total: 5, status: 'done', detail: 'Calendar checked' });
 */

import { sendMessage, editMessage } from './telegramService.js';
import { getUserChannels } from './messageRouter.js';
import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { createLogger } from './logger.js';

const log = createLogger('TaskProgress');

// In-memory fallback for tracking Telegram progress message IDs
const progressMessageCache = new Map();

/**
 * Report progress on a running agent task.
 * Sends/edits a progress message on Telegram, emits SSE for web.
 * Fire-and-forget — never blocks the agent loop.
 *
 * @param {string} userId
 * @param {string} taskId - Agent action ID
 * @param {object} progress - { step, total, status, detail, summary }
 */
export async function reportProgress(userId, taskId, progress) {
  const { step, total, status, detail, summary } = progress;

  // Build progress text
  const statusEmoji = status === 'done' ? '\u2705' : status === 'failed' ? '\u274C' : '\u23F3';
  const progressBar = buildProgressBar(step, total);
  const text = `${statusEmoji} *Agent Working*\n${progressBar}\nStep ${step}/${total}: ${detail || status}${summary ? `\n\n${summary}` : ''}`;

  // Send to Telegram (edit existing message if we already sent one)
  try {
    const channels = await getUserChannels(userId);
    const telegram = channels.find(c => c.channel === 'telegram');

    if (telegram) {
      const cacheKey = `progress:${taskId}`;
      const existingMsgId = await getProgressMessageId(cacheKey);

      if (existingMsgId) {
        await editMessage(telegram.channel_id, existingMsgId, text);
      } else {
        const result = await sendMessage(telegram.channel_id, text);
        if (result.success && result.messageId) {
          await setProgressMessageId(cacheKey, result.messageId);
        }
      }
    }
  } catch (err) {
    log.warn('Failed to send progress to Telegram', { userId, taskId, error: err.message });
  }
}

function buildProgressBar(current, total) {
  const filled = Math.round((current / total) * 10);
  const empty = 10 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ` ${Math.round((current / total) * 100)}%`;
}

async function getProgressMessageId(key) {
  try {
    if (isRedisAvailable()) {
      return await getRedisClient().get(key);
    }
  } catch {}
  return progressMessageCache.get(key) || null;
}

async function setProgressMessageId(key, messageId) {
  try {
    if (isRedisAvailable()) {
      await getRedisClient().set(key, String(messageId), 'EX', 600); // 10 min TTL
      return;
    }
  } catch {}
  progressMessageCache.set(key, messageId);
  setTimeout(() => progressMessageCache.delete(key), 600_000);
}
