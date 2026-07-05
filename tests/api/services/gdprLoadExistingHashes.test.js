/**
 * Unit test for gdprImportService.loadExistingHashes (audit-2026-07-02 M3).
 *
 * The dedup pre-fetch is bounded at 5000 rows, but a .limit() without an
 * .order() lets the database return an ARBITRARY subset once an account
 * outgrows the bound — silently dropping the newest hashes, which are exactly
 * the rows a re-import is most likely to duplicate. Pin the query shape: the
 * builder must receive .order('created_at', { ascending: false }) BEFORE
 * .limit(5000), and the hash set must include both the content hash and any
 * metadata.import_hash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ci-stub.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'ci-stub-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'ci-stub-service-role-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// ── Chainable supabaseAdmin mock (repo idiom — see wikiCompilationService.test.js) ──
const rows = [
  { content: 'Listened to Radiohead on repeat all evening', metadata: { source: 'spotify' } },
  { content: 'Imported streaming history entry', metadata: { source: 'spotify', import_hash: 'abcd1234ef567890' } },
];

const chain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  filter: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
};
const fromMock = vi.fn(() => chain);

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: (...args) => fromMock(...args) },
  serverDb: {},
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { loadExistingHashes } = await import('../../../api/services/gdprImportService.js');

// Mirrors the private contentHash() in gdprImportService.js.
function expectedHash(platform, content) {
  return crypto
    .createHash('sha256')
    .update(`${platform}:${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 16);
}

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('gdprImportService.loadExistingHashes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.limit.mockResolvedValue({ data: rows, error: null });
  });

  it('bounds the dedup scan to the newest 5000 rows (order + limit)', async () => {
    await loadExistingHashes(USER_ID, 'spotify');

    expect(fromMock).toHaveBeenCalledWith('user_memories');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('memory_type', 'platform_data');
    expect(chain.filter).toHaveBeenCalledWith('metadata->>source', 'eq', 'spotify');
    // The load-bearing assertions: deterministic newest-first bound.
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(5000);
  });

  it('returns content hashes plus any metadata.import_hash values', async () => {
    const hashes = await loadExistingHashes(USER_ID, 'spotify');

    expect(hashes).toBeInstanceOf(Set);
    expect(hashes.has(expectedHash('spotify', rows[0].content))).toBe(true);
    expect(hashes.has(expectedHash('spotify', rows[1].content))).toBe(true);
    expect(hashes.has('abcd1234ef567890')).toBe(true);
  });

  it('returns an empty set when the query yields no rows', async () => {
    chain.limit.mockResolvedValue({ data: null, error: null });
    const hashes = await loadExistingHashes(USER_ID, 'spotify');
    expect(hashes.size).toBe(0);
  });
});
