import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  shouldSyncTimezone,
  getLastSyncedTimezone,
  markTimezoneSynced,
} from '../../src/utils/timezoneSync';

// audit-2026-07-03 route-sweep: AuthContext fired an unconditional
// PATCH /api/account/timezone on EVERY hard page load (1 write/load/user —
// the same per-load-write class as the $375 Vercel incident). The decision
// "should we send the detected timezone at all?" is extracted into the pure
// shouldSyncTimezone() so it can be pinned here.
describe('shouldSyncTimezone', () => {
  it('skips when the detected zone matches the stored profile timezone', () => {
    expect(shouldSyncTimezone('Europe/London', 'Europe/London', null)).toBe(false);
  });

  it('skips when the detected zone matches the last value this device sent', () => {
    // Steady state: profile timezone unknown (verify response does not carry
    // it today), but we already delivered this exact value from this browser.
    expect(shouldSyncTimezone('Europe/London', undefined, 'Europe/London')).toBe(false);
  });

  it('syncs when the detected zone differs from both stored and last-sent', () => {
    // The legitimate "user actually changed timezone" update must still fire.
    expect(shouldSyncTimezone('America/Sao_Paulo', 'Europe/London', 'Europe/London')).toBe(true);
  });

  it('syncs once when nothing is stored and nothing was ever sent', () => {
    expect(shouldSyncTimezone('Europe/London', undefined, null)).toBe(true);
    expect(shouldSyncTimezone('Europe/London', null, undefined)).toBe(true);
  });

  it('syncs when last-sent exists but differs (travel / OS tz change)', () => {
    expect(shouldSyncTimezone('Asia/Tokyo', undefined, 'Europe/London')).toBe(true);
  });

  it('skips when last-sent matches even if the stored value differs', () => {
    // Another device may have legitimately set a different zone more recently.
    // This device already delivered its value; re-asserting on every load
    // would ping-pong writes between devices.
    expect(shouldSyncTimezone('Europe/London', 'America/New_York', 'Europe/London')).toBe(false);
  });

  it('never syncs without a usable detected zone', () => {
    expect(shouldSyncTimezone(null, undefined, null)).toBe(false);
    expect(shouldSyncTimezone(undefined, undefined, null)).toBe(false);
    expect(shouldSyncTimezone('', undefined, null)).toBe(false);
    expect(shouldSyncTimezone('   ', undefined, null)).toBe(false);
  });
});

describe('last-synced timezone cache (localStorage)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the last synced value for the same user', () => {
    markTimezoneSynced('user-1', 'Europe/London');
    expect(getLastSyncedTimezone('user-1')).toBe('Europe/London');
  });

  it('does not leak another user\'s cache (shared browser, account switch)', () => {
    // Without the user scoping, user B would inherit user A's "already sent"
    // marker and never get their timezone synced at all.
    markTimezoneSynced('user-1', 'Europe/London');
    expect(getLastSyncedTimezone('user-2')).toBe(null);
  });

  it('returns null when nothing was ever marked', () => {
    expect(getLastSyncedTimezone('user-1')).toBe(null);
  });

  it('returns null for a missing userId and ignores marks without one', () => {
    markTimezoneSynced(undefined, 'Europe/London');
    expect(getLastSyncedTimezone(undefined)).toBe(null);
    expect(getLastSyncedTimezone('user-1')).toBe(null);
  });

  it('treats corrupt storage content as absent', () => {
    store['twinme_tz_last_synced_v1'] = '{not json';
    expect(getLastSyncedTimezone('user-1')).toBe(null);
  });

  it('is a no-op (not a crash) when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(() => markTimezoneSynced('user-1', 'Europe/London')).not.toThrow();
    expect(getLastSyncedTimezone('user-1')).toBe(null);
  });
});
