/**
 * Mood derivation from Spotify audio features (payload audit, 2026-08-13).
 *
 * IMPORTERS/CALLERS: this test imports only the new pure module
 * api/services/spotify/moodFromAudioFeatures.js. That module will be imported
 * by api/services/userContextAggregator.js (getSpotifyContext, ~line 597),
 * whose currentMood/audioProfile fields feed twinContextBuilder.
 *
 * AFFECTED API: Spotify GET /v1/audio-features, response shape
 * { audio_features: [{ id, energy, valence, tempo, danceability, ... }] }.
 * It returns HTTP 403 for this app (restricted Nov 2024).
 *
 * DATA SCHEMAS: none written. In-memory shape only —
 * { label, energy, valence, tempo, description } becomes omittable.
 *
 * USER'S VERBATIM INSTRUCTION: "ok compacted now contnue" (continuing the
 * payload audit from "audit the other fetchers for payload assumptions").
 *
 * The bug this pins: userContextAggregator.calculateAverageAudioFeatures([])
 * returned a hardcoded { energy: 0.5, valence: 0.5, tempo: 100 }, which
 * deriveMoodFromFeatures then read as "Balanced / Moderate energy and mood".
 * Since the endpoint is restricted, that branch is the ONLY branch that runs
 * in production: every user's music mood has been a fabricated constant,
 * indistinguishable downstream from a real measurement.
 *
 * Fourth occurrence of the same signature as the calendar's "completely open
 * day" and the spotify valence-zero average: missing data rendered as a
 * confident claim. Absent readings must produce no reading.
 */
import { describe, it, expect } from 'vitest';
import {
  averageAudioFeatures,
  deriveMood,
} from '../../../../api/services/spotify/moodFromAudioFeatures.js';

describe('averageAudioFeatures', () => {
  it('returns null for an empty array rather than inventing midpoints', () => {
    expect(averageAudioFeatures([])).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a non-array', { energy: 0.9 }],
    ['an array of nulls', [null, undefined]],
    ['an array of non-objects', ['nope', 42]],
  ])('returns null for %s', (_label, input) => {
    expect(averageAudioFeatures(input)).toBeNull();
  });

  it('averages real readings', () => {
    const avg = averageAudioFeatures([
      { energy: 0.8, valence: 0.6, tempo: 120, danceability: 0.7 },
      { energy: 0.6, valence: 0.4, tempo: 100, danceability: 0.5 },
    ]);
    expect(avg).toMatchObject({
      energy: 0.7,
      valence: 0.5,
      tempo: 110,
      danceability: 0.6,
    });
  });

  it('reports how many readings the average rests on', () => {
    const avg = averageAudioFeatures([
      { energy: 0.8, valence: 0.6 },
      { energy: 0.6, valence: 0.4 },
      { energy: 0.4, valence: 0.2 },
    ]);
    expect(avg.sampleSize).toBe(3);
  });

  // The valence-fallback bug in miniature: `(f.valence || 0)` counted an
  // ABSENT reading as a reading of zero, dragging every average toward sad.
  it('excludes absent fields from the mean instead of scoring them zero', () => {
    const avg = averageAudioFeatures([
      { energy: 0.8, valence: 0.8 },
      { energy: 0.8 }, // no valence reported
    ]);
    expect(avg.valence).toBe(0.8);
  });

  it('counts a genuine zero, which is not the same as absent', () => {
    const avg = averageAudioFeatures([
      { energy: 1, valence: 0 },
      { energy: 1, valence: 1 },
    ]);
    expect(avg.valence).toBe(0.5);
  });

  it('returns null when energy and valence are both missing everywhere', () => {
    expect(averageAudioFeatures([{ tempo: 120 }, { tempo: 130 }])).toBeNull();
  });

  it('omits optional fields nobody reported rather than defaulting them', () => {
    const avg = averageAudioFeatures([{ energy: 0.8, valence: 0.6 }]);
    expect(avg.tempo).toBeUndefined();
    expect(avg.danceability).toBeUndefined();
  });

  it('ignores non-finite values', () => {
    const avg = averageAudioFeatures([
      { energy: 0.8, valence: 0.6 },
      { energy: NaN, valence: Infinity },
    ]);
    expect(avg).toMatchObject({ energy: 0.8, valence: 0.6, sampleSize: 1 });
  });
});

describe('deriveMood', () => {
  it('returns null when there is no average to read', () => {
    expect(deriveMood(null)).toBeNull();
  });

  it('does not label a mood "Balanced" when the readings are absent', () => {
    expect(deriveMood(averageAudioFeatures([]))).toBeNull();
  });

  it.each([
    ['Energized', { energy: 0.8, valence: 0.7 }],
    ['Intense', { energy: 0.8, valence: 0.3 }],
    ['Relaxed', { energy: 0.3, valence: 0.7 }],
    ['Calm', { energy: 0.3, valence: 0.3 }],
    ['Balanced', { energy: 0.5, valence: 0.5 }],
  ])('labels %s from real readings', (label, avg) => {
    expect(deriveMood(avg).label).toBe(label);
  });

  it('still returns null when energy or valence is missing from the average', () => {
    expect(deriveMood({ tempo: 120 })).toBeNull();
    expect(deriveMood({ energy: 0.8 })).toBeNull();
  });
});
