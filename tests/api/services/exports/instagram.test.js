import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { detectInstagramExport, parseInstagramExport } from '../../../../api/services/exports/parsers/instagram.js';
import { buildInstagramZip } from './fixtures.js';
import { detectInstagramExportIntent, formatInstagramExport } from '../../../../api/services/exports/chat/instagram.js';

describe('instagram export parser', () => {
  const zip = new AdmZip(buildInstagramZip());

  it('detects instagram zip', async () => {
    expect(await detectInstagramExport(zip)).toBe(true);
  });

  it('parses post + reel + story counts and likes-given', async () => {
    const { aggregates } = await parseInstagramExport(zip);
    expect(aggregates.totals.posts).toBe(2);
    expect(aggregates.totals.reels).toBe(1);
    expect(aggregates.totals.stories).toBe(0);
    expect(aggregates.totals.likes_given).toBe(2);
    expect(aggregates.totals.comments_made).toBe(4);
  });

  it('aggregates search topics', async () => {
    const { aggregates } = await parseInstagramExport(zip);
    const travel = aggregates.top_search_topics.find((s) => s.query === 'travel');
    expect(travel?.count).toBe(2);
  });

  it('observations include posting cadence', async () => {
    const { observations } = await parseInstagramExport(zip);
    expect(observations.join(' ')).toMatch(/Instagram/);
  });
});

describe('instagram export chat glue', () => {
  it('detects intent on common phrasings', () => {
    expect(detectInstagramExportIntent('what are my top instagram searches').kind).toBe('export');
    expect(detectInstagramExportIntent('how many posts did I make on instagram').kind).toBe('export');
    expect(detectInstagramExportIntent('what did I eat for lunch').kind).toBe(null);
  });

  it('formats aggregates into a directive line', () => {
    const aggregates = {
      totals: { posts: 50, reels: 10, stories: 5, likes_given: 200, saved_items: 30, comments_made: 12 },
      posting_cadence: { active_days: 30, posts_per_day: 2 },
      top_search_topics: [{ query: 'travel', count: 5 }],
    };
    const out = formatInstagramExport(aggregates);
    expect(out).toContain('50 posts');
    expect(out).toContain('200 likes given');
    expect(out).toContain('"travel"');
  });
});
