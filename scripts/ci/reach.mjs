/**
 * What the product reaches.
 * =========================
 * The 22 September audit found 639 of 735 backend files unreachable from the money routes:
 * a retired product, still mounted. Before any of it is gated or deleted, the set of files
 * the product actually needs has to be a computed fact, not a list somebody remembers.
 *
 * This walks static ESM imports (`import x from './y.js'`, `import('./y.js')`,
 * `export ... from './y.js'`) from a set of root files and returns everything they reach,
 * as repository-relative paths. It also reads the API mounts out of `api/server.js`: the
 * path and the router file each `app.use('/api/...', ..., router)` ends in.
 *
 * Pure, dependency-free, and used by tests/goals/legacy-twin-unmounted.goal.test.js, so it
 * must not need madge or the network. The roots live in scripts/ci/staying-roots.txt.
 */
import fs from 'node:fs';
import path from 'node:path';

/* The `from` clause is optional (a side-effect import has none) and bounded to one statement:
   `[\s\S]*?` let the engine run from `import './x.css'` to a later statement's `from`, so the
   side-effect import was never seen and the stylesheet counted as unreachable (2026-09-22). */
const IMPORT_RE = /(?:import|export)\s+(?:[^;'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** The relative import specifiers in one source file. */
export function importsOf(source) {
  const out = [];
  for (const m of String(source).matchAll(IMPORT_RE)) out.push(m[1] || m[2]);
  return out;
}

/** Resolve a relative specifier the way Node does for this repository's plain .js modules. */
export function resolveImport(fromFile, spec, { exists = fs.existsSync } = {}) {
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')];
  return candidates.find((c) => exists(c)) || null;
}

/**
 * Every file reachable from the roots, roots included. Paths are repository-relative with
 * forward slashes. Files under node_modules are never followed (bare specifiers are not
 * relative and so never match).
 */
export function reachable(roots, { root = process.cwd(), read = (f) => fs.readFileSync(f, 'utf8'), exists = fs.existsSync } = {}) {
  const seen = new Set();
  const queue = roots.map((r) => path.normalize(r));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    const abs = path.isAbsolute(file) ? file : path.join(root, file);
    if (!exists(abs)) continue;
    seen.add(file);
    let source = '';
    try { source = read(abs); } catch { continue; }
    for (const spec of importsOf(source)) {
      const target = resolveImport(abs, spec, { exists });
      if (target) queue.push(path.relative(root, target).split(path.sep).join('/'));
    }
  }
  return seen;
}

/** The roots file: one repository-relative path per line, # for a comment. */
export function readRoots(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
}

/**
 * The API mounts in api/server.js: `{ path, file, gated }` for every `app.use('/api/...')`
 * whose last argument is an imported router; inline middleware (a limiter, a body parser, a
 * 404 handler) has no file and is skipped by the caller that wants routers.
 */
export function mounts(serverSource) {
  const imports = {};
  for (const m of serverSource.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g)) imports[m[1]] = `api/routes/${m[2]}`;
  const out = [];
  for (const m of serverSource.matchAll(/app\.use\(\s*['"](\/api\/[^'"]+)['"]\s*,([^;]*?)\);/gs)) {
    const args = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    const last = args[args.length - 1] || '';
    const id = (last.match(/^(\w+)$/) || [])[1];
    out.push({ path: m[1], file: id ? imports[id] || null : null, gated: /legacyTwin(Route)?Gate/.test(m[2]) });
  }
  return out;
}
