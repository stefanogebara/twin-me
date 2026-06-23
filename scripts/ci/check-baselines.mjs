#!/usr/bin/env node
/**
 * CI baseline-freeze guard — audit 2026-06, Milestone 0.5.
 *
 * Freezes three regression-prone counts so they can only stay flat or shrink:
 *   - routesWithDirectFrom : files under api/routes that hit Supabase directly (.from('...'))
 *   - eslintErrors         : whole-repo ESLint errors
 *   - tscErrors            : tsc (app) type errors
 *
 * Exits 1 if ANY metric EXCEEDS its baseline (scripts/ci/baselines.json).
 * Decreases are the goal — when a metric drops, lower the number in
 * baselines.json (same PR) to lock the gain. Run locally before pushing:
 *   node scripts/ci/check-baselines.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselines = JSON.parse(readFileSync(join(root, 'scripts/ci/baselines.json'), 'utf8'));

function countRoutesWithFrom() {
  const res = spawnSync('git', ['ls-files', 'api/routes'], { cwd: root, encoding: 'utf8' });
  const files = (res.stdout || '')
    .split('\n')
    .filter((f) => f.endsWith('.js'));
  let n = 0;
  for (const f of files) {
    try {
      if (/\.from\(\s*['"`]/.test(readFileSync(join(root, f), 'utf8'))) n++;
    } catch {
      /* unreadable file — skip */
    }
  }
  return n;
}

function run(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 128 * 1024 * 1024,
  });
}

function countEslintErrors() {
  const r = run('npx', ['eslint', '.', '-f', 'json']);
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    console.error('eslint did not emit parseable JSON. stdout/stderr head:');
    console.error((r.stdout || '').slice(0, 1500));
    console.error((r.stderr || '').slice(0, 1500));
    process.exit(2);
  }
  let errors = 0;
  const offenders = [];
  for (const f of report) {
    const fe = f.messages.filter((m) => m.severity === 2).length;
    if (fe) {
      errors += fe;
      offenders.push(`${f.filePath.replace(root, '').replace(/^[\\/]/, '')}: ${fe}`);
    }
  }
  return { errors, offenders };
}

function countTscErrors() {
  const r = run('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit']);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const lines = out.split('\n').filter((l) => /error TS\d+/.test(l));
  return { errors: lines.length, sample: lines.slice(0, 25) };
}

const routes = countRoutesWithFrom();
const { errors: eslintErrors, offenders } = countEslintErrors();
const { errors: tscErrors, sample } = countTscErrors();

const checks = [
  ['routesWithDirectFrom', routes, baselines.routesWithDirectFrom],
  ['eslintErrors', eslintErrors, baselines.eslintErrors],
  ['tscErrors', tscErrors, baselines.tscErrors],
];

console.log('\nCI baseline freeze');
console.log('  metric                  current  baseline  status');
let failed = false;
let improved = false;
for (const [name, cur, base] of checks) {
  let status;
  if (cur > base) {
    status = 'REGRESSED';
    failed = true;
  } else if (cur < base) {
    status = 'improved -> lower baselines.json';
    improved = true;
  } else {
    status = 'ok';
  }
  console.log(`  ${name.padEnd(22)} ${String(cur).padStart(6)}  ${String(base).padStart(8)}  ${status}`);
}

if (failed) {
  console.error('\nFAIL: a frozen baseline regressed. Fix the new violation(s); if truly intentional, raise the number in scripts/ci/baselines.json with justification in the commit.');
  if (eslintErrors > baselines.eslintErrors) {
    console.error('\nESLint files with errors:\n  ' + offenders.join('\n  '));
  }
  if (tscErrors > baselines.tscErrors) {
    console.error('\ntsc errors (sample):\n  ' + sample.join('\n  '));
  }
  process.exit(1);
}

if (improved) {
  console.log('\nA metric improved — remember to lower it in scripts/ci/baselines.json to lock the gain.');
}
console.log('\nAll baselines held.');
