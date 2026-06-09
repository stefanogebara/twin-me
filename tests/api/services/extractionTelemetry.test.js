/**
 * Tests for api/services/extractionTelemetry.js
 * Pure builder + frozen enum, plus durable-persistence wiring (DB mocked).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the DB client so persistence is verified without touching a real database.
const { insertMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return { insertMock, fromMock };
});
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: fromMock },
}));

import {
  INGESTION_SOURCE,
  EXTRACTION_RUN_EVENT,
  PERSISTED_SOURCES,
  buildExtractionRunEvent,
  shouldPersist,
  persistExtractionRun,
  logExtractionRun,
} from '../../../api/services/extractionTelemetry.js';

describe('INGESTION_SOURCE', () => {
  it('exposes the four canonical path identifiers', () => {
    expect(INGESTION_SOURCE).toEqual({
      BACKGROUND: 'background',
      POST_ONBOARDING: 'post_onboarding',
      ON_DEMAND: 'on_demand',
      OAUTH_CALLBACK: 'oauth_callback',
    });
  });

  it('is frozen (immutable enum)', () => {
    expect(Object.isFrozen(INGESTION_SOURCE)).toBe(true);
  });
});

describe('EXTRACTION_RUN_EVENT', () => {
  it('is the stable greppable event name', () => {
    expect(EXTRACTION_RUN_EVENT).toBe('extraction_run');
  });
});

describe('buildExtractionRunEvent', () => {
  it('maps source -> ingestion_source and includes platform', () => {
    expect(
      buildExtractionRunEvent({ source: 'background', platform: 'spotify' }),
    ).toEqual({ ingestion_source: 'background', platform: 'spotify' });
  });

  it('includes userId only when provided', () => {
    expect(
      buildExtractionRunEvent({ source: 'on_demand', platform: 'discord', userId: 'u1' }),
    ).toEqual({ ingestion_source: 'on_demand', platform: 'discord', userId: 'u1' });

    expect(
      buildExtractionRunEvent({ source: 'on_demand', platform: 'discord' }),
    ).not.toHaveProperty('userId');
  });

  it('falls back to "unknown" for missing fields', () => {
    expect(buildExtractionRunEvent({})).toEqual({
      ingestion_source: 'unknown',
      platform: 'unknown',
    });
    expect(buildExtractionRunEvent()).toEqual({
      ingestion_source: 'unknown',
      platform: 'unknown',
    });
  });
});

describe('shouldPersist / PERSISTED_SOURCES', () => {
  it('persists the three user-triggered sources', () => {
    expect(shouldPersist(INGESTION_SOURCE.ON_DEMAND)).toBe(true);
    expect(shouldPersist(INGESTION_SOURCE.OAUTH_CALLBACK)).toBe(true);
    expect(shouldPersist(INGESTION_SOURCE.POST_ONBOARDING)).toBe(true);
  });

  it('does NOT persist background (it lives in cron_executions)', () => {
    expect(shouldPersist(INGESTION_SOURCE.BACKGROUND)).toBe(false);
  });

  it('does NOT persist unknown/invalid sources', () => {
    expect(shouldPersist('unknown')).toBe(false);
    expect(shouldPersist(undefined)).toBe(false);
    expect(shouldPersist('')).toBe(false);
  });

  it('PERSISTED_SOURCES is exactly the three non-background sources', () => {
    expect(PERSISTED_SOURCES).toEqual(['on_demand', 'oauth_callback', 'post_onboarding']);
    expect(PERSISTED_SOURCES).not.toContain('background');
  });
});

describe('logExtractionRun (logging)', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockClear();
  });

  it('does not throw for valid input', () => {
    expect(() =>
      logExtractionRun({ source: INGESTION_SOURCE.BACKGROUND, platform: 'spotify', userId: 'u1' }),
    ).not.toThrow();
  });

  it('does not throw for empty/undefined input', () => {
    expect(() => logExtractionRun()).not.toThrow();
    expect(() => logExtractionRun({})).not.toThrow();
  });
});

describe('persistExtractionRun (DB write, awaited & deterministic)', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockClear();
  });

  it('inserts into extraction_events with mapped columns', async () => {
    await persistExtractionRun({ ingestion_source: 'on_demand', platform: 'spotify', userId: 'u1' });
    expect(fromMock).toHaveBeenCalledWith('extraction_events');
    expect(insertMock).toHaveBeenCalledWith({
      ingestion_source: 'on_demand',
      platform: 'spotify',
      user_id: 'u1',
    });
  });

  it('maps a missing userId to null', async () => {
    await persistExtractionRun({ ingestion_source: 'post_onboarding', platform: 'reddit' });
    expect(insertMock).toHaveBeenCalledWith({
      ingestion_source: 'post_onboarding',
      platform: 'reddit',
      user_id: null,
    });
  });

  it('never throws even if the insert rejects', async () => {
    insertMock.mockRejectedValueOnce(new Error('db down'));
    await expect(
      persistExtractionRun({ ingestion_source: 'on_demand', platform: 'spotify' }),
    ).resolves.toBeUndefined();
  });
});

describe('logExtractionRun (persistence gating)', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockClear();
  });

  it('persists a user-triggered source (fire-and-forget)', async () => {
    logExtractionRun({ source: INGESTION_SOURCE.ON_DEMAND, platform: 'spotify', userId: 'u1' });
    await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith({
      ingestion_source: 'on_demand',
      platform: 'spotify',
      user_id: 'u1',
    });
  });

  it('does NOT persist background events (already in cron_executions)', async () => {
    logExtractionRun({ source: INGESTION_SOURCE.BACKGROUND, platform: 'spotify', userId: 'u1' });
    await new Promise((r) => setTimeout(r, 25));
    expect(insertMock).not.toHaveBeenCalled();
  });
});
