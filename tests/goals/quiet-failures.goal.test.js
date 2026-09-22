/**
 * Goal: no error in code the product reaches is swallowed without a name.
 *
 * `.catch(() => [])` made a failed read look like an empty one (audit M1-3, 2026-09-19, the
 * money code). The 22 September audit counted 76 more across everything the money routes
 * reach (M1-D). Every such catch now goes through quietly('name', fallback), which logs and
 * counts it under the name, and no two sites share a name. The set is the one the unmount
 * computes: every file reachable from scripts/ci/staying-roots.txt.
 *
 * A bare `catch {}` counts. A catch whose whole body is a comment saying why the silence is
 * right (a `catch` holding only a comment such as "not JSON") does not: that is a documented decision, the same
 * shape M1-3 accepted, and there are 65 of them in the reach set.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reachable, readRoots } from '../../scripts/ci/reach.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const staying = [...reachable(readRoots(path.join(ROOT, 'scripts/ci/staying-roots.txt')), { root: ROOT })]
  .filter((f) => f.endsWith('.js') && !f.endsWith('/quietly.js')).sort();

/* Comments off, so a doc line quoting the old shape does not count. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ANONYMOUS_CATCH = /\.catch\(\s*\(\s*\)\s*=>/g;
const EMPTY_CATCH_BLOCK = /\bcatch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/g;

describe('code the product reaches names its quiet failures', () => {
  it('walks a set worth checking', () => {
    expect(staying.length).toBeGreaterThan(300);
  });

  it('has no anonymous swallowing catch', () => {
    const offenders = [];
    for (const f of staying) {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const src = code(raw);
      for (const m of src.matchAll(ANONYMOUS_CATCH)) offenders.push(`${f}: ${src.slice(m.index, m.index + 40).replace(/\s+/g, ' ')}`);
      for (const m of raw.matchAll(EMPTY_CATCH_BLOCK)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('gives every quiet failure a name of its own', () => {
    const names = [];
    for (const f of staying) {
      const src = code(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      for (const m of src.matchAll(/quietly\('([^']+)'/g)) names.push(m[1]);
    }
    expect(names.length).toBeGreaterThanOrEqual(26 + 75);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
});
