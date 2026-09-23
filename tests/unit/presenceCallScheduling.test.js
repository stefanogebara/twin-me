/**
 * Who is due for a call. Pure: the cron passes the presences, the calls placed
 * today, and the moment; this decides in the presence's own timezone.
 */
import { describe, expect, it } from 'vitest';
import { localClock, isDue } from '../../api/_app/services/presenceCallScheduling.js';

const SP = 'America/Sao_Paulo';
// 2026-09-15 is a Tuesday. 13:00Z is 10:00 in São Paulo (UTC-3).
const tuesday10 = new Date('2026-09-15T13:00:00Z');
const tuesday11 = new Date('2026-09-15T14:00:00Z');
const tuesday12 = new Date('2026-09-15T15:00:00Z');

const presence = { id: 'p-1', call_hour: 10, call_days: [0, 1, 2, 3, 4, 5, 6], call_timezone: SP };

describe('localClock', () => {
  it('reads the hour, weekday and day key in the timezone', () => {
    expect(localClock(tuesday10, SP)).toEqual({ hour: 10, weekday: 2, dayKey: '2026-09-15' });
  });

  it('crosses the date line correctly: 01:00Z on the 16th is still the 15th in São Paulo', () => {
    expect(localClock(new Date('2026-09-16T01:00:00Z'), SP)).toEqual({ hour: 22, weekday: 2, dayKey: '2026-09-15' });
  });
});

describe('isDue', () => {
  it('is due at her hour on one of her days with no call today', () => {
    expect(isDue(presence, [], tuesday10)).toEqual({ due: true, attempt: 1 });
  });

  it('is not due at another hour', () => {
    expect(isDue(presence, [], tuesday11).due).toBe(false);
  });

  it('is not due on a day that is not hers', () => {
    expect(isDue({ ...presence, call_days: [1, 3, 5] }, [], tuesday10).due).toBe(false);
  });

  it('is not due when today already has a completed call', () => {
    expect(isDue(presence, [{ status: 'completed', attempt: 1, scheduled_for: '2026-09-15T13:00:00Z' }], tuesday10).due).toBe(false);
  });

  it('tries a second time the next hour after a no-answer', () => {
    expect(isDue(presence, [{ status: 'no_answer', attempt: 1, scheduled_for: '2026-09-15T13:00:00Z' }], tuesday11))
      .toEqual({ due: true, attempt: 2 });
  });

  it('tries a second time after busy too, but not after failed', () => {
    expect(isDue(presence, [{ status: 'busy', attempt: 1, scheduled_for: '2026-09-15T13:00:00Z' }], tuesday11).due).toBe(true);
    expect(isDue(presence, [{ status: 'failed', attempt: 1, scheduled_for: '2026-09-15T13:00:00Z' }], tuesday11).due).toBe(false);
  });

  it('gives up after two attempts in a day', () => {
    const calls = [
      { status: 'no_answer', attempt: 1, scheduled_for: '2026-09-15T13:00:00Z' },
      { status: 'no_answer', attempt: 2, scheduled_for: '2026-09-15T14:00:00Z' },
    ];
    expect(isDue(presence, calls, tuesday12).due).toBe(false);
  });

  it('does not dial while a call from this hour is still dialing', () => {
    expect(isDue(presence, [{ status: 'dialing', attempt: 1, scheduled_for: '2026-09-15T13:00:00Z' }], tuesday10).due).toBe(false);
  });

  it('counts yesterday\'s calls as another day', () => {
    expect(isDue(presence, [{ status: 'completed', attempt: 1, scheduled_for: '2026-09-14T13:00:00Z' }], tuesday10).due).toBe(true);
  });

  it('does not count an inbound call she made as the day\'s call', () => {
    expect(isDue(presence, [{ status: 'completed', attempt: 1, direction: 'inbound', scheduled_for: '2026-09-15T11:00:00Z' }], tuesday10).due).toBe(true);
  });
});
