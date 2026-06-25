/**
 * Tests for nangoOrphanCleanup — frees Nango slots held by retired-platform
 * connections (the resource_capped root cause). Retired platforms are gone
 * from PLATFORM_CONFIGS, so cleanup must delete by the stored
 * provider_config_key + nango_connection_id, drop bookkeeping on success, and
 * tolerate per-connection failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NODE_ENV = 'test';

const rawDeleteMock = vi.fn();
vi.mock('../../../api/services/nangoService.js', () => ({
  deleteNangoConnectionRaw: (...a) => rawDeleteMock(...a),
}));

let selectResult = { data: [], error: null };
const deleteCalls = [];
let inArg = null;
vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const b = { _table: table };
    b.select = vi.fn(() => b);
    b.in = vi.fn((col, vals) => { inArg = { col, vals }; return b; });
    b.limit = vi.fn(() => Promise.resolve(selectResult));
    b.delete = vi.fn(() => { const d = { _t: table, eqs: {} }; deleteCalls.push(d); 
      const chain = { eq: vi.fn((c, v) => { d.eqs[c] = v; return chain; }) };
      return chain; });
    return b;
  }
  return { supabaseAdmin: { from: vi.fn((t) => builder(t)) } };
});

const { cleanupOrphanedNangoConnections, RETIRED_PLATFORMS } = await import('../../../api/services/nangoOrphanCleanup.js');

beforeEach(() => {
  vi.clearAllMocks();
  deleteCalls.length = 0;
  inArg = null;
  selectResult = { data: [], error: null };
  rawDeleteMock.mockResolvedValue({ success: true });
});

describe('cleanupOrphanedNangoConnections', () => {
  it('only targets retired platforms', async () => {
    await cleanupOrphanedNangoConnections();
    expect(inArg.col).toBe('platform');
    expect(inArg.vals).toEqual(RETIRED_PLATFORMS);
    expect(RETIRED_PLATFORMS).toContain('twitch');
    expect(RETIRED_PLATFORMS).toContain('reddit');
    expect(RETIRED_PLATFORMS).toContain('linkedin');
  });

  it('dry run reports counts without deleting', async () => {
    selectResult = { data: [
      { id: 'm1', user_id: 'u1', platform: 'twitch', provider_config_key: 'twitch', nango_connection_id: 'c1' },
      { id: 'm2', user_id: 'u2', platform: 'twitch', provider_config_key: 'twitch', nango_connection_id: 'c2' },
      { id: 'm3', user_id: 'u3', platform: 'reddit', provider_config_key: 'reddit', nango_connection_id: 'c3' },
    ], error: null };
    const r = await cleanupOrphanedNangoConnections({ dryRun: true });
    expect(r.scanned).toBe(3);
    expect(r.deleted).toBe(0);
    expect(r.byPlatform).toEqual({ twitch: 2, reddit: 1 });
    expect(rawDeleteMock).not.toHaveBeenCalled();
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes connection + bookkeeping on success', async () => {
    selectResult = { data: [
      { id: 'm1', user_id: 'u1', platform: 'twitch', provider_config_key: 'twitch', nango_connection_id: 'c1' },
    ], error: null };
    const r = await cleanupOrphanedNangoConnections();
    expect(rawDeleteMock).toHaveBeenCalledWith('twitch', 'c1');
    expect(r.deleted).toBe(1);
    expect(r.failed).toBe(0);
    // one mapping delete (by id) + one platform_connections delete (by user+platform)
    expect(deleteCalls.some(d => d._t === 'nango_connection_mappings' && d.eqs.id === 'm1')).toBe(true);
    expect(deleteCalls.some(d => d._t === 'platform_connections' && d.eqs.user_id === 'u1' && d.eqs.platform === 'twitch')).toBe(true);
  });

  it('counts failures and keeps rows (retried next run)', async () => {
    selectResult = { data: [
      { id: 'm1', user_id: 'u1', platform: 'twitch', provider_config_key: 'twitch', nango_connection_id: 'c1' },
    ], error: null };
    rawDeleteMock.mockResolvedValue({ success: false, error: 'nango 500', status: 500 });
    const r = await cleanupOrphanedNangoConnections();
    expect(r.deleted).toBe(0);
    expect(r.failed).toBe(1);
    expect(deleteCalls).toHaveLength(0);
  });

  it('treats already-gone (404) as success', async () => {
    selectResult = { data: [
      { id: 'm1', user_id: 'u1', platform: 'reddit', provider_config_key: 'reddit', nango_connection_id: 'c1' },
    ], error: null };
    rawDeleteMock.mockResolvedValue({ success: true, alreadyGone: true });
    const r = await cleanupOrphanedNangoConnections();
    expect(r.deleted).toBe(1);
  });

  it('surfaces a query error', async () => {
    selectResult = { data: null, error: { message: 'db down' } };
    const r = await cleanupOrphanedNangoConnections();
    expect(r.error).toBe('db down');
    expect(r.deleted).toBe(0);
  });
});
