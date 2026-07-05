/**
 * Characterization tests for scoreEnrichmentQuality — a pure scorer (no I/O)
 * that decides whether the free enrichment sources returned enough to skip the
 * paid (PDL) fallback. Pins the exact point weights and the isMinimal threshold.
 */
import { describe, it, expect } from 'vitest';
import { scoreEnrichmentQuality } from '../../../api/services/enrichment/enrichmentQualityScorer.js';

describe('scoreEnrichmentQuality', () => {
  it('returns zero + everything-missing for null/undefined input', () => {
    expect(scoreEnrichmentQuality(null)).toEqual({
      score: 0,
      isMinimal: true,
      missingFields: ['everything'],
    });
    expect(scoreEnrichmentQuality(undefined).isMinimal).toBe(true);
  });

  it('scores an empty object as 0 and lists every missing field', () => {
    const r = scoreEnrichmentQuality({});
    expect(r.score).toBe(0);
    expect(r.isMinimal).toBe(true);
    // The 6 fields checked with a missingFields push when absent:
    expect(r.missingFields).toEqual([
      'name', 'photo', 'bio', 'company', 'location', 'social_links',
    ]);
  });

  it('weights identity fields exactly (name 2, photo 1, bio 2, company 2, location 1)', () => {
    expect(scoreEnrichmentQuality({ discovered_name: 'Ana' }).score).toBe(2);
    expect(scoreEnrichmentQuality({ discovered_photo: 'x.jpg' }).score).toBe(1);
    expect(scoreEnrichmentQuality({ discovered_bio: 'hi' }).score).toBe(2);
    expect(scoreEnrichmentQuality({ discovered_company: 'Acme' }).score).toBe(2);
    expect(scoreEnrichmentQuality({ discovered_location: 'NYC' }).score).toBe(1);
  });

  it('caps social_links contribution at 5 points', () => {
    const many = { social_links: Array.from({ length: 12 }, (_, i) => `l${i}`) };
    expect(scoreEnrichmentQuality(many).score).toBe(5);
    // exactly 5 links -> 5 points; still no social_links in missing
    const five = { social_links: [1, 2, 3, 4, 5] };
    const r = scoreEnrichmentQuality(five);
    expect(r.score).toBe(5);
    expect(r.missingFields).not.toContain('social_links');
  });

  it('adds platform + reputation + WMN points', () => {
    const data = {
      github_repos: [{}],       // +2
      reddit_interests: ['a'],  // +1
      hn_karma: 100,            // +1
      breach_services: ['x'],   // +1
      email_reputation: 'good', // +1
      wmn_count: 3,             // +1
    };
    // total 7, no identity/social -> still below threshold 5? 7 >= 5 so not minimal
    const r = scoreEnrichmentQuality(data);
    expect(r.score).toBe(7);
    expect(r.isMinimal).toBe(false);
  });

  it('treats score of exactly 4 as minimal and 5 as sufficient (threshold = 5)', () => {
    // name(2)+photo(1)+location(1) = 4 -> minimal
    expect(scoreEnrichmentQuality({
      discovered_name: 'A', discovered_photo: 'p', discovered_location: 'L',
    })).toMatchObject({ score: 4, isMinimal: true });

    // name(2)+bio(2)+photo(1) = 5 -> NOT minimal
    expect(scoreEnrichmentQuality({
      discovered_name: 'A', discovered_bio: 'b', discovered_photo: 'p',
    })).toMatchObject({ score: 5, isMinimal: false });
  });

  it('does not count empty arrays as present (reddit_interests: [] contributes 0)', () => {
    const r = scoreEnrichmentQuality({ reddit_interests: [], breach_services: [] });
    expect(r.score).toBe(0);
  });
});
