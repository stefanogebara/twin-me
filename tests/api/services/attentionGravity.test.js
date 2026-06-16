/**
 * Tests for the PURE core of attention gravity — dwell aggregation, the
 * visits-vs-attention divergence, the concentration gates, and candidate text.
 * The DB gather is glue (verified live); the ranking math is pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  friendlyDomain,
  computeAttentionGravity,
  buildAttentionGravityCandidate,
} from '../../../api/services/attentionGravity.js';

/** Helper: n visits to a domain, each with the given dwell seconds. */
function visits(domain, n, dwellEach) {
  return Array.from({ length: n }, () => ({ domain, dwellS: dwellEach }));
}
/** 8 filler domains with small dwell, to clear the MIN_DOMAINS gate. */
function filler() {
  return Array.from({ length: 8 }, (_, i) => ({ domain: `site${i}.com`, dwellS: 20 }));
}

describe('friendlyDomain', () => {
  it('extracts a title-cased registrable label', () => {
    expect(friendlyDomain('figma.com')).toBe('Figma');
    expect(friendlyDomain('www.github.com')).toBe('Github');
    expect(friendlyDomain('web.whatsapp.com')).toBe('Whatsapp');
    expect(friendlyDomain('console.cloud.google.com')).toBe('Google');
  });
  it('handles junk safely', () => {
    expect(friendlyDomain('')).toBeNull();
    expect(friendlyDomain(null)).toBeNull();
  });
});

describe('computeAttentionGravity', () => {
  it('flags the click-vs-attention divergence (open one, dwell on another)', () => {
    const events = [
      ...visits('google.com', 40, 5),   // many quick checks: 200s total
      ...visits('figma.com', 8, 250),   // few long sessions: 2000s total
      ...filler(),
    ];
    const g = computeAttentionGravity(events);
    expect(g).not.toBeNull();
    expect(g.topDomain).toBe('figma.com');     // attention pools here (by dwell)
    expect(g.topVisitDomain).toBe('google.com'); // but clicked most
    expect(g.diverges).toBe(true);
  });

  it('reports concentration when the top dwell IS the top visited', () => {
    const events = [
      ...visits('figma.com', 30, 120),  // both most-visited and most-dwelled
      ...visits('google.com', 5, 10),
      ...filler(),
    ];
    const g = computeAttentionGravity(events);
    expect(g).not.toBeNull();
    expect(g.topDomain).toBe('figma.com');
    expect(g.diverges).toBe(false);
  });

  it('returns null when attention is too scattered (no domain holds the floor)', () => {
    // 12 domains, each ~equal dwell -> top share well under 12%
    const events = Array.from({ length: 12 }, (_, i) => visits(`d${i}.com`, 5, 60)).flat();
    expect(computeAttentionGravity(events)).toBeNull();
  });

  it('returns null below the domain-count and dwell floors', () => {
    expect(computeAttentionGravity([])).toBeNull();
    expect(computeAttentionGravity(visits('a.com', 3, 10))).toBeNull(); // too few domains
    // enough domains but trivial total dwell
    const thin = Array.from({ length: 10 }, (_, i) => ({ domain: `d${i}.com`, dwellS: 2 }));
    expect(computeAttentionGravity(thin)).toBeNull();
  });

  it('ignores events without a domain', () => {
    const events = [
      ...visits('figma.com', 10, 200),
      { domain: null, dwellS: 9999 },   // page_summary-style, dropped
      ...filler(),
    ];
    const g = computeAttentionGravity(events);
    expect(g.topDomain).toBe('figma.com');
  });
});

describe('buildAttentionGravityCandidate', () => {
  it('frames the divergence with both friendly names', () => {
    const c = buildAttentionGravityCandidate({
      topDomain: 'figma.com', topVisitDomain: 'google.com', diverges: true, nDomains: 20, topDwellMin: 40, dwellSharePct: 30,
    });
    expect(c).toMatch(/open Google more/);
    expect(c).toMatch(/pools on Figma/);
    expect(c).not.toMatch(/%/);
  });
  it('frames the concentration case when not diverging', () => {
    const c = buildAttentionGravityCandidate({
      topDomain: 'figma.com', topVisitDomain: 'figma.com', diverges: false, nDomains: 18, topDwellMin: 50, dwellSharePct: 35,
    });
    expect(c).toMatch(/pooling in one place: Figma/);
    expect(c).toMatch(/18 sites/);
  });
  it('returns null for no finding', () => {
    expect(buildAttentionGravityCandidate(null)).toBeNull();
  });
});
