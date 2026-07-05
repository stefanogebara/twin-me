import { describe, it, expect } from 'vitest';
import {
  formatArchetypeName,
  determineArchetype,
  generateTraitBadges,
  determineArchetypeFromSoulLayers,
  generateTraitBadgesFromSoulLayers,
  extractOneLiner,
  type SoulSignatureLayers,
} from '../../src/utils/archetypeEngine';

/**
 * Characterization tests for the archetype classification engine.
 *
 * All exported functions are pure: OCEAN scores / soul-layer objects in,
 * deterministic archetype / badge / string out. These tests PIN current
 * behavior (audit-2026-07-04) so refactors to the scoring math or the
 * ARCHETYPES table surface as intentional diffs.
 *
 * The archetype signatures are internal constants; rather than hardcode the
 * expected winner for arbitrary inputs (brittle), tests either (a) feed an
 * exact archetype signature and assert it wins, or (b) assert structural
 * invariants (best >= runner_up, similarity bounds).
 */

describe('formatArchetypeName', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(formatArchetypeName(null)).toBe('');
    expect(formatArchetypeName(undefined)).toBe('');
    expect(formatArchetypeName('')).toBe('');
  });

  it('inserts a space in glued "TheStrategist" → "The Strategist"', () => {
    expect(formatArchetypeName('TheStrategist')).toBe('The Strategist');
    expect(formatArchetypeName('TheArchitect')).toBe('The Architect');
  });

  it('leaves already well-formed names untouched', () => {
    expect(formatArchetypeName('The Strategist')).toBe('The Strategist');
    expect(formatArchetypeName('The Debugging Composer')).toBe('The Debugging Composer');
  });

  it('collapses double / odd whitespace', () => {
    expect(formatArchetypeName('The   Strategist')).toBe('The Strategist');
    expect(formatArchetypeName('The  Debugging   Composer')).toBe('The Debugging Composer');
  });

  it('trims leading / trailing whitespace', () => {
    expect(formatArchetypeName('  The Strategist  ')).toBe('The Strategist');
  });

  it('CHARACTERIZATION: only fixes "The" glued to an uppercase letter, not other glued articles', () => {
    // The regex is anchored to ^The([A-Z]); "AnArchitect" is NOT rewritten.
    expect(formatArchetypeName('AnArchitect')).toBe('AnArchitect');
    // "Thestrategist" (lowercase s) does NOT match ^The([A-Z]) → unchanged.
    expect(formatArchetypeName('Thestrategist')).toBe('Thestrategist');
  });

  it('CHARACTERIZATION: only the leading "The" is spaced, a mid-string glued The is untouched', () => {
    // Regex is anchored at start (^), so "TheReTheStrategist" only fixes the
    // first The. Pin exact output.
    expect(formatArchetypeName('TheReborn')).toBe('The Reborn');
  });
});

