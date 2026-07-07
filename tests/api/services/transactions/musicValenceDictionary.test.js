/**
 * Tests for musicValenceDictionary — the heuristic artist/genre → valence map
 * the emotion tagger falls back to now that Spotify no longer exposes
 * audio-features.
 *
 * Bug-classes these tests prevent:
 *
 *   - Accent word-boundary blindness. JS `\b` is ASCII-only: it treats
 *     é / ó / ã as NON-word chars. A rule like /\baxé\b/ therefore never
 *     matches the accented spelling ("axé", "forró", "Beyoncé") that Spotify
 *     actually returns — the trailing \b sits between the accent and a space
 *     (two non-word chars), so no boundary exists. The dictionary silently
 *     scored NULL for exactly the canonical spellings. These tests pin the
 *     accented forms so the Unicode-aware boundary can't regress back to \b.
 *
 *   - Boundary over-loosening. The fix must not turn word-anchored rules into
 *     substring matches: "relaxed" must not score as "axé", "abeyonce" must
 *     not score as "beyoncé". These guard that boundaries still bound.
 */
import { describe, it, expect } from 'vitest';
import { estimateValence } from '../../../../api/services/transactions/musicValenceDictionary.js';

describe('estimateValence — accented spellings (the bug)', () => {
  // These are the spellings Spotify actually returns. Before the Unicode
  // word-boundary fix every one of these returned null.
  it('scores "Beyoncé" (accented) same as the plain spelling', () => {
    expect(estimateValence({ artist_name: 'Beyoncé' })).toBe(0.82);
  });

  it('scores the "axé" genre (accented)', () => {
    expect(estimateValence({ genre: 'axé' })).toBe(0.88);
  });

  it('scores the "forró" genre (accented)', () => {
    expect(estimateValence({ genre: 'forró' })).toBe(0.78);
  });
});

describe('estimateValence — plain + mid-word accents still work', () => {
  it('plain "Beyonce" still scores', () => {
    expect(estimateValence({ artist_name: 'Beyonce' })).toBe(0.82);
  });

  it('mid-word accent "joão gilberto" still scores', () => {
    expect(estimateValence({ artist_name: 'joão gilberto' })).toBe(0.52);
  });

  it('"menos é mais" (accent flanked by spaces) still scores', () => {
    expect(estimateValence({ artist_name: 'menos é mais' })).toBe(0.62);
  });

  it('mid-word accent "clássica" genre still scores', () => {
    expect(estimateValence({ genre: 'clássica' })).toBe(0.52);
  });

  it('plain "forro" / "axe" still score via the ASCII alternative', () => {
    expect(estimateValence({ genre: 'forro' })).toBe(0.78);
    expect(estimateValence({ genre: 'axe' })).toBe(0.88);
  });
});

describe('estimateValence — boundaries still bound (no over-match)', () => {
  it('does not match "axé" inside "relaxed"', () => {
    expect(estimateValence({ genre: 'relaxed jazz mix' })).not.toBe(0.88);
  });

  it('does not match "beyoncé" without a leading boundary', () => {
    expect(estimateValence({ artist_name: 'abeyonce theband' })).toBeNull();
  });

  it('does not match "beyonce" glued to a trailing word char', () => {
    // "beyoncés" — trailing letter means no boundary after the accent
    expect(estimateValence({ artist_name: 'beyoncesque tribute' })).toBeNull();
  });
});

describe('estimateValence — passthrough + no-signal', () => {
  it('prefers a real Spotify valence when present', () => {
    expect(estimateValence({ valence: 0.13, artist_name: 'Beyoncé' })).toBe(0.13);
  });

  it('returns null for an unknown artist with no genre signal', () => {
    expect(estimateValence({ artist_name: 'Some Unlisted Local Band' })).toBeNull();
  });

  it('returns null for empty / non-object input', () => {
    expect(estimateValence(null)).toBeNull();
    expect(estimateValence({})).toBeNull();
  });
});
