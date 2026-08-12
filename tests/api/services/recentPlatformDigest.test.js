/**
 * Recent Platform Digest — candidate temporal-grounding block (Phase 3).
 * Pins the contract the fidelity eval's 'digest' arm depends on: one
 * platform_data query over the window, per-platform grouping with exact
 * counts but capped items, busiest-platform-first ordering, and an empty
 * result ('' text) rather than a throw when there is no recent data.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { renderRecentPlatformDigest } = await import(
  '../../../api/services/recentPlatformDigest.js'
);

/**
 * Chainable supabase stub. `count` mirrors PostgREST's exact-count header —
 * the total matching rows BEFORE the limit, which is how the digest knows it
 * was capped.
 */
function supabaseWith(rows, error = null, count = undefined) {
  const calls = { filters: [], selectOpts: [] };
  const builder = {
    select: vi.fn((_cols, opts) => { calls.selectOpts.push(opts); return builder; }),
    eq: vi.fn((col, val) => { calls.filters.push([col, val]); return builder; }),
    gte: vi.fn((col, val) => { calls.filters.push([col, val]); return builder; }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({
      data: rows,
      error,
      count: count ?? (rows ? rows.length : 0),
    })),
  };
  return { client: { from: vi.fn(() => builder) }, calls };
}

const row = (platform, content, iso) => ({
  content,
  created_at: iso,
  metadata: { platform },
});

describe('renderRecentPlatformDigest', () => {
  it('groups by platform with exact counts, caps items, busiest first', async () => {
    // 4 spotify rows, 2 github rows; spotify cap forced to 2 for the test.
    const rows = [
      row('spotify', 'Played A', '2026-08-11T10:00:00Z'),
      row('spotify', 'Played B', '2026-08-10T10:00:00Z'),
      row('github', 'Opened PR', '2026-08-09T10:00:00Z'),
      row('spotify', 'Played C', '2026-08-08T10:00:00Z'),
      row('github', 'Pushed commits', '2026-08-07T10:00:00Z'),
      row('spotify', 'Played D', '2026-08-06T10:00:00Z'),
    ];
    const { client } = supabaseWith(rows);

    const digest = await renderRecentPlatformDigest('user-1', {
      supabase: client,
      perPlatform: { spotify: 2, github: 5 },
    });

    expect(digest.events).toBe(6);
    expect(digest.platforms).toBe(2);
    // Exact count survives the item cap
    expect(digest.text).toContain('SPOTIFY (4 events)');
    expect(digest.text).toContain('GITHUB (2 events)');
    // Cap: only the 2 newest spotify items rendered
    expect(digest.text).toContain('Played A');
    expect(digest.text).toContain('Played B');
    expect(digest.text).not.toContain('Played C');
    // Busiest platform first
    expect(digest.text.indexOf('SPOTIFY')).toBeLessThan(digest.text.indexOf('GITHUB'));
    // Header carries the window
    expect(digest.text).toContain('=== MY LAST TWO WEEKS');
    expect(digest.text).toContain('[Aug 11]');
  });

  it('never reports the row cap as the true event count', async () => {
    // 2 rows returned, but 3200 match the window — the digest must not
    // present the capped subset as an exact total (CodeRabbit, PR #250).
    const rows = [
      row('spotify', 'Played A', '2026-08-12T10:00:00Z'),
      row('spotify', 'Played B', '2026-08-12T09:00:00Z'),
    ];
    const { client } = supabaseWith(rows, null, 3200);

    const digest = await renderRecentPlatformDigest('user-1', { supabase: client, days: 14 });

    expect(digest.capped).toBe(true);
    expect(digest.totalEvents).toBe(3200);
    expect(digest.events).toBe(2); // what was actually rendered
    // The header must disclose the sampling AND stop claiming a full window,
    // since newest-first capping means the range really is shorter.
    expect(digest.text).toContain('newest 2 of 3200 events');
    expect(digest.text).not.toContain('MY LAST TWO WEEKS');
  });

  it('reports an uncapped window as an exact, unqualified count', async () => {
    const rows = [row('github', 'Opened PR', '2026-08-12T10:00:00Z')];
    const { client, calls } = supabaseWith(rows, null, 1);

    const digest = await renderRecentPlatformDigest('user-1', { supabase: client });

    expect(digest.capped).toBe(false);
    expect(digest.totalEvents).toBe(1);
    expect(digest.text).toContain('MY LAST TWO WEEKS');
    expect(digest.text).not.toContain('newest');
    // The exact count rides on the same query — no second round trip.
    expect(calls.selectOpts).toContainEqual({ count: 'exact' });
  });

  it('returns empty text (not a throw) when no platform_data in window', async () => {
    const { client } = supabaseWith([]);
    const digest = await renderRecentPlatformDigest('user-1', { supabase: client });
    expect(digest).toEqual({ text: '', events: 0, totalEvents: 0, capped: false, platforms: 0 });
  });

  it('degrades to empty on query error instead of throwing', async () => {
    const { client } = supabaseWith(null, { message: 'boom' });
    const digest = await renderRecentPlatformDigest('user-1', { supabase: client });
    expect(digest.text).toBe('');
  });

  it('queries platform_data only, scoped to the user and window', async () => {
    const { client, calls } = supabaseWith([]);
    await renderRecentPlatformDigest('user-1', { supabase: client, days: 14 });
    expect(calls.filters).toContainEqual(['user_id', 'user-1']);
    expect(calls.filters).toContainEqual(['memory_type', 'platform_data']);
    const gte = calls.filters.find(([col]) => col === 'created_at');
    expect(gte).toBeTruthy();
    const windowMs = Date.now() - new Date(gte[1]).getTime();
    expect(windowMs).toBeGreaterThan(13.9 * 24 * 3600 * 1000);
    expect(windowMs).toBeLessThan(14.1 * 24 * 3600 * 1000);
  });

  it('requires an injected supabase client', async () => {
    await expect(renderRecentPlatformDigest('user-1', {})).rejects.toThrow(/supabase/);
  });
});
