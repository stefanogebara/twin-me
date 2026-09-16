// @vitest-environment jsdom
/**
 * A page whose file is gone after a deploy reloads once, and only once.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { withChunkReload } from '../../src/lib/lazyWithRetry';

const FLAG = 'twinme:reloaded-for-chunk';
const gone = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));

describe('withChunkReload', () => {
  let reloads = 0;
  beforeEach(() => {
    reloads = 0;
    sessionStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: () => { reloads += 1; } } });
  });

  it('passes the page through when its file is there, and forgets any earlier reload', async () => {
    sessionStorage.setItem(FLAG, '1');
    await expect(withChunkReload(async () => 'the page')()).resolves.toBe('the page');
    expect(reloads).toBe(0);
    expect(sessionStorage.getItem(FLAG)).toBeNull();
  });

  it('reloads once when the file is missing, and does not resolve before the reload lands', async () => {
    let settled = false;
    void withChunkReload(gone)().then(() => { settled = true; }, () => { settled = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(reloads).toBe(1);
    expect(sessionStorage.getItem(FLAG)).toBe('1');
    expect(settled).toBe(false);
  });

  it('shows the error the second time, so a broken build is not an endless reload', async () => {
    sessionStorage.setItem(FLAG, '1');
    await expect(withChunkReload(gone)()).rejects.toThrow('Failed to fetch');
    expect(reloads).toBe(0);
  });
});
