/**
 * Characterization tests for the PURE methods of the SQL temporal pattern
 * detector: buildTemporalRelationships (music-precedes-event windowing),
 * extractGenre (source precedence + energy fallback), aggregatePatterns
 * (grouping + confidence = 0.5*frequency + 0.5*consistency + min-occurrence /
 * min-confidence filtering + sort), and calculateStdDev. detectPatterns/
 * savePatterns are DB glue and out of scope; database.js is mocked for import.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import detector from '../../../api/services/temporalPatternDetector.js';

describe('calculateStdDev', () => {
  it('returns 0 for an empty array', () => {
    expect(detector.calculateStdDev([])).toBe(0);
  });

  it('is 0 for constant values', () => {
    expect(detector.calculateStdDev([15, 15, 15])).toBe(0);
  });

  it('computes the population standard deviation', () => {
    // 10,20,30 -> mean 20, variance ((100+0+100)/3)=66.66, sqrt~8.165
    expect(detector.calculateStdDev([10, 20, 30])).toBeCloseTo(8.16497, 4);
  });
});

describe('extractGenre', () => {
  it('prefers explicit track.genre, then artist.genres[0], then rawData.genre', () => {
    expect(detector.extractGenre({ genre: 'jazz' }, {}, {})).toBe('jazz');
    expect(detector.extractGenre({}, { genres: ['funk', 'soul'] }, {})).toBe('funk');
    expect(detector.extractGenre({}, {}, { genre: 'ambient' })).toBe('ambient');
  });

  it('falls back to energy buckets when no genre is present', () => {
    expect(detector.extractGenre({ energy: 0.1 }, {}, {})).toBe('calm');
    expect(detector.extractGenre({ energy: 0.5 }, {}, {})).toBe('moderate');
    expect(detector.extractGenre({ energy: 0.9 }, {}, {})).toBe('energetic');
  });

  it('uses the 0.5 default energy (moderate) when energy is absent', () => {
    expect(detector.extractGenre({}, {}, {})).toBe('moderate');
  });
});

describe('buildTemporalRelationships', () => {
  // Music at 12:00; an event 20 min later (12:20) is inside the [10,30] window.
  const musicAt = (iso, raw = {}) => ({ created_at: iso, raw_data: raw });
  const eventAt = (iso, extra = {}) => ({ start_time: iso, title: extra.title || 'Ev', ...extra });

  it('pairs music that precedes an event within the 10-30 min window', () => {
    const music = [musicAt('2026-01-01T12:00:00Z', {
      track: { genre: 'jazz', artists: [{}] },
      audioFeatures: { energy: 0.4, valence: 0.6 },
    })];
    const events = [eventAt('2026-01-01T12:20:00Z', { event_type: 'presentation', is_important: true, title: 'Pitch' })];

    const rels = detector.buildTemporalRelationships(events, music);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({
      musicGenre: 'jazz',
      musicEnergy: 0.4,
      musicValence: 0.6,
      eventType: 'presentation',
      eventImportance: 85,   // is_important -> 85
      minutesBefore: 20,
    });
  });

  it('excludes music outside the window (too close < 10 or too far > 30)', () => {
    const music = [
      musicAt('2026-01-01T12:15:00Z'), // 5 min before -> excluded
      musicAt('2026-01-01T11:00:00Z'), // 80 min before -> excluded
    ];
    const events = [eventAt('2026-01-01T12:20:00Z')];
    expect(detector.buildTemporalRelationships(events, music)).toEqual([]);
  });

  it('marks non-important events with importance 50 and skips invalid timestamps', () => {
    const music = [
      musicAt('not-a-date'),                 // skipped
      musicAt('2026-01-01T09:00:00Z', { track: {} }),
    ];
    const events = [
      eventAt('also-not-a-date'),            // skipped
      eventAt('2026-01-01T09:25:00Z', { event_type: 'meeting' }), // 25 min after -> valid, importance 50
    ];
    const rels = detector.buildTemporalRelationships(events, music);
    expect(rels).toHaveLength(1);
    expect(rels[0].eventImportance).toBe(50);
    expect(rels[0].eventType).toBe('meeting');
  });
});

describe('aggregatePatterns', () => {
  /** Build N identical relationships for one genre+eventType. */
  function rels(n, { genre = 'jazz', eventType = 'presentation', minutesBefore = 20, energy = 0.4, valence = 0.6 } = {}) {
    return Array.from({ length: n }, (_, i) => ({
      musicGenre: genre,
      musicEnergy: energy,
      musicValence: valence,
      eventType,
      minutesBefore,
      eventTitle: `Event ${i}`,
    }));
  }

  it('filters out groups below minOccurrences', () => {
    const patterns = detector.aggregatePatterns(rels(2), 3, 0.5);
    expect(patterns).toEqual([]);
  });

  it('emits a pattern when occurrences and confidence clear the bar', () => {
    // 5 identical -> minutesBefore all 20 -> stdDev 0 -> consistency 1.
    // frequency = min(5/10,1)=0.5 -> confidence = 0.5*0.5 + 1*0.5 = 0.75.
    const patterns = detector.aggregatePatterns(rels(5), 3, 0.7);
    expect(patterns).toHaveLength(1);
    const p = patterns[0];
    expect(p.pattern_type).toBe('temporal_music_before_event');
    expect(p.occurrence_count).toBe(5);
    expect(p.confidence_score).toBe(75); // 0.75 * 100
    expect(p.consistency_rate).toBe(100);
    expect(p.trigger.event_type).toBe('presentation');
    expect(p.response.genre).toBe('jazz');
    expect(p.time_offset_minutes).toBe(20);
    expect(p.example_events).toHaveLength(3); // capped at 3
  });

  it('drops a low-confidence group (scattered timing -> high stdDev)', () => {
    // Wildly scattered minutesBefore -> stdDev large -> consistency ~0.
    const scattered = [10, 60, 15, 90, 12].map((m, i) => ({
      musicGenre: 'rock', musicEnergy: 0.8, musicValence: 0.3,
      eventType: 'meeting', minutesBefore: m, eventTitle: `E${i}`,
    }));
    // frequency 0.5, consistency near 0 -> confidence ~0.25 < 0.7
    expect(detector.aggregatePatterns(scattered, 3, 0.7)).toEqual([]);
  });

  it('sorts multiple patterns by confidence then occurrence count', () => {
    const combined = [
      ...rels(5, { genre: 'jazz', eventType: 'presentation', minutesBefore: 20 }),   // conf 0.75
      ...rels(10, { genre: 'lofi', eventType: 'focus', minutesBefore: 15 }),         // freq 1.0 -> conf 1.0
    ];
    const patterns = detector.aggregatePatterns(combined, 3, 0.5);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].response.genre).toBe('lofi');   // higher confidence first
    expect(patterns[0].confidence_score).toBeGreaterThanOrEqual(patterns[1].confidence_score);
  });
});
