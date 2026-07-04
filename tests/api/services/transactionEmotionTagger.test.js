/**
 * Characterization tests for getEffectiveEventTime — the pure event-time
 * resolver at the heart of the transaction/biometric correlation window.
 *
 * The rest of transactionEmotionTagger is DB-bound (Supabase fetches) and is
 * intentionally not covered here. getEffectiveEventTime is pure and load-
 * bearing: picking the wrong timestamp mis-correlates a purchase with HRV or
 * music, so its candidate-priority order and fallbacks are pinned precisely.
 *
 * database.js is imported transitively; the CI Supabase env stubs let the
 * module graph load without a live connection (no DB call is made here).
 */
import { describe, it, expect } from 'vitest';
import { getEffectiveEventTime } from '../../../api/services/transactions/transactionEmotionTagger.js';

describe('getEffectiveEventTime — candidate priority', () => {
  it('prefers Spotify played_at over the row extracted_at', () => {
    const row = {
      raw_data: { played_at: '2026-04-03T18:00:00Z' },
      extracted_at: '2026-04-04T09:00:00Z',
    };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T18:00:00.000Z');
  });

  it('uses Whoop created_at when played_at is absent', () => {
    const row = {
      raw_data: { created_at: '2026-04-03T06:30:00Z' },
      extracted_at: '2026-04-05T00:00:00Z',
    };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T06:30:00.000Z');
  });

  it('reads a Google Calendar nested start.dateTime shape', () => {
    const row = {
      raw_data: { start: { dateTime: '2026-04-03T14:00:00Z' } },
      extracted_at: '2026-04-03T20:00:00Z',
    };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T14:00:00.000Z');
  });

  it('reads a Calendar all-day start.date shape', () => {
    const row = { raw_data: { start: { date: '2026-04-03' } }, extracted_at: '2026-04-04T00:00:00Z' };
    // 'YYYY-MM-DD' parsed as UTC midnight by the Date constructor.
    expect(getEffectiveEventTime(row).toISOString().slice(0, 10)).toBe('2026-04-03');
  });

  it('honors the candidate ORDER: played_at wins over a later start field', () => {
    // played_at is first in the candidate list, so it beats start even though
    // both are present.
    const row = {
      raw_data: { played_at: '2026-04-03T10:00:00Z', start: '2026-04-03T23:00:00Z' },
      extracted_at: '2026-04-04T00:00:00Z',
    };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T10:00:00.000Z');
  });

  it('falls back to extracted_at when no payload timestamp is present', () => {
    const row = { raw_data: { some: 'unrelated field' }, extracted_at: '2026-04-03T12:00:00Z' };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T12:00:00.000Z');
  });

  it('skips an unparseable payload timestamp and uses the next valid candidate', () => {
    const row = {
      raw_data: { played_at: 'not-a-date', created_at: '2026-04-03T08:00:00Z' },
      extracted_at: '2026-04-05T00:00:00Z',
    };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T08:00:00.000Z');
  });

  it('returns null when neither payload nor extracted_at is valid', () => {
    expect(getEffectiveEventTime({ raw_data: {}, extracted_at: 'garbage' })).toBeNull();
    expect(getEffectiveEventTime({ raw_data: {} })).toBeNull();
  });

  it('handles a missing raw_data object (defensive default)', () => {
    const row = { extracted_at: '2026-04-03T12:00:00Z' };
    expect(getEffectiveEventTime(row).toISOString()).toBe('2026-04-03T12:00:00.000Z');
    expect(getEffectiveEventTime(null)).toBeNull();
    expect(getEffectiveEventTime(undefined)).toBeNull();
  });

  it('supports alternate naming: start_time / startTime / dateTime / timestamp', () => {
    expect(getEffectiveEventTime({ raw_data: { start_time: '2026-04-03T01:00:00Z' } }).toISOString())
      .toBe('2026-04-03T01:00:00.000Z');
    expect(getEffectiveEventTime({ raw_data: { startTime: '2026-04-03T02:00:00Z' } }).toISOString())
      .toBe('2026-04-03T02:00:00.000Z');
    expect(getEffectiveEventTime({ raw_data: { dateTime: '2026-04-03T03:00:00Z' } }).toISOString())
      .toBe('2026-04-03T03:00:00.000Z');
    expect(getEffectiveEventTime({ raw_data: { timestamp: '2026-04-03T04:00:00Z' } }).toISOString())
      .toBe('2026-04-03T04:00:00.000Z');
  });
});
