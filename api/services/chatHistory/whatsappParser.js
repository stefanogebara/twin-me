/**
 * WhatsApp Chat Export Parser
 * ===========================
 * Parses WhatsApp .txt or .zip exports into normalized ChatMessage objects.
 *
 * Handles three format variants produced by different WhatsApp versions/regions:
 *   Format A (iOS):     [DD/MM/YY, HH:MM:SS AM/PM] Sender: body
 *   Format B (Android): DD/MM/YYYY, HH:MM - Sender: body
 *   Format C (Android 2): [DD/MM/YYYY, HH:MM:SS] Sender: body
 *
 * Multi-line messages are handled: lines that don't start with a timestamp
 * are treated as continuation of the previous message.
 *
 * Owner inference: the sender with the highest message count is assumed to be
 * the person who exported the chat. Can be overridden via ownerName option.
 */

import AdmZip from 'adm-zip';

// ── Format regexes ──────────────────────────────────────────────────────────
// Format A: [DD/MM/YY, H:MM:SS AM] Sender: body
const FMT_A = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*[AP]M)?\]\s+([^:]+):\s*(.*)$/i;
// Format B: DD/MM/YYYY, HH:MM - Sender: body
const FMT_B = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*[AP]M)?\s+-\s+([^:]+):\s*(.*)$/i;
// Format C: [DD/MM/YYYY, HH:MM:SS] Sender: body
const FMT_C = /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):\d{2}\]\s+([^:]+):\s*(.*)$/;

// System messages to skip (WhatsApp generates these automatically)
const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /this message was deleted/i,
  /<media omitted>/i,
  /\u200e/,                            // left-to-right mark (WhatsApp system msgs)
  /you created group/i,
  /added you/i,
  /changed the subject/i,
  /changed this group/i,
  /security code changed/i,
  /\u200b/,                            // zero-width space
];

function isSystemMessage(body) {
  return SYSTEM_PATTERNS.some(p => p.test(body));
}

function parseTimestamp(day, month, year, hour, min) {
  let y = Number(year);
  if (y < 100) y += 2000;
  return new Date(y, Number(month) - 1, Number(day), Number(hour), Number(min));
}

/**
 * Extract raw text from buffer (handles both .zip and .txt)
 */
function extractText(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find(e =>
      !e.isDirectory && e.entryName.toLowerCase().endsWith('_chat.txt')
    );
    if (entry) return entry.getData().toString('utf8');
  } catch {
    // Not a zip — fall through
  }
  return buffer.toString('utf8');
}

/**
 * Parse WhatsApp export text into raw message objects
 *
 * @param {string} text
 * @returns {{ ts: Date, sender: string, body: string }[]}
 */
function parseLines(text) {
  const messages = [];
  let current = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(FMT_A) || line.match(FMT_B) || line.match(FMT_C);

    if (match) {
      if (current) messages.push(current);
      const [, day, month, year, hour, min, rawSender, body] = match;
      const ts = parseTimestamp(day, month, year, hour, min);
      if (isNaN(ts.getTime())) continue;

      const sender = rawSender.trim().slice(0, 80);
      current = { ts, sender, body: body.trim() };
    } else if (current) {
      // Continuation of previous message (multi-line)
      current.body += '\n' + line;
    }
  }

  if (current) messages.push(current);
  return messages;
}

/**
 * Parse a WhatsApp export buffer into ChatMessage[]
 *
 * @param {Buffer} buffer - Raw file buffer (.txt or .zip)
 * @param {object} opts
 * @param {string} [opts.ownerName] - Display name of the exporter (inferred if omitted)
 * @param {string} [opts.chatName] - Override chat/contact name
 * @returns {{ messages: ChatMessage[], ownerName: string, stats: object }}
 */
export function parseWhatsAppChat(buffer, opts = {}) {
  const text = extractText(buffer);

  if (!text || text.trim().length === 0) {
    throw new Error('WhatsApp export is empty');
  }

  const raw = parseLines(text);

  if (raw.length === 0) {
    throw new Error('Could not parse any messages — check WhatsApp export format');
  }

  // Infer owner (most frequent non-system sender)
  const senderCounts = {};
  for (const m of raw) {
    if (!isSystemMessage(m.body)) {
      senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
    }
  }

  const ownerName = opts.ownerName ||
    Object.entries(senderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    'Unknown';

  // Build ChatMessage[]
  let idCounter = 0;
  const messages = [];

  for (const m of raw) {
    if (isSystemMessage(m.body)) continue;
    if (!m.body.trim()) continue;

    const isSender = m.sender === ownerName ? 1 : 0;

    messages.push({
      id: ++idCounter,
      sender: m.sender,
      is_sender: isSender,
      msg: m.body.replace(/\n+/g, ' ').trim(),
      timestamp: m.ts,
      chat_name: opts.chatName || 'WhatsApp Chat',
      platform: 'whatsapp_chat',
    });
  }

  const ownerMsgs = messages.filter(m => m.is_sender === 1);
  const stats = {
    total: messages.length,
    owner_sent: ownerMsgs.length,
    owner_name: ownerName,
    date_range: raw.length > 0
      ? { from: raw[0].ts.toISOString(), to: raw[raw.length - 1].ts.toISOString() }
      : null,
  };

  return { messages, ownerName, stats };
}
