#!/usr/bin/env node
/**
 * CI baseline RATCHET guard — audit 2026-06 M0.5, ratcheted 2026-07 (A2-M2c).
 *
 * Tracks three regression-prone counts that may only stay flat or SHRINK:
 *   - routesWithDirectFrom : files under api/routes that hit Supabase directly (.from('...'))
 *   - eslintErrors         : whole-repo ESLint errors
 *   - tscErrors            : tsc (app) type errors
 *
 * A ratchet, not just a freeze: the guard FAILS on ANY drift from the baseline
 * — both when a metric REGRESSES above it (new violations) AND when a metric
 * IMPROVES below it without the gain being locked in. That second half is what
 * makes it a ratchet: every improvement must be captured in baselines.json in
 * the same PR, so a count can never silently creep back up to reclaim the slack.
 *
 * Usage:
 *   node scripts/ci/check-baselines.mjs           # verify (CI runs this, no flag)
 *   node scripts/ci/check-baselines.mjs --update   # lock in improvements, then commit baselines.json
 *
 * --update rewrites each baseline to min(current, baseline): it only ever
 * LOWERS a number, never raises one, so it cannot be used to paper over a
 * regression (that still requires a real fix, or a hand-edit of baselines.json
 * with justification in the commit — reviewed via the file diff).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinesPath = join(root, 'scripts/ci/baselines.json');
const baselines = JSON.parse(readFileSync(baselinesPath, 'utf8'));
const UPDATE = process.argv.slice(2).some((a) => a === '--update' || a === '--fix');

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

console.log('\nCI baseline ratchet');
console.log('  metric                  current  baseline  status');
let regressed = false;
let unlocked = false;
for (const [name, cur, base] of checks) {
  let status;
  if (cur > base) {
    status = 'REGRESSED';
    regressed = true;
  } else if (cur < base) {
    status = 'improved -> run --update';
    unlocked = true;
  } else {
    status = 'ok';
  }
  console.log(`  ${name.padEnd(22)} ${String(cur).padStart(6)}  ${String(base).padStart(8)}  ${status}`);
}

// --update: lock in improvements by lowering baselines to the current counts.
// Clamped to min(cur, base) so it can only ever LOWER a number — a regression
// (cur > base) is left untouched and still fails a subsequent verify run.
if (UPDATE) {
  const next = { ...baselines };
  const lowered = [];
  for (const [name, cur, base] of checks) {
    const value = Math.min(cur, base);
    if (value !== base) {
      next[name] = value;
      lowered.push(`${name}: ${base} -> ${value}`);
    }
  }
  if (lowered.length) {
    writeFileSync(baselinesPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log('\nLocked in:\n  ' + lowered.join('\n  '));
    console.log('Commit scripts/ci/baselines.json to make the gain permanent.');
  } else {
    console.log('\nNothing to lock in — no metric is below its baseline.');
  }
  if (regressed) {
    console.error('\nWARNING: a metric REGRESSED and --update will not lower it. Fix the new violation(s) first.');
    process.exit(1);
  }
  process.exit(0);
}

if (regressed) {
  console.error('\nFAIL: a baseline regressed. Fix the new violation(s); if truly intentional, raise the number in scripts/ci/baselines.json with justification in the commit.');
  if (eslintErrors > baselines.eslintErrors) {
    console.error('\nESLint files with errors:\n  ' + offenders.join('\n  '));
  }
  if (tscErrors > baselines.tscErrors) {
    console.error('\ntsc errors (sample):\n  ' + sample.join('\n  '));
  }
  process.exit(1);
}

if (unlocked) {
  console.error('\nFAIL: a metric improved but the gain is not locked in. Run:\n  node scripts/ci/check-baselines.mjs --update\nthen commit scripts/ci/baselines.json in this PR so the count can never creep back up.');
  process.exit(1);
}

console.log('\nAll baselines held.');
