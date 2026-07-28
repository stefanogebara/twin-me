/**
 * Tests for dedup content hashing (api/services/observationUtils.js).
 *
 * optmem-brain audit, Phase 0 item 4 (root cause 7): dedup hashed the raw
 * string, so "40,381 unread" and "40,448 unread" hashed differently — both got
 * inserted, neither retired, and the backlog stat accumulated a new row every
 * ingestion cycle. proactiveInsights.js already solved this for INSIGHT text
 * with _stripDigitsForDedup, but memory writes never got it.
 *
 * Why this is not a literal reuse of _stripDigitsForDedup:
 *
 * contentHash feeds two skip-insert dedup paths — isDuplicate's near-duplicate
 * layer AND the batch prefilter in observationIngestion.js, which runs over a
 * SEVEN-DAY window against up to 5000 rows. Stripping every digit there would
 * collapse legitimate daily numeric observations into one per week:
 *
 *   "Whoop stress score today: 62/100 — moderate"  vs  "71/100 — moderate"
 *   "Sleep details: 7h 32m, efficiency 91%"        vs  "8h 02m, efficiency 88%"
 *   "Has a meeting 'Standup' from 9:00 AM to 9:15 AM" vs "from 10:00 AM ..."
 *
 * — a real regression in the health and calendar signal. Digits are pure noise
 * for insight THEME matching; they are load-bearing for daily observations.
 * So only VOLATILE COUNTS are stripped: 4+ digit runs and thousand-separated
 * numbers, which is exactly what the drifting-backlog problem looks like.
 */
import { describe, it, expect } from 'vitest';
import { contentHash, stripVolatileCounts } from '../../../api/services/observationUtils.js';

const collides = (a, b, platform = 'gmail') =>
  contentHash(platform, a) === contentHash(platform, b);

describe('stripVolatileCounts', () => {
  it('strips long digit runs', () => {
    expect(stripVolatileCounts('Has a backlog of 40448 unread emails in inbox'))
      .toBe('Has a backlog of unread emails in inbox');
  });

  it('strips thousand-separated numbers', () => {
    expect(stripVolatileCounts('Outlook inbox contains approximately 52,431 messages'))
      .toBe('Outlook inbox contains approximately messages');
  });

  it('leaves small numbers alone — they distinguish real daily observations', () => {
    expect(stripVolatileCounts('Whoop stress score today: 62/100 — moderate'))
      .toBe('Whoop stress score today: 62/100 — moderate');
    expect(stripVolatileCounts("Has a meeting 'Standup' from 9:00 AM to 9:15 AM"))
      .toBe("Has a meeting 'Standup' from 9:00 AM to 9:15 AM");
  });

  it('leaves decade labels intact (no word boundary after the digits)', () => {
    expect(stripVolatileCounts('Album era preferences: 1990s, 2000s'))
      .toBe('Album era preferences: 1990s, 2000s');
  });

  it('is null-safe', () => {
    expect(stripVolatileCounts(null)).toBe('');
    expect(stripVolatileCounts(undefined)).toBe('');
  });
});

describe('contentHash — drifting counts collide', () => {
  it('THE REGRESSION: an incrementing unread backlog hashes to one bucket', () => {
    expect(collides(
      'Has a backlog of 40000 unread emails in inbox',
      'Has a backlog of 40448 unread emails in inbox',
    )).toBe(true);
  });

  it('collides across thousand-separated formatting too', () => {
    expect(collides(
      'Has a backlog of 40,381 unread emails in inbox',
      'Has a backlog of 40,448 unread emails in inbox',
    )).toBe(true);
  });

  it('collides drifting Outlook mailbox sizes', () => {
    expect(collides(
      'Outlook inbox contains approximately 52,431 messages (very large inbox)',
      'Outlook inbox contains approximately 53,102 messages (very large inbox)',
      'outlook',
    )).toBe(true);
  });

  it('identical content still hashes identically', () => {
    const s = 'Discovered new artist: Radiohead';
    expect(collides(s, s)).toBe(true);
  });
});

describe('contentHash — distinct observations must NOT collide', () => {
  it('keeps daily Whoop readings distinct (small numbers are signal)', () => {
    expect(collides(
      'Whoop stress score today: 62/100 — moderate',
      'Whoop stress score today: 71/100 — moderate',
      'whoop',
    )).toBe(false);
  });

  it('keeps nightly sleep details distinct', () => {
    expect(collides(
      'Sleep details: 7h 32m, efficiency 91%',
      'Sleep details: 8h 02m, efficiency 88%',
      'whoop',
    )).toBe(false);
  });

  it('keeps same-titled meetings at different times distinct', () => {
    expect(collides(
      "Has a meeting 'Standup' from 9:00 AM to 9:15 AM",
      "Has a meeting 'Standup' from 10:00 AM to 10:30 AM",
      'calendar',
    )).toBe(false);
  });

  it('keeps weekly activity counts distinct', () => {
    expect(collides(
      'Made 47 commits across 9 repos on GitHub this week',
      'Made 12 commits across 3 repos on GitHub this week',
      'github',
    )).toBe(false);
  });

  it('keeps unrelated content distinct', () => {
    expect(collides(
      'Has a backlog of 40448 unread emails in inbox',
      'Discovered new artist: Radiohead',
    )).toBe(false);
  });

  it('still separates platforms — same text, different source', () => {
    const s = 'Has a backlog of 40448 unread emails in inbox';
    expect(contentHash('gmail', s)).not.toBe(contentHash('outlook', s));
  });
});
