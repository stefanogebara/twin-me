/**
 * Characterization tests for musicValenceDictionary — heuristic valence [0-1]
 * lookup for BR + global artists (used when Spotify audio-features are absent).
 *
 * Pure function. We pin: real-valence passthrough, artist matches, genre
 * fallbacks, first-match-wins ordering, the multi-field haystack, and the
 * null-on-no-match contract the emotion tagger depends on.
 */
import { describe, it, expect } from 'vitest';
import { estimateValence } from '../../../api/services/transactions/musicValenceDictionary.js';

describe('estimateValence — real valence passthrough', () => {
  it('prefers an explicit numeric raw.valence over the heuristic', () => {
    expect(estimateValence({ valence: 0.123, artist_name: 'ABBA' })).toBe(0.123);
  });

  it('prefers raw.audio_valence when valence is absent', () => {
    expect(estimateValence({ audio_valence: 0.777, artist_name: 'Adele' })).toBe(0.777);
  });

  it('accepts 0 as a valid real valence (not treated as missing)', () => {
    expect(estimateValence({ valence: 0 })).toBe(0);
  });

  it('ignores a non-numeric valence field and falls through to heuristic', () => {
    // valence is a string -> typeof !== 'number' -> heuristic path on artist.
    expect(estimateValence({ valence: 'high', artist_name: 'ABBA' })).toBe(0.9);
  });
});

describe('estimateValence — artist dictionary', () => {
  it('matches a known global artist (ABBA -> 0.90)', () => {
    expect(estimateValence({ artist_name: 'ABBA' })).toBe(0.9);
  });

  it('matches a known BR artist (Anitta -> 0.85)', () => {
    expect(estimateValence({ artist_name: 'Anitta' })).toBe(0.85);
  });

  it('matches a melancholic artist (Lana Del Rey -> 0.32)', () => {
    expect(estimateValence({ artist: 'Lana Del Rey' })).toBe(0.32);
  });

  it('is case-insensitive', () => {
    expect(estimateValence({ artist_name: 'billie eilish' })).toBe(0.3);
    expect(estimateValence({ artist_name: 'BILLIE EILISH' })).toBe(0.3);
  });

  it('matches the ASCII spelling Beyonce (the [eé] class + trailing \\b)', () => {
    expect(estimateValence({ artist_name: 'Beyonce' })).toBe(0.82);
    expect(estimateValence({ artist_name: 'Beyonce Renaissance' })).toBe(0.82);
  });

  it('BUG (pinned): the ACCENTED "Beyoncé" does NOT match — trailing é breaks \\b', () => {
    // KNOWN BUG: patterns use \b without the /u flag. A trailing accented vowel
    // (é) is not a \w char, so the closing \b never matches. Only the ASCII
    // form "Beyonce" hits. Real Spotify metadata usually spells it "Beyoncé",
    // which therefore falls through to null. Pinning current behavior.
    expect(estimateValence({ artist_name: 'Beyoncé' })).toBeNull();
  });

  it('matches on album_name / track_name fields too', () => {
    expect(estimateValence({ album_name: 'Coldplay Live' })).toBe(0.55);
    expect(estimateValence({ track_name: 'a Metallica cover' })).toBe(0.42);
  });
});

describe('estimateValence — genre fallbacks (after artist misses)', () => {
  it('falls back to a genre regex when no artist rule matches', () => {
    expect(estimateValence({ genre: 'pagode' })).toBe(0.68);
    expect(estimateValence({ genre: 'samba' })).toBe(0.7);
  });

  it('accepts genres as an array (joined into the haystack)', () => {
    expect(estimateValence({ genres: ['indie', 'jazz'] })).toBe(0.48);
  });

  it('matches the ASCII genre spelling "axe" -> 0.88', () => {
    expect(estimateValence({ genre: 'axe' })).toBe(0.88);
  });

  it('BUG (pinned): accented BR genres ending in a vowel ("axé", "forró") miss', () => {
    // Same \b-without-/u bug as Beyoncé: axé/forró end in an accented vowel, so
    // the trailing word boundary fails and the accented spelling returns null.
    // A mid-word accent is fine ("clássica" matches via [aá]), only trailing
    // accents break. This means the accented (correct) genre labels don't tag.
    expect(estimateValence({ genre: 'axé' })).toBeNull();
    expect(estimateValence({ genre: 'forró' })).toBeNull();
    expect(estimateValence({ genre: 'clássica' })).toBe(0.52); // mid-word accent OK
  });
});

describe('estimateValence — ordering and no-match', () => {
  it('lets a matching ARTIST rule win over a genre that also matches', () => {
    // "metallica" (artist 0.42) appears before the generic "metal" genre (0.32).
    // Artist rules are scanned first, so 0.42 wins.
    expect(estimateValence({ artist_name: 'Metallica', genre: 'metal' })).toBe(0.42);
  });

  it('returns null when nothing matches', () => {
    expect(estimateValence({ artist_name: 'Some Totally Unknown Act 999' })).toBeNull();
  });

  it('returns null for a null / non-object / empty input', () => {
    expect(estimateValence(null)).toBeNull();
    expect(estimateValence(undefined)).toBeNull();
    expect(estimateValence('ABBA')).toBeNull(); // not an object
    expect(estimateValence({})).toBeNull(); // no fields -> empty haystack
  });

  it('returns null when all name fields are empty strings', () => {
    expect(estimateValence({ artist_name: '', album_name: '', track_name: '' })).toBeNull();
  });
});
