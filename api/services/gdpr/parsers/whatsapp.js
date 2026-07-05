/**
 * GDPR parser: WhatsApp.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// WhatsApp chat export parser
// PRIVACY: message content is NEVER stored — only behavioral/pattern metadata
// ---------------------------------------------------------------------------

/**
 * Accepts either:
 *   - A ZIP buffer containing a file whose name ends with _chat.txt
 *   - A raw TXT buffer (the _chat.txt content directly)
 *
 * Supported line formats:
 *   [15/01/2024, 08:32:45] Stefano: Hey, can we meet today?
 *   15/01/2024, 08:32 - Stefano: Hey, can we meet today?
 *
 * "<Media omitted>" lines are counted as media messages (no content stored).
 * System messages (no "Sender: " pattern) are skipped.
 */
/**
 * Parse one WhatsApp export line into { ts, sender, body } or null. Exported for
 * testing. Handles bracketed (FMT_A) and dash (FMT_B) formats, 2- or 4-digit
 * years, optional seconds, and optional 12-hour AM/PM. The AM/PM + 2-digit-year
 * US-locale variants used to be unmatched, which threw on the ENTIRE import
 * (audit). DD/MM vs MM/DD is resolved with the >12 heuristic.
 */
export function parseWhatsAppLine(line) {
  const FMT_A = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\]\s+([^:]+):\s*(.*)$/;
  const FMT_B = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\s+-\s+([^:]+):\s*(.*)$/;
  const match = line.match(FMT_A) || line.match(FMT_B);
  if (!match) return null;
  const [, p1, p2, yearRaw, hourRaw, min, ampm, rawSender, body] = match;
  // Resolve DD/MM vs MM/DD: a field > 12 must be the day.
  const n1 = Number(p1), n2 = Number(p2);
  let day, month;
  if (n1 > 12) { day = n1; month = n2; }
  else if (n2 > 12) { month = n1; day = n2; }
  else { day = n1; month = n2; } // ambiguous -> WhatsApp's default DD/MM
  let year = Number(yearRaw);
  if (year < 100) year += 2000;
  let hour = Number(hourRaw);
  const ap = (ampm || '').toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  else if (ap === 'am' && hour === 12) hour = 0;
  const ts = new Date(year, month - 1, day, hour, Number(min));
  if (isNaN(ts.getTime())) return null;
  return { ts, sender: rawSender.trim().slice(0, 60), body };
}

