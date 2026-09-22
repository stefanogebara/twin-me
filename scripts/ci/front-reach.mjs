/**
 * What the front end reaches.
 * ===========================
 * The same idea as reach.mjs for the API: everything src/main.tsx reaches through static
 * imports (with a binding or for effect), re-exports, dynamic imports and CSS `@import`, with
 * Vite's `@/` alias and TypeScript's extension-less specifiers resolved the way Vite does.
 * The rest of src/ is dead: 308 of 540 files on 2026-09-22, the retired twin's pages and what
 * only they used, deleted that day. tests/goals/front-reach.goal.test.js keeps it at zero.
 *
 *   node scripts/ci/front-reach.mjs            # lists every file under src/ nothing reaches
 */
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /(?:import|export)\s+(?:[^;'"]*?\s+from\s+)?['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]|import\(\s*['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]\s*\)|@import\s+(?:url\()?['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]/g;
const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '/index.ts', '/index.tsx', '/index.js'];
const WALKED = /\.(tsx?|jsx?|mjs|css)$/;

/** The relative and aliased specifiers in one source file, JS or CSS. */
export function frontImportsOf(source) {
  return [...String(source).matchAll(IMPORT_RE)].map((m) => m[1] || m[2] || m[3]);
}

/** Resolve a specifier the way Vite does here: `@/` is src/, extensions may be left off. */
export function resolveFront(fromFile, spec, { root, exists = fs.existsSync }) {
  const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.join(path.dirname(fromFile), spec);
  for (const ext of EXT) { const c = base + ext; if (exists(c) && (!fs.existsSync(c) || fs.statSync(c).isFile())) return c; }
  return null;
}

/** Every file under src/ reachable from the roots, repository-relative with forward slashes. */
export function frontReachable(roots = ['src/main.tsx'], { root = process.cwd(), read = (f) => fs.readFileSync(f, 'utf8'), exists = fs.existsSync } = {}) {
  const seen = new Set(); const queue = roots.map((r) => (path.isAbsolute(r) ? r : path.join(root, r)));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !exists(file)) continue;
    seen.add(file);
    if (!WALKED.test(file)) continue;
    let source = ''; try { source = read(file); } catch { continue; }
    for (const spec of frontImportsOf(source)) { const t = resolveFront(file, spec, { root, exists }); if (t) queue.push(t); }
  }
  return new Set([...seen].map((f) => path.relative(root, f).split(path.sep).join('/')));
}

/** Every walkable file under src/, except type declarations, which nothing imports. */
export function frontFiles(root = process.cwd()) {
  return fs.readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && WALKED.test(d.name) && !d.name.endsWith('.d.ts'))
    .map((d) => path.relative(root, path.join(d.parentPath ?? d.path, d.name)).split(path.sep).join('/'))
    .sort();
}

/** The files under src/ nothing reaches from src/main.tsx. */
export function frontUnreachable(root = process.cwd()) {
  const reached = frontReachable(['src/main.tsx'], { root });
  return frontFiles(root).filter((f) => !reached.has(f));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dead = frontUnreachable();
  console.log(dead.join('\n'));
  console.log(`${dead.length} unreachable of ${frontFiles().length}`);
}
