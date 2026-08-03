/**
 * Unit contract for getStarvedIngestionUserIds — the starvation detector the
 * ingestion cron uses to decide whether a "successful" Inngest fan-out actually
 * got consumed (2026-06 incident: 3 weeks of successful fan-outs, zero function
 * runs). "Starved" must mean "ingestion has not ATTEMPTED this user recently".
 *
 * Regression this pins (2026-07-17): the check keyed off
 * user_platform_data.extracted_at, which is CONTENT recency. A connected-but-
 * dormant user with no new platform activity never advances extracted_at, so it
 * was flagged starved on EVERY 30-min tick forever — firing the bounded inline
 * fallback (real gmail/calendar/github fetches) against users we had in fact
 * just polled. Fix: also honour the per-poll sync clocks
 * (platform_connections.last_sync_at / nango_connection_mappings.last_synced_at),
 * which bump on every poll regardless of whether new data landed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The heavy observationIngestion.js import chain reads these at load.
process.env.SUPABASE_URL ||= 'https://stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'stub-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service';
process.env.OPENROUTER_API_KEY ||= 'stub-openrouter';
process.env.ENCRYPTION_KEY ||= '0'.repeat(64); // 32-byte key as hex, matching every other suite
process.env.JWT_SECRET ||= 'stub-jwt-secret';

// Hoisted holder so the vi.mock factory (hoisted above module init) can reach a
// per-test mutable supabase stub.
const h = vi.hoisted(() => ({ supabase: null }));

vi.mock('../../../api/services/observationUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSupabase: async () => h.supabase };
});

const { getStarvedIngestionUserIds } = await import('../../../api/services/observationIngestion.js');

/**
 * Table-aware Supabase stub. Every freshness lookup is a
 * .from(table).select().in()[.neq()].gte(col, cutoff) chain that awaits
 * { data, error }. `freshByTable` maps a table to the user_ids it reports fresh;
 * `errorTables` forces { error } for the fail-closed path.
 */
function makeSupabase(freshByTable = {}, errorTables = new Set()) {
  return {
    from(table) {
      const builder = {
        select: () => builder,
        in: () => builder,
        neq: () => builder,
        gte: () =>
          errorTables.has(table)
            ? Promise.resolve({ data: null, error: { message: `${table} boom` } })
            : Promise.resolve({ data: (freshByTable[table] || []).map((user_id) => ({ user_id })), error: null }),
      };
      return builder;
    },
  };
}

beforeEach(() => { h.supabase = null; });

describe('getStarvedIngestionUserIds — attempt recency, not content recency', () => {
  it('dormant user polled recently (fresh last_sync_at) but no new content (stale extracted_at) is NOT starved', async () => {
    // THE regression: extracted_at alone flagged this user starved forever.
    h.supabase = makeSupabase({
      platform_connections: ['dormant'], // last_sync_at within cutoff — we polled them
      nango_connection_mappings: [],
      user_platform_data: [], // extracted_at stale — no new content
    });
    expect(await getStarvedIngestionUserIds(['dormant'], 40)).toEqual([]);
  });

  it('freshness via nango last_synced_at counts (nango-only user not starved)', async () => {
    h.supabase = makeSupabase({ nango_connection_mappings: ['nangoUser'] });
    expect(await getStarvedIngestionUserIds(['nangoUser'], 40)).toEqual([]);
  });

  it('content recency still counts (extension/github-only user fresh via extracted_at)', async () => {
    h.supabase = makeSupabase({ user_platform_data: ['ghUser'] });
    expect(await getStarvedIngestionUserIds(['ghUser'], 40)).toEqual([]);
  });

  it('genuinely un-polled user with no fresh signal anywhere IS starved', async () => {
    h.supabase = makeSupabase({});
    expect(await getStarvedIngestionUserIds(['ghost'], 40)).toEqual(['ghost']);
  });

  it('mixed set: only the un-polled/no-content user is reported starved', async () => {
    h.supabase = makeSupabase({
      platform_connections: ['polled'],
      user_platform_data: ['hasContent'],
    });
    expect(await getStarvedIngestionUserIds(['polled', 'hasContent', 'starved'], 40)).toEqual(['starved']);
  });

  it('fails closed (all eligible starved) only when EVERY freshness lookup errors', async () => {
    h.supabase = makeSupabase({}, new Set(['platform_connections', 'nango_connection_mappings', 'user_platform_data']));
    expect(await getStarvedIngestionUserIds(['u1', 'u2'], 40)).toEqual(['u1', 'u2']);
  });

  it('a partial error still yields freshness from the surviving lookups', async () => {
    h.supabase = makeSupabase({ user_platform_data: ['u1'] }, new Set(['platform_connections']));
    expect(await getStarvedIngestionUserIds(['u1', 'u2'], 40)).toEqual(['u2']);
  });

  it('no supabase -> every eligible user treated as starved', async () => {
    h.supabase = null;
    expect(await getStarvedIngestionUserIds(['u1', 'u2'], 40)).toEqual(['u1', 'u2']);
  });

  it('empty eligible list -> empty (no query)', async () => {
    expect(await getStarvedIngestionUserIds([], 40)).toEqual([]);
  });
});
