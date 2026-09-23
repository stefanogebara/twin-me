/**
 * GDPR parser: Netflix.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { csvToObjects, getHourInTimeZone, getDayInTimeZone } from '../shared.js';
import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Netflix — viewing activity CSV (from account.netflix.com/YourData)
// ---------------------------------------------------------------------------
// Users receive a ZIP. The key file is `CONTENT_INTERACTION/ViewingActivity.csv`
// which has columns: Profile Name, Start Time, Duration, Attributes,
// Title, Supplemental Video Type, Device Type, Bookmark, Latest Bookmark, Country.
// Accept either the full ZIP or a bare ViewingActivity.csv.

function extractNetflixCsv(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = safeAdmZip(buffer);
      const entry = zip.getEntries().find(e => /ViewingActivity\.csv$/i.test(e.entryName));
      if (entry) return entry.getData().toString('utf8');
      throw new Error('Netflix ZIP missing CONTENT_INTERACTION/ViewingActivity.csv');
    } catch (e) {
      throw new Error(`Netflix ZIP extract failed: ${e.message}`);
    }
  }
  return buffer.toString('utf8');
}

function parseDurationSeconds(d) {
  // Netflix durations look like "00:45:12" (HH:MM:SS). Return seconds.
  if (!d) return 0;
  // Parse positionally — do NOT filter out NaN segments, or a malformed middle
  // segment ("00:--:30") would collapse HH:MM:SS to MM:SS and mis-scale the value.
  const parts = d.split(':').map(n => parseInt(n, 10));
  if (parts.some(n => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseNetflix(buffer, timezone) {
  const csv = extractNetflixCsv(buffer);
  const rows = csvToObjects(csv);
  if (rows.length === 0) throw new Error('Netflix ViewingActivity.csv has no rows');

  const MAX_TITLES = 500;
  const titleStats = {};      // title -> { count, totalSec, latest }
  const deviceCounts = {};
  const countryCounts = {};
  const profileCounts = {};
  const hourBuckets = new Array(24).fill(0);
  const dayOfWeekBuckets = new Array(7).fill(0);

  let totalSessions = 0;
  let totalHours = 0;

  // Netflix wraps a series episode title as "Show: Season N: EpTitle" — strip to the show name.
  const showOf = t => (t || '').split(':')[0].trim();

  for (const r of rows) {
    const title = (r['Title'] || '').trim();
    if (!title) continue;

    const startStr = r['Start Time'] || r['Start time'] || '';
    const durationSec = parseDurationSeconds(r['Duration'] || '');
    if (durationSec < 60) continue; // skip trailers / accidental plays

    totalSessions++;
    totalHours += durationSec / 3600;

    const show = showOf(title);
    const stat = titleStats[show] || { count: 0, totalSec: 0, latest: '' };
    stat.count += 1;
    stat.totalSec += durationSec;
    if (startStr > stat.latest) stat.latest = startStr;
    titleStats[show] = stat;

    const device = (r['Device Type'] || '').trim();
    if (device) deviceCounts[device] = (deviceCounts[device] || 0) + 1;

    const country = (r['Country'] || '').trim();
    if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;

    const profile = (r['Profile Name'] || '').trim();
    if (profile) profileCounts[profile] = (profileCounts[profile] || 0) + 1;

    if (startStr) {
      const d = new Date(startStr);
      if (!Number.isNaN(d.getTime())) {
        hourBuckets[getHourInTimeZone(d, timezone)] += 1;
        dayOfWeekBuckets[getDayInTimeZone(d, timezone)] += 1;
      }
    }
  }

  const rollups = [];
  const topShows = Object.entries(titleStats)
    .sort((a, b) => b[1].totalSec - a[1].totalSec)
    .slice(0, 15);

  rollups.push(`Your Netflix history has ${totalSessions} sessions across ${Object.keys(titleStats).length} distinct shows/films, totaling roughly ${Math.round(totalHours)} hours watched.`);

  if (topShows.length > 0) {
    const top5 = topShows.slice(0, 5).map(([show, s]) => `${show} (${Math.round(s.totalSec / 3600)}h)`).join(', ');
    rollups.push(`Your most-watched Netflix titles by time are: ${top5}.`);
  }

  // Peak hour
  const peakHour = hourBuckets.reduce((max, v, i) => v > max.v ? { v, i } : max, { v: 0, i: 0 });
  if (peakHour.v > 0) {
    const fmtHour = h => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    rollups.push(`Your Netflix peak viewing hour is ${fmtHour(peakHour.i)} (${peakHour.v} sessions).`);
  }

  // Peak day of week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const peakDay = dayOfWeekBuckets.reduce((max, v, i) => v > max.v ? { v, i } : max, { v: 0, i: 0 });
  if (peakDay.v > 0) {
    rollups.push(`Your most-Netflix-heavy day of the week is ${dayNames[peakDay.i]}.`);
  }

  // Devices
  const topDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0];
  if (topDevice) rollups.push(`You watch Netflix mostly on ${topDevice[0]}.`);

  // Per-show observations (richer context)
  const perShow = topShows.slice(0, MAX_TITLES).map(([show, s]) =>
    `You watched "${show}" on Netflix — ${s.count} session${s.count === 1 ? '' : 's'}, ~${Math.round(s.totalSec / 3600)}h total${s.latest ? `, most recently ${s.latest.split(' ')[0]}` : ''}.`
  );

  return [...rollups, ...perShow];
}

export { parseNetflix };
