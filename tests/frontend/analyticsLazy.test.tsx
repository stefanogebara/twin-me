// @vitest-environment jsdom
/**
 * posthog-js leaves the entry chunk (M3-2): it is fetched once the browser is idle, and every
 * event asked for before it arrives is delivered afterwards, in order.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const ph = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn(), startSessionRecording: vi.fn() }));
vi.mock('posthog-js', () => ({ default: ph }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'U', email: 'u@x' } }) }));
vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key_for_test');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback = (cb) => { cb(); return 1; };

it('queues events until the client arrives on idle, then delivers them in order', async () => {
  const { initPostHog, AnalyticsProvider, useAnalytics, postHogQueued } = await import('../../src/contexts/AnalyticsContext');
  let track: ReturnType<typeof useAnalytics> | null = null;
  const Probe = () => { track = useAnalytics(); return null; };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<AnalyticsProvider><Probe /></AnalyticsProvider>); });
  track!.trackEvent('first', { n: 1 });
  track!.trackFunnel('second');
  expect(ph.capture).not.toHaveBeenCalled();
  expect(postHogQueued()).toBe(3); // identify, then the two events
  await initPostHog();
  expect(ph.init).toHaveBeenCalledOnce();
  expect(ph.identify).toHaveBeenCalledWith('U', expect.objectContaining({ email: 'u@x' }));
  expect(ph.capture.mock.calls.map((c) => c[0])).toEqual(['first', 'second']);
  expect(postHogQueued()).toBe(0);
  track!.trackEvent('third');
  expect(ph.capture).toHaveBeenLastCalledWith('third', {});
  await act(async () => root.unmount());
});
