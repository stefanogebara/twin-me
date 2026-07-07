/**
 * Characterization tests for the GDPR import pipeline (audit A2-M2a).
 *
 * These tests were written and turned GREEN against the 4084-line
 * gdprImportService.js monolith BEFORE decomposing it into
 * api/services/gdpr/{shared.js,registry.js,parsers/*}. They pin the exact
 * observation strings emitted through the PUBLIC seam (processGdprImport)
 * for three representative parsers (whatsapp, netflix, reddit) plus the
 * unsupported-platform error path. The decomposition must keep every
 * assertion here passing with ZERO changes.
 *
 * Determinism notes:
 *   - WhatsApp timestamps are built with `new Date(y, m, d, h, min)` (local
 *     time) and bucketed with getHours()/getDay() (local time), so hour/day
 *     buckets are timezone-independent.
 *   - Netflix "Start Time" strings ("YYYY-MM-DD HH:MM:SS") parse as local
 *     time in Node, and the mocked user timezone is null, so
 *     getHourInTimeZone/getDayInTimeZone fall back to local getters —
 *     also timezone-independent.
 *   - Month labels use toLocaleString('default', ...) like the production
 *     code; expected strings compute the label the same way to stay
 *     locale-proof.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

// ── Mocks ────────────────────────────────────────────────────────────────

// Capture every observation the pipeline writes to the memory stream.
const observationCalls = [];
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addPlatformObservation: vi.fn(async (userId, content, platform, metadata) => {
    observationCalls.push({ userId, content, platform, metadata });
    return { id: `mem-${observationCalls.length}` };
  }),
}));

vi.mock('../../../api/services/reflectionEngine.js', () => ({
  shouldTriggerReflection: vi.fn(async () => false),
  generateReflections: vi.fn(async () => {}),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Supabase mock covering the four query shapes the orchestration uses:
//   createImportRecord : from('user_data_imports').insert().select('id').single()
//   finalizeImportRecord: from('user_data_imports').update({...}).eq('id', id)
//   getUserTimezone    : from('users').select('timezone').eq().maybeSingle()
//   loadExistingHashes : from('user_memories').select().eq().eq().filter().order().limit()
const finalizeCalls = [];
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      if (table === 'user_data_imports') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'import-test-1' }, error: null }),
            }),
          }),
          update: (patch) => ({
            eq: async (_col, id) => {
              finalizeCalls.push({ importId: id, ...patch });
              return { error: null };
            },
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          }),
        };
      }
      if (table === 'user_memories') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                // audit-2026-07-02 M3 added .order('created_at', desc) before
                // .limit() for deterministic dedup — the chain must include it.
                filter: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected supabase table in test: ${table}`);
    },
  },
}));

import { processGdprImport } from '../../../api/services/gdprImportService.js';

const USER_ID = 'user-characterization-test';

// Month label exactly as the production code renders it (locale-proof).
const monthShort = (y, m) => new Date(y, m, 1).toLocaleString('default', { month: 'short' });
const JAN = monthShort(2024, 0);

beforeEach(() => {
  observationCalls.length = 0;
  finalizeCalls.length = 0;
});

// ── WhatsApp (chat .txt export — both line formats) ─────────────────────

describe('processGdprImport characterization: whatsapp', () => {
  const chatTxt = [
    '[15/01/2024, 08:32:45] Stefano: Hey, can we meet today?',
    '[15/01/2024, 08:35:00] Maria: Sure, what time works?',
    '15/01/2024, 09:10 - Stefano: How about noon at the cafe',
    '[16/01/2024, 21:15:00] Stefano: <Media omitted>',
    '[16/01/2024, 21:20:00] Maria: Nice photo!',
    '[17/01/2024, 10:00:00] Stefano: Thanks. See you soon',
  ].join('\n');

  it('emits the exact behavioral-pattern observations (no message content)', async () => {
    const result = await processGdprImport(USER_ID, 'whatsapp', Buffer.from(chatTxt, 'utf8'), '_chat.txt');

    expect(result.error).toBeUndefined();
    expect(result.importId).toBe('import-test-1');
    expect(result.factsCreated).toBe(0);
    expect(result.observationsCreated).toBe(8);

    const contents = observationCalls.map(c => c.content);
    expect(contents).toEqual([
      `WhatsApp chat history spans 2 days (${JAN} 2024 to ${JAN} 2024), 6 total messages across 2 participants, averaging 3.0 messages/day`,
      'WhatsApp messaging patterns: 75% morning, 0% afternoon, 25% evening, 0% late-night. Peak hour: around 8am (primarily a morning messenger)',
      'Most active WhatsApp day: Monday (2 messages sent on Mondays)',
      'Most frequent WhatsApp contacts: Maria (2 msgs)',
      'WhatsApp communication style: 3 text messages, 1 media files (25% media — moderate media sender)',
      'WhatsApp message length: avg 5.0 words per text message (sends short, punchy messages)',
      'WhatsApp participation: sent 4 of 6 total messages (67% share — tends to carry conversations)',
      'WhatsApp weekly pattern: 0% of messages on weekends (messaging peaks on weekdays (work/school week pattern))',
    ]);

    // Every write is tagged as a GDPR import for this platform
    for (const call of observationCalls) {
      expect(call.userId).toBe(USER_ID);
      expect(call.platform).toBe('whatsapp');
      expect(call.metadata.ingestion_source).toBe('gdpr_import');
      expect(call.metadata.import_id).toBe('import-test-1');
      expect(typeof call.metadata.import_hash).toBe('string');
      expect(call.metadata.import_hash).toHaveLength(16);
    }

    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0]).toMatchObject({
      importId: 'import-test-1',
      status: 'completed',
      observations_created: 8,
      facts_created: 0,
      error_message: null,
    });
  });

  it('re-uploading the same export dedups every observation (created=0)', async () => {
    await processGdprImport(USER_ID, 'whatsapp', Buffer.from(chatTxt, 'utf8'), '_chat.txt');
    expect(observationCalls).toHaveLength(8);

    // Second run within the same process: the mocked DB returns no existing
    // hashes, so dedup relies on the content-hash Set built per run — this
    // pins that identical content produces identical hashes across runs by
    // replaying the memory rows the first run created.
    // (loadExistingHashes derives hashes from content, so feed them back.)
    const firstRunContents = observationCalls.map(c => c.content);
    observationCalls.length = 0;

    // Re-import with the first run's rows visible as existing memories.
    const { processGdprImport: run } = await import('../../../api/services/gdprImportService.js');
    // Patch the user_memories mock response for this call only.
    const dbModule = await import('../../../api/services/database.js');
    const originalFrom = dbModule.supabaseAdmin.from;
    dbModule.supabaseAdmin.from = (table) => {
      if (table === 'user_memories') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                filter: () => ({
                  limit: async () => ({
                    data: firstRunContents.map(content => ({ content, metadata: {} })),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return originalFrom(table);
    };
    try {
      const result = await run(USER_ID, 'whatsapp', Buffer.from(chatTxt, 'utf8'), '_chat.txt');
      expect(result.observationsCreated).toBe(0);
      expect(observationCalls).toHaveLength(0);
    } finally {
      dbModule.supabaseAdmin.from = originalFrom;
    }
  });
});

// ── Netflix (ViewingActivity.csv) ────────────────────────────────────────

describe('processGdprImport characterization: netflix', () => {
  const csv = [
    'Title,Start Time,Duration,Attributes,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country',
    '"Dark: Season 1: Secrets","2024-01-15 20:30:00","00:50:00",,,TV,,,"DE (Germany)"',
    '"Dark: Season 1: Lies","2024-01-16 21:00:00","00:48:00",,,TV,,,"DE (Germany)"',
    '"The Irishman","2024-01-20 22:00:00","03:20:00",,,Laptop,,,"US (United States)"',
    '"Some Trailer","2024-01-21 10:00:00","00:00:30",,,Laptop,,,"US (United States)"',
  ].join('\n');

  it('emits exact rollups and per-show observations, skipping sub-60s plays', async () => {
    const result = await processGdprImport(USER_ID, 'netflix', Buffer.from(csv, 'utf8'), 'ViewingActivity.csv');

    expect(result.error).toBeUndefined();
    expect(result.observationsCreated).toBe(7);

    const contents = observationCalls.map(c => c.content);
    expect(contents).toEqual([
      'Your Netflix history has 3 sessions across 2 distinct shows/films, totaling roughly 5 hours watched.',
      'Your most-watched Netflix titles by time are: The Irishman (3h), Dark (2h).',
      'Your Netflix peak viewing hour is 8pm (1 sessions).',
      'Your most-Netflix-heavy day of the week is Monday.',
      'You watch Netflix mostly on TV.',
      'You watched "The Irishman" on Netflix — 1 session, ~3h total, most recently 2024-01-20.',
      'You watched "Dark" on Netflix — 2 sessions, ~2h total, most recently 2024-01-16.',
    ]);

    expect(observationCalls.every(c => c.platform === 'netflix')).toBe(true);
    expect(finalizeCalls[0]).toMatchObject({ status: 'completed', observations_created: 7 });
  });
});

// ── Reddit (nested JSON export) ──────────────────────────────────────────

describe('processGdprImport characterization: reddit', () => {
  const redditJson = JSON.stringify({
    comments: [
      { subreddit: 'programming' },
      { subreddit: 'programming' },
      { subreddit: 'r/programming' },
      { subreddit: 'webdev' },
      { data: { subreddit: 'webdev' } },
    ],
    posts: [{ subreddit: 'programming' }],
    saved_posts: [{}, {}],
  });

  it('emits exact community rollups including the tech-community inference', async () => {
    const result = await processGdprImport(USER_ID, 'reddit', Buffer.from(redditJson, 'utf8'), 'reddit-data.json');

    expect(result.error).toBeUndefined();
    expect(result.observationsCreated).toBe(5);

    const contents = observationCalls.map(c => c.content);
    expect(contents).toEqual([
      'Most active Reddit communities: r/programming (4), r/webdev (2)',
      'Made 5 Reddit comments across history',
      'Submitted 1 Reddit posts',
      'Saved 2 Reddit posts',
      'Strong Reddit presence in technology and programming communities',
    ]);

    expect(finalizeCalls[0]).toMatchObject({ status: 'completed', observations_created: 5 });
  });
});

// ── Error paths ──────────────────────────────────────────────────────────

describe('processGdprImport characterization: error handling', () => {
  it("unknown platform finalizes the import as 'error' and returns {error}", async () => {
    const result = await processGdprImport(USER_ID, 'myspace', Buffer.from('x'), 'x.bin');

    expect(result).toEqual({
      importId: 'import-test-1',
      observationsCreated: 0,
      factsCreated: 0,
      error: 'Unsupported platform: myspace',
    });
    expect(observationCalls).toHaveLength(0);
    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0]).toMatchObject({
      importId: 'import-test-1',
      status: 'error',
      observations_created: 0,
      facts_created: 0,
      error_message: 'Unsupported platform: myspace',
    });
  });

  it("a parser throw (invalid Spotify JSON) also finalizes as 'error'", async () => {
    const result = await processGdprImport(USER_ID, 'spotify', Buffer.from('not json'), 'StreamingHistory0.json');

    expect(result.error).toBe('Invalid Spotify JSON — expected StreamingHistory*.json or Streaming_History_Audio_*.json');
    expect(finalizeCalls[0]).toMatchObject({ status: 'error' });
  });
});

// ── Registry (added after the decomposition) ─────────────────────────────

describe('PLATFORM_PARSERS registry', () => {
  it('covers exactly the 21 platforms the old switch handled, in order', async () => {
    const { PLATFORM_PARSERS } = await import('../../../api/services/gdpr/registry.js');
    expect(Object.keys(PLATFORM_PARSERS)).toEqual([
      'spotify', 'youtube', 'discord', 'reddit', 'android_usage',
      'google_search', 'whatsapp', 'whoop', 'apple_health', 'health_connect',
      'android_health', 'sms_patterns', 'letterboxd', 'goodreads', 'netflix',
      'tiktok', 'x_archive', 'apple_music', 'soundcloud', 'linkedin',
      'instagram',
    ]);
  });

  it('every entry has a callable parse function and a boolean needsTimezone', async () => {
    const { PLATFORM_PARSERS } = await import('../../../api/services/gdpr/registry.js');
    for (const [platform, entry] of Object.entries(PLATFORM_PARSERS)) {
      expect(typeof entry.parse, `${platform}.parse`).toBe('function');
      expect(typeof entry.needsTimezone, `${platform}.needsTimezone`).toBe('boolean');
    }
  });

  it('needsTimezone mirrors exactly the switch cases that passed userTimezone', async () => {
    const { PLATFORM_PARSERS } = await import('../../../api/services/gdpr/registry.js');
    const withTimezone = Object.entries(PLATFORM_PARSERS)
      .filter(([, e]) => e.needsTimezone)
      .map(([k]) => k)
      .sort();
    expect(withTimezone).toEqual(['discord', 'google_search', 'netflix', 'spotify', 'youtube']);
  });
});
