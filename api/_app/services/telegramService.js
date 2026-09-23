/**
 * Telegram Service — grammY Bot for Twin Messaging
 * ==================================================
 * Handles Telegram bot initialization, message sending, and insight
 * formatting. The bot enables bidirectional chat with the twin and
 * proactive delivery of insights, briefings, and reminders.
 *
 * Env: TELEGRAM_BOT_TOKEN (from BotFather)
 */

import { Bot } from 'grammy';
import { createLogger } from './logger.js';

const log = createLogger('Telegram');

let bot = null;

/**
 * Get or initialize the Telegram bot instance (lazy singleton).
 * Returns null if TELEGRAM_BOT_TOKEN is not set.
 */
export function getBot() {
  if (bot) return bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log.warn('TELEGRAM_BOT_TOKEN not set — Telegram disabled');
    return null;
  }

  bot = new Bot(token);
  // Pre-initialize bot info to avoid getMe() call on first webhook request.
  // grammY calls bot.init() (which calls getMe) on the first webhookCallback,
  // and this can time out on Vercel serverless cold starts.
  bot.botInfo = {
    id: 8625509286,
    is_bot: true,
    first_name: 'TwinMe',
    username: 'TwinMeStefanoBot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  };
  log.info('Telegram bot initialized');
  return bot;
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendMessage(chatId, text, options = {}) {
  const b = getBot();
  if (!b) return { success: false, error: 'bot_not_initialized' };

  try {
    const result = await b.api.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...options,
    });
    return { success: true, messageId: result.message_id };
  } catch (err) {
    log.error('Failed to send Telegram message', { chatId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Format a proactive insight for Telegram delivery.
 */
export function formatInsightMessage(insight) {
  const urgencyTag = insight.urgency === 'high' ? '[!] ' : '';

  // Escape markdown special chars in the insight text
  const text = (insight.insight || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

  return `${urgencyTag}*${formatCategoryLabel(insight.category)}*\n\n${text}`;
}

function formatCategoryLabel(category) {
  const labels = {
    briefing: 'Morning Briefing',
    evening_recap: 'Evening Recap',
    music_mood_match: 'Music Suggestion',
    email_triage: 'Email Triage',
    reminder: 'Reminder',
    suggestion: 'Suggestion',
    nudge: 'Nudge',
  };
  return labels[category] || category.replace(/_/g, ' ');
}

/**
 * Send a proactive insight to a Telegram user.
 * Includes inline keyboard for thumbs up/down feedback.
 */
export async function sendInsight(chatId, insight) {
  const formatted = formatInsightMessage(insight);

  // Add inline feedback keyboard if insight has an ID
  const options = {};
  if (insight.id) {
    options.reply_markup = {
      inline_keyboard: [[
        { text: '\u{1F44D} Helpful', callback_data: `insight_up_${insight.id}` },
        { text: '\u{1F44E} Not helpful', callback_data: `insight_down_${insight.id}` },
      ]],
    };
  }

  return sendMessage(chatId, formatted, options);
}

/**
 * Edit an existing Telegram message (for progress updates).
 */
export async function editMessage(chatId, messageId, text, options = {}) {
  const b = getBot();
  if (!b) return { success: false, error: 'bot_not_initialized' };

  try {
    await b.api.editMessageText(chatId, messageId, text, {
      parse_mode: 'Markdown',
      ...options,
    });
    return { success: true };
  } catch (err) {
    // "message is not modified" is expected when text hasn't changed
    if (err.message?.includes('not modified')) return { success: true };
    log.error('Failed to edit Telegram message', { chatId, messageId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Build an inline keyboard with quick-reply suggestion buttons.
 * Used after twin responses that contain questions or suggestions.
 */
export function buildQuickReplyKeyboard(options) {
  if (!options || options.length === 0) return null;
  return {
    inline_keyboard: [options.slice(0, 3).map(opt => ({
      text: opt.text || opt,
      callback_data: `quick_reply_${opt.value || opt.text || opt}`.slice(0, 64),
    }))],
  };
}

/**
 * Format a morning briefing for rich Telegram delivery.
 * Sections: greeting, health, calendar, music, closing.
 */
export function formatBriefingCard(data) {
  const parts = [];

  parts.push(`\u2615 *Morning Briefing*`);
  if (data.greeting) parts.push(data.greeting);
  if (data.health) parts.push(`\n\u{1F4AA} *Health*\n${data.health}`);
  if (data.calendar) parts.push(`\n\u{1F4C5} *Today*\n${data.calendar}`);
  if (data.music) parts.push(`\n\u{1F3B5} *Music*\n${data.music}`);
  if (data.closing) parts.push(`\n${data.closing}`);

  return parts.join('\n');
}
