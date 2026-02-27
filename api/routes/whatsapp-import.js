/**
 * WhatsApp Export Parser
 * ======================
 * POST /api/whatsapp/import
 *
 * Accepts a WhatsApp chat export (.txt) as a text body and extracts
 * communication patterns → stores as platform_data observations in user_memories.
 *
 * WhatsApp export formats supported:
 *   Android: [DD/MM/YYYY, HH:MM:SS] Name: message
 *   iOS:     DD/MM/YYYY, HH:MM - Name: message
 *   (Both with 12h and 24h time)
 *
 * Extracted signals:
 *   - Top contacts by message count
 *   - Active hours (when they message most)
 *   - Emoji usage patterns
 *   - Average message length (terse vs verbose)
 *   - Response patterns (one-liner vs paragraph)
 *   - Total conversation span
 *
 * POST /api/whatsapp/status
 *   Returns how many WhatsApp observations exist for the user.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { addPlatformObservation, addMemory } from '../services/memoryStreamService.js';

const router = express.Router();

// Accept up to 10MB of text (large chat exports)
const TEXT_LIMIT = '10mb';

// ─── Parse WhatsApp export ─────────────────────────────────────────────────────

/**
 * Parse WhatsApp .txt export into an array of message objects.
 * Handles Android and iOS formats, 12h and 24h time.
 *
 * @param {string} text
 * @returns {{ ts: Date, sender: string, body: string }[]}
 */
function parseWhatsAppExport(text) {
  const messages = [];

  // Android: [01/12/2023, 14:23:45] John Doe: Hey!
  // Android 12h: [01/12/2023, 2:23:45 PM] John Doe: Hey!
  // iOS: 01/12/2023, 14:23 - John Doe: Hey!
  // iOS 12h: 01/12/2023, 2:23 PM - John Doe: Hey!
  const patterns = [
    // Android with brackets
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+([^:]+?):\s+(.+)$/,
    // iOS without brackets
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s+-\s+([^:]+?):\s+(.+)$/,
    // US date format M/D/YY
    /^\[(\d{1,2}\/\d{1,2}\/\d{2}),\s+(\d{1,2}:\d{2}:\d{2}\s+[AP]M)\]\s+([^:]+?):\s+(.+)$/,
  ];

  const lines = text.split('\n');
  let currentMsg = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let matched = false;
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m) {
        if (currentMsg) messages.push(currentMsg);
        const dateStr = m[1], timeStr = m[2], sender = m[3].trim(), body = m[4].trim();
        const ts = parseWhatsAppDate(dateStr, timeStr);
        currentMsg = { ts, sender, body };
        matched = true;
        break;
      }
    }

    // Continuation line (multi-line message)
    if (!matched && currentMsg) {
      // Skip system messages
      if (line.startsWith('‎') || line.includes('Messages and calls are end-to-end encrypted')) {
        continue;
      }
      currentMsg.body += ' ' + line;
    }
  }

  if (currentMsg) messages.push(currentMsg);
  return messages;
}

function parseWhatsAppDate(dateStr, timeStr) {
  try {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return new Date();
    const [d, mo, y] = parts.map(Number);
    const year = y < 100 ? 2000 + y : y;
    // timeStr: "14:23:45" or "2:23 PM" etc.
    const timeParts = timeStr.trim().split(/[:\s]+/);
    let h = parseInt(timeParts[0]), min = parseInt(timeParts[1] || '0');
    const ampm = timeStr.toUpperCase().includes('PM') ? 'PM' : timeStr.toUpperCase().includes('AM') ? 'AM' : null;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return new Date(year, mo - 1, d, h, min);
  } catch {
    return new Date();
  }
}

// ─── Extract patterns from parsed messages ─────────────────────────────────────

