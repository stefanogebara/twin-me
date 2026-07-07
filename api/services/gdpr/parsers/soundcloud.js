/**
 * GDPR parser: SoundCloud.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { csvToObjects } from '../shared.js';
import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// SoundCloud — GDPR data export ZIP
// ---------------------------------------------------------------------------
// SoundCloud has a CSV/XML-based export that includes your own tracks,
// liked tracks, followings, playlists, comments. We parse the key CSVs:
//   - likes.csv   (tracks you've liked)
//   - followings.csv (users you follow)
//   - playlists.csv (playlists you created)
//   - your_tracks.csv (tracks you uploaded)
// Fields and filenames are inconsistent across export vintages — we fuzzy-match.

function parseSoundCloud(buffer) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    throw new Error('SoundCloud export must be a ZIP (request at soundcloud.com/settings/account then download)');
  }

  let zip;
  try { zip = safeAdmZip(buffer); } catch (e) {
    throw new Error(`SoundCloud ZIP extract failed: ${e.message}`);
  }

  const findCsv = (re) => {
    const entry = zip.getEntries().find(e => re.test(e.entryName) && !e.isDirectory);
    if (!entry) return null;
    return csvToObjects(entry.getData().toString('utf8'));
  };

  const likes = findCsv(/likes?\.csv$/i) || findCsv(/favourites\.csv$/i);
  const followings = findCsv(/followings?\.csv$/i);
  const playlists = findCsv(/playlists?\.csv$/i);
  const yourTracks = findCsv(/your[-_ ]tracks?\.csv$/i) || findCsv(/tracks?\.csv$/i);
  const comments = findCsv(/comments?\.csv$/i);

  const rollups = [];
  const observations = [];
  const MAX_OBS = 250;

  // --- Likes ---
  if (likes && likes.length > 0) {
    rollups.push(`You've liked ${likes.length} tracks on SoundCloud.`);
    const artistCounts = {};
    for (const r of likes) {
      const a = (r['Artist'] || r['User'] || r['Creator'] || '').trim();
      if (a) artistCounts[a] = (artistCounts[a] || 0) + 1;
    }
    const topArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topArtists.length > 0) {
      rollups.push(`Top artists you liked on SoundCloud: ${topArtists.map(([a, c]) => `${a} (${c})`).join(', ')}.`);
    }
    for (const r of likes.slice(0, MAX_OBS)) {
      const title = (r['Title'] || r['Track'] || '').trim();
      const artist = (r['Artist'] || r['User'] || r['Creator'] || '').trim();
      const date = (r['Date'] || r['Created At'] || r['Liked At'] || '').trim();
      if (!title) continue;
      const parts = [`You liked "${title}"`];
      if (artist) parts.push(`by ${artist}`);
      parts.push('on SoundCloud');
      if (date) parts.push(`(${date})`);
      observations.push(parts.join(' ') + '.');
    }
  }

  // --- Followings ---
  if (followings && followings.length > 0) {
    rollups.push(`You follow ${followings.length} accounts on SoundCloud.`);
    const names = followings.slice(0, 25).map(r => (r['Name'] || r['User'] || r['Username'] || '').trim()).filter(Boolean);
    if (names.length > 0) rollups.push(`Accounts you follow on SoundCloud include: ${names.slice(0, 20).join(', ')}.`);
  }

  // --- Playlists ---
  if (playlists && playlists.length > 0) {
    rollups.push(`You have ${playlists.length} playlists on SoundCloud.`);
    const titles = playlists.slice(0, 15).map(r => (r['Title'] || r['Name'] || '').trim()).filter(Boolean);
    if (titles.length > 0) rollups.push(`Your SoundCloud playlist names: ${titles.slice(0, 12).map(t => `"${t}"`).join(', ')}.`);
  }

  // --- Uploads ---
  if (yourTracks && yourTracks.length > 0) {
    rollups.push(`You've uploaded ${yourTracks.length} tracks to SoundCloud.`);
  }

  // --- Comments ---
  if (comments && comments.length > 0) {
    rollups.push(`You've made ${comments.length} comments on SoundCloud.`);
    for (const r of comments.slice(0, 20)) {
      const txt = (r['Comment'] || r['Body'] || r['Text'] || '').trim();
      if (txt && txt.length > 4) observations.push(`On SoundCloud you commented: "${txt.slice(0, 280)}"`);
    }
  }

  if (rollups.length === 0 && observations.length === 0) {
    throw new Error('SoundCloud export appears empty or has an unrecognised structure');
  }

  return [...rollups, ...observations];
}

export { parseSoundCloud };
