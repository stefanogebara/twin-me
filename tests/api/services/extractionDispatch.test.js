/**
 * Tests for api/services/extractionDispatch.js
 *
 * The dispatch table is where Phase 3's regression risk lives: a dropped
 * platform, a wrong store-as alias, or a mis-wired feature extractor. These
 * assertions pin the table against the post-cut platform portfolio
 * (replan-2026-06-10 Track C): killed platforms (linkedin, oura, twitch,
 * reddit, strava, garmin, fitbit, slack, google_drive, apple_music, notion,
 * pinterest, soundcloud, steam) must NOT reappear; keepers must stay wired
 * exactly as before. Discord and outlook are demoted in the UI but keep full
 * backend function.
 */
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_EXTRACTION,
  getDescriptor,
  normalizeRawExtractorResult,
} from '../../../api/services/extractionDispatch.js';

// The post-cut platform set (replan-2026-06-10 Track C).
const OBSERVATION_WITH_FEATURE = ['discord', 'github', 'youtube', 'gmail', 'whoop'];
const OBSERVATION_NO_FEATURE = ['google_calendar', 'outlook'];
const KILLED_PLATFORMS = [
  'strava', 'oura', 'fitbit', 'garmin', 'notion', 'pinterest', 'soundcloud',
  'slack', 'steam', 'tiktok', 'apple_music', 'google_drive', 'reddit',
  'linkedin', 'twitch',
];

describe('PLATFORM_EXTRACTION table', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(PLATFORM_EXTRACTION)).toBe(true);
  });

  it('covers exactly the post-cut platform set (incl. google_gmail alias)', () => {
    const expected = [
      'spotify',
      ...OBSERVATION_WITH_FEATURE,
      ...OBSERVATION_NO_FEATURE,
      'google_gmail',
    ].sort();
    expect(Object.keys(PLATFORM_EXTRACTION).sort()).toEqual(expected);
  });

  it('contains no killed platform (replan-2026-06-10 Track C)', () => {
    for (const p of KILLED_PLATFORMS) {
      expect(PLATFORM_EXTRACTION[p], p).toBeUndefined();
      expect(getDescriptor(p), p).toBeNull();
    }
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

  it('the feature platforms have a featureExtractors module', () => {
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

  it('no raw_extractor descriptors remain (notion/pinterest/soundcloud/steam deleted)', () => {
    const rawKinds = Object.values(PLATFORM_EXTRACTION).filter(d => d.kind === 'raw_extractor');
    expect(rawKinds).toEqual([]);
  });
});

describe('getDescriptor', () => {
  it('resolves known platforms', () => {
    expect(getDescriptor('spotify')).toBe(PLATFORM_EXTRACTION.spotify);
    expect(getDescriptor('whoop').kind).toBe('observation');
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

// normalizeRawExtractorResult stays exported for the orchestrator's
// 'raw_extractor' runner even though no current platform uses the kind —
// these tests pin its contract for any future niche platform.
describe('normalizeRawExtractorResult', () => {
  it('successAlways descriptors are always success: true', () => {
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

  it('non-successAlways passes through success flag + error', () => {
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
    expect(normalizeRawExtractorResult({}, {}).success).toBe(true);
    expect(normalizeRawExtractorResult({}, {}).itemsExtracted).toBe(0);
    expect(normalizeRawExtractorResult({ successAlways: true }, {}).success).toBe(true);
  });
});
