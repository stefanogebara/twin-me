/**
 * Tests for api/services/extractionDispatch.js
 *
 * The dispatch table is where Phase 3's regression risk lives: a dropped
 * platform, a wrong store-as alias, or a mis-wired feature extractor. These
 * assertions pin the table 1:1 against the behavior of the prior switch.
 */
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_EXTRACTION,
  getDescriptor,
  normalizeRawExtractorResult,
} from '../../../api/services/extractionDispatch.js';

// The exact platform set the old switch handled.
const OBSERVATION_WITH_FEATURE = [
  'discord', 'github', 'youtube', 'gmail', 'linkedin',
  'whoop', 'oura', 'twitch', 'reddit', 'strava',
];
const OBSERVATION_NO_FEATURE = [
  'google_calendar', 'outlook', 'garmin', 'fitbit', 'slack',
  'google_drive', 'apple_music',
];
const RAW_EXTRACTORS = ['notion', 'pinterest', 'soundcloud', 'steam'];

describe('PLATFORM_EXTRACTION table', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(PLATFORM_EXTRACTION)).toBe(true);
  });

  it('covers every platform the old switch handled (incl. google_gmail alias)', () => {
    const expected = [
      'spotify',
      ...OBSERVATION_WITH_FEATURE,
      ...OBSERVATION_NO_FEATURE,
      ...RAW_EXTRACTORS,
      'google_gmail',
    ].sort();
    expect(Object.keys(PLATFORM_EXTRACTION).sort()).toEqual(expected);
  });

  it('marks spotify as the special kind', () => {
    expect(PLATFORM_EXTRACTION.spotify).toEqual({ kind: 'spotify' });
  });

  it('every observation platform has a module + fetch fn', () => {
    for (const p of [...OBSERVATION_WITH_FEATURE, ...OBSERVATION_NO_FEATURE]) {
      const d = PLATFORM_EXTRACTION[p];
      expect(d.kind, p).toBe('observation');
      expect(d.module, p).toMatch(/^\.\/observationFetchers\/.+\.js$/);
      expect(typeof d.fn, p).toBe('string');
      expect(d.fn.length, p).toBeGreaterThan(0);
    }
  });

  it('the 10 feature platforms have a featureExtractors module', () => {
    for (const p of OBSERVATION_WITH_FEATURE) {
      expect(PLATFORM_EXTRACTION[p].feature, p).toMatch(/^\.\/featureExtractors\/.+\.js$/);
    }
  });

  it('observation-only platforms have NO feature extractor', () => {
    for (const p of OBSERVATION_NO_FEATURE) {
      expect(PLATFORM_EXTRACTION[p].feature, p).toBeUndefined();
    }
  });

  it('gmail and google_gmail both store as "google_gmail" with the gmail feature', () => {
    for (const key of ['gmail', 'google_gmail']) {
      expect(PLATFORM_EXTRACTION[key].storeAs, key).toBe('google_gmail');
      expect(PLATFORM_EXTRACTION[key].fn, key).toBe('fetchGmailObservations');
      expect(PLATFORM_EXTRACTION[key].feature, key).toContain('gmailExtractor');
    }
  });

  it('raw extractors point at extractors/* and set successAlways correctly', () => {
    for (const p of RAW_EXTRACTORS) {
      expect(PLATFORM_EXTRACTION[p].kind, p).toBe('raw_extractor');
      expect(PLATFORM_EXTRACTION[p].module, p).toMatch(/^\.\/extractors\/.+\.js$/);
    }
    // notion/pinterest were always treated as success; soundcloud/steam were not.
    expect(PLATFORM_EXTRACTION.notion.successAlways).toBe(true);
    expect(PLATFORM_EXTRACTION.pinterest.successAlways).toBe(true);
    expect(PLATFORM_EXTRACTION.soundcloud.successAlways).toBeUndefined();
    expect(PLATFORM_EXTRACTION.steam.successAlways).toBeUndefined();
  });
});

describe('getDescriptor', () => {
  it('resolves known platforms', () => {
    expect(getDescriptor('spotify')).toBe(PLATFORM_EXTRACTION.spotify);
    expect(getDescriptor('notion').kind).toBe('raw_extractor');
  });

  it('is case-insensitive (matches old switch .toLowerCase())', () => {
    expect(getDescriptor('Spotify')).toBe(PLATFORM_EXTRACTION.spotify);
    expect(getDescriptor('GitHub')).toBe(PLATFORM_EXTRACTION.github);
  });

  it('returns null for unknown platforms and invalid input', () => {
    expect(getDescriptor('myspace')).toBeNull();
    expect(getDescriptor('')).toBeNull();
    expect(getDescriptor(null)).toBeNull();
    expect(getDescriptor(undefined)).toBeNull();
    expect(getDescriptor(42)).toBeNull();
  });
});

describe('normalizeRawExtractorResult', () => {
  it('successAlways descriptors are always success: true (notion/pinterest)', () => {
    const d = { successAlways: true };
    expect(normalizeRawExtractorResult(d, { itemsExtracted: 5 })).toEqual({
      success: true,
      itemsExtracted: 5,
    });
    // even if the extractor itself returned success:false
    expect(normalizeRawExtractorResult(d, { success: false, itemsExtracted: 0 })).toEqual({
      success: true,
      itemsExtracted: 0,
    });
  });

  it('non-successAlways passes through success flag + error (soundcloud/steam)', () => {
    const d = {};
    expect(normalizeRawExtractorResult(d, { success: true, itemsExtracted: 3 })).toEqual({
      success: true,
      itemsExtracted: 3,
      error: undefined,
    });
    expect(
      normalizeRawExtractorResult(d, { success: false, itemsExtracted: 0, error: 'no key' }),
    ).toEqual({ success: false, itemsExtracted: 0, error: 'no key' });
  });

  it('treats missing success as success: true (only explicit false fails)', () => {
    expect(normalizeRawExtractorResult({}, { itemsExtracted: 2 }).success).toBe(true);
  });

  it('treats a missing result (null/undefined) as a failure (matches old switch throw)', () => {
    // The old switch did `result.itemsExtracted` and threw on undefined -> the
    // outer catch marked the job failed. Preserve that: no result === failure.
    expect(normalizeRawExtractorResult({}, undefined)).toEqual({
      success: false,
      itemsExtracted: 0,
      error: 'Extractor returned no result',
    });
    expect(normalizeRawExtractorResult({ successAlways: true }, null)).toEqual({
      success: false,
      itemsExtracted: 0,
      error: 'Extractor returned no result',
    });
  });

  it('treats an empty result object as success with 0 items (matches old switch)', () => {
    // extractAll returning {} -> old code: itemsExtracted 0, success true.
    expect(normalizeRawExtractorResult({}, {}).success).toBe(true);
    expect(normalizeRawExtractorResult({}, {}).itemsExtracted).toBe(0);
    expect(normalizeRawExtractorResult({ successAlways: true }, {}).success).toBe(true);
  });
});
