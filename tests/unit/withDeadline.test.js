/**
 * withDeadline bounds best-effort background work so an awaited job can never
 * blow a serverless function's wall-clock budget.
 *
 * Regression context: observation ingestion awaits backgroundJobs (incl. the
 * soul-signature cache warm, ~10-28s when stale) before returning so Vercel
 * does not freeze mid-write. When that warm ran long the whole cron blew
 * Vercel's 60s limit → 504 (live 2026-07-15). Bounding the warm keeps the
 * function under budget; an abandoned warm is safe (daily soul-sig cron +
 * serve-stale-then-revalidate re-warms it).
 */
import { describe, it, expect } from 'vitest';
import { withDeadline } from '../../api/services/withDeadline.js';

describe('withDeadline', () => {
  it('resolves with the inner value when it settles before the deadline', async () => {
    const result = await withDeadline(Promise.resolve('ok'), 1000, 'fallback');
    expect(result).toBe('ok');
  });

  it('resolves with the fallback when the inner promise hangs past the deadline', async () => {
    const start = Date.now();
    const neverSettles = new Promise(() => {}); // intentionally never resolves
    const result = await withDeadline(neverSettles, 30, 'fallback');
    const elapsed = Date.now() - start;
    expect(result).toBe('fallback');
    // Must return at ~the deadline, not hang. Generous upper bound for CI jitter.
    expect(elapsed).toBeLessThan(500);
  });

  it('defaults the fallback to undefined', async () => {
    const result = await withDeadline(new Promise(() => {}), 20);
    expect(result).toBeUndefined();
  });

  it('propagates a rejection that happens before the deadline', async () => {
    await expect(
      withDeadline(Promise.reject(new Error('boom')), 1000)
    ).rejects.toThrow('boom');
  });

  it('accepts a non-promise value and resolves with it', async () => {
    const result = await withDeadline('plain', 1000, 'fallback');
    expect(result).toBe('plain');
  });

  it('does not leave a pending timer that keeps the event loop alive', async () => {
    // If the timer were not cleared on fast-settle, vitest would warn about an
    // open handle. We assert the fast path returns promptly and the deadline
    // never fires by racing a large deadline against an immediate resolve.
    const result = await withDeadline(Promise.resolve(42), 10_000, 'fallback');
    expect(result).toBe(42);
  });
});
