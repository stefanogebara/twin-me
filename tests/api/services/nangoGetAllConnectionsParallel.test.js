/**
 * Dispatch-shape tests for nangoService.getAllConnections
 * (backend-latency audit 2026-07-03).
 *
 * GET /api/nango/connections measured at 6.8s: the old implementation looped
 * over the 8 PLATFORM_CONFIGS serially, each iteration paying one Supabase
 * mapping lookup + one Nango API round trip (sum of 8). The fix is twofold:
 *   1. all per-platform lookups run in parallel (cost = max, not sum), and
 *   2. platforms with no mapping row short-circuit to connected:false
 *      WITHOUT calling the Nango API at all.
 *
 * The parallel assertion uses a barrier: every mocked Nango call blocks until
 * released. If dispatch were still serial, call #2 would never be issued
 * while call #1 is blocked, and vi.waitFor would time out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockNangoGetConnection, mockDbGetConnectionId } = vi.hoisted(() => ({
  mockNangoGetConnection: vi.fn(),
  mockDbGetConnectionId: vi.fn(),
}));

vi.mock('@nangohq/node', () => ({
  Nango: class {
    constructor() {
      this.getConnection = mockNangoGetConnection;
    }
  },
}));

vi.mock('../../../api/services/connectionMappingService.js', () => ({
  getConnectionId: mockDbGetConnectionId,
  updateLastSynced: vi.fn(),
  markConnectionNeedsReconnect: vi.fn(),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

// nangoService only constructs its Nango client when the secret is present,
// and the hardcoded dev-user fallback must stay dormant in this test.
process.env.NANGO_SECRET_KEY = 'test-secret';
delete process.env.DEV_USER_ID;

const { getAllConnections, PLATFORM_CONFIGS } = await import(
  '../../../api/services/nangoService.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const PLATFORM_COUNT = Object.keys(PLATFORM_CONFIGS).length;

describe('getAllConnections (audit 2026-07-03: 6.8s serial loop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches every platform lookup in parallel, not serially', async () => {
    // Every platform has a mapping, so every lookup reaches the Nango call.
    mockDbGetConnectionId.mockImplementation(
      async (_userId, platform) => `conn-${platform}`
    );

    let releaseBarrier;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });
    mockNangoGetConnection.mockImplementation(async (_key, connectionId) => {
      await barrier;
      return {
        connection_id: connectionId,
        created_at: '2026-07-01T00:00:00Z',
        credentials: { access_token: 't', expires_at: null },
      };
    });

    const resultPromise = getAllConnections(USER_ID);

    // All N Nango calls must be IN FLIGHT before any of them resolves.
    // The old serial loop would stall at 1 and this waitFor would time out.
    await vi.waitFor(() => {
      expect(mockNangoGetConnection).toHaveBeenCalledTimes(PLATFORM_COUNT);
    });

    releaseBarrier();
    const connections = await resultPromise;

    expect(Object.keys(connections)).toHaveLength(PLATFORM_COUNT);
    for (const [platform, result] of Object.entries(connections)) {
      expect(result).toMatchObject({ success: true, connected: true, platform });
    }
  });

  it('skips the Nango API entirely when no mapping exists', async () => {
    mockDbGetConnectionId.mockResolvedValue(null);

    const connections = await getAllConnections(USER_ID);

    expect(mockNangoGetConnection).not.toHaveBeenCalled();
    expect(Object.keys(connections)).toHaveLength(PLATFORM_COUNT);
    for (const [platform, result] of Object.entries(connections)) {
      expect(result).toEqual({ success: true, connected: false, platform });
    }
  });

  it('only calls Nango for mapped platforms (mixed case)', async () => {
    mockDbGetConnectionId.mockImplementation(async (_userId, platform) =>
      platform === 'spotify' ? 'conn-spotify' : null
    );
    mockNangoGetConnection.mockResolvedValue({
      connection_id: 'conn-spotify',
      created_at: '2026-07-01T00:00:00Z',
      credentials: { access_token: 't', expires_at: null },
    });

    const connections = await getAllConnections(USER_ID);

    expect(mockNangoGetConnection).toHaveBeenCalledTimes(1);
    expect(mockNangoGetConnection).toHaveBeenCalledWith('spotify', 'conn-spotify');
    expect(connections.spotify).toMatchObject({ success: true, connected: true });
    expect(connections.github).toEqual({
      success: true,
      connected: false,
      platform: 'github',
    });
  });

  it('one platform failing does not poison the others', async () => {
    mockDbGetConnectionId.mockImplementation(
      async (_userId, platform) => `conn-${platform}`
    );
    mockNangoGetConnection.mockImplementation(async (key) => {
      if (key === 'discord') throw new Error('nango exploded');
      return {
        connection_id: `conn-${key}`,
        created_at: '2026-07-01T00:00:00Z',
        credentials: { access_token: 't', expires_at: null },
      };
    });

    const connections = await getAllConnections(USER_ID);

    expect(connections.discord.success).toBe(false);
    expect(connections.spotify).toMatchObject({ success: true, connected: true });
  });
});
