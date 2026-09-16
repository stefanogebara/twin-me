/**
 * A page whose code was replaced under it loads itself again, once.
 *
 * Every page here is a separate file fetched on demand, named by a hash of its contents. A
 * deploy writes new files and removes the old ones, so a browser holding yesterday's index
 * asks for a file that is no longer there, the import rejects, and the person gets the error
 * screen. Reloading fixes it, which is why it looked like "an error every time I open it,
 * and then it works" (Stefano, 2026-09-16, on his phone).
 *
 * So: when a page's code cannot be fetched, reload the page once. The fresh index names the
 * files that do exist and the person sees the page, not an apology. The once is the point:
 * the flag lives in sessionStorage, so a genuinely broken build shows the error screen on the
 * second try instead of reloading for ever. A success clears the flag, so the next deploy is
 * allowed its own single reload.
 */
import { lazy, type ComponentType } from 'react';

const FLAG = 'twinme:reloaded-for-chunk';

/* Private browsing and a few locked-down browsers throw on sessionStorage itself. A missing
   store means no reload happens, which is the safe way to be wrong. */
function flagRead(): boolean {
  try { return sessionStorage.getItem(FLAG) === '1'; } catch { return true; }
}
function flagWrite(on: boolean): void {
  try { if (on) sessionStorage.setItem(FLAG, '1'); else sessionStorage.removeItem(FLAG); } catch { /* nothing to remember with */ }
}

/** The loader itself, so the rule can be tested without rendering anything. */
export function withChunkReload<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const mod = await load();
      flagWrite(false);
      return mod;
    } catch (error) {
      if (flagRead()) throw error;
      flagWrite(true);
      window.location.reload();
      /* The reload is on its way; never resolve, so React shows the fallback until it lands
         rather than flashing the error screen on the way out. */
      return new Promise<T>(() => undefined);
    }
  };
}

/** `lazy`, with one reload when the page's code is missing. */
export function lazyWithRetry<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>) {
  return lazy(withChunkReload(load));
}
