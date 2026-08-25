/**
 * Restore a working localStorage/sessionStorage under jsdom.
 *
 * Node 26 ships a NATIVE `localStorage` global that is `undefined` unless the
 * process is started with --localstorage-file. In Vitest's jsdom environment
 * `window === globalThis`, so that native getter occupies the same slot jsdom
 * would populate — and Vitest's global population does not overwrite it. The
 * result: `localStorage` and `window.localStorage` both read as `undefined`
 * inside a jsdom test, which surfaces as "Cannot read properties of undefined
 * (reading 'clear')" rather than anything that names the real cause.
 *
 * The descriptor is configurable, so we replace it with a spec-shaped
 * in-memory Storage. Node-environment tests are left untouched.
 */
class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }
  clear(): void {
    this.#map.clear();
  }
  getItem(key: string): string | null {
    return this.#map.has(String(key)) ? this.#map.get(String(key))! : null;
  }
  key(index: number): string | null {
    return Array.from(this.#map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.#map.delete(String(key));
  }
  setItem(key: string, value: string): void {
    this.#map.set(String(key), String(value));
  }
  [name: string]: any;
}

function install(name: 'localStorage' | 'sessionStorage') {
  const g = globalThis as any;
  let usable = false;
  try {
    usable = !!g[name] && typeof g[name].getItem === 'function';
  } catch {
    // jsdom throws SecurityError for opaque origins — also "not usable".
    usable = false;
  }
  if (usable) return;
  Object.defineProperty(g, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// Only meaningful in a DOM environment; node-env suites keep their globals.
if (typeof window !== 'undefined') {
  install('localStorage');
  install('sessionStorage');
}
