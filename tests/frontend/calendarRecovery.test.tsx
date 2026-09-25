// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const calendar = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/api/moneyAPI', async original => ({
  ...await original<Record<string, unknown>>(),
  moneyAPI: { calendar, questions: async () => null, patterns: async () => [] },
}));
import { useYouReads } from '../../src/pages/money/useMoneyAccount';
let latest: ReturnType<typeof useYouReads>;
function Probe() { latest = useYouReads('you', null); return null; }
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if(root) await act(async () => root.unmount()); vi.clearAllMocks(); });

it('retains the last calendar on a failed retry and clears recovery state after success', async () => {
  const snapshot = { connected: true, google: true, events_seen: 3 };
  calendar.mockResolvedValue(snapshot);
  root = createRoot(host); await act(async () => root.render(<Probe />));
  calendar.mockRejectedValue(Object.assign(new Error('Read failed'), { needsReconnect: true }));
  await act(async () => latest.loadCalendar());
  expect(latest.calendar).toBe(snapshot);
  expect(latest.calendarFailed).toBe(true);
  expect(latest.calendarNeedsReconnect).toBe(true);
  calendar.mockResolvedValue(snapshot);
  await act(async () => latest.loadCalendar());
  expect(latest.calendarFailed).toBe(false);
  expect(latest.calendarNeedsReconnect).toBe(false);
  expect(latest.calendarLoading).toBe(false);
});

it('does not claim a transient first-read error is a disconnected calendar', async () => {
  calendar.mockRejectedValue(new Error('Temporary read failure'));
  root = createRoot(host); await act(async () => root.render(<Probe />));
  expect(latest.calendar).toBeNull();
  expect(latest.calendarFailed).toBe(true);
  expect(latest.calendarNeedsReconnect).toBe(false);
});
