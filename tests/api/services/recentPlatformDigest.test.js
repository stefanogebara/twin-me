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

/**
 * `eventIso` is when it HAPPENED (metadata.timestamp); `iso` is when we
 * ingested it (created_at). They differ by up to ~17 days on batch-ingested
 * platforms, which is why the digest dates by the former.
 */
const row = (platform, content, iso, eventIso = iso) => ({
  content,
  created_at: iso,
  metadata: { platform, timestamp: eventIso },
});

/** ISO string for N days before now — keeps fixtures inside the window. */
const daysAgo = (n, hour = 12) => {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('renderRecentPlatformDigest', () => {
  it('groups by platform with exact counts, caps items, busiest first', async () => {
    // 4 spotify rows, 2 github rows; spotify cap forced to 2 for the test.
    const rows = [
      row('spotify', 'Played A', daysAgo(1)),
      row('spotify', 'Played B', daysAgo(2)),
      row('github', 'Opened PR', daysAgo(3)),
      row('spotify', 'Played C', daysAgo(4)),
      row('github', 'Pushed commits', daysAgo(5)),
      row('spotify', 'Played D', daysAgo(6)),
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
    expect(digest.text).toContain('=== MY LAST TWO WEEKS');
  });

  it('does not render an activity-spread line (measured: no fidelity gain)', async () => {
    // A v2 attempt printed per-platform spread ("33 events on 8 of the last
    // 15 days") to answer packed-vs-bursts. It did not move the score, so it
    // stays out of the prompt — pinned so it cannot drift back in unmeasured.
    const rows = [
      row('google_calendar', 'Standup', daysAgo(2, 9)),
      row('google_calendar', 'Review', daysAgo(2, 11)),
    ];
    const digest = await renderRecentPlatformDigest('u', { supabase: supabaseWith(rows).client });

    expect(digest.text).toContain('GOOGLE CALENDAR (2 events)');
    expect(digest.text).not.toMatch(/of the last \d+ days/);
    expect(digest.text).not.toContain('/active day');
  });

  it('dates lines by when the event happened, not when it was ingested', async () => {
    // Gmail/GitHub/YouTube ingest in batches lagging reality by up to ~17
    // days (measured), so created_at mislabels the day.
    const happened = daysAgo(9);
    const ingested = daysAgo(1);
    const { client } = supabaseWith([row('google_gmail', 'Inbox summary', ingested, happened)]);

    const digest = await renderRecentPlatformDigest('u', { supabase: client });

    const expected = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(happened));
    expect(digest.text).toContain(`[${expected}]`);
  });

  it('drops events that happened before the window even if ingested inside it', async () => {
    const { client } = supabaseWith([
      row('github', 'Ancient push', daysAgo(1), daysAgo(30)), // happened long ago
      row('github', 'Fresh push', daysAgo(1), daysAgo(1)),
    ]);

    const digest = await renderRecentPlatformDigest('u', { supabase: client });

    expect(digest.text).toContain('Fresh push');
    expect(digest.text).not.toContain('Ancient push');
    expect(digest.events).toBe(1);
  });

  it('ignores a future event time rather than narrating it as done', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const ingested = daysAgo(1);
    const { client } = supabaseWith([row('google_calendar', 'Scheduled meeting', ingested, future)]);

    const digest = await renderRecentPlatformDigest('u', { supabase: client });

    const ingestedLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(ingested));
    expect(digest.text).toContain(`[${ingestedLabel}]`); // fell back to created_at
    expect(digest.events).toBe(1);
  });

  it('trims whole sections to stay inside its own char budget', async () => {
    // Many platforms, long content — the block must not rely on the prompt
    // builder's clamp, which would chop a line mid-sentence.
    const rows = [];
    for (const p of ['spotify', 'github', 'google_gmail', 'whoop', 'youtube', 'web', 'google_calendar', 'outlook']) {
      for (let i = 0; i < 6; i++) {
        rows.push(row(p, `${p} event ${i} `.padEnd(140, 'x'), daysAgo((i % 10) + 1)));
      }
    }
    const digest = await renderRecentPlatformDigest('u', { supabase: supabaseWith(rows).client });

    expect(digest.text.length).toBeLessThanOrEqual(3000);
    // Trimmed from the tail, so the busiest platform survives intact and the
    // block still ends on a complete line.
    expect(digest.text).toContain('=== MY LAST TWO WEEKS');
    expect(digest.text.endsWith('x')).toBe(true);
  });

  it('never reports the row cap as the true event count', async () => {
    // 2 rows returned, but 3200 match the window — the digest must not
    // present the capped subset as an exact total (CodeRabbit, PR #250).
    const rows = [
      row('spotify', 'Played A', daysAgo(0, 10)),
      row('spotify', 'Played B', daysAgo(0, 9)),
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
    const rows = [row('github', 'Opened PR', daysAgo(0, 10))];
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