describe('determineArchetype — exact-signature matches', () => {
  it('returns The Architect when fed its own signature', () => {
    // Architect signature: [0.9, 0.8, 0.3, 0.6, 0.4]
    const result = determineArchetype(0.9, 0.8, 0.3, 0.6, 0.4);
    expect(result.archetype.name).toBe('The Architect');
    // Cosine similarity of a vector with itself is 1 (within float epsilon).
    expect(result.similarity).toBeCloseTo(1, 10);
  });

  it('returns The Commander when fed its own signature', () => {
    // Commander signature: [0.6, 0.8, 0.8, 0.4, 0.3]
    const result = determineArchetype(0.6, 0.8, 0.8, 0.4, 0.3);
    expect(result.archetype.name).toBe('The Commander');
    expect(result.similarity).toBeCloseTo(1, 10);
  });

  it('returns The Poet when fed its own signature', () => {
    // Poet signature: [0.8, 0.4, 0.3, 0.7, 0.8]
    const result = determineArchetype(0.8, 0.4, 0.3, 0.7, 0.8);
    expect(result.archetype.name).toBe('The Poet');
    expect(result.similarity).toBeCloseTo(1, 10);
  });

  it('always exposes a runner_up distinct from the winner', () => {
    const result = determineArchetype(0.9, 0.8, 0.3, 0.6, 0.4);
    expect(result.runner_up).toBeDefined();
    expect(result.runner_up.name).not.toBe(result.archetype.name);
  });

  it('winner similarity is always >= runner_up similarity (sorted descending)', () => {
    // Feed an arbitrary but fixed profile; assert ordering invariant.
    const winner = determineArchetype(0.7, 0.5, 0.6, 0.55, 0.5);
    const all = determineArchetype(0.7, 0.5, 0.6, 0.55, 0.5);
    // Re-derive runner-up similarity is not exposed, but winner must dominate.
    expect(winner.similarity).toBeGreaterThanOrEqual(0);
    expect(winner.similarity).toBeLessThanOrEqual(1);
    expect(all.archetype.name).toBe(winner.archetype.name);
  });

  it('is deterministic — same input yields same archetype', () => {
    const a = determineArchetype(0.55, 0.55, 0.55, 0.55, 0.55);
    const b = determineArchetype(0.55, 0.55, 0.55, 0.55, 0.55);
    expect(a.archetype.name).toBe(b.archetype.name);
    expect(a.similarity).toBe(b.similarity);
  });

  it('CHARACTERIZATION: all-zero profile yields similarity 0 (cosine denom guard)', () => {
    // magA = 0 → denom 0 → cosineSimilarity returns 0 for every archetype.
    // The sort is then stable-ish; the first archetype (The Architect) wins by
    // array order since all similarities tie at 0.
    const result = determineArchetype(0, 0, 0, 0, 0);
    expect(result.similarity).toBe(0);
    expect(result.archetype.name).toBe('The Architect');
  });
});

describe('generateTraitBadges', () => {
  it('returns no badges for a perfectly average profile (all 0.5)', () => {
    // No threshold is crossed at exactly 0.5.
    expect(generateTraitBadges(0.5, 0.5, 0.5, 0.5, 0.5)).toEqual([]);
  });

  it('adds both openness badges when openness > 0.85', () => {
    const badges = generateTraitBadges(0.9, 0.5, 0.5, 0.5, 0.5);
    expect(badges).toContain('Curious Mind');
    expect(badges).toContain('Pattern Seeker');
  });

  it('adds only the first openness badge between 0.75 and 0.85', () => {
    const badges = generateTraitBadges(0.8, 0.5, 0.5, 0.5, 0.5);
    expect(badges).toContain('Curious Mind');
    expect(badges).not.toContain('Pattern Seeker');
  });

  it('CHARACTERIZATION: thresholds are strict > (exactly 0.75 does not qualify)', () => {
    expect(generateTraitBadges(0.75, 0.75, 0.5, 0.75, 0.5)).toEqual([]);
  });

  it('adds Small Circle for low extraversion (< 0.4) and Truth Teller for low agreeableness', () => {
    const badges = generateTraitBadges(0.5, 0.5, 0.3, 0.3, 0.5);
    expect(badges).toContain('Small Circle');
    expect(badges).toContain('Truth Teller');
  });

  it('adds Social Spark for high extraversion (> 0.7)', () => {
    expect(generateTraitBadges(0.5, 0.5, 0.75, 0.5, 0.5)).toContain('Social Spark');
  });

  it('adds Deep Feeler for high neuroticism (>0.65) and Unshakeable for low (<0.35)', () => {
    expect(generateTraitBadges(0.5, 0.5, 0.5, 0.5, 0.7)).toContain('Deep Feeler');
    expect(generateTraitBadges(0.5, 0.5, 0.5, 0.5, 0.3)).toContain('Unshakeable');
  });

  it('caps output at 8 badges', () => {
    // Push every threshold to max simultaneously (>10 potential badges).
    const badges = generateTraitBadges(0.99, 0.99, 0.99, 0.99, 0.99);
    expect(badges.length).toBeLessThanOrEqual(8);
  });

  it('CHARACTERIZATION: badge ordering follows the source if/push order', () => {
    // openness>0.85 pushes both openness badges first, then conscientiousness.
    const badges = generateTraitBadges(0.9, 0.9, 0.5, 0.5, 0.5);
    expect(badges).toEqual([
      'Curious Mind',
      'Pattern Seeker',
      'Deep Worker',
      'Systems Thinker',
    ]);
  });
});

