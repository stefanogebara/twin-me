// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import LedgerOrb from '../../src/components/LedgerOrb';

vi.mock('../../src/lib/i18n', () => ({ useT: () => (s: string) => s }));
vi.mock('../../src/lib/orb/engine.js', () => ({ MODE_DRAWS: { test: vi.fn() }, resolvePreset: () => ({ mode: 'test', speed: 1, opts: {} }) }));
vi.mock('../../src/lib/orb/ink', () => ({ groundOf: () => null }));
const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { act(() => root?.unmount()); host.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('stops a mounted orb when reduced motion is enabled and resumes only when allowed', () => {
  const listeners = new Set<() => void>();
  const media = { matches: false, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const request = vi.fn(() => 1); const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  root = createRoot(host);
  act(() => root.render(<LedgerOrb />));
  expect(request).toHaveBeenCalledTimes(1);
  act(() => { media.matches = true; listeners.forEach(fn => fn()); });
  expect(cancel).toHaveBeenCalledWith(1);
  expect(request).toHaveBeenCalledTimes(1);
  act(() => { media.matches = false; listeners.forEach(fn => fn()); });
  expect(request).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  expect(listeners.size).toBe(0);
});
