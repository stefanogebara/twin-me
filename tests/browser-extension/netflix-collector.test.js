import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

// netflix-inject.js is a classic MAIN-world browser script. We can't `import`
// it (it has no ESM exports, and `export` would break it in the page). Instead
// execute the real shipped file in a CJS sandbox: `window` is undefined there,
// so the fetch/XHR hooks are skipped, and the pure parser is exposed via the
// file's `module.exports` guard. This tests the actual shipped logic.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(
  path.resolve(here, '../../browser-extension/collectors/netflix-inject.js'),
  'utf8'
);
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(src, sandbox);
const { normalizeViewedItems } = sandbox.module.exports;

describe('netflix normalizeViewedItems (viewingactivity API shape)', () => {
  it('exports the parser from the shipped browser file', () => {
    expect(typeof normalizeViewedItems).toBe('function');
  });

  it('maps a series episode (seriesTitle present)', () => {
    const out = normalizeViewedItems([
      { title: 'Chapter One', seriesTitle: 'Stranger Things', movieID: 80057281, date: 1733000000, bookmark: 1500, dateStr: '01/12/2026' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: 'Stranger Things',
      episodeTitle: 'Chapter One',
      contentType: 'series',
      movieID: 80057281,
      watchedSeconds: 1500,
    });
    expect(out[0].watchedAt).toBe(new Date(1733000000 * 1000).toISOString());
  });

  it('maps a movie (no seriesTitle)', () => {
    const out = normalizeViewedItems([{ title: 'The Irishman', movieID: 80175798, date: 1733100000 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'The Irishman', contentType: 'movie', episodeTitle: null, movieID: 80175798 });
  });

  it('drops items without a title and tolerates junk', () => {
    expect(normalizeViewedItems([{ movieID: 1 }, null, 'x', 42])).toEqual([]);
  });

  it('returns [] for non-array / nullish input', () => {
    expect(normalizeViewedItems(null)).toEqual([]);
    expect(normalizeViewedItems(undefined)).toEqual([]);
    expect(normalizeViewedItems({})).toEqual([]);
  });

  it('falls back to dateStr when date epoch is absent', () => {
    const out = normalizeViewedItems([{ title: 'Movie', dateStr: '12/01/2026' }]);
    expect(out[0].watchedAt).toBe('12/01/2026');
  });
});
