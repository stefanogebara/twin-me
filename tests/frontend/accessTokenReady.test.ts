/** The token's arrival as a promise (M2-A, 2026-09-22): now, later, never, or not in time. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessTokenReady, clearAccessToken, markNoSession, setAccessToken } from '../../src/services/api/apiBase';

describe('accessTokenReady', () => {
  beforeEach(() => { vi.useFakeTimers(); clearAccessToken(); });
  afterEach(() => { vi.useRealTimers(); clearAccessToken(); });

  it('answers at once when a token exists', async () => {
    setAccessToken('t1');
    await expect(accessTokenReady()).resolves.toBe('t1');
  });
  it('answers when the token arrives', async () => {
    const waiting = accessTokenReady();
    setAccessToken('t2');
    await expect(waiting).resolves.toBe('t2');
  });
  it('answers null once this load knows there is no session, and keeps answering null until a token arrives', async () => {
    const waiting = accessTokenReady();
    markNoSession();
    await expect(waiting).resolves.toBe(null);
    await expect(accessTokenReady()).resolves.toBe(null);
    setAccessToken('t3');
    await expect(accessTokenReady()).resolves.toBe('t3');
  });
  it('gives up after the timeout', async () => {
    const waiting = accessTokenReady(500);
    vi.advanceTimersByTime(500);
    await expect(waiting).resolves.toBe(null);
  });
});
