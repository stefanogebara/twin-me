/**
 * Unit tests for the platform yield policy (replan-2026-06-10 Track C BUILD).
 *
 * shouldFeaturePlatform documents the featured-tile gating rule for a future
 * cycle (it is wired into nothing yet): keep when mirror OR explicit keeper
 * OR >= 5 raw-signal memories in the last 14 days; otherwise demote.
 *
 * normalizePlatformTag/aggregatePlatformYield mirror the row shapes actually
 * observed in user_memories on 2026-06-10, including the double-encoded
 * browser-extension metadata cohort and desktop_meeting display names.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldFeaturePlatform,
  normalizePlatformTag,
  aggregatePlatformYield,
  FEATURED_KEEPERS,
  MIRROR_PLATFORMS,
  FEATURE_YIELD_THRESHOLD,
  YIELD_WINDOW_DAYS,
} from '../../api/services/platformYield.js';

describe('shouldFeaturePlatform', () => {
  it('keeps mirrors even with zero yield (the moat is never demoted)', () => {
    expect(shouldFeaturePlatform('web', 0)).toBe('keep');
    expect(shouldFeaturePlatform('desktop', 0)).toBe('keep');
  });

  it('keeps via the explicit isMirror override regardless of platform id', () => {
    expect(shouldFeaturePlatform('extension-surface', 0, true)).toBe('keep');
  });

  it('keeps every explicitly-featured keeper even in a zero-yield week', () => {
    for (const keeper of FEATURED_KEEPERS) {
      expect(shouldFeaturePlatform(keeper, 0)).toBe('keep');
    }
  });

  it('keeps a non-keeper at or above the threshold (youtube as passenger)', () => {
    expect(shouldFeaturePlatform('youtube', FEATURE_YIELD_THRESHOLD)).toBe('keep');
    expect(shouldFeaturePlatform('youtube', 69)).toBe('keep');
  });

  it('demotes a non-keeper below the threshold (the kill-list yield profile)', () => {
    expect(shouldFeaturePlatform('reddit', 2)).toBe('demote');
    expect(shouldFeaturePlatform('linkedin', FEATURE_YIELD_THRESHOLD - 1)).toBe('demote');
    expect(shouldFeaturePlatform('twitch', 0)).toBe('demote');
  });

  it('is case- and whitespace-insensitive on the platform id', () => {
    expect(shouldFeaturePlatform('Spotify', 0)).toBe('keep');
    expect(shouldFeaturePlatform('  WEB  ', 0)).toBe('keep');
    expect(shouldFeaturePlatform('Reddit', 1)).toBe('demote');
  });

  it('treats garbage yield values as zero (demote, never throw)', () => {
    expect(shouldFeaturePlatform('reddit', undefined)).toBe('demote');
    expect(shouldFeaturePlatform('reddit', NaN)).toBe('demote');
    expect(shouldFeaturePlatform('reddit', 'lots')).toBe('demote');
  });

  it('demotes unknown/empty platform ids with no yield', () => {
    expect(shouldFeaturePlatform('', 0)).toBe('demote');
    expect(shouldFeaturePlatform(null, 0)).toBe('demote');
    expect(shouldFeaturePlatform(undefined, 3)).toBe('demote');
  });

  it('policy constants stay as documented in the replan', () => {
    expect(YIELD_WINDOW_DAYS).toBe(14);
    expect(FEATURE_YIELD_THRESHOLD).toBe(5);
    expect(MIRROR_PLATFORMS).toContain('web');
    expect(MIRROR_PLATFORMS).toContain('desktop');
  });
});

describe('normalizePlatformTag', () => {
  it('uses the plain platform tag for OAuth platform_data rows', () => {
    expect(normalizePlatformTag({ platform: 'google_gmail', source: 'google_gmail' }))
      .toBe('google_gmail');
    expect(normalizePlatformTag({ platform: 'whoop', source: 'whoop' })).toBe('whoop');
  });

  it('maps desktop_clip rows (null platform) to desktop', () => {
    expect(normalizePlatformTag({ platform: null, source: 'desktop_clip' })).toBe('desktop');
  });

  it('maps desktop_meeting rows to desktop, ignoring the display-name platform', () => {
    expect(normalizePlatformTag({ platform: 'Google Meet', source: 'desktop_meeting' }))
      .toBe('desktop');
  });

  it('maps browser_extension source rows to web', () => {
    expect(normalizePlatformTag({ platform: 'web', source: 'browser_extension' })).toBe('web');
  });

  it('recovers the inner platform from double-encoded metadata blobs', () => {
    const blob = JSON.stringify({
      source: 'browser_extension',
      platform: 'web',
      data_type: 'page_visit',
    });
    expect(normalizePlatformTag({ platform: blob, source: blob })).toBe('web');
  });

  it('lowercases mixed-case tags', () => {
    expect(normalizePlatformTag({ platform: 'GitHub', source: null })).toBe('github');
  });

  it('returns null for rows with no platform signal', () => {
    expect(normalizePlatformTag({ platform: null, source: 'twin_chat' })).toBe(null);
    expect(normalizePlatformTag({ platform: null, source: null })).toBe(null);
    expect(normalizePlatformTag({})).toBe(null);
    expect(normalizePlatformTag(null)).toBe(null);
  });

  it('does not throw on malformed JSON-looking tags', () => {
    expect(normalizePlatformTag({ platform: '{not json', source: null })).toBe('{not json');
  });
});

describe('aggregatePlatformYield', () => {
  it('counts rows per canonical platform across all observed tag shapes', () => {
    const blob = JSON.stringify({ source: 'browser_extension', platform: 'web' });
    const rows = [
      { platform: 'google_gmail', source: 'google_gmail' },
      { platform: 'google_gmail', source: 'google_gmail' },
      { platform: 'web', source: 'browser_extension' },
      { platform: blob, source: blob },
      { platform: null, source: 'desktop_clip' },
      { platform: 'Google Meet', source: 'desktop_meeting' },
      { platform: null, source: 'twin_chat' }, // no platform signal -> dropped
    ];
    expect(aggregatePlatformYield(rows)).toEqual({
      google_gmail: 2,
      web: 2,
      desktop: 2,
    });
  });

  it('returns an empty object for empty or missing input', () => {
    expect(aggregatePlatformYield([])).toEqual({});
    expect(aggregatePlatformYield(null)).toEqual({});
  });
});
