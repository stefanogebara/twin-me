/**
 * Tests for singleFlight() — the in-flight de-duplication helper that fixes
 * Bug C1 (magic-link signin landing on /auth?error=session_expired).
 *
 * Root cause was React 18 StrictMode firing two concurrent /auth/refresh
 * calls. The server rotates the refresh-token on each call, so call #2 saw
 * the already-rotated RT and 401'd. singleFlight() collapses concurrent
 * callers into a single in-flight promise so the rotated RT is consumed
 * exactly once.
 *
 * These tests prove the dedup contract in isolation. AuthContext wires
 * singleFlight() around refreshAccessTokenImpl — see src/contexts/AuthContext.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { singleFlight } from '../../src/utils/singleFlight';

// Helper: a controllable async fn whose resolution timing we can drive.
function makeDeferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('collapses concurrent callers into a single underlying invocation', async () => {
    const deferred = makeDeferred<boolean>();
    const fn = vi.fn(() => deferred.promise);
    const wrapped = singleFlight(fn);

    // Fire 5 concurrent callers — simulates StrictMode double-effect plus
    // any other component that hits refreshAccessToken while one is in flight.
    const p1 = wrapped();
    const p2 = wrapped();
    const p3 = wrapped();
    const p4 = wrapped();
    const p5 = wrapped();

    expect(fn).toHaveBeenCalledTimes(1);

    // All callers must receive the SAME promise reference — they're awaiting
    // the same in-flight call.
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    expect(p3).toBe(p4);
    expect(p4).toBe(p5);

    deferred.resolve(true);
    const results = await Promise.all([p1, p2, p3, p4, p5]);
    expect(results).toEqual([true, true, true, true, true]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight slot on success so the NEXT call starts fresh', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      return callCount;
    });
    const wrapped = singleFlight(fn);

    const r1 = await wrapped();
    expect(r1).toBe(1);
    expect(wrapped.isInFlight()).toBe(false);

    const r2 = await wrapped();
    expect(r2).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight slot on rejection so retries are possible', async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error('boom');
      return 'ok';
    });
    const wrapped = singleFlight(fn);

    await expect(wrapped()).rejects.toThrow('boom');
    expect(wrapped.isInFlight()).toBe(false);

    // Retry must invoke fn again — the rejected promise must not stay cached.
    const r = await wrapped();
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects all concurrent callers with the same error when fn throws', async () => {
    const deferred = makeDeferred<never>();
    const fn = vi.fn(() => deferred.promise);
    const wrapped = singleFlight(fn);

    const p1 = wrapped().catch((e) => e);
    const p2 = wrapped().catch((e) => e);

    expect(fn).toHaveBeenCalledTimes(1);
    const err = new Error('network down');
    deferred.reject(err);

    const [e1, e2] = await Promise.all([p1, p2]);
    expect(e1).toBe(err);
    expect(e2).toBe(err);
  });

  // The actual Bug C1 scenario: simulates the server-side refresh-token
  // rotation. If two parallel calls hit the server, the second one gets a 401
  // because it sees the rotated RT. With singleFlight, only one call reaches
  // the server.
  it('Bug C1 scenario: prevents the rotated-RT race in /auth/refresh', async () => {
    // Simulate server-side rotation: first call returns ok=true, second
    // (if it reached the server) would return ok=false.
    let serverCalls = 0;
    const fakeRefresh = vi.fn(async (): Promise<boolean> => {
      serverCalls++;
      // First call succeeds. Any concurrent second call against the SAME
      // (rotated) RT would 401 — but singleFlight should prevent it.
      await new Promise((r) => setTimeout(r, 10));
      return serverCalls === 1;
    });
    const wrapped = singleFlight(fakeRefresh);

    // StrictMode double-effect: two parallel calls from AuthContext.initAuth().
    const [a, b] = await Promise.all([wrapped(), wrapped()]);

    // Both callers must see success, and the server is hit exactly once.
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(serverCalls).toBe(1);
    expect(fakeRefresh).toHaveBeenCalledTimes(1);
  });

  it('reset() clears in-flight state (test-only escape hatch)', async () => {
    const deferred = makeDeferred<number>();
    const fn = vi.fn(() => deferred.promise);
    const wrapped = singleFlight(fn);

    void wrapped();
    expect(wrapped.isInFlight()).toBe(true);
    wrapped.reset();
    expect(wrapped.isInFlight()).toBe(false);
  });
});
