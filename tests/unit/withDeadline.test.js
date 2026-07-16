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
import { withDeadline, computeBoundedBudget } from '../../api/services/withDeadline.js';

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

describe('computeBoundedBudget', () => {
  const HARD_STOP = 55_000;
  const MIN = 1_000;

  it('returns the full remaining budget when there is plenty of time', () => {
    expect(computeBoundedBudget(10_000, HARD_STOP, MIN)).toEqual({ skip: false, budgetMs: 45_000 });
  });

  it('still runs at exactly the minimum budget boundary', () => {
    // remaining === minBudget (1000) is NOT < min, so it runs with a 1s budget.
    expect(computeBoundedBudget(54_000, HARD_STOP, MIN)).toEqual({ skip: false, budgetMs: 1_000 });
  });

  it('skips when less than the minimum budget remains', () => {
    expect(computeBoundedBudget(54_500, HARD_STOP, MIN)).toEqual({ skip: true, budgetMs: 0 });
  });

  it('skips (never forces a positive budget) once elapsed is PAST the hard stop', () => {
    // The CodeRabbit case: at elapsed=58s the old Math.max(2000, -3000) floor
    // returned 2000ms and pushed runtime to 60s → 504. Now it must skip.
    expect(computeBoundedBudget(58_000, HARD_STOP, MIN)).toEqual({ skip: true, budgetMs: 0 });
  });
});
