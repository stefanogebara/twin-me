import { describe, it, expect } from 'vitest';
import { isRetiredPlatform, RETIRED_PLATFORMS } from '../../src/lib/retiredPlatforms';
import { PLATFORM_DISPLAY_NAMES } from '../../src/lib/platformNames';

/**
 * Characterization tests for the retired-platform registry and its interplay
 * with the display-name map.
 *
 * Both modules are pure data + a lookup predicate. These tests PIN the current
 * (audit-2026-07-04) set contents and the DELIBERATE invariant documented in
 * retiredPlatforms.ts: retired platforms are dropped from live OAuth/sync but
 * their display names are intentionally RETAINED so historical memories still
 * render. A regression that silently drops a name (or un-retires a platform)
 * trips these tests.
 */

describe('isRetiredPlatform', () => {
  it('returns true for platforms in the retired set', () => {
    expect(isRetiredPlatform('reddit')).toBe(true);
    expect(isRetiredPlatform('linkedin')).toBe(true);
    expect(isRetiredPlatform('twitch')).toBe(true);
    expect(isRetiredPlatform('oura')).toBe(true);
    expect(isRetiredPlatform('slack')).toBe(true);
  });

  it('returns false for still-active platforms', () => {
    expect(isRetiredPlatform('spotify')).toBe(false);
    expect(isRetiredPlatform('github')).toBe(false);
    expect(isRetiredPlatform('discord')).toBe(false);
    expect(isRetiredPlatform('whoop')).toBe(false);
    expect(isRetiredPlatform('youtube')).toBe(false);
    expect(isRetiredPlatform('gmail')).toBe(false);
  });

  it('CHARACTERIZATION: lookup is exact / case-sensitive', () => {
    expect(isRetiredPlatform('Reddit')).toBe(false);
    expect(isRetiredPlatform('REDDIT')).toBe(false);
  });

  it('returns false for unknown / empty strings', () => {
    expect(isRetiredPlatform('')).toBe(false);
    expect(isRetiredPlatform('nonexistent')).toBe(false);
  });
});

describe('RETIRED_PLATFORMS set contents', () => {
  it('pins the exact retired roster (audit-2026-07-04)', () => {
    // If a platform is added/removed from the cut, update this list AND confirm
    // the display-name / sync implications with a reviewer.
    expect([...RETIRED_PLATFORMS].sort()).toEqual(
      [
        'apple_music',
        'fitbit',
        'garmin',
        'google_drive',
        'linkedin',
        'notion',
        'oura',
        'pinterest',
        'reddit',
        'slack',
        'soundcloud',
        'steam',
        'strava',
        'tiktok',
        'twitch',
      ].sort(),
    );
  });

  it('has 15 entries', () => {
    expect(RETIRED_PLATFORMS.size).toBe(15);
  });
});

describe('retired ↔ display-name invariant (intentional retention)', () => {
  it('CHARACTERIZATION: retired platforms that had a display name KEEP it', () => {
    // Per the module comment, historical memories keep rendering via the
    // display-name map. These retired platforms intentionally retain names.
    const retainedRetired = ['reddit', 'linkedin', 'twitch', 'oura', 'slack'];
    for (const p of retainedRetired) {
      expect(isRetiredPlatform(p)).toBe(true);
      expect(PLATFORM_DISPLAY_NAMES[p]).toBeDefined();
    }
  });

  it('active platforms all have a display name', () => {
    const active = ['spotify', 'youtube', 'github', 'discord', 'whoop', 'gmail'];
    for (const p of active) {
      expect(isRetiredPlatform(p)).toBe(false);
      expect(PLATFORM_DISPLAY_NAMES[p]).toBeDefined();
    }
  });
});

describe('PLATFORM_DISPLAY_NAMES lookups', () => {
  it('maps canonical keys to human-readable names', () => {
    expect(PLATFORM_DISPLAY_NAMES.spotify).toBe('Spotify');
    expect(PLATFORM_DISPLAY_NAMES.github).toBe('GitHub');
    expect(PLATFORM_DISPLAY_NAMES.whoop).toBe('Whoop');
  });

  it('CHARACTERIZATION: multiple aliases collapse to the same display name', () => {
    // YouTube aliases.
    expect(PLATFORM_DISPLAY_NAMES.youtube).toBe('YouTube');
    expect(PLATFORM_DISPLAY_NAMES.google_youtube).toBe('YouTube');
    // Google Calendar aliases (three key spellings).
    expect(PLATFORM_DISPLAY_NAMES.calendar).toBe('Google Calendar');
    expect(PLATFORM_DISPLAY_NAMES.google_calendar).toBe('Google Calendar');
    expect(PLATFORM_DISPLAY_NAMES['google-calendar']).toBe('Google Calendar');
    // Gmail aliases.
    expect(PLATFORM_DISPLAY_NAMES.gmail).toBe('Gmail');
    expect(PLATFORM_DISPLAY_NAMES.google_gmail).toBe('Gmail');
  });

  it('CHARACTERIZATION: unknown key returns undefined (callers must supply their own fallback)', () => {
    expect(PLATFORM_DISPLAY_NAMES.nonexistent).toBeUndefined();
    expect(PLATFORM_DISPLAY_NAMES['']).toBeUndefined();
  });
});
