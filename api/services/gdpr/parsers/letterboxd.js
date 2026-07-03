/**
 * GDPR parser: Letterboxd.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { csvToObjects } from '../shared.js';
import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Letterboxd — film diary CSV export
// ---------------------------------------------------------------------------
// Source: Settings -> Data -> Export your data. The ZIP includes several CSVs
// (diary.csv, watched.csv, ratings.csv, reviews.csv). Users typically upload
// one directly; if a ZIP comes in we prefer diary.csv.

function extractLetterboxdCsv(buffer) {
  const asText = buffer.toString('utf8');
  // Cheap ZIP detection
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = safeAdmZip(buffer);
      const entry = zip.getEntries().find(e => /diary\.csv$/i.test(e.entryName))
        || zip.getEntries().find(e => /ratings\.csv$/i.test(e.entryName))
        || zip.getEntries().find(e => /watched\.csv$/i.test(e.entryName));
      if (entry) return entry.getData().toString('utf8');
      throw new Error('Letterboxd ZIP missing diary.csv / ratings.csv / watched.csv');
    } catch (e) {
      throw new Error(`Letterboxd ZIP extract failed: ${e.message}`);
    }
  }
  return asText;
}

function formatStars(r) {
  const n = parseFloat(r);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Letterboxd stores 0.5-5 in half-star increments
  return `${n}★`;
}

function parseLetterboxd(buffer) {
  const csv = extractLetterboxdCsv(buffer);
  const rows = csvToObjects(csv);
  if (rows.length === 0) throw new Error('Letterboxd CSV has no rows');

  // Column layout varies between diary/ratings/watched — handle all three.
  // diary.csv:   Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
  // ratings.csv: Date, Name, Year, Letterboxd URI, Rating
  // watched.csv: Date, Name, Year, Letterboxd URI

  const observations = [];
  const MAX = 500;

  // Aggregates for rollup observations
  const ratingCounts = { '0.5★': 0, '1★': 0, '1.5★': 0, '2★': 0, '2.5★': 0, '3★': 0, '3.5★': 0, '4★': 0, '4.5★': 0, '5★': 0 };
  let totalRated = 0;
  let totalWatched = 0;
  let fiveStarFilms = [];
  let rewatches = 0;

  for (const r of rows) {
    const name = r['Name'] || '';
    if (!name) continue;

    const year = r['Year'] || '';
    const watchedDate = r['Watched Date'] || r['Date'] || '';
    const stars = formatStars(r['Rating']);
    const isRewatch = (r['Rewatch'] || '').toLowerCase() === 'yes';
    const tags = r['Tags'] || '';

    totalWatched++;
    if (stars) {
      totalRated++;
      ratingCounts[stars] = (ratingCounts[stars] || 0) + 1;
      if (stars === '5★') fiveStarFilms.push(`${name}${year ? ` (${year})` : ''}`);
    }
    if (isRewatch) rewatches++;

    // Per-film observation (cap to most recent MAX entries after sort)
    const filmDisplay = year ? `"${name}" (${year})` : `"${name}"`;
    const parts = [`You watched ${filmDisplay}`];
    if (stars) parts.push(`and rated it ${stars}`);
    if (isRewatch) parts.push('(rewatch)');
    if (watchedDate) parts.push(`on ${watchedDate}`);
    if (tags) parts.push(`— tagged: ${tags}`);
    observations.push({
      ts: watchedDate,
      text: parts.join(' ') + '.',
    });
  }

  // Keep most-recent per-film observations
  observations.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const perFilm = observations.slice(0, MAX).map(o => o.text);

  // Rollup observations
  const rollups = [];
  rollups.push(`Your Letterboxd diary contains ${totalWatched} watched film${totalWatched === 1 ? '' : 's'}${totalRated > 0 ? `, ${totalRated} of which you rated` : ''}${rewatches > 0 ? `, including ${rewatches} rewatch${rewatches === 1 ? '' : 'es'}` : ''}.`);

  if (fiveStarFilms.length > 0) {
    const top = fiveStarFilms.slice(0, 10).join(', ');
    rollups.push(`Your five-star films on Letterboxd include: ${top}.`);
  }

  const topStar = Object.entries(ratingCounts).sort((a, b) => b[1] - a[1])[0];
  if (topStar && topStar[1] > 0) {
    rollups.push(`Your most common Letterboxd rating is ${topStar[0]} (${topStar[1]} films).`);
  }

  return [...rollups, ...perFilm];
}

export { parseLetterboxd };
