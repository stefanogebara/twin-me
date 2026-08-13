/**
 * Spotify mood observation.
 *
 * The defect (audit 2026-08-13): the average was
 *
 *     features.reduce((sum, f) => sum + (f[key] || 0), 0) / features.length
 *
 * so a feature object missing `valence` contributed a 0 to the mean rather
 * than being excluded. With the fields absent entirely that yields valence 0,
 * energy 0 — which the label thresholds render as
 *
 *     "Music mood right now: mellow or introspective, low-energy, chill
 *      (valence 0%, energy 0%, danceability 0%)"
 *
 * A confident, specific, false statement produced by missing data — the same
 * failure as the calendar's "completely open day", and `Music mood right now:`
 * is a registered snapshot metric, so that row would be actively kept fresh.
 *
 * It cannot fire today only because /v1/audio-features now returns HTTP 403
 * for this app and the request throws before any of this runs. That is luck,
 * not design: the moment the endpoint returns objects with null fields instead
 * of refusing outright, the twin starts asserting the user listens to
 * maximally joyless music.
 *
 * Contract: absent fields are excluded from the mean, and when too few real
 * readings remain the function returns null and no observation is written.
 */
import { describe, it, expect } from 'vitest';
import { buildMoodObservation, MIN_READINGS } from '../../../../api/services/observationFetchers/spotifyMood.js';

const f = (valence, energy, danceability) => ({ valence, energy, danceability });

describe('buildMoodObservation — real readings', () => {
  it('averages and labels a normal set', () => {
    const out = buildMoodObservation([f(0.8, 0.8, 0.6), f(0.8, 0.8, 0.6), f(0.8, 0.8, 0.6)]);
    expect(out).toBe('Music mood right now: upbeat and positive, high-energy (valence 80%, energy 80%, danceability 60%)');
  });

  it.each([
    [0.9, 'upbeat and positive'],
    [0.5, 'balanced'],
    [0.2, 'mellow or introspective'],
  ])('labels valence %s as "%s"', (valence, label) => {
    const out = buildMoodObservation([f(valence, 0.5, 0.5), f(valence, 0.5, 0.5), f(valence, 0.5, 0.5)]);
    expect(out).toContain(label);
  });

  it.each([
    [0.9, 'high-energy'],
    [0.5, 'moderate-energy'],
    [0.2, 'low-energy, chill'],
  ])('labels energy %s as "%s"', (energy, label) => {
    const out = buildMoodObservation([f(0.5, energy, 0.5), f(0.5, energy, 0.5), f(0.5, energy, 0.5)]);
    expect(out).toContain(label);
  });
});

describe('buildMoodObservation — missing data must not become a claim', () => {
  it('returns null when the fields are absent entirely', () => {
    // The exact shape that would have produced "valence 0%, energy 0%".
    expect(buildMoodObservation([{}, {}, {}, {}])).toBeNull();
  });

  it('returns null when the fields are null', () => {
    expect(buildMoodObservation([f(null, null, null), f(null, null, null), f(null, null, null)])).toBeNull();
  });

  it('never renders a 0% reading that came from absent data', () => {
    for (const set of [[{}, {}, {}], [f(undefined, undefined, undefined)], []]) {
      const out = buildMoodObservation(set);
      expect(out === null || !out.includes('valence 0%')).toBe(true);
    }
  });

  it('excludes absent values from the mean rather than counting them as zero', () => {
    // Two real 0.8 readings plus one absent: the mean is 0.8, not 0.53.
    const out = buildMoodObservation([f(0.8, 0.8, 0.8), f(0.8, 0.8, 0.8), f(0.8, 0.8, 0.8), {}]);
    expect(out).toContain('valence 80%');
    expect(out).toContain('energy 80%');
  });

  it(`requires at least ${MIN_READINGS} real readings per field`, () => {
    const tooFew = Array.from({ length: MIN_READINGS - 1 }, () => f(0.8, 0.8, 0.8));
    expect(buildMoodObservation(tooFew)).toBeNull();

    const enough = Array.from({ length: MIN_READINGS }, () => f(0.8, 0.8, 0.8));
    expect(buildMoodObservation(enough)).not.toBeNull();
  });

  it('returns null when one field is well-covered but another is not', () => {
    // Valence everywhere, energy nowhere: the sentence needs all three.
    const out = buildMoodObservation([
      { valence: 0.8, danceability: 0.5 },
      { valence: 0.8, danceability: 0.5 },
      { valence: 0.8, danceability: 0.5 },
    ]);
    expect(out).toBeNull();
  });

  it('ignores non-numeric junk', () => {
    expect(buildMoodObservation([
      f('0.8', 'high', {}), f(NaN, Infinity, null), f(0.8, 0.8, 0.8),
    ])).toBeNull();
  });

  it('handles malformed input', () => {
    expect(buildMoodObservation(null)).toBeNull();
    expect(buildMoodObservation(undefined)).toBeNull();
    expect(buildMoodObservation([])).toBeNull();
    expect(buildMoodObservation([null, undefined, 5])).toBeNull();
  });
});
