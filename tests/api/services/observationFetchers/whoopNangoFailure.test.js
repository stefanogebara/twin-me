/**
 * A failed Whoop fetch must not be recorded as a successful empty one.
 *
 * IMPORTERS/CALLERS: exercises fetchWhoopObservations in
 * api/services/observationFetchers/whoop.js, registered in PLATFORM_FETCHERS
 * and driven by /api/cron/ingest-observations. The tagged throw is what makes
 * the orchestrator write platform_connections.status='auth_failed' and surface
 * a Reconnect CTA.
 * AFFECTED API: Whoop v2 recovery and activity/sleep through the Nango proxy.
 * DATA SCHEMAS: reads platform_connections.access_token and
 * nango_connection_mappings. No writes in this path.
 * USER'S VERBATIM INSTRUCTION: "fix the whoop token and the dead youtube
 * activities call".
 *
 * The direct-token branch got the tagged throw in Phase 2 (2026-06-08). The
 * Nango branch never did: it reads `result.success ? records : []` and carries
 * on, so a 404 from a missing connection mapping produced zero observations
 * and the run was recorded as count=0 / status=ok. Ingestion had been dead
 * since 2026-08-02 while the UI still read "connected". Someone was already
 * chasing this — whoop.js:151 carries a diagnostic log reading "cron returns
 * count=0 with status=ok — surface why".
 *
 * The distinction that matters, and the one the code was missing:
 *   success:false            -> the call FAILED. Say so.
 *   success:true, 0 records  -> the user genuinely has no data. Stay quiet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSupabase, mockGetRecovery, mockGetSleep, mockGetWorkout } = vi.hoisted(() => ({
  mockGetSupabase: vi.fn(),
  mockGetRecovery: vi.fn(),
  mockGetSleep: vi.fn(),
  mockGetWorkout: vi.fn(),
}));

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: vi.fn(),
}));
vi.mock('../../../../api/services/observationUtils.js', () => ({
  getSupabase: mockGetSupabase,
  _hasNangoMapping: vi.fn(async () => true),
  sanitizeExternal: (value, max) =>
    typeof value === 'string' ? value.slice(0, max ?? 100) : '',
}));
vi.mock('../../../../api/services/nangoService.js', () => ({
  whoop: {
    getRecovery: mockGetRecovery,
    getSleep: mockGetSleep,
    getWorkout: mockGetWorkout,
  },
}));

const { default: fetchWhoopObservations } = await import(
  '../../../../api/services/observationFetchers/whoop.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** platform_connections row marking the connection Nango-managed. */
function nangoManagedSupabase() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: { access_token: 'NANGO_MANAGED' } }),
    upsert: async () => ({ data: null, error: null }),
  };
  return { from: () => builder };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSupabase.mockResolvedValue(nangoManagedSupabase());
  mockGetWorkout.mockResolvedValue({ success: true, data: { records: [] } });
});

describe('fetchWhoopObservations via Nango', () => {
  it('throws instead of reporting an empty success when the connection is gone', async () => {
    const failure = { success: false, error: 'Nango 404: no connection', status: 404 };
    mockGetRecovery.mockResolvedValue(failure);
    mockGetSleep.mockResolvedValue(failure);

    await expect(fetchWhoopObservations(USER_ID)).rejects.toThrow(/whoop/i);
  });

  it('tags the failure so the orchestrator records auth_failed', async () => {
    const failure = { success: false, error: 'Nango 404: no connection', status: 404 };
    mockGetRecovery.mockResolvedValue(failure);
    mockGetSleep.mockResolvedValue(failure);

    await expect(fetchWhoopObservations(USER_ID)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it.each([401, 403, 404])('treats HTTP %i as an auth failure', async (status) => {
    const failure = { success: false, error: `Nango ${status}`, status };
    mockGetRecovery.mockResolvedValue(failure);
    mockGetSleep.mockResolvedValue(failure);

    await expect(fetchWhoopObservations(USER_ID)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('does not claim auth failure for a transient 500', async () => {
    const failure = { success: false, error: 'Nango 500', status: 500 };
    mockGetRecovery.mockResolvedValue(failure);
    mockGetSleep.mockResolvedValue(failure);

    await expect(fetchWhoopObservations(USER_ID)).rejects.toMatchObject({
      code: 'TOKEN_UNAVAILABLE',
    });
  });

  // A working connection with nothing to report is not a failure.
  it('stays quiet when the calls succeed with no records', async () => {
    mockGetRecovery.mockResolvedValue({ success: true, data: { records: [] } });
    mockGetSleep.mockResolvedValue({ success: true, data: { records: [] } });

    await expect(fetchWhoopObservations(USER_ID)).resolves.toEqual([]);
  });

  it('surfaces a thrown Nango client error instead of swallowing it', async () => {
    mockGetRecovery.mockRejectedValue(new Error('socket hang up'));
    mockGetSleep.mockResolvedValue({ success: true, data: { records: [] } });

    await expect(fetchWhoopObservations(USER_ID)).rejects.toMatchObject({
      code: 'TOKEN_UNAVAILABLE',
    });
  });

  // One endpoint failing is not evidence the connection is broken.
  it('does not throw when only one of the two calls fails', async () => {
    mockGetRecovery.mockResolvedValue({ success: true, data: { records: [] } });
    mockGetSleep.mockResolvedValue({ success: false, error: 'Nango 404', status: 404 });

    await expect(fetchWhoopObservations(USER_ID)).resolves.toBeInstanceOf(Array);
  });
});