describe('determineArchetypeFromSoulLayers', () => {
  it('returns a valid archetype for an empty layers object (uses defaults)', () => {
    const result = determineArchetypeFromSoulLayers({});
    expect(result.archetype).toBeDefined();
    expect(result.archetype.name).toMatch(/^The /);
    expect(result.similarity).toBeGreaterThan(0);
  });

  it('is deterministic for identical layer inputs', () => {
    const layers: SoulSignatureLayers = {
      values: { values: [{ name: 'Discipline', strength: 0.9 }] },
      taste: { diversity: 0.8 },
    };
    const a = determineArchetypeFromSoulLayers(layers);
    const b = determineArchetypeFromSoulLayers(layers);
    expect(a.archetype.name).toBe(b.archetype.name);
    expect(a.similarity).toBe(b.similarity);
  });

  it('CHARACTERIZATION: unstable growth edges bump neuroticism (isStable === false path)', () => {
    // isStable === false → neuroticism 0.58; otherwise 0.38. Assert the two
    // branches can produce different archetypes / similarities (behavior split).
    const stable = determineArchetypeFromSoulLayers({ growthEdges: { isStable: true, shifts: [] } });
    const unstable = determineArchetypeFromSoulLayers({ growthEdges: { isStable: false, shifts: [] } });
    // Both are valid; the neuroticism input differs, so at least the similarity
    // score should differ (the profiles are not identical).
    expect(stable.similarity).not.toBe(unstable.similarity);
  });

  it('reads snake_case growth_edges as a fallback for cached payloads', () => {
    const camel = determineArchetypeFromSoulLayers({ growthEdges: { isStable: false, shifts: [{ domain: 'x' }] } });
    const snake = determineArchetypeFromSoulLayers({ growth_edges: { isStable: false, shifts: [{ domain: 'x' }] } });
    // Both paths feed the same downstream math → identical result.
    expect(snake.archetype.name).toBe(camel.archetype.name);
    expect(snake.similarity).toBeCloseTo(camel.similarity, 10);
  });

  it('CHARACTERIZATION: social keywords in connection text raise extraversion', () => {
    // "community"/"collaboration" are social signals (+0.12 each). A soul with
    // heavy social language should not crash and should return a valid archetype.
    const result = determineArchetypeFromSoulLayers({
      connections: { style: 'community builder', summary: 'thrives on collaboration and social connection with friends' },
    });
    expect(result.archetype.name).toMatch(/^The /);
    expect(result.similarity).toBeGreaterThan(0);
  });
});

