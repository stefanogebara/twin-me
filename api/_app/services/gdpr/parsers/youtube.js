/**
 * GDPR parser: YouTube (Google Takeout).
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { getHourInTimeZone } from '../shared.js';

// ---------------------------------------------------------------------------
// YouTube (Google Takeout) parser
// ---------------------------------------------------------------------------

function parseYouTube(buffer, timezone) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid YouTube JSON — expected watch-history.json');
  }

  if (!Array.isArray(raw)) {
    throw new Error('YouTube file must be a JSON array');
  }

  const channelCounts = {};
  const hourBuckets = new Array(24).fill(0);
  const individualObs = [];

  // Sample up to 500 most recent watches
  const recent = raw.slice(-500);
  for (const entry of recent) {
    const title = String(entry.title || '').replace(/^Watched /, '').slice(0, 80);
    if (!title) continue;

    const channel = entry.subtitles?.[0]?.name || 'Unknown Channel';
    const safeChannel = String(channel).slice(0, 60);
    const whenRaw = entry.time ? new Date(entry.time) : null;
    const when = (whenRaw && !isNaN(whenRaw.getTime())) ? whenRaw : null; // guard Invalid Date
    const monthYear = when ? `${when.toLocaleString('default', { month: 'short' })} ${when.getFullYear()}` : '';

    individualObs.push(
      monthYear
        ? `Watched "${title}" by ${safeChannel} (${monthYear})`
        : `Watched "${title}" by ${safeChannel}`
    );

    if (!channelCounts[safeChannel]) channelCounts[safeChannel] = 0;
    channelCounts[safeChannel]++;

    if (when) hourBuckets[getHourInTimeZone(when, timezone)]++;
  }

  const summaryObs = [];
  const totalWatched = raw.length;

  const topChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topChannels.length > 0) {
    const [topName, topCount] = topChannels[0];
    summaryObs.push(`Top YouTube channel: ${topName} (${topCount} videos watched)`);
  }

  if (topChannels.length > 1) {
    const names = topChannels.slice(1, 5).map(([n]) => n).join(', ');
    summaryObs.push(`Also frequently watched: ${names}`);
  }

  if (totalWatched > 0) {
    summaryObs.push(`YouTube watch history spans ${totalWatched.toLocaleString()} videos`);
  }

  // Time-of-day pattern
  const total = hourBuckets.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const evening = hourBuckets.slice(18, 24).reduce((a, b) => a + b, 0);
    const pct = Math.round((evening / total) * 100);
    if (pct > 40) {
      summaryObs.push(`Evening YouTube watcher — ${pct}% of videos watched after 6pm`);
    }
  }

  return [...individualObs, ...summaryObs];
}

export { parseYouTube };
