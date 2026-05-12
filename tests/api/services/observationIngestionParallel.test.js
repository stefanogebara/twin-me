/**
 * Tests for H9 — parallel platform fetch pattern in observationIngestion.js
 *
 * The real ingestion loop is too deeply wired (18 fetchers, reflection engine,
 * goal tracking, twin summary, wiki compilation, etc) to unit-test as a whole.
 * Instead, this test isolates the invariant that matters: with N platforms in
 * parallel and a per-platform timeout of 15s, a single hanging platform must
 * NOT prevent the others from completing — the run wall-time must be bounded
 * by the slowest *successful* platform plus the timeout for the slow one.
 *
 * This mirrors the Promise.allSettled + Promise.race pattern in the real code.
 */
import { describe, it, expect } from 'vitest';

const PER_PLATFORM_TIMEOUT_MS = 15_000;

/**
 * Mirrors the per-platform race in observationIngestion.js so the test
 * exercises the exact same pattern (Promise.race against a setTimeout-reject
 * inside a Promise.allSettled outer wrapper).
 */
async function fetchWithTimeout(platform, fetcher, timeoutMs = PER_PLATFORM_TIMEOUT_MS) {
  const start = Date.now();
  try {
    const obs = await Promise.race([
      fetcher(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${platform} fetch timeout (${timeoutMs / 1000}s)`)), timeoutMs),
      ),
    ]);
    return { platform, status: 'ok', ms: Date.now() - start, count: (obs || []).length };
  } catch (err) {
    const ms = Date.now() - start;
    return {
      platform,
      status: ms >= timeoutMs ? 'timeout' : 'error',
      ms,
      error: err.message,
    };
  }
}

function fakeFetcher(delayMs, payload = ['obs']) {
  return () => new Promise((resolve) => setTimeout(() => resolve(payload), delayMs));
}

function hangingFetcher() {
  // Never resolves — simulates a platform that has wedged. The 15s timeout
  // must terminate it before it eats the user's wall-clock budget.
  return () => new Promise(() => {});
}

describe('H9 parallel platform fetch with per-platform timeout', () => {
  it('Promise.allSettled completes within budget when one platform hangs', async () => {
    // Use a shorter timeout for the test so it runs fast, but the same shape
    // as production (one slow platform + several fast ones).
    const TEST_TIMEOUT_MS = 500;
    const platforms = [
      { name: 'spotify', fetcher: fakeFetcher(50) },
      { name: 'github', fetcher: fakeFetcher(80) },
      { name: 'whoop', fetcher: fakeFetcher(100) },
      { name: 'gmail', fetcher: hangingFetcher() }, // wedged
      { name: 'youtube', fetcher: fakeFetcher(60) },
    ];

    const start = Date.now();
    const settled = await Promise.allSettled(
      platforms.map((p) => fetchWithTimeout(p.name, p.fetcher, TEST_TIMEOUT_MS)),
    );
    const wallTime = Date.now() - start;

    // Wall time must be bounded by the slow-platform timeout, not the sum.
    // Sequential fetches would sum to ~290ms + hang forever. Parallel with
    // 500ms timeout must complete in ~500ms (the hung fetcher) + small slack.
    expect(wallTime).toBeLessThan(TEST_TIMEOUT_MS + 200);

    // All 5 entries are fulfilled (allSettled never rejects).
    expect(settled).toHaveLength(5);
    for (const s of settled) {
      expect(s.status).toBe('fulfilled');
    }

    // The 4 fast platforms succeed, gmail times out.
    const byName = Object.fromEntries(settled.map((s) => [s.value.platform, s.value]));
    expect(byName.spotify.status).toBe('ok');
    expect(byName.github.status).toBe('ok');
    expect(byName.whoop.status).toBe('ok');
    expect(byName.youtube.status).toBe('ok');
    expect(byName.gmail.status).toBe('timeout');
    expect(byName.gmail.error).toMatch(/timeout/i);
  });

  it('one fast platform per-call returns within its own latency, not the slowest', async () => {
    const TEST_TIMEOUT_MS = 500;
    const platforms = [
      { name: 'spotify', fetcher: fakeFetcher(50) },
      { name: 'gmail', fetcher: hangingFetcher() },
    ];

    const settled = await Promise.allSettled(
      platforms.map((p) => fetchWithTimeout(p.name, p.fetcher, TEST_TIMEOUT_MS)),
    );

    const byName = Object.fromEntries(settled.map((s) => [s.value.platform, s.value]));
    // spotify's ms should be ~50ms, well under the timeout, proving it wasn't
    // blocked by gmail hanging.
    expect(byName.spotify.ms).toBeLessThan(200);
    expect(byName.gmail.ms).toBeGreaterThanOrEqual(TEST_TIMEOUT_MS);
  });

  it('errors thrown by fetchers are isolated — they do not reject the outer allSettled', async () => {
    const TEST_TIMEOUT_MS = 500;
    const platforms = [
      { name: 'spotify', fetcher: fakeFetcher(30) },
      { name: 'github', fetcher: () => Promise.reject(new Error('GitHub 503')) },
      { name: 'whoop', fetcher: fakeFetcher(40) },
    ];

    const settled = await Promise.allSettled(
      platforms.map((p) => fetchWithTimeout(p.name, p.fetcher, TEST_TIMEOUT_MS)),
    );

    for (const s of settled) {
      // Inner fetchWithTimeout catches the rejection so outer allSettled sees
      // every entry as fulfilled — this is the property H9 relies on.
      expect(s.status).toBe('fulfilled');
    }
    const byName = Object.fromEntries(settled.map((s) => [s.value.platform, s.value]));
    expect(byName.spotify.status).toBe('ok');
    expect(byName.whoop.status).toBe('ok');
    expect(byName.github.status).toBe('error');
    expect(byName.github.error).toMatch(/GitHub 503/);
  });
});
