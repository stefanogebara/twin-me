import { describe, it, expect } from 'vitest';
import {
  classifyConnection,
  classifyNangoConnection,
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
