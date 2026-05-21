/**
 * Parse-smoke test for every src/**\/*.{ts,tsx} file.
 *
 * Why this exists: on 2026-05-20, commit e0e5a9d4 shipped to main with
 * an unbalanced JSX ternary in ProactiveInsightsPanel.tsx ({!moat ? (
 * opened at L279 with no matching `) : null}` before the wrapping
 * </div>). esbuild reported "Unterminated regular expression" at L297,
 * but no CI step ran the parser, so the bug landed on main and only got
 * caught by a follow-up linter pass that rewrote the file. Without that
 * coincidence the broken file would have nuked the next prod build.
 *
 * vitest is configured with environment: 'node' and no jsdom/RTL, so a
 * full React mount test would need new dev deps (jsdom, @testing-library/*)
 * plus a workspace split. This test does the cheap thing that catches
 * the actual bug class: ask esbuild to parse the file. If it can't,
 * the test fails with the file + the esbuild diagnostic.
 *
 * Type errors are out of scope here — `tsc --noEmit` covers those. This
 * is purely a syntax / JSX-balance smoke test that runs in <1s.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { transformSync } from 'esbuild';

const SRC_DIR = join(process.cwd(), 'src');
const REPO_ROOT = process.cwd();

/** Recursively collect every .ts / .tsx file under src/, skipping .d.ts and node_modules. */
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...collectSources(abs));
      continue;
    }
    const ext = extname(entry);
    if (ext !== '.ts' && ext !== '.tsx') continue;
    if (entry.endsWith('.d.ts')) continue;
    out.push(abs);
  }
  return out;
}

const files = collectSources(SRC_DIR).map((abs) => ({
  abs,
  rel: relative(REPO_ROOT, abs).replace(/\\/g, '/'),
  loader: extname(abs) === '.tsx' ? 'tsx' : 'ts',
}));

// Per-case timeout bump: under parallel-worker load, esbuild.transformSync
// on the largest files (App.tsx is ~50KB, the dashboard pages aren't far
// behind) can take 6-8 seconds — well over vitest's 5s default. Observed
// run #2 of the 5-run flake-verification: App.tsx at 7964ms timed out
// even though the parse would have succeeded. 30s gives the worst-case
// file generous headroom while still catching a real esbuild hang.
describe('src parse smoke', { timeout: 30_000 }, () => {
  it('finds a non-trivial number of source files (sanity)', () => {
    // The repo has hundreds of components; if this collapses to single digits
    // something is off with the file walker before per-file assertions run.
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)('$rel parses cleanly', ({ abs, loader }) => {
    const src = readFileSync(abs, 'utf8');
    // esbuild's transformSync throws on syntax/JSX errors with a precise
    // location. We don't keep the output — we just want the parse to succeed.
    expect(() =>
      transformSync(src, {
        loader,
        // Match the vite build target so any modern syntax used in the repo
        // (top-level await, decorators, etc.) doesn't trip the parser.
        target: 'es2022',
        // Source filename surfaces in the error message if it throws.
        sourcefile: abs,
      }),
    ).not.toThrow();
  });
});
