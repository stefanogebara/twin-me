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

// Category → emoji mapping for insight formatting
const CATEGORY_EMOJI = {
  briefing: '\u2615', // coffee
  evening_recap: '\u{1F319}', // crescent moon
  music_mood_match: '\u{1F3B5}', // musical note
  email_triage: '\u{1F4E7}', // email
  reminder: '\u{1F514}', // bell
  suggestion: '\u{1F4A1}', // light bulb
  nudge: '\u{1F449}', // point right
};

/**
 * Format a proactive insight for Telegram delivery.
 */
export function formatInsightMessage(insight) {
  const emoji = CATEGORY_EMOJI[insight.category] || '\u2728'; // sparkles default
  const urgencyTag = insight.urgency === 'high' ? ' \u{1F525}' : '';

  // Escape markdown special chars in the insight text
  const text = (insight.insight || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

  return `${emoji}${urgencyTag} *${formatCategoryLabel(insight.category)}*\n\n${text}`;
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
 */
export async function sendInsight(chatId, insight) {
  const formatted = formatInsightMessage(insight);
  return sendMessage(chatId, formatted);
}
