/**
 * Characterization tests for raceContextFanout — the graceful-degradation core
 * of fetchTwinContext (twinContextBuilder.js).
 *
 * This logic is the twin-chat hot path's resilience layer. TWO production 500s
 * traced back to earlier versions of it:
 *   - a cold-start Whoop eval where the platformData leg timed out and re-threw
 *     instead of degrading, and
 *   - a Nango token-refresh leg blowing its per-leg budget.
 *
 * These tests pin the contract that keeps a slow/failing context leg from
 * taking down the whole chat request:
 *   1. all legs resolve            -> full results, breaker not tripped
 *   2. one leg times out           -> ONLY that leg defaults, siblings survive
 *   3. global breaker fires        -> resolved legs kept, pending legs defaulted
 *   4. mixed resolved + hung       -> partial context, breaker tripped
 *   5. non-timeout rejection       -> propagates (not silently swallowed)
 *
 * Fake timers make the timeout paths deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { raceContextFanout } from '../../../api/services/contextFanout.js';

const never = () => new Promise(() => {}); // a leg that never settles
const legTimeout = (label) => Promise.reject(new Error(`${label}_leg_timeout`));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('raceContextFanout', () => {
  describe('happy path', () => {
    it('returns all resolved values in order, breaker not tripped', async () => {
      const p = raceContextFanout(
        [Promise.resolve('a'), Promise.resolve('b'), Promise.resolve('c')],
        ['da', 'db', 'dc'],
        10000,
      );
      await vi.advanceTimersByTimeAsync(0); // flush microtasks; Promise.all wins
      const r = await p;
      expect(r.contextResults).toEqual(['a', 'b', 'c']);
      expect(r.circuitBreakerTripped).toBe(false);
      expect(r.degradationReason).toBeNull();
    });

    it('handles empty fan-out', async () => {
      const p = raceContextFanout([], [], 10000);
      await vi.advanceTimersByTimeAsync(0);
      const r = await p;
      expect(r.contextResults).toEqual([]);
      expect(r.circuitBreakerTripped).toBe(false);
    });

    it('does not call onDegrade when nothing degrades', async () => {
      const onDegrade = vi.fn();
      const p = raceContextFanout([Promise.resolve(1)], [0], 10000, { onDegrade });
      await vi.advanceTimersByTimeAsync(0);
      await p;
      expect(onDegrade).not.toHaveBeenCalled();
    });
  });

  describe('per-leg timeout degrades ONLY that leg (the core regression guard)', () => {
    it('a single _leg_timeout falls back to its default; siblings still resolve', async () => {
      const p = raceContextFanout(
        [Promise.resolve('soul'), legTimeout('platformData'), Promise.resolve('writing')],
        ['dSoul', 'dPlatform', 'dWriting'],
        10000,
      );
      await vi.advanceTimersByTimeAsync(0);
      const r = await p;
      // The failing leg gets its default; the others are NOT discarded.
      expect(r.contextResults).toEqual(['soul', 'dPlatform', 'writing']);
      // A guarded leg timeout resolves Promise.all, so the GLOBAL breaker never trips.
      expect(r.circuitBreakerTripped).toBe(false);
    });

    it('multiple leg timeouts each independently default without aborting the fan-out', async () => {
      const p = raceContextFanout(
        [legTimeout('a'), Promise.resolve('B'), legTimeout('c')],
        ['dA', 'dB', 'dC'],
        10000,
      );
      await vi.advanceTimersByTimeAsync(0);
      const r = await p;
      expect(r.contextResults).toEqual(['dA', 'B', 'dC']);
      expect(r.circuitBreakerTripped).toBe(false);
    });
  });

  describe('global breaker', () => {
    it('trips after timeoutMs when a leg hangs, returning defaults for pending legs', async () => {
      const onDegrade = vi.fn();
      const p = raceContextFanout(
        [Promise.resolve('fast'), never()],
        ['dFast', 'dSlow'],
        10000,
        { onDegrade },
      );
      // Let the resolved leg record into resolvedValues before the timer fires.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10000);
      const r = await p;
      expect(r.contextResults).toEqual(['fast', 'dSlow']); // resolved kept, hung defaulted
      expect(r.circuitBreakerTripped).toBe(true);
      expect(r.degradationReason).toBe('fetchTwinContext timeout');
      expect(onDegrade).toHaveBeenCalledWith('fetchTwinContext timeout');
    });

    it('returns all defaults when every leg hangs past the budget', async () => {
      const p = raceContextFanout([never(), never()], ['d0', 'd1'], 5000);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5000);
      const r = await p;
      expect(r.contextResults).toEqual(['d0', 'd1']);
      expect(r.circuitBreakerTripped).toBe(true);
    });

    it('does not trip before the budget elapses', async () => {
      let resolveSlow;
      const slow = new Promise((res) => { resolveSlow = res; });
      const p = raceContextFanout([Promise.resolve('x'), slow], ['dx', 'dy'], 10000);
      await vi.advanceTimersByTimeAsync(9000); // still within budget
      resolveSlow('y'); // slow leg lands just in time
      await vi.advanceTimersByTimeAsync(0);
      const r = await p;
      expect(r.contextResults).toEqual(['x', 'y']);
      expect(r.circuitBreakerTripped).toBe(false);
    });
  });

  describe('genuine (non-timeout) errors are not swallowed', () => {
    it('propagates a leg rejection that is not a _leg_timeout', async () => {
      const onDegrade = vi.fn();
      const p = raceContextFanout(
        [Promise.resolve('ok'), Promise.reject(new Error('boom'))],
        ['dOk', 'dBad'],
        10000,
        { onDegrade },
      );
      await expect(p).rejects.toThrow('boom');
      expect(onDegrade).not.toHaveBeenCalled();
    });
  });
});
