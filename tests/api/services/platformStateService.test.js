import { describe, it, expect } from 'vitest';
import {
  classifyConnection,
  classifyNangoConnection,
  buildMirrorEntries,
  summarizeBreakdown,
  RETIRED_PLATFORMS,
  STALE_DAYS,
} from '../../../api/services/platformStateService.js';

const NOW = Date.parse('2026-06-10T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

describe('classifyConnection', () => {
  it('classifies a healthy recently-synced connection as active', () => {
    const row = {
      status: 'active',
      last_sync_status: 'success',
      last_sync_at: daysAgo(1),
      connected_at: daysAgo(30),
    };
    expect(classifyConnection(row, NOW)).toBe('active');
  });

  it.each(['expired', 'token_expired', 'needs_reauth', 'requires_reauth', 'auth_failed'])(
    "classifies status='%s' as expired",
    (status) => {
      const row = { status, last_sync_status: 'success', last_sync_at: daysAgo(1) };
      expect(classifyConnection(row, NOW)).toBe('expired');
    }
  );

  it.each(['requires_reauth', 'auth_failed', 'encryption_key_mismatch'])(
    "classifies last_sync_status='%s' as expired",
    (lastSyncStatus) => {
      const row = { status: 'active', last_sync_status: lastSyncStatus, last_sync_at: daysAgo(1) };
      expect(classifyConnection(row, NOW)).toBe('expired');
    }
  );

  it("classifies status='error' + last_sync_status='auth_error' as expired", () => {
    const row = { status: 'error', last_sync_status: 'auth_error', last_sync_at: daysAgo(1) };
    expect(classifyConnection(row, NOW)).toBe('expired');
  });

  it('classifies no sync in more than STALE_DAYS as stale', () => {
    const row = {
      status: 'active',
      last_sync_status: 'success',
      last_sync_at: daysAgo(STALE_DAYS + 1),
    };
    expect(classifyConnection(row, NOW)).toBe('stale');
  });

  it.each(['partial', 'error'])("classifies last_sync_status='%s' as stale", (lastSyncStatus) => {
    const row = { status: 'active', last_sync_status: lastSyncStatus, last_sync_at: daysAgo(1) };
    expect(classifyConnection(row, NOW)).toBe('stale');
  });

  it('does NOT classify routine token_expires_at lapse alone as expired', () => {
    // audit-2026-06-10: access tokens lapse hourly by design and are
    // auto-refreshed on next use — that is not a reconnect signal.
    const row = {
      status: 'active',
      last_sync_status: 'success',
      last_sync_at: daysAgo(1),
      token_expires_at: new Date(NOW - 60 * 60 * 1000).toISOString(),
    };
    expect(classifyConnection(row, NOW)).toBe('active');
  });

  it('treats a connection with no last_sync_at as active (never synced, not stale)', () => {
    const row = { status: 'active', last_sync_status: null, last_sync_at: null };
    expect(classifyConnection(row, NOW)).toBe('active');
  });
});

describe('classifyNangoConnection', () => {
  it('classifies a recently-synced mapping as active', () => {
    expect(classifyNangoConnection({ last_synced_at: daysAgo(1) }, NOW)).toBe('active');
  });

  it('classifies no sync in more than STALE_DAYS as stale', () => {
    expect(classifyNangoConnection({ last_synced_at: daysAgo(STALE_DAYS + 1) }, NOW)).toBe('stale');
  });

  it('classifies a never-synced mapping as active', () => {
    expect(classifyNangoConnection({ last_synced_at: null }, NOW)).toBe('active');
  });
});

describe('buildMirrorEntries', () => {
  // replan-2026-06-10 Track C: extension + desktop mirrors are synthesized
  // breakdown entries — present and 'active' when recent data exists, absent
  // otherwise. They must never contribute to expired/stale alarms.

  it('returns no entries when neither mirror has recent data', () => {
    expect(buildMirrorEntries({})).toEqual([]);
    expect(buildMirrorEntries()).toEqual([]);
  });

  it('returns an active web entry with freshness and 7d yield when the extension has recent data', () => {
    const entries = buildMirrorEntries({
      webLastSeenAt: daysAgo(0.004), // ~6 minutes ago
      webObservations7d: 251,
    });
    expect(entries).toEqual([
      {
        platform: 'web',
        state: 'active',
        connectedAt: null,
        lastSyncAt: daysAgo(0.004),
        source: 'mirror',
        observations7d: 251,
      },
    ]);
  });

  it('returns an active desktop entry when desktop-tagged memories are recent', () => {
    const entries = buildMirrorEntries({ desktopLastSeenAt: daysAgo(2) });
    expect(entries).toEqual([
      {
        platform: 'desktop',
        state: 'active',
        connectedAt: null,
        lastSyncAt: daysAgo(2),
        source: 'mirror',
      },
    ]);
  });

  it('returns both mirrors, web first, when both are fresh', () => {
    const entries = buildMirrorEntries({
      webLastSeenAt: daysAgo(1),
      webObservations7d: 10,
      desktopLastSeenAt: daysAgo(1),
    });
    expect(entries.map((e) => e.platform)).toEqual(['web', 'desktop']);
  });

  it("never emits a state other than 'active' (mirrors cannot raise expired/stale alarms)", () => {
    const entries = buildMirrorEntries({
      webLastSeenAt: daysAgo(13),
      desktopLastSeenAt: daysAgo(13),
    });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.state).toBe('active');
    }
  });
});

describe('summarizeBreakdown', () => {
  // replan-2026-06-10 Track C: retired platforms stay in the breakdown (so
  // Settings can show their "No longer supported" row) but must NOT count
  // toward total/active/expired/stale — otherwise a pre-cut reddit/linkedin
  // connection inflates the connections header and the Soul Score.

  it('counts live platforms by state', () => {
    expect(
      summarizeBreakdown([
        { platform: 'spotify', state: 'active' },
        { platform: 'whoop', state: 'expired' },
        { platform: 'github', state: 'stale' },
        { platform: 'web', state: 'active' },
      ])
    ).toEqual({ total: 4, active: 2, expired: 1, stale: 0 + 1 });
  });

  it('excludes retired platforms from every count but they remain in the breakdown', () => {
    const breakdown = [
      { platform: 'spotify', state: 'active' },
      { platform: 'github', state: 'active' },
      { platform: 'reddit', state: 'active', retired: true },
      { platform: 'linkedin', state: 'expired', retired: true },
    ];
    expect(summarizeBreakdown(breakdown)).toEqual({
      total: 2,
      active: 2,
      expired: 0,
      stale: 0,
    });
    // The breakdown array itself is untouched — Settings still sees the retired rows.
    expect(breakdown).toHaveLength(4);
  });

  it('handles empty / missing input', () => {
    expect(summarizeBreakdown([])).toEqual({ total: 0, active: 0, expired: 0, stale: 0 });
    expect(summarizeBreakdown()).toEqual({ total: 0, active: 0, expired: 0, stale: 0 });
  });
});

describe('RETIRED_PLATFORMS', () => {
  it('contains the Track C cut list and not the keepers', () => {
    for (const p of ['reddit', 'linkedin', 'twitch', 'strava', 'google_drive']) {
      expect(RETIRED_PLATFORMS.has(p), p).toBe(true);
    }
    for (const p of ['spotify', 'github', 'whoop', 'google_gmail', 'google_calendar', 'youtube', 'discord', 'outlook', 'web', 'desktop']) {
      expect(RETIRED_PLATFORMS.has(p), p).toBe(false);
    }
  });
});
