/**
 * Tests for the Gmail unread delta/weekly decision helpers.
 *
 * Replan 2026-06-10 (Track B): the Gmail fetcher emitted the LIFETIME unread
 * total as a fresh daily observation — the "40k unread" stat appeared 6+
 * times in 3 days across 4 surfaces because every day produced a "new" total
 * that defeated lexical dedup. These tests pin the replacement contract:
 * daily observations are DELTAS vs the stored snapshot; lifetime totals are
 * mentioned at most weekly.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldMentionLifetimeTotal,
  buildUnreadDeltaObservation,
  nextGmailCounters,
} from '../../../../api/services/observationFetchers/gmailUnreadDelta.js';

const NOW = new Date('2026-06-10T12:00:00Z');
const YESTERDAY = '2026-06-09T12:00:00Z';

describe('shouldMentionLifetimeTotal', () => {
  it('mentions when there is no previous state (first run)', () => {
    expect(shouldMentionLifetimeTotal(null, NOW)).toBe(true);
    expect(shouldMentionLifetimeTotal({}, NOW)).toBe(true);
  });

  it('does NOT mention when last mention was within 7 days', () => {
    expect(shouldMentionLifetimeTotal({ total_last_mentioned_at: YESTERDAY }, NOW)).toBe(false);
    expect(shouldMentionLifetimeTotal({ total_last_mentioned_at: '2026-06-03T13:00:00Z' }, NOW)).toBe(false);
  });

  it('mentions again once the last mention is older than 7 days', () => {
    expect(shouldMentionLifetimeTotal({ total_last_mentioned_at: '2026-06-02T12:00:00Z' }, NOW)).toBe(true);
  });

  it('treats an unparseable timestamp as never-mentioned', () => {
    expect(shouldMentionLifetimeTotal({ total_last_mentioned_at: 'not-a-date' }, NOW)).toBe(true);
  });
});

describe('buildUnreadDeltaObservation', () => {
  const prev = { inbox_unread: 40443, snapshot_at: YESTERDAY };

  it('returns null for a missing/invalid reading', () => {
    expect(buildUnreadDeltaObservation(null, prev, NOW)).toBeNull();
    expect(buildUnreadDeltaObservation(NaN, prev, NOW)).toBeNull();
    expect(buildUnreadDeltaObservation(undefined, prev, NOW)).toBeNull();
  });

  it('celebrates inbox zero regardless of history', () => {
    const result = buildUnreadDeltaObservation(0, prev, NOW);
    expect(result.kind).toBe('zero');
    expect(result.observation.content).toBe('Practices inbox zero — 0 unread emails in inbox');
    expect(result.observation.contentType).toBe('daily_summary');
  });

  it('first run (no previous snapshot) emits the absolute count once as a baseline', () => {
    const result = buildUnreadDeltaObservation(40490, null, NOW);
    expect(result.kind).toBe('baseline');
    expect(result.observation.content).toBe('Has a backlog of 40490 unread emails in inbox');
  });

  it('the echo-chamber regression: with a previous snapshot the lifetime total NEVER appears — only the delta', () => {
    // June 9 snapshot 40443 -> June 10 reading 40490. The old code said
    // "Has a backlog of 40490 unread emails" every single day.
    const result = buildUnreadDeltaObservation(40490, prev, NOW);
    expect(result.kind).toBe('delta');
    expect(result.observation.content).toBe('Inbox grew by 47 unread emails since yesterday');
    expect(result.observation.content).not.toContain('40490');
  });

  it('shrinking inbox is phrased as progress', () => {
    const result = buildUnreadDeltaObservation(40400, prev, NOW);
    expect(result.kind).toBe('delta');
    expect(result.observation.content).toBe('Cleared 43 unread emails from the inbox since yesterday');
  });

  it('singular grammar for a delta of 1', () => {
    const result = buildUnreadDeltaObservation(40444, prev, NOW);
    expect(result.observation.content).toBe('Inbox grew by 1 unread email since yesterday');
  });

  it('unchanged count emits nothing (fails the so-what bar)', () => {
    expect(buildUnreadDeltaObservation(40443, prev, NOW)).toBeNull();
  });

  it('stale snapshot phrases the window honestly instead of "since yesterday"', () => {
    const stale = { inbox_unread: 40000, snapshot_at: '2026-06-05T12:00:00Z' };
    const result = buildUnreadDeltaObservation(40490, stale, NOW);
    expect(result.observation.content).toBe('Inbox grew by 490 unread emails over the past 5 days');
  });

  it('previous row without a usable snapshot_at falls back to baseline', () => {
    const result = buildUnreadDeltaObservation(30, { inbox_unread: 25 }, NOW);
    expect(result.kind).toBe('baseline');
    expect(result.observation.content).toBe('Has a moderate pile of 30 unread emails in inbox');
  });
});

describe('nextGmailCounters', () => {
  const prev = {
    inbox_unread: 40443,
    total_messages: 52000,
    snapshot_at: YESTERDAY,
    total_last_mentioned_at: '2026-06-04T12:00:00Z',
  };

  it('records the new reading and snapshot time', () => {
    const next = nextGmailCounters({ inboxUnread: 40490, totalMessages: 52010, previous: prev, mentionedTotal: false, now: NOW });
    expect(next).toEqual({
      inbox_unread: 40490,
      total_messages: 52010,
      snapshot_at: NOW.toISOString(),
      total_last_mentioned_at: '2026-06-04T12:00:00Z',
    });
  });

  it('stamps total_last_mentioned_at only when the lifetime total was actually mentioned', () => {
    const next = nextGmailCounters({ inboxUnread: 40490, totalMessages: 52010, previous: prev, mentionedTotal: true, now: NOW });
    expect(next.total_last_mentioned_at).toBe(NOW.toISOString());
  });

  it('a failed reading preserves the previous snapshot (no delta-timing corruption)', () => {
    const next = nextGmailCounters({ inboxUnread: null, totalMessages: null, previous: prev, mentionedTotal: false, now: NOW });
    expect(next.inbox_unread).toBe(40443);
    expect(next.total_messages).toBe(52000);
    expect(next.snapshot_at).toBe(YESTERDAY);
  });

  it('first run with no previous state yields nulls for missing fields', () => {
    const next = nextGmailCounters({ inboxUnread: 12, totalMessages: null, previous: null, mentionedTotal: false, now: NOW });
    expect(next).toEqual({
      inbox_unread: 12,
      total_messages: null,
      snapshot_at: NOW.toISOString(),
      total_last_mentioned_at: null,
    });
  });
});
