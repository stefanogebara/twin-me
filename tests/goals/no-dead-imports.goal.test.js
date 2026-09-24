/**
 * Goal: nothing imports a file that is not there.
 * ===============================================
 * The parked API's deletion (M2-B) removed 331 files and every static import of them, and left
 * seven dynamic ones: `app.use('/api/costs', (await import('./routes/cost-dashboard.js')).default)`
 * at the top level of server.js took production down a second time on 2026-09-24. A dynamic
 * import is invisible to a regex that only knows `import x from '...'`, and the suite could not
 * see it either, because a route nobody tests is a route nobody imports.
 *
 * This reads every remaining API file and resolves every specifier in it, static, re-exported or
 * dynamic, against the disk.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');

function deadImports() {
  const files = execSync('git ls-files api/_app', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.(js|mjs|cjs)$/.test(f));
  const dead = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const specs = [
      ...[...src.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map((m) => [m[1], 'dynamic']),
      ...[...src.matchAll(/^import\s[^'"\n]*from\s*['"](\.[^'"]+)['"]/gm)].map((m) => [m[1], 'static']),
      ...[...src.matchAll(/^export\s[^'"\n]*from\s*['"](\.[^'"]+)['"]/gm)].map((m) => [m[1], 're-export']),
    ];
    for (const [spec, kind] of specs) {
      const base = path.resolve(path.dirname(path.join(ROOT, f)), spec);
      const found = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')].some((c) => fs.existsSync(c));
      if (!found) dead.push(`${kind} ${f} -> ${spec}`);
    }
  }
  return dead;
}

describe('every import points at a file that exists', () => {
  it('static, re-exported and dynamic alike', () => {
    expect(deadImports()).toEqual([]);
  }, 60000);
});
