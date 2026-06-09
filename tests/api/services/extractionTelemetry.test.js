/**
 * Tests for api/services/extractionTelemetry.js
 * Pure builder + frozen enum — no DB, no LLM.
 */
import { describe, it, expect } from 'vitest';
import {
  INGESTION_SOURCE,
  EXTRACTION_RUN_EVENT,
  buildExtractionRunEvent,
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

describe('logExtractionRun', () => {
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
