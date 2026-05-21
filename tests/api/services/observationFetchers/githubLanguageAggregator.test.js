/**
 * Tests for aggregateLanguages — the build-output filter for the
 * "Your GitHub language distribution" observation.
 *
 * Audit (2026-05-21) found: "HTML 43%, JavaScript 40%, TypeScript 16%,
 * 5227 commits" was attributed to a developer who writes TypeScript
 * exclusively. Cause: GitHub's /languages endpoint counts dist/*.html
 * + build/*.css as if hand-written. The aggregator now skips
 * presentation-language bytes from any repo whose primary language is
 * a real code language.
 *
 * These tests pin the heuristic so a future "let's count HTML for SEO
 * blog repos" change has to justify itself against the false-positive
 * cost for every full-stack developer.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateLanguages,
  isLikelyBuildOutput,
  PRESENTATION_LANGUAGES,
  CODE_LANGUAGES,
} from '../../../../api/services/observationFetchers/githubLanguageAggregator.js';

describe('isLikelyBuildOutput', () => {
  describe('Code-language repos with markup bytes (the audit case)', () => {
    it.each([
      ['TypeScript', 'HTML'],
      ['TypeScript', 'CSS'],
      ['JavaScript', 'HTML'],
      ['Python', 'HTML'],
      ['Go', 'CSS'],
      ['Rust', 'SCSS'],
    ])('skips %s/%s bytes (almost always dist/build output)', (repoLang, lang) => {
      expect(isLikelyBuildOutput(repoLang, lang)).toBe(true);
    });
  });

  describe('Same code-language bytes pass through', () => {
    it.each([
      ['TypeScript', 'TypeScript'],
      ['TypeScript', 'JavaScript'],
      ['Python', 'Python'],
      ['Go', 'Go'],
    ])('keeps %s/%s bytes', (repoLang, lang) => {
      expect(isLikelyBuildOutput(repoLang, lang)).toBe(false);
    });
  });

  describe('Markup-primary repos keep their markup bytes', () => {
    // A repo whose own primary language IS HTML/CSS (a static site, a
    // CSS framework, an MDX docs site) — the author really did write
    // the markup. Filter must not strip these.
    it.each([
      ['HTML', 'HTML'],
      ['HTML', 'CSS'],
      ['CSS', 'CSS'],
      ['SCSS', 'SCSS'],
      [null, 'HTML'],   // primary unknown (empty repo)
      [undefined, 'CSS'],
    ])('keeps %s/%s bytes (primary not a code language)', (repoLang, lang) => {
      expect(isLikelyBuildOutput(repoLang, lang)).toBe(false);
    });
  });

  describe('Exhaustive set membership', () => {
    it('includes the obvious presentation languages', () => {
      expect(PRESENTATION_LANGUAGES.has('HTML')).toBe(true);
      expect(PRESENTATION_LANGUAGES.has('CSS')).toBe(true);
      expect(PRESENTATION_LANGUAGES.has('SCSS')).toBe(true);
    });
    it('includes the major code languages', () => {
      for (const lang of ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Ruby']) {
        expect(CODE_LANGUAGES.has(lang), `${lang} in CODE_LANGUAGES`).toBe(true);
      }
    });
    it('does NOT classify HTML or CSS as a code language', () => {
      expect(CODE_LANGUAGES.has('HTML')).toBe(false);
      expect(CODE_LANGUAGES.has('CSS')).toBe(false);
    });
  });
});

describe('aggregateLanguages', () => {
  it('returns empty array on empty input', () => {
    expect(aggregateLanguages([], [])).toEqual([]);
    expect(aggregateLanguages([{ language: 'TypeScript' }], [{}])).toEqual([]);
  });

  it('returns empty array on null / non-array input (defensive)', () => {
    expect(aggregateLanguages(null, [])).toEqual([]);
    expect(aggregateLanguages([], null)).toEqual([]);
    expect(aggregateLanguages(undefined, undefined)).toEqual([]);
  });

  it('the audit-shaped input — TS-primary repo with HTML/CSS build output — produces a TS-dominant breakdown', () => {
    // Single TwinMe-style repo: TS source + JS source + dist HTML/CSS
    // committed to gh-pages or similar. Without the filter you'd get
    // "HTML 43%, JS 40%, TS 16%" — the audit symptom. With the filter
    // you get the true source mix.
    const repos = [{ language: 'TypeScript' }];
    const langResults = [{
      TypeScript: 1_000_000,  // source
      JavaScript:   500_000,  // source
      HTML:       1_500_000,  // built dist/ (the bug)
      CSS:          400_000,  // built dist/ (the bug)
    }];
    const result = aggregateLanguages(repos, langResults);

    expect(result.map(r => r.lang)).toEqual(['TypeScript', 'JavaScript']);
    // 1M of 1.5M total ≈ 67%, 0.5M ≈ 33%.
    expect(result[0]).toEqual({ lang: 'TypeScript', pct: 67 });
    expect(result[1]).toEqual({ lang: 'JavaScript', pct: 33 });
  });

  it('a real static-site repo keeps its HTML credit (primary is HTML, not a code lang)', () => {
    // Inverse case: a docs / blog repo whose primary is HTML. The
    // author wrote those bytes by hand. Filter must respect it.
    const repos = [{ language: 'HTML' }];
    const langResults = [{
      HTML: 800_000,
      CSS: 200_000,
    }];
    const result = aggregateLanguages(repos, langResults);
    expect(result).toEqual([
      { lang: 'HTML', pct: 80 },
      { lang: 'CSS', pct: 20 },
    ]);
  });

  it('mixed corpus: TS repo + HTML repo — each contributes its own markup credit', () => {
    const repos = [
      { language: 'TypeScript' },          // markup bytes = build output (skip)
      { language: 'HTML' },                // markup bytes = real (keep)
    ];
    const langResults = [
      { TypeScript: 500_000, HTML: 500_000 },   // 500k TS counted, 500k HTML SKIPPED
      { HTML: 200_000, CSS: 50_000 },           // both counted
    ];
    const result = aggregateLanguages(repos, langResults);

    const map = Object.fromEntries(result.map((r) => [r.lang, r.pct]));
    // Total counted: TS 500k + HTML 200k + CSS 50k = 750k
    // TS 67%, HTML 27%, CSS 7% (rounded)
    expect(map.TypeScript).toBe(67);
    expect(map.HTML).toBe(27);
    expect(map.CSS).toBe(7);
  });

  it('caps results at top 4 languages by bytes', () => {
    // 6 languages — only the top 4 should survive.
    const repos = [{ language: 'TypeScript' }];
    const langResults = [{
      TypeScript: 5_000_000,
      JavaScript: 3_000_000,
      Python:     2_000_000,
      Go:         1_000_000,
      Ruby:         500_000,
      Java:         200_000,
    }];
    const result = aggregateLanguages(repos, langResults);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.lang)).toEqual(['TypeScript', 'JavaScript', 'Python', 'Go']);
  });

  it('handles non-finite byte counts (defensive)', () => {
    const repos = [{ language: 'TypeScript' }];
    const langResults = [{
      TypeScript: 1000,
      Python: NaN,
      Go: undefined,
      Ruby: null,
    }];
    const result = aggregateLanguages(repos, langResults);
    expect(result).toEqual([{ lang: 'TypeScript', pct: 100 }]);
  });

  it('handles a null repo or missing langResult entry', () => {
    const repos = [{ language: 'TypeScript' }, null];
    const langResults = [{ TypeScript: 100 }, undefined];
    const result = aggregateLanguages(repos, langResults);
    expect(result).toEqual([{ lang: 'TypeScript', pct: 100 }]);
  });

  it('the audit symptom is gone: HTML never dominates a TS-only project', () => {
    // Pin this as a regression. If a future refactor accidentally
    // brings the bug back, this assertion fails LOUDLY.
    const repos = [{ language: 'TypeScript' }];
    const langResults = [{ HTML: 99_999_999, TypeScript: 1_000_000 }];
    const result = aggregateLanguages(repos, langResults);
    // HTML must not appear at all — the repo's primary was TypeScript.
    expect(result.find((r) => r.lang === 'HTML')).toBeUndefined();
    expect(result[0].lang).toBe('TypeScript');
    expect(result[0].pct).toBe(100);
  });
});
