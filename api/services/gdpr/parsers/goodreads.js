/**
 * GDPR parser: Goodreads.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { csvToObjects } from '../shared.js';

// ---------------------------------------------------------------------------
// Goodreads — library CSV export
// ---------------------------------------------------------------------------
// Source: My Books -> Import and Export -> Export Library. Returns a single CSV
// with ~25 columns including shelves, dates, rating, review text.

function parseGoodreads(buffer) {
  const text = buffer.toString('utf8');
  const rows = csvToObjects(text);
  if (rows.length === 0) throw new Error('Goodreads CSV has no rows');

  const observations = [];
  const MAX = 500;

  const shelfCounts = {};
  let totalRead = 0;
  let totalRated = 0;
  let currentlyReading = [];
  let wantToRead = [];
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const fiveStarBooks = [];

  const perBook = [];

  for (const r of rows) {
    const title = (r['Title'] || '').trim();
    if (!title) continue;

    const author = (r['Author'] || '').trim();
    const rating = parseInt(r['My Rating'] || '0', 10);
    const dateRead = (r['Date Read'] || '').trim();
    const dateAdded = (r['Date Added'] || '').trim();
    const shelf = (r['Exclusive Shelf'] || '').trim().toLowerCase();
    const review = (r['My Review'] || '').trim();
    const pageCount = parseInt(r['Number of Pages'] || '0', 10);

    shelfCounts[shelf || 'unshelved'] = (shelfCounts[shelf || 'unshelved'] || 0) + 1;

    if (shelf === 'read') {
      totalRead++;
      if (rating > 0) {
        totalRated++;
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
        if (rating === 5) fiveStarBooks.push(`${title}${author ? ` by ${author}` : ''}`);
      }
    } else if (shelf === 'currently-reading') {
      currentlyReading.push(`${title}${author ? ` by ${author}` : ''}`);
    } else if (shelf === 'to-read') {
      wantToRead.push(`${title}${author ? ` by ${author}` : ''}`);
    }

    // Per-book observation (focus on read books)
    if (shelf === 'read') {
      const parts = [`You read "${title}"`];
      if (author) parts.push(`by ${author}`);
      if (rating > 0) parts.push(`and rated it ${rating}/5`);
      if (dateRead) parts.push(`(finished ${dateRead})`);
      else if (dateAdded) parts.push(`(added ${dateAdded})`);
      if (pageCount > 0) parts.push(`— ${pageCount} pages`);
      const base = parts.join(' ') + '.';
      const full = review && review.length > 0 && review.length < 400
        ? `${base} Your review: "${review}"`
        : base;
      perBook.push({ ts: dateRead || dateAdded, text: full });
    }
  }

  // Keep most-recent per-book observations
  perBook.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const perBookText = perBook.slice(0, MAX).map(o => o.text);

  // Rollups
  const rollups = [];
  rollups.push(`Your Goodreads library has ${totalRead} book${totalRead === 1 ? '' : 's'} on your "read" shelf${totalRated > 0 ? `, ${totalRated} rated` : ''}.`);

  if (currentlyReading.length > 0) {
    const top = currentlyReading.slice(0, 5).join('; ');
    rollups.push(`You are currently reading: ${top}.`);
  }
  if (wantToRead.length > 0) {
    rollups.push(`Your "want to read" shelf has ${wantToRead.length} book${wantToRead.length === 1 ? '' : 's'}.`);
  }
  if (fiveStarBooks.length > 0) {
    const top = fiveStarBooks.slice(0, 10).join('; ');
    rollups.push(`Your five-star books on Goodreads include: ${top}.`);
  }

  const topRating = Object.entries(ratingDistribution)
    .map(([k, v]) => [parseInt(k, 10), v])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (topRating) {
    rollups.push(`Your most common Goodreads rating is ${topRating[0]}/5 (${topRating[1]} books).`);
  }

  const customShelves = Object.entries(shelfCounts)
    .filter(([k]) => !['read', 'currently-reading', 'to-read', 'unshelved'].includes(k))
    .map(([k]) => k);
  if (customShelves.length > 0) {
    rollups.push(`Custom Goodreads shelves you use: ${customShelves.slice(0, 10).join(', ')}.`);
  }

  return [...rollups, ...perBookText];
}

export { parseGoodreads };
