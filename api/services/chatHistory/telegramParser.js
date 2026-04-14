/**
 * Telegram Chat Export Parser
 * ============================
 * Parses Telegram Desktop JSON exports (result.json) into normalized ChatMessage objects.
 *
 * How to export: Telegram Desktop → chat → ⋮ → Export chat history
 *   Select "JSON" format. Place ChatExport_* folder anywhere and upload result.json.
 *
 * Owner identification: user specifies their display name as it appears in the export
 * (the "from" field). Alternatively, provide myId as the numeric Telegram user ID
 * (appears as "from_id": "user<ID>" in the JSON).
 *
 * Ported and adapted from WeClone's telegram_parser.py (MIT/AGPL).
 */

// Message types we keep (text only for V1; images/stickers filtered)
const KEEP_TYPES = new Set(['text']);

// Forwarded messages are skipped — they reflect others' voice, not yours
const SKIP_FORWARDED = true;

/**
 * Extract text content from Telegram's "text" field (can be string or array)
 */
function extractText(textField) {
  if (typeof textField === 'string') return textField;
  if (!Array.isArray(textField)) return '';

  return textField
    .map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.text) return item.text;
      return '';
    })
    .join('');
}

/**
 * Determine if this message was sent by the owner
 */
function isSentByOwner(message, myName, myId) {
  if (myId && message.from_id === `user${myId}`) return true;
  if (myName && message.from === myName) return true;
  return false;
}

/**
 * Parse a single Telegram message object into a ChatMessage
 */
function processMessage(message, myName, myId, idCounter) {
  if (message.type !== 'message') return null;

  // Skip forwarded messages (they're not YOUR voice)
  if (SKIP_FORWARDED && message.forwarded_from) return null;

  const text = extractText(message.text || '').replace(/\n+/g, ' ').trim();
  if (!text) return null;

  let ts;
  try {
    ts = new Date(message.date);
    if (isNaN(ts.getTime())) return null;
  } catch {
    return null;
  }

  const senderName = message.from || 'Unknown';
  const isSender = isSentByOwner(message, myName, myId) ? 1 : 0;

  return {
    id: idCounter,
    sender: senderName,
    is_sender: isSender,
    msg: text,
    timestamp: ts,
    platform: 'telegram_chat',
  };
}

/**
 * Parse a Telegram result.json buffer into ChatMessage[]
 *
 * @param {Buffer} buffer - Raw JSON file buffer
 * @param {object} opts
 * @param {string} [opts.myName] - Your display name as shown in the export
 * @param {string} [opts.myId]   - Your numeric Telegram user ID (without "user" prefix)
 * @returns {{ messages: ChatMessage[], chatName: string, stats: object }}
 */
export function parseTelegramChat(buffer, opts = {}) {
  let json;
  try {
    json = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Telegram export: not valid JSON');
  }

  if (!json.messages || !Array.isArray(json.messages)) {
    throw new Error('Invalid Telegram export: no messages array found');
  }

  if (!opts.myName && !opts.myId) {
    throw new Error('Telegram import requires either myName or myId to identify your messages');
  }

  const chatName = json.name || 'Telegram Chat';
  const myName = opts.myName?.trim();
  const myId = opts.myId?.trim();

  let idCounter = 0;
  const messages = [];

  for (const message of json.messages) {
    idCounter++;
    const parsed = processMessage(message, myName, myId, idCounter);
    if (parsed) {
      parsed.chat_name = chatName;
      messages.push(parsed);
    }
  }

  if (messages.length === 0) {
    throw new Error(
      `No messages found. Check that myName "${myName}" matches your display name in the export exactly.`
    );
  }

  const ownerMsgs = messages.filter(m => m.is_sender === 1);
  const stats = {
    total: messages.length,
    owner_sent: ownerMsgs.length,
    chat_name: chatName,
    date_range: messages.length > 0
      ? { from: messages[0].timestamp.toISOString(), to: messages[messages.length - 1].timestamp.toISOString() }
      : null,
  };

  return { messages, chatName, stats };
}