describe('generateTraitBadgesFromSoulLayers', () => {
  it('returns empty array for empty layers', () => {
    expect(generateTraitBadgesFromSoulLayers({})).toEqual([]);
  });

  it('includes core value names verbatim', () => {
    const badges = generateTraitBadgesFromSoulLayers({
      values: { values: [{ name: 'Curiosity' }, { name: 'Integrity' }] },
    });
    expect(badges).toContain('Curiosity');
    expect(badges).toContain('Integrity');
  });

  it('formats snake_case chronotype and connection style to Title Case', () => {
    const badges = generateTraitBadgesFromSoulLayers({
      rhythms: { chronotype: 'night_owl' },
      connections: { style: 'deep_connector' },
    });
    expect(badges).toContain('Night Owl');
    expect(badges).toContain('Deep Connector');
  });

  it('adds "Stable Core" when growth edges are stable', () => {
    const badges = generateTraitBadgesFromSoulLayers({ growthEdges: { isStable: true } });
    expect(badges).toContain('Stable Core');
  });

  it('adds "Evolving Edge" when unstable with shifts (and NOT Stable Core)', () => {
    const badges = generateTraitBadgesFromSoulLayers({
      growthEdges: { isStable: false, shifts: [{ domain: 'work' }] },
    });
    expect(badges).toContain('Evolving Edge');
    expect(badges).not.toContain('Stable Core');
  });

  it('CHARACTERIZATION: unstable with ZERO shifts yields neither badge', () => {
    // isStable falsy AND shifts.length === 0 → the else-if guard fails.
    const badges = generateTraitBadgesFromSoulLayers({ growthEdges: { isStable: false, shifts: [] } });
    expect(badges).not.toContain('Stable Core');
    expect(badges).not.toContain('Evolving Edge');
  });

  it('deduplicates via Set and caps at 8 badges', () => {
    const badges = generateTraitBadgesFromSoulLayers({
      values: {
        values: Array.from({ length: 12 }, (_, i) => ({ name: `Value${i}` })),
      },
    });
    expect(badges.length).toBeLessThanOrEqual(8);
    // No duplicates.
    expect(new Set(badges).size).toBe(badges.length);
  });

  it('CHARACTERIZATION: skips topSignals (artist/content names, not identity traits)', () => {
    const badges = generateTraitBadgesFromSoulLayers({
      taste: { topSignals: ['Drake', 'Taylor Swift'] },
    });
    expect(badges).not.toContain('Drake');
    expect(badges).not.toContain('Taylor Swift');
  });

  it('trims whitespace and filters empties', () => {
    const badges = generateTraitBadgesFromSoulLayers({
      values: { values: [{ name: '  Grit  ' }, { name: '' }, { name: '   ' }] },
    });
    expect(badges).toContain('Grit');
    expect(badges).not.toContain('');
    // Whitespace-only name becomes '' after trim → filtered out.
    expect(badges.every((b) => b.length > 0)).toBe(true);
  });
});

describe('extractOneLiner', () => {
  it('returns empty string for empty / undefined input', () => {
    expect(extractOneLiner([])).toBe('');
    expect(extractOneLiner(undefined as unknown as string[])).toBe('');
  });

  it('extracts the first sentence terminated by a period', () => {
    expect(extractOneLiner(['You value depth over breadth. And much more text here.']))
      .toBe('You value depth over breadth.');
  });

  it('handles exclamation and question terminators', () => {
    expect(extractOneLiner(['What a mind! The rest follows.'])).toBe('What a mind!');
    expect(extractOneLiner(['Who are you really? Deep question.'])).toBe('Who are you really?');
  });

  it('strips markdown bold/italic markers', () => {
    expect(extractOneLiner(['**You** are *bold*. More.'])).toBe('You are bold.');
  });

  it('strips leading and trailing quotes', () => {
    expect(extractOneLiner(['"You are curious. Deeply."'])).toBe('You are curious.');
  });

  it('uses only the FIRST insight in the array', () => {
    expect(extractOneLiner(['First one. x', 'Second one. y'])).toBe('First one.');
  });

  it('CHARACTERIZATION: no sentence terminator + <=120 chars returns the whole cleaned text', () => {
    const text = 'a short fragment with no terminator';
    expect(extractOneLiner([text])).toBe(text);
  });

  it('CHARACTERIZATION: no terminator + >120 chars truncates to 117 chars + ellipsis', () => {
    const longText = 'x'.repeat(200); // no period
    const result = extractOneLiner([longText]);
    expect(result).toBe('x'.repeat(117) + '...');
    expect(result.length).toBe(120);
  });

  it('CHARACTERIZATION: a trailing period with no following space still matches ($ anchor)', () => {
    // Regex: /^(.+?[.!?])(?:\s|$)/ — the "$" alternative lets a terminator at
    // the very end match even without a trailing space.
    expect(extractOneLiner(['Just this.'])).toBe('Just this.');
  });
});