function extractPatterns(messages, myName) {
  if (messages.length === 0) return null;

  const SKIP_BODIES = ['<Media omitted>', 'image omitted', 'video omitted', 'audio omitted', 'sticker omitted', 'GIF omitted', 'document omitted'];

  const textMessages = messages.filter(m =>
    m.body &&
    !SKIP_BODIES.some(s => m.body.toLowerCase().includes(s.toLowerCase())) &&
    m.body.length > 0
  );

  // Contact frequency
  const contactCounts = {};
  for (const m of textMessages) {
    if (!m.sender || m.sender === myName) continue;
    contactCounts[m.sender] = (contactCounts[m.sender] || 0) + 1;
  }
  const topContacts = Object.entries(contactCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Hourly activity
  const hourCounts = new Array(24).fill(0);
  for (const m of textMessages) {
    if (m.ts) hourCounts[m.ts.getHours()]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const totalMessages = textMessages.length;

  // My messages
  const myMessages = textMessages.filter(m => m.sender === myName || !myName);
  const avgMyMsgLength = myMessages.length > 0
    ? Math.round(myMessages.reduce((s, m) => s + m.body.length, 0) / myMessages.length)
    : 0;

  // Emoji extraction
  const emojiRegex = /\p{Emoji}/gu;
  const emojiMap = {};
  for (const m of myMessages) {
    const emojis = m.body.match(emojiRegex) || [];
    for (const e of emojis) {
      if (/\d/.test(e)) continue; // skip digit emojis
      emojiMap[e] = (emojiMap[e] || 0) + 1;
    }
  }
  const topEmojis = Object.entries(emojiMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  // Date range
  const timestamps = messages.filter(m => m.ts).map(m => m.ts.getTime()).filter(Boolean);
  const spanDays = timestamps.length > 1
    ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24))
    : 0;

  // One-liner ratio
  const oneLiners = myMessages.filter(m => m.body.length < 30).length;
  const oneLinePct = myMessages.length > 0 ? oneLiners / myMessages.length : 0;

  return {
    topContacts,
    peakHour,
    totalMessages,
    myMessageCount: myMessages.length,
    avgMyMsgLength,
    topEmojis,
    spanDays,
    oneLinePct,
    contactCount: Object.keys(contactCounts).length,
  };
}

// ─── Generate NL observations from patterns ────────────────────────────────────

function buildObservations(patterns) {
  const obs = [];
  if (!patterns) return obs;

  const {
    topContacts, peakHour, totalMessages, myMessageCount,
    avgMyMsgLength, topEmojis, spanDays, oneLinePct, contactCount,
  } = patterns;

  // Contacts
  if (topContacts.length > 0) {
    const names = topContacts.slice(0, 3).map(c => c.name);
    obs.push(`Most frequent WhatsApp contacts: ${names.join(', ')} — suggests these are the closest relationships in their social circle`);
  }

  // Volume
  if (spanDays > 0 && totalMessages > 0) {
    const msgsPerDay = Math.round(totalMessages / spanDays);
    obs.push({ content: `Exchanges about ${msgsPerDay} WhatsApp messages per day across ${contactCount} contacts (${spanDays} days of history)`, contentType: 'weekly_summary' });
  }

  // Active hours
  const hourLabel = peakHour >= 22 || peakHour < 4
    ? 'late at night'
    : peakHour >= 4 && peakHour < 8
    ? 'early in the morning'
    : peakHour >= 8 && peakHour < 12
    ? 'in the morning'
    : peakHour >= 12 && peakHour < 17
    ? 'in the afternoon'
    : 'in the evening';
  obs.push(`Most active on WhatsApp ${hourLabel} (peak: ${peakHour}:00–${peakHour + 1}:00)`);

  // Message style
  if (avgMyMsgLength > 0) {
    const style = avgMyMsgLength < 25 ? 'very concise (under 25 chars on average)'
      : avgMyMsgLength < 60 ? 'brief and to-the-point'
      : avgMyMsgLength < 120 ? 'moderately detailed'
      : 'detailed and thoughtful';
    obs.push(`WhatsApp message style is ${style} — avg ${avgMyMsgLength} characters per message`);
  }

  // Emoji usage
  if (topEmojis.length >= 3) {
    obs.push(`Heavy emoji user in WhatsApp: frequently uses ${topEmojis.join(' ')} — expressive, warm communication style`);
  } else if (topEmojis.length > 0) {
    obs.push(`Occasional emoji user in WhatsApp: uses ${topEmojis.join(' ')} sparingly`);
  } else if (myMessageCount > 20) {
    obs.push(`Minimal emoji use in WhatsApp — text-first, direct communication style`);
  }

  return obs;
}

// ─── POST /import ──────────────────────────────────────────────────────────────

router.post('/import', authenticateUser, express.text({ limit: TEXT_LIMIT, type: 'text/plain' }), async (req, res) => {
  const userId = req.user.id;
  const { my_name } = req.query; // optional: user's display name in the chat

  if (!req.body || req.body.length < 50) {
    return res.status(400).json({ error: 'No chat export data provided' });
  }

  try {
    const messages = parseWhatsAppExport(req.body);

    if (messages.length < 10) {
      return res.status(400).json({
        error: 'Could not parse chat export',
        message: 'Make sure you\'re uploading a WhatsApp .txt export. Less than 10 messages were found.',
        parsed: messages.length,
      });
    }

    const patterns = extractPatterns(messages, my_name || null);
    const observations = buildObservations(patterns);

    if (observations.length === 0) {
      return res.json({ success: true, stored: 0, parsed: messages.length, message: 'No meaningful patterns found' });
    }

    // Store observations
    let stored = 0;
    for (const obs of observations) {
      const content = typeof obs === 'string' ? obs : obs.content;
      const meta = { ingestion_source: 'whatsapp_import', my_name: my_name || null };
      const ok = await addPlatformObservation(userId, content, 'whatsapp', meta);
      if (ok) stored++;
    }

    // Store a high-importance fact summarising the contact network
    if (patterns?.topContacts?.length > 0) {
      const contactSummary = `WhatsApp social circle: ${patterns.topContacts.map(c => c.name).join(', ')} — imported from chat export covering ${patterns.spanDays} days`;
      await addMemory(userId, contactSummary, 'fact', { source: 'whatsapp_import' }, {
        importanceScore: 7,
        skipImportance: true,
      });
      stored++;
    }

    console.log(`[WhatsApp] Stored ${stored} observations for user ${userId} from ${messages.length} messages`);

    res.json({
      success: true,
      stored,
      parsed: messages.length,
      contacts: patterns?.contactCount || 0,
      spanDays: patterns?.spanDays || 0,
    });
  } catch (err) {
    console.error('[WhatsApp] Import error:', err.message);
    res.status(500).json({ error: 'Failed to process WhatsApp export' });
  }
});

// ─── GET /status ───────────────────────────────────────────────────────────────

router.get('/status', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const { supabaseAdmin } = await import('../services/database.js');
    const { count } = await supabaseAdmin
      .from('user_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .like('content', '%WhatsApp%');

    res.json({ imported: (count || 0) > 0, memoryCount: count || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get WhatsApp status' });
  }
});

export default router;
