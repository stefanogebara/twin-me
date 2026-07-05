/**
 * Characterization tests for the PURE scoring surface of the behavioral pattern
 * recognizer: scorePatternConfidence (frequency/consistency/temporal-stability
 * multi-factor), getConfidenceLevel (band labels), getConfidenceDescription
 * (voice by band). The detection + storage paths are DB glue and are not tested
 * here. database.js is mocked only so the module imports cleanly.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  scorePatternConfidence,
  getConfidenceLevel,
  getConfidenceDescription,
} from '../../../api/services/behavioralPatternRecognition.js';

describe('scorePatternConfidence', () => {
  it('uses safe defaults (1 occurrence, 0 consistency, no dates) -> ~4', () => {
    // frequency = min(40, 1*4)=4 ; consistency = 0*0.4=0 ; stability = 0
    expect(scorePatternConfidence({})).toBe(4);
  });

  it('caps the frequency component at 40 points (10+ occurrences)', () => {
    // occurrence_count 20 -> 20*4=80 capped to 40 ; consistency 0 ; no dates
    expect(scorePatternConfidence({ occurrence_count: 20 })).toBe(40);
    // exactly 10 -> 40 too
    expect(scorePatternConfidence({ occurrence_count: 10 })).toBe(40);
  });

  it('scales consistency at 0.4 per point (100% -> 40)', () => {
    // occurrence 1 (4) + consistency 100 (*0.4=40) = 44
    expect(scorePatternConfidence({ occurrence_count: 1, consistency_rate: 100 })).toBe(44);
  });

  it('adds temporal stability up to 20 points (daysDiff/2, capped)', () => {
    const base = { occurrence_count: 1, consistency_rate: 0 };
    // 10 days apart -> 10/2 = 5 stability -> 4 + 0 + 5 = 9
    const tenDays = {
      ...base,
      first_observed_at: '2026-01-01T00:00:00Z',
      last_observed_at: '2026-01-11T00:00:00Z',
    };
    expect(scorePatternConfidence(tenDays)).toBe(9);

    // 100 days apart -> 50 capped to 20 -> 4 + 0 + 20 = 24
    const hundredDays = {
      ...base,
      first_observed_at: '2026-01-01T00:00:00Z',
      last_observed_at: '2026-04-11T00:00:00Z',
    };
    expect(scorePatternConfidence(hundredDays)).toBe(24);
  });

  it('caps the total at 100', () => {
    const maxed = {
      occurrence_count: 50,         // 40
      consistency_rate: 100,        // 40
      first_observed_at: '2026-01-01T00:00:00Z',
      last_observed_at: '2027-01-01T00:00:00Z', // >20 stability
    };
    expect(scorePatternConfidence(maxed)).toBe(100);
  });

  it('ignores stability when only one timestamp is present', () => {
    const oneDate = { occurrence_count: 1, consistency_rate: 0, first_observed_at: '2026-01-01T00:00:00Z' };
    expect(scorePatternConfidence(oneDate)).toBe(4); // stability stays 0
  });
});

describe('getConfidenceLevel', () => {
  it('maps scores to the five bands at the documented cutoffs', () => {
    expect(getConfidenceLevel(95)).toBe('very_high');
    expect(getConfidenceLevel(90)).toBe('very_high');
    expect(getConfidenceLevel(89.99)).toBe('high');
    expect(getConfidenceLevel(70)).toBe('high');
    expect(getConfidenceLevel(69)).toBe('medium');
    expect(getConfidenceLevel(50)).toBe('medium');
    expect(getConfidenceLevel(49)).toBe('low');
    expect(getConfidenceLevel(30)).toBe('low');
    expect(getConfidenceLevel(29)).toBe('very_low');
    expect(getConfidenceLevel(0)).toBe('very_low');
  });
});

describe('getConfidenceDescription', () => {
  it('voices the twin differently per confidence band', () => {
    expect(getConfidenceDescription(95)).toBe("We're confident you");
    expect(getConfidenceDescription(70)).toBe('It seems like you');
    expect(getConfidenceDescription(55)).toBe('You might');
    expect(getConfidenceDescription(40)).toBe("We're still learning if you");
    expect(getConfidenceDescription(10)).toBe("We're still learning if you");
  });
});
