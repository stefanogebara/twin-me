/**
 * GDPR parser: Apple Music.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { csvToObjects } from '../shared.js';
import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Apple Music — GDPR data export CSV
// ---------------------------------------------------------------------------
// Users request their data from privacy.apple.com. The ZIP contains several
// CSVs under "Apple Media Services information/Apple Music Activity/":
//   - Apple Music - Play History Daily Tracks.csv
//   - Apple Music - Recently Played Tracks.csv
//   - Apple Music Likes and Dislikes.csv
//   - Apple Music Library Activity.csv
//   - Apple Music Library Tracks.csv
// We prefer "Play History Daily Tracks" because it has the richest temporal
// detail (song + album + date played + play count).

function extractAppleMusicCsv(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = safeAdmZip(buffer);
      const preferred = [
        /Play History Daily Tracks\.csv$/i,
        /Recently Played Tracks\.csv$/i,
        /Library Tracks\.csv$/i,
      ];
      for (const re of preferred) {
        const entry = zip.getEntries().find(e => re.test(e.entryName));
        if (entry) return { csv: entry.getData().toString('utf8'), name: entry.entryName };
      }
      // Fallback: any Apple Music CSV inside the ZIP
      const any = zip.getEntries().find(e => /Apple Music.*\.csv$/i.test(e.entryName));
      if (any) return { csv: any.getData().toString('utf8'), name: any.entryName };
      throw new Error('Apple Music ZIP missing a recognised Play History / Recently Played / Library Tracks CSV');
    } catch (e) {
      throw new Error(`Apple Music ZIP extract failed: ${e.message}`);
    }
  }
  return { csv: buffer.toString('utf8'), name: 'apple_music.csv' };
}

function parseAppleMusic(buffer) {
  const { csv, name } = extractAppleMusicCsv(buffer);
  const rows = csvToObjects(csv);
  if (rows.length === 0) throw new Error('Apple Music CSV has no rows');

  const MAX_OBS = 400;
  const songStats = {};
  const artistStats = {};
  const albumStats = {};
  const hourBuckets = new Array(24).fill(0);
  let totalPlays = 0;

  const hdrs = Object.keys(rows[0]).reduce((acc, h) => { acc[h.toLowerCase()] = h; return acc; }, {});
  const colSong = hdrs['song name'] || hdrs['track description'] || hdrs['title'] || 'Song Name';
  const colArtist = hdrs['artist name'] || hdrs['artist'] || 'Artist Name';
  const colAlbum = hdrs['album name'] || hdrs['album'] || 'Album Name';
  const colPlayDate = hdrs['date played'] || hdrs['last played date'] || hdrs['play date'] || hdrs['event date time'] || 'Date Played';
  const colPlayCount = hdrs['play count'] || hdrs['total plays'] || null;

  for (const r of rows) {
    const song = (r[colSong] || '').trim();
    if (!song) continue;
    const artist = (r[colArtist] || '').trim();
    const album = (r[colAlbum] || '').trim();
    const date = (r[colPlayDate] || '').trim();
    const pc = colPlayCount ? parseInt(r[colPlayCount] || '1', 10) || 1 : 1;

    const key = `${song} — ${artist}`;
    songStats[key] = (songStats[key] || 0) + pc;
    if (artist) artistStats[artist] = (artistStats[artist] || 0) + pc;
    if (album) albumStats[album] = (albumStats[album] || 0) + pc;
    totalPlays += pc;

    if (date) {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) hourBuckets[d.getHours()] += pc;
    }
  }

  const rollups = [];
  rollups.push(`Your Apple Music export (${name.split('/').pop()}) has ${totalPlays.toLocaleString('en-US')} plays across ${Object.keys(songStats).length} distinct tracks, ${Object.keys(artistStats).length} artists, and ${Object.keys(albumStats).length} albums.`);

  const topArtists = Object.entries(artistStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topArtists.length > 0) {
    rollups.push(`Your top Apple Music artists by plays: ${topArtists.map(([a, p]) => `${a} (${p})`).join(', ')}.`);
  }

  const topAlbums = Object.entries(albumStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topAlbums.length > 0) {
    rollups.push(`Your most-played Apple Music albums: ${topAlbums.map(([a, p]) => `${a} (${p})`).join('; ')}.`);
  }

  const peakHour = hourBuckets.reduce((max, v, i) => v > max.v ? { v, i } : max, { v: 0, i: 0 });
  if (peakHour.v > 0) {
    const fmtHour = h => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    rollups.push(`Your Apple Music peak listening hour is ${fmtHour(peakHour.i)}.`);
  }

  // Per-song observations (top N by plays)
  const topSongs = Object.entries(songStats).sort((a, b) => b[1] - a[1]).slice(0, MAX_OBS);
  const perSong = topSongs.map(([key, plays]) =>
    `You've played "${key}" on Apple Music ${plays} time${plays === 1 ? '' : 's'}.`
  );

  return [...rollups, ...perSong];
}

export { parseAppleMusic };
