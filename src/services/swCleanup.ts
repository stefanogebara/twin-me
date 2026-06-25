/**
 * Kill the legacy cache-first service worker that served stale app shells.
 *
 * An old `public/service-worker.js` (cache 'soul-signature-v1') used a
 * cache-first fetch strategy + clients.claim(), so it kept serving the old
 * index.html — and its old hashed JS — to returning users indefinitely. It is
 * registered nowhere now, but lingers + controls in browsers that visited an
 * older build. The push worker (`/sw.js`) registers without skipWaiting, so it
 * can't take over while the legacy one is still active.
 *
 * On load we unregister any `/service-worker.js` registration, delete the
 * legacy cache, and reload ONCE so the page comes back from the network on the
 * current build. New users (no legacy SW/cache) are a no-op. The push worker
 * (`/sw.js`) is left untouched. Best-effort — never blocks startup.
 */
const RELOAD_GUARD = 'sw-legacy-cleaned';

export async function cleanupLegacyServiceWorker(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let killed = false;

    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
      if (url.includes('/service-worker.js')) {
        await reg.unregister();
        killed = true;
      }
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) {
        if (k === 'soul-signature-v1' || k.startsWith('soul-signature')) {
          await caches.delete(k);
          killed = true;
        }
      }
    }

    // Reload once so the now-uncontrolled page fetches the current build. The
    // sessionStorage guard prevents a reload loop if anything re-registers.
    if (killed && typeof window !== 'undefined' && !sessionStorage.getItem(RELOAD_GUARD)) {
      sessionStorage.setItem(RELOAD_GUARD, '1');
      window.location.reload();
    }
  } catch {
    // Best-effort — a cache-cleanup failure must never break app startup.
  }
}
