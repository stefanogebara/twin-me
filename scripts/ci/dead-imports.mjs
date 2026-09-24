import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
const ROOT = process.cwd();
const files = execSync('git ls-files api/_app', { encoding: 'utf8' }).split('\n').filter((f) => /\.(js|mjs|cjs)$/.test(f));
const dead = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const specs = [
    ...[...src.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map((m) => [m[1], 'dynamic']),
    ...[...src.matchAll(/^import\s[^'"\n]*from\s*['"](\.[^'"]+)['"]/gm)].map((m) => [m[1], 'static']),
    ...[...src.matchAll(/^export\s[^'"\n]*from\s*['"](\.[^'"]+)['"]/gm)].map((m) => [m[1], 'reexport']),
  ];
  for (const [spec, kind] of specs) {
    const base = path.resolve(path.dirname(f), spec);
    const hit = [base, base + '.js', base + '.mjs', path.join(base, 'index.js')].some((c) => fs.existsSync(c));
    if (!hit) dead.push({ file: f, spec, kind });
  }
}
for (const d of dead) console.log(`${d.kind.padEnd(8)} ${d.file} -> ${d.spec}`);
console.log(`dead imports: ${dead.length} in ${new Set(dead.map((d) => d.file)).size} files`);
