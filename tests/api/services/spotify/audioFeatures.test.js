/**
 * Availability gate for Spotify /v1/audio-features.
 *
 * IMPORTERS/CALLERS: api/services/spotify/audioFeatures.js is imported by
 * realTimeExtractor.js, spotifyEnhancedExtractor.js, routes/spotify-oauth.js
 * and observationFetchers/spotify.js.
 * AFFECTED API: Spotify GET /v1/audio-features — HTTP 403 for this app since
 * Spotify restricted the endpoint (Nov 2024).
 * DATA SCHEMAS: none. Reads env SPOTIFY_AUDIO_FEATURES_ENABLED.
 * USER'S VERBATIM INSTRUCTION: "fix the remaining four call sites too".
 *
 * Why a gate and not six deletions: the endpoint is restricted, not gone. If
 * access is ever restored the sites should light up again by config, not by
 * archaeology. Deleting the calls would make that a code change in six files;
 * this makes it an env var.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  audioFeaturesAvailable,
  AUDIO_FEATURES_RESTRICTED_REASON,
} from '../../../../api/services/spotify/audioFeatures.js';

const ORIGINAL = process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;
  else process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = ORIGINAL;
});

describe('audioFeaturesAvailable', () => {
  it('is off by default, because the endpoint 403s', () => {
    delete process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;
    expect(audioFeaturesAvailable()).toBe(false);
  });

  it('turns on for exactly "true"', () => {
    process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = 'true';
    expect(audioFeaturesAvailable()).toBe(true);
  });

  it.each(['false', '1', 'yes', 'TRUE', ''])(
    'stays off for %o — no accidental truthiness',
    (value) => {
      process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = value;
      expect(audioFeaturesAvailable()).toBe(false);
    },
  );

  it('reads the env at call time, not at import time', () => {
    delete process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;
    expect(audioFeaturesAvailable()).toBe(false);
    process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = 'true';
    expect(audioFeaturesAvailable()).toBe(true);
  });

  it('carries a reason a log line can print', () => {
    expect(AUDIO_FEATURES_RESTRICTED_REASON).toMatch(/restricted/i);
  });
});
