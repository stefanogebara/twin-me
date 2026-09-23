/**
 * GDPR parser: Discord.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { getHourInTimeZone } from '../shared.js';
import { safeAdmZip, isSafeZipEntryName } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Discord parser  (ZIP containing messages/ * /messages.json)
// PRIVACY: we do NOT store message content — only frequency/timing patterns
// ---------------------------------------------------------------------------

function parseDiscord(buffer, timezone) {
  let zip;
  try {
    zip = safeAdmZip(buffer);
  } catch {
    throw new Error('Invalid Discord export — expected a ZIP file');
  }

  const entries = zip.getEntries();
  const messageFiles = entries.filter(e =>
    isSafeZipEntryName(e.entryName) && e.entryName.match(/messages\/[^/]+\/messages\.json$/i) && !e.isDirectory
  );

  if (messageFiles.length === 0) {
    throw new Error('No messages found in Discord export (expected messages/*/messages.json)');
  }

  let totalMessages = 0;
  let serverCount = 0;
  const hourBuckets = new Array(24).fill(0);
  const channelIds = new Set();

  for (const entry of messageFiles) {
    if (!isSafeZipEntryName(entry.entryName)) continue;
    let msgs;
    try {
      msgs = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(msgs)) continue;

    channelIds.add(entry.entryName.split('/')[1]);
    totalMessages += msgs.length;

    for (const msg of msgs) {
      const ts = msg.Timestamp || msg.timestamp;
      if (ts) {
        try {
          const h = getHourInTimeZone(new Date(ts), timezone);
          if (h >= 0 && h <= 23) hourBuckets[h]++;
        } catch { /* skip */ }
      }
    }
  }

  serverCount = channelIds.size;

  const summaryObs = [];

  if (totalMessages > 0) {
    summaryObs.push(
      `Sent ${totalMessages.toLocaleString()} Discord messages across ${serverCount} channel${serverCount !== 1 ? 's' : ''}`
    );
  }

  // Time-of-day pattern
  const total = hourBuckets.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const evening = hourBuckets.slice(19, 23).reduce((a, b) => a + b, 0);
    const pct = Math.round((evening / total) * 100);
    if (pct > 35) {
      summaryObs.push(`Peak Discord activity: evenings (${pct}% of messages sent 7–11pm)`);
    }
    // Find peak hour range
    let maxHour = 0;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourBuckets[h] > maxCount) { maxCount = hourBuckets[h]; maxHour = h; }
    }
    const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    summaryObs.push(`Most active Discord hour: around ${fmt(maxHour)}`);
  }

  return summaryObs;
}

export { parseDiscord };
