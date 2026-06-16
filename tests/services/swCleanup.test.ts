import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanupLegacyServiceWorker } from '@/services/swCleanup';

/**
 * The cleanup runs against browser globals (navigator.serviceWorker, caches,
 * window). We stub them so the contract is pinned: evict /service-worker.js,
 * delete the soul-signature cache, reload exactly once, and NEVER touch the
 * push worker (/sw.js).
 */
function setup({ regs = [] as string[], cacheKeys = [] as string[], cleaned = false }) {
  const unregistered: string[] = [];
  const deleted: string[] = [];
  let reloaded = 0;
  const store: Record<string, string> = cleaned ? { 'sw-legacy-cleaned': '1' } : {};

  const sessionStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
  };
  const caches = {
    keys: async () => cacheKeys,
    delete: async (k: string) => { deleted.push(k); return true; },
  };

  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistrations: async () =>
        regs.map((url) => ({
          active: { scriptURL: url },
          unregister: async () => { unregistered.push(url); return true; },
        })),
    },
  });
  vi.stubGlobal('window', { caches, location: { reload: () => { reloaded += 1; } }, sessionStorage });
  vi.stubGlobal('caches', caches);
  vi.stubGlobal('sessionStorage', sessionStorage);

  return { unregistered, deleted, reloaded: () => reloaded };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cleanupLegacyServiceWorker', () => {
  it('evicts the legacy SW + cache and reloads once', async () => {
    const m = setup({ regs: ['https://app/service-worker.js'], cacheKeys: ['soul-signature-v1', 'other'] });
    await cleanupLegacyServiceWorker();
    expect(m.unregistered).toEqual(['https://app/service-worker.js']);
    expect(m.deleted).toContain('soul-signature-v1');
    expect(m.deleted).not.toContain('other');
    expect(m.reloaded()).toBe(1);
  });

  it('never unregisters the push worker (/sw.js)', async () => {
    const m = setup({ regs: ['https://app/sw.js'], cacheKeys: [] });
    await cleanupLegacyServiceWorker();
    expect(m.unregistered).toEqual([]);
    expect(m.reloaded()).toBe(0); // nothing to clean -> no reload
  });

  it('is a no-op (no reload) for a clean browser', async () => {
    const m = setup({ regs: [], cacheKeys: [] });
    await cleanupLegacyServiceWorker();
    expect(m.reloaded()).toBe(0);
  });

  it('does not reload again once the guard is set', async () => {
    const m = setup({ regs: ['https://app/service-worker.js'], cacheKeys: ['soul-signature-v1'], cleaned: true });
    await cleanupLegacyServiceWorker();
    expect(m.unregistered).toContain('https://app/service-worker.js'); // still cleans
    expect(m.reloaded()).toBe(0); // but does not reload-loop
  });
});
