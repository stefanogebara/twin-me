/**
 * Pure aggregator for GitHub language byte counts across multiple repos.
 *
 * Extracted from observationFetchers/github.js so the build-output
 * filter heuristic can be unit-tested without standing up an HTTP mock.
 *
 * Background (audit 2026-05-21): GitHub's /repos/:owner/:name/languages
 * endpoint returns bytes per file extension. It respects
 * linguist-generated only when the repo has a .gitattributes marking
 * dist/build/vendor dirs. Most TwinMe-style projects don't have that
 * file, so committed dist/*.html and build/*.css get counted as if the
 * developer hand-wrote them. The audit observed "HTML 43%, JS 40%,
 * TS 16%" for a TypeScript-only developer — entirely build output.
 *
 * Heuristic: if a repo's PRIMARY language (from the GitHub repos
 * endpoint, NOT computed from the bytes map) is a real source-code
 * language, treat any presentation-language bytes in that same repo
 * as build output and exclude them from the aggregate.
 */

export const PRESENTATION_LANGUAGES = new Set([
  'HTML', 'CSS', 'SCSS', 'Less', 'Sass',
]);

export const CODE_LANGUAGES = new Set([
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java',
  'Ruby', 'C++', 'C', 'Swift', 'Kotlin', 'PHP', 'Scala', 'C#',
  'Elixir', 'Erlang', 'Haskell', 'Clojure', 'OCaml', 'Dart',
  'Zig', 'Nim', 'F#',
]);

/**
 * Decide whether the given (repo, language) pair is build output that
 * should be excluded from the aggregate. Exported so callers can mirror
 * the decision elsewhere (e.g., a per-repo display) without re-implementing.
 *
 * @param {string} repoPrimaryLanguage - The `language` field from the
 *   GitHub /repos endpoint for this repo. May be null for empty repos.
 * @param {string} language - The language being considered (key from
 *   /languages endpoint).
 * @returns {boolean} true if this language's bytes for this repo are
 *   almost certainly compiled output and should be skipped.
 */
export function isLikelyBuildOutput(repoPrimaryLanguage, language) {
  if (!CODE_LANGUAGES.has(repoPrimaryLanguage)) return false;
  return PRESENTATION_LANGUAGES.has(language);
}

/**
 * Aggregate language bytes across a list of repos, applying the
 * build-output filter.
 *
 * @param {Array<{ language: string|null }>} repos - same shape as the
 *   /repos endpoint. Length MUST match langResults.
 * @param {Array<Record<string, number>>} langResults - same shape as
 *   the /languages endpoint. Index i corresponds to repos[i].
 * @returns {Array<{ lang: string, pct: number }>} Top-4 languages by
 *   bytes, with integer percentages summing to ~100.
 *   Empty array if all bytes were filtered out.
 */
export function aggregateLanguages(repos, langResults) {
  if (!Array.isArray(repos) || !Array.isArray(langResults)) return [];

  const agg = {};
  const n = Math.min(repos.length, langResults.length);
  for (let i = 0; i < n; i++) {
    const repoPrimary = repos[i]?.language ?? null;
    const langMap = langResults[i] || {};
    for (const [lang, bytes] of Object.entries(langMap)) {
      if (isLikelyBuildOutput(repoPrimary, lang)) continue;
      agg[lang] = (agg[lang] || 0) + (Number.isFinite(bytes) ? bytes : 0);
    }
  }

  // Drop zero-byte entries — they're noise from defensive Number.isFinite
  // checks (e.g., a language key with NaN bytes lands in agg with a 0).
  // Including them would push real languages out of the top-4 cap.
  const nonZero = Object.entries(agg).filter(([, bytes]) => bytes > 0);
  const total = nonZero.reduce((a, [, b]) => a + b, 0);
  if (total <= 0) return [];

  return nonZero
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([lang, bytes]) => ({ lang, pct: Math.round((bytes / total) * 100) }));
}