function parseWhatsApp(buffer) {
  // ── Step 1: extract text ────────────────────────────────────────────────
  let text;
  try {
    const zip = safeAdmZip(buffer);
    const chatEntry = zip.getEntries().find(e =>
      !e.isDirectory && e.entryName.toLowerCase().endsWith('_chat.txt')
    );
    if (!chatEntry) {
      throw new Error('No _chat.txt found inside ZIP');
    }
    text = chatEntry.getData().toString('utf8');
  } catch (zipErr) {
    // Not a ZIP (or no _chat.txt) — treat buffer as raw TXT
    text = buffer.toString('utf8');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('WhatsApp export is empty');
  }

  // ── Step 2: parse lines (per-line parsing in parseWhatsAppLine) ──────────
  // Media sentinel — match localized + bare variants (English/PT/ES/DE plus the
  // bracketless "image/video/audio/sticker/GIF omitted" Android forms) so media
  // isn't miscounted as text in non-English exports (audit).
  const MEDIA_RE = /(<\s*)?(media omitted|m[íi]dia omitida|multimedia omitido|medien ausgeschlossen|(image|video|audio|sticker|gif) omitted)(\s*>)?/i;

  const lines = text.split('\n');

  // We need to identify the "owner" of the export — the person who exported.
  // WhatsApp exports typically have the exporter's name appear most frequently
  // as the sender (since it's their own chat history). We'll infer it.
  const senderCounts = {};
  let earliestDate = null;
  let latestDate = null;

  const messages = []; // { ts: Date, sender: string, isMedia: boolean, wordCount: number }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = parseWhatsAppLine(line);
    if (!parsed) continue;
    const { ts, sender, body } = parsed;

    const isMedia = MEDIA_RE.test(body.trim());
    const wordCount = isMedia ? 0 : body.trim().split(/\s+/).filter(Boolean).length;

    senderCounts[sender] = (senderCounts[sender] || 0) + 1;

    if (!earliestDate || ts < earliestDate) earliestDate = ts;
    if (!latestDate || ts > latestDate) latestDate = ts;

    messages.push({ ts, sender, isMedia, wordCount });
  }

  if (messages.length === 0) {
    throw new Error('Could not parse any messages from WhatsApp export — check file format');
  }

  // ── Step 3: infer "owner" (most frequent sender) ────────────────────────
  const ownerName = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  // ── Step 4: compute metrics — only on owner's messages ──────────────────
  const ownerMessages = messages.filter(m => m.sender === ownerName);
  const totalMessages = messages.length;
  const ownerMsgCount = ownerMessages.length;

  // Date range + avg messages/day
  const daySpan = earliestDate && latestDate
    ? Math.max(1, Math.round((latestDate - earliestDate) / (24 * 3600_000)))
    : 1;
  const avgMsgsPerDay = (totalMessages / daySpan).toFixed(1);

  // Active hours — only owner's messages
  const hourBuckets = new Array(24).fill(0);
  for (const m of ownerMessages) {
    hourBuckets[m.ts.getHours()]++;
  }
  const totalHourMsgs = hourBuckets.reduce((a, b) => a + b, 0);

  const pctHours = totalHourMsgs > 0 ? {
    morning:   Math.round(hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0) / totalHourMsgs * 100),
    afternoon: Math.round(hourBuckets.slice(12, 18).reduce((a, b) => a + b, 0) / totalHourMsgs * 100),
    evening:   Math.round(hourBuckets.slice(18, 22).reduce((a, b) => a + b, 0) / totalHourMsgs * 100),
    night:     Math.round((
      hourBuckets.slice(22, 24).reduce((a, b) => a + b, 0) +
      hourBuckets.slice(0, 6).reduce((a, b) => a + b, 0)
    ) / totalHourMsgs * 100),
  } : null;

  // Peak hour
  let peakHour = 0;
  for (let h = 1; h < 24; h++) {
    if (hourBuckets[h] > hourBuckets[peakHour]) peakHour = h;
  }
  const fmtHour = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

  // Day-of-week patterns — owner messages
  const dayBuckets = new Array(7).fill(0); // 0=Sun, 1=Mon, ...
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const m of ownerMessages) {
    dayBuckets[m.ts.getDay()]++;
  }
  let peakDay = 0;
  for (let d = 1; d < 7; d++) {
    if (dayBuckets[d] > dayBuckets[peakDay]) peakDay = d;
  }

  // Media ratio — owner messages
  const ownerMedia = ownerMessages.filter(m => m.isMedia).length;
  const ownerText  = ownerMsgCount - ownerMedia;
  const mediaPct   = ownerMsgCount > 0 ? Math.round((ownerMedia / ownerMsgCount) * 100) : 0;

  // Average words per message (text-only, owner)
  const totalWords = ownerMessages.reduce((s, m) => s + m.wordCount, 0);
  const avgWords   = ownerText > 0 ? (totalWords / ownerText).toFixed(1) : 0;

  // Contact frequency: top contacts by message count (no content, only counts)
  // Use anonymized labels to protect privacy (Contact A, B, C, ...)
  const contactsSorted = Object.entries(senderCounts)
    .filter(([name]) => name !== ownerName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Response time analysis: per-conversation session (gap > 4h = new session)
  const SESSION_GAP_MS = 4 * 3600_000;
  const responseTimes = [];
  const conversationStarts = { owner: 0, other: 0 };

  let prevMsg = null;
  for (const msg of messages) {
    if (!prevMsg) {
      // First message — whoever sent it started
      if (msg.sender === ownerName) conversationStarts.owner++;
      else conversationStarts.other++;
      prevMsg = msg;
      continue;
    }

    const gap = msg.ts - prevMsg.ts;

    // New session — track who opens it
    if (gap > SESSION_GAP_MS) {
      if (msg.sender === ownerName) conversationStarts.owner++;
      else conversationStarts.other++;
    }

    // Response time: only when the sender changes and gap is < 4h
    if (msg.sender !== prevMsg.sender && gap > 0 && gap < SESSION_GAP_MS) {
      responseTimes.push(gap);
    }

    prevMsg = msg;
  }

  const totalSessions = conversationStarts.owner + conversationStarts.other;
  const initiatorPct = totalSessions > 0
    ? Math.round((conversationStarts.owner / totalSessions) * 100)
    : 0;

  const avgResponseMs = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : null;

  const fmtDuration = (ms) => {
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins} min`;
    const hours = (ms / 3_600_000).toFixed(1);
    return `${hours}h`;
  };

  // ── Step 5: build observations ───────────────────────────────────────────
  const obs = [];

  // 1. Volume + date range summary
  if (earliestDate && latestDate) {
    const monthFmt = (d) => `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    const spanLabel = daySpan >= 365
      ? `~${Math.round(daySpan / 365)} year${Math.round(daySpan / 365) !== 1 ? 's' : ''}`
      : daySpan >= 30
        ? `~${Math.round(daySpan / 30)} months`
        : `${daySpan} days`;
    obs.push(
      `WhatsApp chat history spans ${spanLabel} (${monthFmt(earliestDate)} to ${monthFmt(latestDate)}), ` +
      `${totalMessages.toLocaleString()} total messages across ${contactsSorted.length + 1} participants, ` +
      `averaging ${avgMsgsPerDay} messages/day`
    );
  }

  // 2. Active hours pattern
  if (pctHours) {
    const dominant = Object.entries(pctHours).sort((a, b) => b[1] - a[1])[0];
    obs.push(
      `WhatsApp messaging patterns: ${pctHours.morning}% morning, ${pctHours.afternoon}% afternoon, ` +
      `${pctHours.evening}% evening, ${pctHours.night}% late-night. ` +
      `Peak hour: around ${fmtHour(peakHour)} (primarily a ${dominant[0]} messenger)`
    );
  }

  // 3. Day-of-week pattern
  obs.push(
    `Most active WhatsApp day: ${DAY_NAMES[peakDay]} ` +
    `(${dayBuckets[peakDay]} messages sent on ${DAY_NAMES[peakDay]}s)`
  );

  // 4. Contact frequency — top 5, anonymized by first name only (common privacy norm)
  if (contactsSorted.length > 0) {
    const topContacts = contactsSorted.slice(0, 5).map(([name, count], i) => {
      // Use first name only (split on space, take first word) for minimal privacy exposure
      const firstName = name.split(/\s+/)[0];
      return `${firstName} (${count} msgs)`;
    });
    obs.push(`Most frequent WhatsApp contacts: ${topContacts.join(', ')}`);
  }

  // 5. Media ratio
  if (ownerMsgCount > 0) {
    const mediaDesc = mediaPct > 30
      ? 'heavy media sender (GIFs, photos, voice notes)'
      : mediaPct > 15
        ? 'moderate media sender'
        : 'primarily text-based communicator';
    obs.push(
      `WhatsApp communication style: ${ownerText.toLocaleString()} text messages, ` +
      `${ownerMedia.toLocaleString()} media files (${mediaPct}% media — ${mediaDesc})`
    );
  }

  // 6. Message length — brief vs verbose
  if (Number(avgWords) > 0) {
    const lengthDesc = Number(avgWords) > 20
      ? 'writes long, detailed messages'
      : Number(avgWords) > 8
        ? 'writes medium-length messages'
        : 'sends short, punchy messages';
    obs.push(
      `WhatsApp message length: avg ${avgWords} words per text message (${lengthDesc})`
    );
  }

  // 7. Conversation starter tendency
  if (totalSessions >= 5) {
    const starterDesc = initiatorPct > 60
      ? 'tends to initiate conversations'
      : initiatorPct < 40
        ? 'tends to respond rather than initiate'
        : 'balanced conversation initiator';
    obs.push(
      `WhatsApp conversation dynamics: initiates ${initiatorPct}% of chat sessions (${starterDesc})`
    );
  }

  // 8. Response time
  if (avgResponseMs !== null && responseTimes.length >= 10) {
    obs.push(
      `Average WhatsApp response time: ${fmtDuration(avgResponseMs)} ` +
      `(based on ${responseTimes.length.toLocaleString()} message exchanges)`
    );
  }

  // 9. Own message share vs others
  const ownerSharePct = totalMessages > 0 ? Math.round((ownerMsgCount / totalMessages) * 100) : 0;
  if (ownerMsgCount > 0) {
    const shareDesc = ownerSharePct > 55
      ? 'tends to carry conversations'
      : ownerSharePct < 35
        ? 'tends to be the listener in conversations'
        : 'balanced talker-listener';
    obs.push(
      `WhatsApp participation: sent ${ownerMsgCount.toLocaleString()} of ${totalMessages.toLocaleString()} total messages ` +
      `(${ownerSharePct}% share — ${shareDesc})`
    );
  }

  // 10. Weekend vs weekday messaging
  const weekendMsgs = dayBuckets[0] + dayBuckets[6]; // Sun + Sat
  const weekdayMsgs = dayBuckets.slice(1, 6).reduce((a, b) => a + b, 0);
  const totalDayMsgs = weekendMsgs + weekdayMsgs;
  if (totalDayMsgs > 0) {
    const weekendPct = Math.round((weekendMsgs / totalDayMsgs) * 100);
    const pattern = weekendPct > 32
      ? 'more socially active on weekends'
      : weekendPct < 20
        ? 'messaging peaks on weekdays (work/school week pattern)'
        : 'consistent messaging across weekdays and weekends';
    obs.push(`WhatsApp weekly pattern: ${weekendPct}% of messages on weekends (${pattern})`);
  }

  return obs;
}

export { parseWhatsApp };
